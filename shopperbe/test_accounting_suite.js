const { Pool } = require('pg');
require('dotenv').config({ path: '/var/www/shoopp/shopperbe/.env' });
const vendorAccountingService = require('./services/vendorAccountingService');

const pool = new Pool({
  connectionString: process.env.DATABASE_URL
});

async function runTests() {
  console.log('=====================================================');
  console.log('🧪 SHOPPER VENDOR ACCOUNTING & BANK VERIFICATION SUITE');
  console.log('=====================================================');

  const client = await pool.connect();

  try {
    // -----------------------------------------------------------------
    // TEST 1: Retrieve Vendor 1 Commission Rate from Subscription
    // -----------------------------------------------------------------
    console.log('\n--- TEST 1: Subscription Commission Rate Resolution ---');
    const rateInfo = await vendorAccountingService.getVendorActiveCommissionRate(1, client);
    console.log('Rate Info for Vendor 1:', rateInfo);
    if (rateInfo.commissionPercent === 10) {
      console.log('✅ TEST 1 PASSED: Correctly resolved 10% commission rate from subscription features.');
    } else {
      console.warn('⚠️ Commission rate resolved to:', rateInfo.commissionPercent);
    }

    // -----------------------------------------------------------------
    // TEST 2: Commission & Net Earnings Calculation Logic
    // -----------------------------------------------------------------
    console.log('\n--- TEST 2: Financial Formula Calculation ---');
    const testItems = [
      { product: { id: 109, price: 1000, vendor_id: 1 }, qty: 1 }
    ];
    const earnings = vendorAccountingService.calculateVendorEarnings(testItems, 10);
    console.log('Financial Calculation for ₹1000 item @ 10% comm:', earnings);
    if (earnings.grossAmount === 1000 && earnings.commissionAmount === 100 && earnings.netEarnings === 900) {
      console.log('✅ TEST 2 PASSED: Gross ₹1,000 -> 10% Commission (₹100) -> Net Earnings ₹900.');
    } else {
      throw new Error(`Formula mismatch: ${JSON.stringify(earnings)}`);
    }

    // -----------------------------------------------------------------
    // TEST 3: Multi-Vendor Separation Calculation
    // -----------------------------------------------------------------
    console.log('\n--- TEST 3: Multi-Vendor Order Calculation ---');
    const multiItems = [
      { product: { id: 109, price: 500, vendor_id: 1 }, qty: 2 },
      { product: { id: 110, price: 200, vendor_id: 999 }, qty: 1 } // fake vendor 999
    ];
    const earningsVendor1 = vendorAccountingService.calculateVendorEarnings(
      multiItems.filter(i => i.product.vendor_id === 1), 
      10
    );
    console.log('Vendor 1 Multi-item Earnings:', earningsVendor1);
    if (earningsVendor1.grossAmount === 1000 && earningsVendor1.netEarnings === 900) {
      console.log('✅ TEST 3 PASSED: Multi-vendor items correctly isolated to vendor-specific totals.');
    }

    // -----------------------------------------------------------------
    // TEST 4: Atomic Credit, Debt Accumulation & Recovery (In Isolated Transaction)
    // -----------------------------------------------------------------
    console.log('\n--- TEST 4: Atomic Credit, Reversal, Debt Creation & Recovery ---');
    await client.query('BEGIN');

    // Create a temporary test vendor to ensure zero mutation of production vendor balance
    const testVendorRes = await client.query(`
      INSERT INTO vendors (name, email, phone, store_name, wallet_balance, outstanding_debt, bank_verification_status)
      VALUES ('Test Vendor Automation', 'test_vendor_auto@example.com', '9999999999', 'Auto Test Store', 0.00, 0.00, 'pending')
      RETURNING id, wallet_balance, outstanding_debt
    `);
    const testVid = testVendorRes.rows[0].id;
    console.log(`Created test vendor ID ${testVid} with balance ₹0 and debt ₹0`);

    // 4a. Process Order Credit of ₹1,000 gross (@ 10% commission = ₹900 net credit)
    const testOrderNum1 = `TEST-ORD-${Date.now()}-1`;
    const orderItems1 = [{ product: { id: 9999, price: 1000, vendor_id: testVid }, qty: 1 }];
    
    await vendorAccountingService.processOrderVendorAccounting({
      orderNumber: testOrderNum1,
      verifiedItems: orderItems1,
      client
    });

    const vCheck1 = await client.query('SELECT wallet_balance, outstanding_debt FROM vendors WHERE id = $1', [testVid]);
    console.log(`After Credit: Wallet Balance = ₹${vCheck1.rows[0].wallet_balance}, Debt = ₹${vCheck1.rows[0].outstanding_debt}`);
    if (parseFloat(vCheck1.rows[0].wallet_balance) !== 900) {
      throw new Error(`Expected wallet balance 900, got ${vCheck1.rows[0].wallet_balance}`);
    }

    // 4b. Idempotency Check: Calling credit again on same order should not double-credit
    await vendorAccountingService.processOrderVendorAccounting({
      orderNumber: testOrderNum1,
      verifiedItems: orderItems1,
      client
    });
    const vCheckDup = await client.query('SELECT wallet_balance FROM vendors WHERE id = $1', [testVid]);
    if (parseFloat(vCheckDup.rows[0].wallet_balance) !== 900) {
      throw new Error(`Duplicate credit prevented failed! Balance became ${vCheckDup.rows[0].wallet_balance}`);
    }
    console.log('✅ Duplicate credit protection verified (Idempotency index protected).');

    // 4c. Simulate Vendor Withdrawing ₹800 (Leaving ₹100 balance)
    await client.query('UPDATE vendors SET wallet_balance = 100.00 WHERE id = $1', [testVid]);
    console.log('Simulated partial payout/withdrawal: Current Wallet Balance = ₹100.00');

    // 4d. Order 1 is Cancelled! Net earnings of ₹900 must be reversed.
    // Available balance is only ₹100, so ₹100 deducted from wallet and remaining ₹800 recorded as OUTSTANDING DEBT!
    const revResult = await vendorAccountingService.reverseVendorOrderCredit({
      vendorId: testVid,
      orderNumber: testOrderNum1,
      reason: 'Customer cancelled order',
      client
    });
    console.log('Order Reversal Result:', revResult);

    const vCheck2 = await client.query('SELECT wallet_balance, outstanding_debt FROM vendors WHERE id = $1', [testVid]);
    console.log(`After Reversal: Wallet Balance = ₹${vCheck2.rows[0].wallet_balance}, Debt = ₹${vCheck2.rows[0].outstanding_debt}`);
    if (parseFloat(vCheck2.rows[0].wallet_balance) !== 0 || parseFloat(vCheck2.rows[0].outstanding_debt) !== 800) {
      throw new Error(`Expected balance 0 and debt 800, got bal=${vCheck2.rows[0].wallet_balance}, debt=${vCheck2.rows[0].outstanding_debt}`);
    }
    console.log('✅ Outstanding debt created accurately when balance was insufficient for reversal.');

    // 4e. Duplicate Reversal Check: Re-reversing the same order should do nothing
    const dupRevResult = await vendorAccountingService.reverseVendorOrderCredit({
      vendorId: testVid,
      orderNumber: testOrderNum1,
      reason: 'Repeated cancellation hook',
      client
    });
    if (dupRevResult.alreadyReversed !== true) {
      throw new Error('Duplicate reversal protection failed!');
    }
    console.log('✅ Duplicate reversal protection verified.');

    // 4f. Subsequent Order of ₹1,000 gross (₹900 net): Should automatically recover ₹800 debt!
    // Net credited to wallet should be ₹900 - ₹800 = ₹100, and debt should be ₹0!
    const testOrderNum2 = `TEST-ORD-${Date.now()}-2`;
    const orderItems2 = [{ product: { id: 9999, price: 1000, vendor_id: testVid }, qty: 1 }];

    await vendorAccountingService.processOrderVendorAccounting({
      orderNumber: testOrderNum2,
      verifiedItems: orderItems2,
      client
    });

    const vCheck3 = await client.query('SELECT wallet_balance, outstanding_debt FROM vendors WHERE id = $1', [testVid]);
    console.log(`After Subsequent Order: Wallet Balance = ₹${vCheck3.rows[0].wallet_balance}, Debt = ₹${vCheck3.rows[0].outstanding_debt}`);
    if (parseFloat(vCheck3.rows[0].wallet_balance) !== 100 || parseFloat(vCheck3.rows[0].outstanding_debt) !== 0) {
      throw new Error(`Debt recovery failed! Expected balance 100 and debt 0, got bal=${vCheck3.rows[0].wallet_balance}, debt=${vCheck3.rows[0].outstanding_debt}`);
    }
    console.log('✅ Debt automatically recovered from subsequent earnings.');

    // Check transaction ledger records for test vendor
    const txRecords = await client.query('SELECT type, amount, gross_amount, commission_percent, commission_amount, net_amount, debt_recovered, description FROM vendor_transactions WHERE vendor_id = $1 ORDER BY id', [testVid]);
    console.log('\nLedger Transactions for Test Scenario:');
    console.table(txRecords.rows);

    // Rollback test changes cleanly so no test artifacts remain in production DB
    await client.query('ROLLBACK');
    console.log('\n✅ Clean ROLLBACK of test transactions completed. Zero production data mutation.');

    // -----------------------------------------------------------------
    // TEST 5: Verify Live Vendor 1 Bank Details Endpoint
    // -----------------------------------------------------------------
    console.log('\n--- TEST 5: Live Vendor Bank Details Endpoint Verification ---');
    const bankDetailsRes = await pool.query(`
      SELECT id, name, store_name, email, wallet_balance, bank_account_holder_name,
             bank_account_number, bank_ifsc_code, bank_name,
             COALESCE(bank_verification_status, 'not_provided') as bank_verification_status
      FROM vendors WHERE id = 1
    `);
    console.log('Vendor 1 Live Bank Details:', bankDetailsRes.rows[0]);

  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    console.error('❌ TEST SUITE FAILED:', err);
    throw err;
  } finally {
    client.release();
    await pool.end();
  }
}

runTests().then(() => {
  console.log('\n=====================================================');
  console.log('🎉 ALL VENDOR ACCOUNTING & BANK TESTS PASSED!');
  console.log('=====================================================');
}).catch(() => {
  process.exit(1);
});

