const pool = require('../db');

/**
 * Service for managing referral reward calculations, idempotency, attribution and reporting.
 */
class ReferralAccountingService {
  /**
   * Get dynamic percentage setting from database settings table.
   * @param {string} key 'customer_referral_percent' | 'vendor_referral_percent'
   * @param {object} client DB client (optional)
   */
  async getRewardPercent(key, client = pool) {
    const res = await client.query('SELECT value FROM settings WHERE key = $1', [key]);
    if (res.rows.length === 0) return null;
    const val = parseFloat(res.rows[0].value);
    if (isNaN(val) || val < 0 || val > 100) return null;
    return val;
  }

  /**
   * Check if a referral code is a self-referral.
   */
  async isSelfReferral(referralCode, accountType, id, client = pool) {
    if (!referralCode) return false;
    if (accountType === 'vendor') {
      const v = await client.query('SELECT id FROM vendors WHERE referral_code = $1 AND id = $2', [referralCode, id]);
      return v.rows.length > 0;
    } else {
      const u = await client.query('SELECT id FROM users WHERE referral_code = $1 AND id = $2', [referralCode, id]);
      return u.rows.length > 0;
    }
  }

  /**
   * Record referral reward for an eligible customer order.
   * @param {object} params { orderNumber, customerId, orderTotal, client }
   */
  async recordCustomerOrderReward({ orderNumber, customerId, orderTotal, client = pool }) {
    if (!orderNumber || !customerId || parseFloat(orderTotal) <= 0) return null;

    // 1. Fetch customer's referred_by code
    const uRes = await client.query('SELECT id, name, email, referred_by FROM users WHERE id = $1', [customerId]);
    if (uRes.rows.length === 0) return null;
    const referredBy = (uRes.rows[0].referred_by || '').trim();
    if (!referredBy) return null;

    // 2. Resolve referrer (Check vendors first, then users)
    let referrerType = null;
    let referrerId = null;

    const vendorCheck = await client.query('SELECT id, referral_code FROM vendors WHERE referral_code = $1', [referredBy]);
    if (vendorCheck.rows.length > 0) {
      referrerType = 'vendor';
      referrerId = vendorCheck.rows[0].id;
    } else {
      const userCheck = await client.query('SELECT id, referral_code FROM users WHERE referral_code = $1', [referredBy]);
      if (userCheck.rows.length > 0) {
        referrerType = 'customer';
        referrerId = userCheck.rows[0].id;
      }
    }

    if (!referrerType || !referrerId) return null;

    // 3. Prevent self-referral
    if (referrerType === 'customer' && referrerId === customerId) {
      console.warn(`[Referral] Self-referral attempt blocked for customer id ${customerId}`);
      return null;
    }

    // 4. Fetch dynamic percentage from database settings (NO hardcoded defaults)
    const percent = await this.getRewardPercent('customer_referral_percent', client);
    if (percent === null || percent <= 0) {
      console.warn("[Referral] 'customer_referral_percent' is not configured or 0%. Skipping reward.");
      return null;
    }

    // 5. Calculate reward amount
    const eligibleAmount = parseFloat(parseFloat(orderTotal).toFixed(2));
    const rewardAmount = parseFloat((eligibleAmount * (percent / 100)).toFixed(2));
    if (rewardAmount <= 0) return null;

    // 6. Idempotent insertion into referral_rewards table
    const insertRewardRes = await client.query(
      `INSERT INTO referral_rewards (
        referrer_type, referrer_id, referral_code,
        referred_type, referred_id, event_type, event_reference,
        eligible_amount, reward_percent, reward_amount, status, notes
      ) VALUES (
        $1, $2, $3, 'customer', $4, 'customer_order', $5, $6, $7, $8, 'approved', $9
      ) ON CONFLICT (referrer_type, referrer_id, event_type, event_reference) DO NOTHING
      RETURNING *`,
      [
        referrerType,
        referrerId,
        referredBy,
        customerId,
        orderNumber,
        eligibleAmount,
        percent,
        rewardAmount,
        `Customer referral reward (${percent}%) on order ${orderNumber}`
      ]
    );

    // If already exists, do not double-credit wallet
    if (insertRewardRes.rows.length === 0) {
      console.log(`[Referral] Duplicate reward attempt blocked for order ${orderNumber}`);
      return null;
    }

    const rewardRecord = insertRewardRes.rows[0];

    // 7. Credit wallet & log transaction in appropriate ledger
    if (referrerType === 'vendor') {
      await client.query(
        `INSERT INTO vendor_transactions (
          vendor_id, type, amount, order_number, description, gross_amount, net_amount
        ) VALUES (
          $1, 'credit', $2, $3, $4, $2, $2
        ) ON CONFLICT (vendor_id, order_number, type) WHERE type = 'credit' AND order_number IS NOT NULL DO NOTHING`,
        [
          referrerId,
          rewardAmount,
          orderNumber,
          `Referral reward (${percent}%) from customer order ${orderNumber}`
        ]
      );
      await client.query(
        'UPDATE vendors SET wallet_balance = COALESCE(wallet_balance, 0) + $1 WHERE id = $2',
        [rewardAmount, referrerId]
      );
    } else {
      await client.query(
        `INSERT INTO user_wallet_transactions (
          user_id, type, amount, reference_id, description, referral_percent
        ) VALUES (
          $1, 'credit', $2, $3, $4, $5
        )`,
        [
          referrerId,
          rewardAmount,
          orderNumber,
          `Referral reward (${percent}%) from order ${orderNumber}`,
          percent
        ]
      );
      await client.query(
        'UPDATE users SET wallet_balance = COALESCE(wallet_balance, 0) + $1 WHERE id = $2',
        [rewardAmount, referrerId]
      );
    }

    return rewardRecord;
  }

  /**
   * Record referral reward for an eligible vendor subscription.
   * @param {object} params { vendorId, paymentId, subscriptionAmount, client }
   */
  async recordVendorSubscriptionReward({ vendorId, paymentId, subscriptionAmount, client = pool }) {
    if (!vendorId || !paymentId || parseFloat(subscriptionAmount) <= 0) return null;

    // 1. Fetch vendor's referred_by code
    const vRes = await client.query('SELECT id, name, referred_by FROM vendors WHERE id = $1', [vendorId]);
    if (vRes.rows.length === 0) return null;
    const referredBy = (vRes.rows[0].referred_by || '').trim();
    if (!referredBy) return null;

    // 2. Resolve referrer (Check vendors first, then users)
    let referrerType = null;
    let referrerId = null;

    const vendorCheck = await client.query('SELECT id, referral_code FROM vendors WHERE referral_code = $1', [referredBy]);
    if (vendorCheck.rows.length > 0) {
      referrerType = 'vendor';
      referrerId = vendorCheck.rows[0].id;
    } else {
      const userCheck = await client.query('SELECT id, referral_code FROM users WHERE referral_code = $1', [referredBy]);
      if (userCheck.rows.length > 0) {
        referrerType = 'customer';
        referrerId = userCheck.rows[0].id;
      }
    }

    if (!referrerType || !referrerId) return null;

    // 3. Prevent self-referral
    if (referrerType === 'vendor' && referrerId === vendorId) {
      console.warn(`[Referral] Self-referral attempt blocked for vendor id ${vendorId}`);
      return null;
    }

    // 4. Fetch dynamic percentage from database settings (NO hardcoded defaults)
    const percent = await this.getRewardPercent('vendor_referral_percent', client);
    if (percent === null || percent <= 0) {
      console.warn("[Referral] 'vendor_referral_percent' is not configured or 0%. Skipping reward.");
      return null;
    }

    // 5. Calculate reward amount
    const eligibleAmount = parseFloat(parseFloat(subscriptionAmount).toFixed(2));
    const rewardAmount = parseFloat((eligibleAmount * (percent / 100)).toFixed(2));
    if (rewardAmount <= 0) return null;

    // 6. Idempotent insertion into referral_rewards table
    const insertRewardRes = await client.query(
      `INSERT INTO referral_rewards (
        referrer_type, referrer_id, referral_code,
        referred_type, referred_id, event_type, event_reference,
        eligible_amount, reward_percent, reward_amount, status, notes
      ) VALUES (
        $1, $2, $3, 'vendor', $4, 'vendor_subscription', $5, $6, $7, $8, 'approved', $9
      ) ON CONFLICT (referrer_type, referrer_id, event_type, event_reference) DO NOTHING
      RETURNING *`,
      [
        referrerType,
        referrerId,
        referredBy,
        vendorId,
        paymentId,
        eligibleAmount,
        percent,
        rewardAmount,
        `Vendor subscription referral reward (${percent}%) on payment ${paymentId}`
      ]
    );

    // If already exists, do not double-credit wallet
    if (insertRewardRes.rows.length === 0) {
      console.log(`[Referral] Duplicate reward attempt blocked for subscription ${paymentId}`);
      return null;
    }

    const rewardRecord = insertRewardRes.rows[0];

    // 7. Credit wallet & log transaction in appropriate ledger
    if (referrerType === 'vendor') {
      await client.query(
        `INSERT INTO vendor_transactions (
          vendor_id, type, amount, order_number, description, gross_amount, net_amount
        ) VALUES (
          $1, 'credit', $2, $3, $4, $2, $2
        ) ON CONFLICT (vendor_id, order_number, type) WHERE type = 'credit' AND order_number IS NOT NULL DO NOTHING`,
        [
          referrerId,
          rewardAmount,
          paymentId,
          `Referral reward (${percent}%) on vendor subscription ${paymentId}`
        ]
      );
      await client.query(
        'UPDATE vendors SET wallet_balance = COALESCE(wallet_balance, 0) + $1 WHERE id = $2',
        [rewardAmount, referrerId]
      );
    } else {
      await client.query(
        `INSERT INTO user_wallet_transactions (
          user_id, type, amount, reference_id, description, referral_percent
        ) VALUES (
          $1, 'credit', $2, $3, $4, $5
        )`,
        [
          referrerId,
          rewardAmount,
          paymentId,
          `Referral reward (${percent}%) on vendor subscription ${paymentId}`,
          percent
        ]
      );
      await client.query(
        'UPDATE users SET wallet_balance = COALESCE(wallet_balance, 0) + $1 WHERE id = $2',
        [rewardAmount, referrerId]
      );
    }

    return rewardRecord;
  }

  /**
   * Get complete vendor referral overview, metrics, and detailed history.
   * @param {number} vendorId Authenticated vendor ID
   */
  async getVendorReferralData(vendorId, client = pool) {
    const vRes = await client.query('SELECT id, name, store_name, referral_code, wallet_balance FROM vendors WHERE id = $1', [vendorId]);
    if (vRes.rows.length === 0) throw new Error('Vendor not found');
    const vendor = vRes.rows[0];
    const code = vendor.referral_code;

    // Active percentages from settings
    const customerPercent = await this.getRewardPercent('customer_referral_percent', client);
    const vendorPercent = await this.getRewardPercent('vendor_referral_percent', client);

    if (!code) {
      return {
        referral_code: null,
        settings: { customer_percent: customerPercent, vendor_percent: vendorPercent },
        metrics: {
          total_vendor_referrals: 0,
          total_customer_referrals: 0,
          active_referred_vendors: 0,
          active_referred_customers: 0,
          pending_referral_rewards: 0,
          approved_referral_rewards: 0,
          paid_referral_rewards: 0,
          total_referral_earnings: 0
        },
        referrals: []
      };
    }

    // 1. Fetch referred customers
    const customersRes = await client.query(
      `SELECT id, name, email, phone, 'customer' AS account_type,
              CASE WHEN is_verified THEN 'Active' ELSE 'Pending' END AS status,
              created_at
       FROM users WHERE referred_by = $1 ORDER BY created_at DESC`,
      [code]
    );

    // 2. Fetch referred vendors
    const vendorsRes = await client.query(
      `SELECT id, name, store_name, email, phone, 'vendor' AS account_type,
              status, created_at
       FROM vendors WHERE referred_by = $1 ORDER BY created_at DESC`,
      [code]
    );

    // 3. Fetch all reward records for this vendor
    const rewardsRes = await client.query(
      `SELECT * FROM referral_rewards
       WHERE referrer_type = 'vendor' AND referrer_id = $1
       ORDER BY created_at DESC`,
      [vendorId]
    );
    const rewards = rewardsRes.rows;

    // Calculate metrics
    let pendingRewards = 0;
    let approvedRewards = 0;
    let paidRewards = 0;

    rewards.forEach(r => {
      const amt = parseFloat(r.reward_amount || 0);
      if (r.status === 'pending') pendingRewards += amt;
      else if (r.status === 'approved') approvedRewards += amt;
      else if (r.status === 'paid') paidRewards += amt;
    });

    const activeReferredCustomers = customersRes.rows.filter(c => (c.status || '').toLowerCase() === 'active').length;
    const activeReferredVendors = vendorsRes.rows.filter(v => ['approved', 'active'].includes((v.status || '').toLowerCase())).length;

    // 4. Build combined detailed history
    // Map each referred person and associate any reward events
    const historyList = [];

    // Map customers
    for (const c of customersRes.rows) {
      const userRewards = rewards.filter(r => r.referred_type === 'customer' && r.referred_id === c.id);
      if (userRewards.length > 0) {
        userRewards.forEach(r => {
          historyList.push({
            id: `c_${c.id}_${r.id}`,
            name: c.name,
            store_name: null,
            email: c.email,
            phone: c.phone,
            referral_type: 'customer',
            registration_date: c.created_at,
            referral_status: c.status,
            event_type: r.event_type,
            event_reference: r.event_reference,
            eligible_amount: parseFloat(r.eligible_amount || 0),
            applied_percentage: parseFloat(r.reward_percent || 0),
            reward_amount: parseFloat(r.reward_amount || 0),
            reward_status: r.status,
            payment_reference: r.payout_reference || r.event_reference || null,
            created_at: r.created_at
          });
        });
      } else {
        // Registered but no reward yet (e.g. hasn't made eligible purchase yet)
        historyList.push({
          id: `c_${c.id}`,
          name: c.name,
          store_name: null,
          email: c.email,
          phone: c.phone,
          referral_type: 'customer',
          registration_date: c.created_at,
          referral_status: c.status,
          event_type: 'registration',
          event_reference: null,
          eligible_amount: 0,
          applied_percentage: customerPercent || 0,
          reward_amount: 0,
          reward_status: 'No Qualifying Order',
          payment_reference: null,
          created_at: c.created_at
        });
      }
    }

    // Map vendors
    for (const v of vendorsRes.rows) {
      const vendorRewards = rewards.filter(r => r.referred_type === 'vendor' && r.referred_id === v.id);
      if (vendorRewards.length > 0) {
        vendorRewards.forEach(r => {
          historyList.push({
            id: `v_${v.id}_${r.id}`,
            name: v.name,
            store_name: v.store_name,
            email: v.email,
            phone: v.phone,
            referral_type: 'vendor',
            registration_date: v.created_at,
            referral_status: v.status,
            event_type: r.event_type,
            event_reference: r.event_reference,
            eligible_amount: parseFloat(r.eligible_amount || 0),
            applied_percentage: parseFloat(r.reward_percent || 0),
            reward_amount: parseFloat(r.reward_amount || 0),
            reward_status: r.status,
            payment_reference: r.payout_reference || r.event_reference || null,
            created_at: r.created_at
          });
        });
      } else {
        historyList.push({
          id: `v_${v.id}`,
          name: v.name,
          store_name: v.store_name,
          email: v.email,
          phone: v.phone,
          referral_type: 'vendor',
          registration_date: v.created_at,
          referral_status: v.status,
          event_type: 'registration',
          event_reference: null,
          eligible_amount: 0,
          applied_percentage: vendorPercent || 0,
          reward_amount: 0,
          reward_status: 'Pending Subscription',
          payment_reference: null,
          created_at: v.created_at
        });
      }
    }

    // Also include any standalone historical reward records (e.g. legacy signup bonus)
    for (const r of rewards) {
      const alreadyIncluded = historyList.some(h => h.event_reference === r.event_reference);
      if (!alreadyIncluded) {
        historyList.push({
          id: `rew_${r.id}`,
          name: r.referred_type === 'customer' ? 'Referred Customer' : 'Referred Vendor',
          store_name: null,
          email: null,
          phone: null,
          referral_type: r.referred_type,
          registration_date: r.created_at,
          referral_status: 'Active',
          event_type: r.event_type,
          event_reference: r.event_reference,
          eligible_amount: parseFloat(r.eligible_amount || 0),
          applied_percentage: parseFloat(r.reward_percent || 0),
          reward_amount: parseFloat(r.reward_amount || 0),
          reward_status: r.status,
          payment_reference: r.payout_reference || r.event_reference || null,
          created_at: r.created_at
        });
      }
    }

    // Sort by created_at DESC
    historyList.sort((a, b) => new Date(b.created_at) - new Date(a.created_at));

    return {
      referral_code: code,
      settings: {
        customer_percent: customerPercent,
        vendor_percent: vendorPercent
      },
      metrics: {
        total_vendor_referrals: vendorsRes.rows.length,
        total_customer_referrals: customersRes.rows.length,
        active_referred_vendors: activeReferredVendors,
        active_referred_customers: activeReferredCustomers,
        pending_referral_rewards: parseFloat(pendingRewards.toFixed(2)),
        approved_referral_rewards: parseFloat(approvedRewards.toFixed(2)),
        paid_referral_rewards: parseFloat(paidRewards.toFixed(2)),
        total_referral_earnings: parseFloat((approvedRewards + paidRewards).toFixed(2))
      },
      history: historyList
    };
  }

  /**
   * Retrieves full audit metrics and referral history for a customer
   * @param {number} userId Authenticated user (customer) ID
   */
  async getCustomerReferralData(userId, client = pool) {
    const uRes = await client.query('SELECT id, name, email, phone, referral_code, wallet_balance FROM users WHERE id = $1', [userId]);
    if (uRes.rows.length === 0) throw new Error('Customer not found');
    const user = uRes.rows[0];
    let code = user.referral_code;

    // If customer doesn't have a referral code yet, auto-generate one
    if (!code) {
      code = Math.random().toString(36).substring(2, 8).toLowerCase();
      await client.query('UPDATE users SET referral_code = $1 WHERE id = $2', [code, userId]);
      user.referral_code = code;
    }

    // Active percentages from settings
    const customerPercent = await this.getRewardPercent('customer_referral_percent', client);
    const vendorPercent = await this.getRewardPercent('vendor_referral_percent', client);

    // 1. Fetch referred customers
    const customersRes = await client.query(
      `SELECT id, name, email, phone, 'customer' AS account_type,
              CASE WHEN is_verified THEN 'Active' ELSE 'Pending' END AS status,
              created_at
       FROM users WHERE referred_by = $1 ORDER BY created_at DESC`,
      [code]
    );

    // 2. Fetch referred vendors
    const vendorsRes = await client.query(
      `SELECT id, name, store_name, email, phone, 'vendor' AS account_type,
              status, created_at
       FROM vendors WHERE referred_by = $1 ORDER BY created_at DESC`,
      [code]
    );

    // 3. Fetch all reward records for this customer
    const rewardsRes = await client.query(
      `SELECT * FROM referral_rewards
       WHERE referrer_type = 'customer' AND referrer_id = $1
       ORDER BY created_at DESC`,
      [userId]
    );
    const rewards = rewardsRes.rows;

    // Calculate metrics
    let pendingRewards = 0;
    let approvedRewards = 0;
    let paidRewards = 0;

    rewards.forEach(r => {
      const amt = parseFloat(r.reward_amount || 0);
      if (r.status === 'pending') pendingRewards += amt;
      else if (r.status === 'approved') approvedRewards += amt;
      else if (r.status === 'paid') paidRewards += amt;
    });

    const activeReferredCustomers = customersRes.rows.filter(c => (c.status || '').toLowerCase() === 'active').length;
    const activeReferredVendors = vendorsRes.rows.filter(v => ['approved', 'active'].includes((v.status || '').toLowerCase())).length;

    // 4. Build combined detailed history
    const historyList = [];

    // Map customers
    for (const c of customersRes.rows) {
      const userRewards = rewards.filter(r => r.referred_type === 'customer' && r.referred_id === c.id);
      if (userRewards.length > 0) {
        userRewards.forEach(r => {
          historyList.push({
            id: `c_${c.id}_${r.id}`,
            name: c.name,
            store_name: null,
            email: c.email,
            phone: c.phone,
            referral_type: 'customer',
            registration_date: c.created_at,
            referral_status: c.status,
            event_type: r.event_type,
            event_reference: r.event_reference,
            eligible_amount: parseFloat(r.eligible_amount || 0),
            applied_percentage: parseFloat(r.reward_percent || 0),
            reward_amount: parseFloat(r.reward_amount || 0),
            reward_status: r.status,
            payment_reference: r.payout_reference || r.event_reference || null,
            created_at: r.created_at
          });
        });
      } else {
        historyList.push({
          id: `c_${c.id}`,
          name: c.name,
          store_name: null,
          email: c.email,
          phone: c.phone,
          referral_type: 'customer',
          registration_date: c.created_at,
          referral_status: c.status,
          event_type: 'registration',
          event_reference: null,
          eligible_amount: 0,
          applied_percentage: customerPercent || 0,
          reward_amount: 0,
          reward_status: 'No Qualifying Order',
          payment_reference: null,
          created_at: c.created_at
        });
      }
    }

    // Map vendors
    for (const v of vendorsRes.rows) {
      const vendorRewards = rewards.filter(r => r.referred_type === 'vendor' && r.referred_id === v.id);
      if (vendorRewards.length > 0) {
        vendorRewards.forEach(r => {
          historyList.push({
            id: `v_${v.id}_${r.id}`,
            name: v.name,
            store_name: v.store_name,
            email: v.email,
            phone: v.phone,
            referral_type: 'vendor',
            registration_date: v.created_at,
            referral_status: v.status,
            event_type: r.event_type,
            event_reference: r.event_reference,
            eligible_amount: parseFloat(r.eligible_amount || 0),
            applied_percentage: parseFloat(r.reward_percent || 0),
            reward_amount: parseFloat(r.reward_amount || 0),
            reward_status: r.status,
            payment_reference: r.payout_reference || r.event_reference || null,
            created_at: r.created_at
          });
        });
      } else {
        historyList.push({
          id: `v_${v.id}`,
          name: v.name,
          store_name: v.store_name,
          email: v.email,
          phone: v.phone,
          referral_type: 'vendor',
          registration_date: v.created_at,
          referral_status: v.status,
          event_type: 'registration',
          event_reference: null,
          eligible_amount: 0,
          applied_percentage: vendorPercent || 0,
          reward_amount: 0,
          reward_status: 'Pending Subscription',
          payment_reference: null,
          created_at: v.created_at
        });
      }
    }

    // Also include any standalone historical reward records
    for (const r of rewards) {
      const alreadyIncluded = historyList.some(h => h.event_reference === r.event_reference);
      if (!alreadyIncluded) {
        historyList.push({
          id: `rew_${r.id}`,
          name: r.referred_type === 'customer' ? 'Referred Customer' : 'Referred Vendor',
          store_name: null,
          email: null,
          phone: null,
          referral_type: r.referred_type,
          registration_date: r.created_at,
          referral_status: 'Active',
          event_type: r.event_type,
          event_reference: r.event_reference,
          eligible_amount: parseFloat(r.eligible_amount || 0),
          applied_percentage: parseFloat(r.reward_percent || 0),
          reward_amount: parseFloat(r.reward_amount || 0),
          reward_status: r.status,
          payment_reference: r.payout_reference || r.event_reference || null,
          created_at: r.created_at
        });
      }
    }

    // Sort by created_at DESC
    historyList.sort((a, b) => new Date(b.created_at) - new Date(a.created_at));

    return {
      referral_code: code,
      settings: {
        customer_percent: customerPercent,
        vendor_percent: vendorPercent
      },
      metrics: {
        total_vendor_referrals: vendorsRes.rows.length,
        total_customer_referrals: customersRes.rows.length,
        active_referred_vendors: activeReferredVendors,
        active_referred_customers: activeReferredCustomers,
        pending_referral_rewards: parseFloat(pendingRewards.toFixed(2)),
        approved_referral_rewards: parseFloat(approvedRewards.toFixed(2)),
        paid_referral_rewards: parseFloat(paidRewards.toFixed(2)),
        total_referral_earnings: parseFloat((approvedRewards + paidRewards).toFixed(2))
      },
      history: historyList
    };
  }
}

module.exports = new ReferralAccountingService();
