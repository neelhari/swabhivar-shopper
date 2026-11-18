const pool = require('../db');

/**
 * Validates and retrieves the applicable subscription commission rate for a vendor.
 * Inspects active subscription features for 'commission_percent'.
 *
 * @param {number|string} vendorId
 * @param {object} [client=pool]
 * @returns {Promise<{
 *   vendorId: number,
 *   storeName: string,
 *   commissionPercent: number,
 *   subscriptionId: number|null,
 *   planName: string,
 *   outstandingDebt: number,
 *   walletBalance: number
 * }>}
 */
async function getVendorActiveCommissionRate(vendorId, client = pool) {
  const query = `
    SELECT v.id AS vendor_id,
           v.name AS vendor_name,
           v.store_name,
           v.status AS vendor_status,
           COALESCE(v.wallet_balance, 0) AS wallet_balance,
           COALESCE(v.outstanding_debt, 0) AS outstanding_debt,
           vs.id AS subscription_id,
           vs.plan_name,
           vs.features,
           vs.starts_at,
           vs.expires_at,
           vs.status AS subscription_status
    FROM vendors v
    LEFT JOIN LATERAL (
      SELECT id, plan_name, features, starts_at, expires_at, status
      FROM vendor_subscriptions
      WHERE vendor_id = v.id
        AND (status = 'active' OR status IS NULL)
      ORDER BY created_at DESC
      LIMIT 1
    ) vs ON true
    WHERE v.id = $1
  `;

  const res = await client.query(query, [vendorId]);
  if (res.rows.length === 0) {
    const err = new Error(`Vendor with ID ${vendorId} not found`);
    err.statusCode = 404;
    throw err;
  }

  const row = res.rows[0];
  const storeName = row.store_name || `Vendor #${vendorId}`;

  // Extract commission rate from subscription features snapshot
  let commissionPercent = 0;
  const rawRate = row.features?.commission_percent;

  if (rawRate !== undefined && rawRate !== null && rawRate !== '' && !isNaN(Number(rawRate))) {
    commissionPercent = parseFloat(Number(rawRate).toFixed(2));
  } else {
    // If no explicit subscription rate snapshot, check settings or default to 10%
    try {
      const setRes = await client.query("SELECT value FROM settings WHERE key = 'vendor_commission_percent'");
      if (setRes.rows[0]?.value && !isNaN(Number(setRes.rows[0].value))) {
        commissionPercent = parseFloat(Number(setRes.rows[0].value).toFixed(2));
      } else {
        commissionPercent = 10.0;
      }
    } catch {
      commissionPercent = 10.0;
    }
  }

  if (commissionPercent < 0 || commissionPercent > 100) {
    commissionPercent = Math.max(0, Math.min(100, commissionPercent));
  }

  return {
    vendorId: row.vendor_id,
    storeName,
    commissionPercent,
    subscriptionId: row.subscription_id || null,
    planName: row.plan_name || 'Standard',
    outstandingDebt: parseFloat(row.outstanding_debt || 0),
    walletBalance: parseFloat(row.wallet_balance || 0),
  };
}

/**
 * Calculates financial breakdown for verified items belonging to a vendor.
 *
 * Formula:
 *  Gross = verified selling price * qty
 *  Commission = round(Gross * (commissionPercent / 100), 2)
 *  Net = Gross - Commission
 *
 * @param {Array} items
 * @param {number} commissionPercent
 */
function calculateVendorEarnings(items, commissionPercent) {
  let grossAmount = 0;
  for (const item of items) {
    const price = parseFloat(item.variant?.price || item.product?.price || item.price || 0);
    const qty = parseInt(item.qty || item.quantity || 1, 10);
    grossAmount += price * qty;
  }

  grossAmount = Math.round(grossAmount * 100) / 100;
  const commissionAmount = Math.round((grossAmount * (commissionPercent / 100)) * 100) / 100;
  const netEarnings = Math.round((grossAmount - commissionAmount) * 100) / 100;

  return {
    grossAmount,
    commissionPercent,
    commissionAmount,
    netEarnings,
  };
}

/**
 * Processes vendor credits and records accounting breakdowns inside an existing DB transaction.
 * Handles multi-vendor breakdown, debt recovery, and idempotent credit ledger insertion.
 *
 * @param {object} params
 * @param {string} params.orderNumber
 * @param {Array} params.verifiedItems
 * @param {number} [params.orderId]
 * @param {object} params.client - pg client with active transaction
 * @returns {Promise<object>} Map of vendorId -> financial breakdown
 */
async function processOrderVendorAccounting({ orderNumber, verifiedItems, orderId, paymentMethod = 'prepaid', client }) {
  if (!orderNumber) throw new Error('orderNumber is required for vendor accounting');
  if (!client) throw new Error('Database transaction client is required');

  const isCod = String(paymentMethod || '').toLowerCase() === 'cod';

  // 1. Group verified items by vendor
  const vendorGroups = {};
  for (const item of verifiedItems) {
    const vid = item.product?.vendor_id || item.vendor_id;
    if (vid) {
      if (!vendorGroups[vid]) {
        vendorGroups[vid] = { vendorId: vid, items: [] };
      }
      vendorGroups[vid].items.push(item);
    }
  }

  const breakdownByVendor = {};

  // 2. Process each vendor within row-lock protection
  for (const [vid, group] of Object.entries(vendorGroups)) {
    // Lock vendor row for atomic update
    const lockRes = await client.query(`
      SELECT id, name, store_name, COALESCE(wallet_balance, 0) as wallet_balance, COALESCE(outstanding_debt, 0) as outstanding_debt
      FROM vendors
      WHERE id = $1
      FOR UPDATE
    `, [vid]);

    if (lockRes.rows.length === 0) {
      console.warn(`Vendor ${vid} not found for order ${orderNumber}, skipping credit.`);
      continue;
    }

    // Check if vendor has already been processed for this order (Idempotency)
    const existingTx = await client.query(`
      SELECT id FROM vendor_transactions 
      WHERE vendor_id = $1 AND order_number = $2 AND (type = 'credit' OR type = 'pending')
    `, [vid, orderNumber]);

    if (existingTx.rows.length > 0) {
      console.warn(`Vendor ${vid} was already processed for order ${orderNumber}. Skipping duplicate.`);
      continue;
    }

    const currentVendor = lockRes.rows[0];
    const vendorRateInfo = await getVendorActiveCommissionRate(vid, client);
    const financials = calculateVendorEarnings(group.items, vendorRateInfo.commissionPercent);

    const {
      grossAmount,
      commissionPercent,
      commissionAmount,
      netEarnings,
    } = financials;

    const currentDebt = parseFloat(currentVendor.outstanding_debt || 0);

    if (isCod) {
      // FOR COD ORDERS:
      // Hold vendor payout in escrow until doorstep delivery and cash remittance are verified by admin!
      if (orderId) {
        await client.query(`
          INSERT INTO vendor_order_payouts 
            (order_id, vendor_id, amount, status, hold_status, hold_reason)
          VALUES 
            ($1, $2, $3, 'pending', 'cod_pending_remittance', 'COD cash pending doorstep delivery & courier remittance')
          ON CONFLICT DO NOTHING
        `, [orderId, vid, netEarnings]);
      }

      await client.query(`
        INSERT INTO vendor_transactions 
          (vendor_id, type, amount, order_number, description, gross_amount, commission_percent, commission_amount, net_amount, debt_recovered)
        VALUES 
          ($1, 'pending', $2, $3, $4, $5, $6, $7, $8, 0)
        ON CONFLICT DO NOTHING
      `, [
        vid,
        netEarnings,
        orderNumber,
        `Order ${orderNumber} (COD) - ₹${grossAmount} gross, ${commissionPercent}% comm. Pending doorstep cash collection.`,
        grossAmount,
        commissionPercent,
        commissionAmount,
        netEarnings
      ]);

      breakdownByVendor[vid] = {
        ...vendorRateInfo,
        ...financials,
        items: group.items,
        netCreditToWallet: 0,
        pendingEarnings: netEarnings,
        holdStatus: 'cod_pending_remittance'
      };
    } else {
      // FOR PREPAID ORDERS:
      // Debt recovery calculation against non-shipping debt
      let debtRecovered = 0;
      let netCreditToWallet = netEarnings;
      let remainingDebt = currentDebt;

      if (currentDebt > 0) {
        debtRecovered = Math.min(netEarnings, currentDebt);
        debtRecovered = Math.round(debtRecovered * 100) / 100;
        netCreditToWallet = Math.round((netEarnings - debtRecovered) * 100) / 100;
        remainingDebt = Math.round((currentDebt - debtRecovered) * 100) / 100;
      }

      // Atomically credit vendor wallet and update remaining outstanding debt
      await client.query(`
        UPDATE vendors 
        SET wallet_balance = COALESCE(wallet_balance, 0) + $1,
            outstanding_debt = $2
        WHERE id = $3
      `, [netCreditToWallet, remainingDebt, vid]);

      // Descriptive transaction narration
      let description = `Order ${orderNumber} - ${group.items.length} item(s) (₹${grossAmount} gross, ${commissionPercent}% comm)`;
      if (debtRecovered > 0) {
        description += ` [₹${debtRecovered} debt recovered]`;
      }

      // Insert transaction into ledger
      await client.query(`
        INSERT INTO vendor_transactions 
          (vendor_id, type, amount, order_number, description, gross_amount, commission_percent, commission_amount, net_amount, debt_recovered)
        VALUES 
          ($1, 'credit', $2, $3, $4, $5, $6, $7, $8, $9)
        ON CONFLICT (vendor_id, order_number, type) WHERE type = 'credit' AND order_number IS NOT NULL
        DO NOTHING
      `, [
        vid,
        netCreditToWallet,
        orderNumber,
        description,
        grossAmount,
        commissionPercent,
        commissionAmount,
        netEarnings,
        debtRecovered
      ]);

      if (orderId) {
        await client.query(`
          INSERT INTO vendor_order_payouts 
            (order_id, vendor_id, amount, status, hold_status)
          VALUES 
            ($1, $2, $3, 'pending', 'released')
          ON CONFLICT DO NOTHING
        `, [orderId, vid, netEarnings]);
      }

      breakdownByVendor[vid] = {
        ...vendorRateInfo,
        ...financials,
        items: group.items,
        netCreditToWallet,
        debtRecovered,
        remainingDebt
      };
    }
  }

  return breakdownByVendor;
}

/**
 * Reverses vendor wallet credit for a cancelled order.
 * If wallet balance < net amount to reverse, unrecovered amount is recorded as vendor debt.
 * Idempotent: safe to call multiple times.
 *
 * @param {object} params
 * @param {number|string} params.vendorId
 * @param {string} params.orderNumber
 * @param {string} [params.reason]
 * @param {object} params.client - pg client with active transaction
 * @returns {Promise<object>}
 */
async function reverseVendorOrderCredit({ vendorId, orderNumber, reason = 'Order cancelled', client }) {
  if (!vendorId || !orderNumber) {
    throw new Error('vendorId and orderNumber are required to reverse vendor credit');
  }
  if (!client) throw new Error('Database transaction client is required');

  // 1. Check if credit transaction exists
  const creditRes = await client.query(`
    SELECT * 
    FROM vendor_transactions 
    WHERE vendor_id = $1 AND order_number = $2 AND type = 'credit'
  `, [vendorId, orderNumber]);

  if (creditRes.rows.length === 0) {
    return {
      success: true,
      reversed: false,
      message: 'No vendor credit record found for this order (legacy or non-vendor order)'
    };
  }

  const creditTx = creditRes.rows[0];

  // 2. Check if already reversed (Idempotency)
  const existingRev = await client.query(`
    SELECT * 
    FROM vendor_transactions 
    WHERE vendor_id = $1 AND order_number = $2 AND type = 'reversal'
  `, [vendorId, orderNumber]);

  if (existingRev.rows.length > 0) {
    return {
      success: true,
      reversed: false,
      alreadyReversed: true,
      message: 'Order credit was already reversed'
    };
  }

  // 3. Amount to reverse is the net earnings that were credited
  const netToReverse = parseFloat(creditTx.net_amount || creditTx.amount || 0);
  if (netToReverse <= 0) {
    return { success: true, reversed: false, message: 'Net amount to reverse is 0' };
  }

  // 4. Lock vendor row for update
  const vRes = await client.query(`
    SELECT wallet_balance, outstanding_debt 
    FROM vendors 
    WHERE id = $1 
    FOR UPDATE
  `, [vendorId]);

  if (vRes.rows.length === 0) throw new Error(`Vendor ${vendorId} not found`);

  const currentBalance = parseFloat(vRes.rows[0].wallet_balance || 0);
  const currentDebt = parseFloat(vRes.rows[0].outstanding_debt || 0);

  let recoveredFromWallet = 0;
  let addedToDebt = 0;
  let newBalance = 0;

  if (currentBalance >= netToReverse) {
    // Full recovery from existing wallet balance
    recoveredFromWallet = netToReverse;
    newBalance = Math.round((currentBalance - netToReverse) * 100) / 100;
    addedToDebt = 0;
  } else {
    // Partial or zero recovery: take available positive balance, record remainder as debt
    recoveredFromWallet = Math.max(0, currentBalance);
    addedToDebt = Math.round((netToReverse - recoveredFromWallet) * 100) / 100;
    newBalance = currentBalance > 0 ? 0 : currentBalance;
  }

  const newDebt = Math.round((currentDebt + addedToDebt) * 100) / 100;

  // 5. Update vendor wallet and outstanding debt
  await client.query(`
    UPDATE vendors 
    SET wallet_balance = $1,
        outstanding_debt = $2 
    WHERE id = $3
  `, [newBalance, newDebt, vendorId]);

  // 6. Record reversal transaction in ledger
  let revDescription = `Order reversal - ${orderNumber} (${reason})`;
  if (addedToDebt > 0) {
    revDescription += ` [₹${recoveredFromWallet} deducted, ₹${addedToDebt} recorded as debt]`;
  }

  await client.query(`
    INSERT INTO vendor_transactions 
      (vendor_id, type, amount, order_number, description, gross_amount, commission_percent, commission_amount, net_amount, debt_recovered)
    VALUES 
      ($1, 'reversal', $2, $3, $4, $5, $6, $7, $8, $9)
    ON CONFLICT (vendor_id, order_number, type) WHERE type = 'reversal' AND order_number IS NOT NULL
    DO NOTHING
  `, [
    vendorId,
    netToReverse,
    orderNumber,
    revDescription,
    creditTx.gross_amount || null,
    creditTx.commission_percent || null,
    creditTx.commission_amount || null,
    netToReverse,
    0
  ]);

  // 7. Update vendor_order_payouts if exists
  await client.query(`
    UPDATE vendor_order_payouts
    SET status = 'cancelled', updated_at = NOW()
    WHERE vendor_id = $1 AND order_id = (SELECT id FROM orders WHERE order_number = $2 LIMIT 1)
  `, [vendorId, orderNumber]);

  return {
    success: true,
    reversed: true,
    netToReverse,
    recoveredFromWallet,
    addedToDebt,
    newBalance,
    newDebt
  };
}

/**
 * Calculates a vendor's withdrawable balance vs held/unsettled order earnings.
 * Earnings become withdrawable only after order is delivered and 7-day return window has elapsed,
 * provided no active return or dispute hold is placed on that order.
 *
 * @param {number|string} vendorId
 * @param {object} [client=pool]
 */
async function getVendorSettlementBalance(vendorId, client = pool) {
  const vRes = await client.query(`
    SELECT wallet_balance, COALESCE(outstanding_debt, 0) as outstanding_debt
    FROM vendors
    WHERE id = $1
  `, [vendorId]);

  if (vRes.rows.length === 0) {
    throw new Error(`Vendor ${vendorId} not found`);
  }

  const walletBalance = parseFloat(vRes.rows[0].wallet_balance || 0);
  const outstandingDebt = parseFloat(vRes.rows[0].outstanding_debt || 0);

  // Query all pending order earnings for this vendor with their order delivery & return status
  const ordersRes = await client.query(`
    SELECT vop.id as payout_id,
           vop.order_id,
           vop.amount,
           vop.status as payout_status,
           vop.hold_status,
           vop.hold_reason,
           o.order_number,
           o.status as order_status,
           o.delivered_at,
           (o.delivered_at IS NOT NULL AND o.delivered_at + INTERVAL '7 days' <= NOW()) as return_window_passed,
           EXISTS(
             SELECT 1 FROM order_returns ret 
             WHERE ret.order_id = vop.order_id 
               AND ret.vendor_id = vop.vendor_id
               AND ret.status NOT IN ('Return Rejected', 'Closed')
           ) as has_active_return
    FROM vendor_order_payouts vop
    JOIN orders o ON vop.order_id = o.id
    WHERE vop.vendor_id = $1 AND vop.status = 'pending'
  `, [vendorId]);

  let heldAmount = 0;
  let eligibleAmount = 0;

  for (const row of ordersRes.rows) {
    const amt = parseFloat(row.amount || 0);
    const isDelivered = row.order_status === 'delivered';
    const isPastReturnWindow = Boolean(row.return_window_passed);
    const hasActiveReturn = Boolean(row.has_active_return) || row.hold_status === 'on_hold';

    if (!isDelivered || !isPastReturnWindow || hasActiveReturn) {
      heldAmount += amt;
    } else {
      eligibleAmount += amt;
    }
  }

  heldAmount = Math.round(heldAmount * 100) / 100;
  eligibleAmount = Math.round(eligibleAmount * 100) / 100;

  const withdrawableBalance = Math.max(0, Math.round((walletBalance - heldAmount - outstandingDebt) * 100) / 100);

  return {
    walletBalance,
    outstandingDebt,
    heldAmount,
    eligibleAmount,
    withdrawableBalance,
    pendingOrdersCount: ordersRes.rows.length
  };
}

/**
 * Places an order's vendor earnings on hold due to a return request.
 */
async function holdOrderEarnings(orderId, vendorId, reason = 'return_requested', client = pool) {
  return await client.query(`
    UPDATE vendor_order_payouts
    SET hold_status = 'on_hold',
        hold_reason = $1,
        updated_at = NOW()
    WHERE order_id = $2 AND vendor_id = $3
  `, [reason, orderId, vendorId]);
}

/**
 * Releases an order's vendor earnings hold (e.g. return rejected or closed without refund).
 */
async function releaseOrderEarningsHold(orderId, vendorId, client = pool) {
  return await client.query(`
    UPDATE vendor_order_payouts
    SET hold_status = 'none',
        hold_reason = NULL,
        updated_at = NOW()
    WHERE order_id = $1 AND vendor_id = $2
  `, [orderId, vendorId]);
}

/**
 * Approves and releases held COD earnings to vendor wallet after cash remittance is verified.
 */
async function approveCodOrderSettlement({ orderId, client = pool, adminUser = 'admin', reference = null }) {
  const payoutsRes = await client.query(`
    SELECT vop.*, o.order_number, v.outstanding_debt
    FROM vendor_order_payouts vop
    JOIN orders o ON vop.order_id = o.id
    JOIN vendors v ON vop.vendor_id = v.id
    WHERE vop.order_id = $1 AND vop.hold_status = 'cod_pending_remittance'
    FOR UPDATE
  `, [orderId]);

  if (payoutsRes.rows.length === 0) {
    return { success: false, message: 'No held COD payouts found for this order.' };
  }

  for (const payout of payoutsRes.rows) {
    const vid = payout.vendor_id;
    const netEarnings = parseFloat(payout.amount || 0);
    const currentDebt = parseFloat(payout.outstanding_debt || 0);

    let debtRecovered = 0;
    let netCreditToWallet = netEarnings;
    let remainingDebt = currentDebt;

    if (currentDebt > 0) {
      debtRecovered = Math.min(netEarnings, currentDebt);
      debtRecovered = Math.round(debtRecovered * 100) / 100;
      netCreditToWallet = Math.round((netEarnings - debtRecovered) * 100) / 100;
      remainingDebt = Math.round((currentDebt - debtRecovered) * 100) / 100;
    }

    await client.query(`
      UPDATE vendors 
      SET wallet_balance = COALESCE(wallet_balance, 0) + $1,
          outstanding_debt = $2
      WHERE id = $3
    `, [netCreditToWallet, remainingDebt, vid]);

    await client.query(`
      UPDATE vendor_order_payouts
      SET hold_status = 'released',
          hold_reason = 'COD cash remitted & verified by ' || $1,
          updated_at = NOW()
      WHERE id = $2
    `, [adminUser, payout.id]);

    const narration = `Order ${payout.order_number} - COD cash remittance verified & settled to wallet (Approved by ${adminUser}${reference ? ', Ref: ' + reference : ''})`;
    await client.query(`
      INSERT INTO vendor_transactions 
        (vendor_id, type, amount, order_number, description, net_amount, debt_recovered, bank_reference)
      VALUES 
        ($1, 'credit', $2, $3, $4, $5, $6, $7)
    `, [vid, netCreditToWallet, payout.order_number, narration, netEarnings, debtRecovered, reference]);
  }

  return { success: true, settledCount: payoutsRes.rows.length };
}

module.exports = {
  getVendorActiveCommissionRate,
  calculateVendorEarnings,
  processOrderVendorAccounting,
  reverseVendorOrderCredit,
  getVendorSettlementBalance,
  holdOrderEarnings,
  releaseOrderEarningsHold,
  approveCodOrderSettlement
};
