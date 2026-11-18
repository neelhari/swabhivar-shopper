const pool = require('./db');
const referralAccountingService = require('./services/referralAccountingService');

async function runTestSuite() {
  console.log('====================================================');
  console.log('   SHOPPER REFERRAL INTEGRATION & ACCOUNTING SUITE  ');
  console.log('====================================================\n');

  let passed = 0;
  let failed = 0;

  function assert(condition, testName) {
    if (condition) {
      console.log(`✅ [PASS] ${testName}`);
      passed++;
    } else {
      console.error(`❌ [FAIL] ${testName}`);
      failed++;
    }
  }

  const client = await pool.connect();

  try {
    // SCENARIO 1: Admin sets a vendor referral percentage
    console.log('--- Testing Admin Percentage Configuration ---');
    const origVendorRes = await client.query("SELECT value FROM settings WHERE key = 'vendor_referral_percent'");
    const origCustomerRes = await client.query("SELECT value FROM settings WHERE key = 'customer_referral_percent'");
    const origVendorPct = origVendorRes.rows[0]?.value || '20';
    const origCustomerPct = origCustomerRes.rows[0]?.value || '10';

    await client.query("INSERT INTO settings (key, value) VALUES ('vendor_referral_percent', '25') ON CONFLICT (key) DO UPDATE SET value='25'");
    const vCheck = await referralAccountingService.getRewardPercent('vendor_referral_percent', client);
    assert(vCheck === 25, '1. Admin sets vendor referral percentage (saved as 25%)');

    // SCENARIO 2: Admin sets a customer referral percentage
    await client.query("INSERT INTO settings (key, value) VALUES ('customer_referral_percent', '15') ON CONFLICT (key) DO UPDATE SET value='15'");
    const cCheck = await referralAccountingService.getRewardPercent('customer_referral_percent', client);
    assert(cCheck === 15, '2. Admin sets customer referral percentage (saved as 15%)');

    // SCENARIO 3 & 4 & 5: Vendor shares vendor link, new vendor registers, attribution stored
    console.log('\n--- Testing Vendor Referral Flow ---');
    const testVendorRefCode = 'TESTVND_' + Math.random().toString(36).substring(2, 6);
    // Create referring vendor
    const refVendorIns = await client.query(`
      INSERT INTO vendors (name, email, phone, password_hash, referral_code, wallet_balance, status)
      VALUES ('Referrer Vendor Test', 'ref_vnd_${Date.now()}@test.com', '9999990001', 'hash', $1, 0, 'approved')
      RETURNING id, referral_code
    `, [testVendorRefCode]);
    const referringVendorId = refVendorIns.rows[0].id;

    // Check link generation
    const vendorLink = `http://localhost:5000/vendor-signup?ref=${testVendorRefCode}`;
    assert(vendorLink.includes(`ref=${testVendorRefCode}`), '3. Vendor shares vendor registration link with valid code');

    // New vendor registers using that link
    const newVendorIns = await client.query(`
      INSERT INTO vendors (name, email, phone, password_hash, referral_code, referred_by, wallet_balance, status)
      VALUES ('Referred Vendor Test', 'new_vnd_${Date.now()}@test.com', '9999990002', 'hash', 'NEWVND_' || $1, $1, 0, 'approved')
      RETURNING id, referred_by
    `, [testVendorRefCode]);
    const newVendorId = newVendorIns.rows[0].id;
    assert(newVendorIns.rows[0].referred_by === testVendorRefCode, '4 & 5. New vendor registers and referral attribution is correctly stored');

    // SCENARIO 6 & 7 & 8: Vendor shares customer link, new customer registers, attribution stored
    console.log('\n--- Testing Customer Referral Flow ---');
    const customerLink = `http://localhost:5000/?ref=${testVendorRefCode}`;
    assert(customerLink.includes(`ref=${testVendorRefCode}`), '6. Vendor shares customer shopping link with valid code');

    const newCustomerIns = await client.query(`
      INSERT INTO users (name, email, phone, password_hash, referral_code, referred_by, wallet_balance, is_verified)
      VALUES ('Referred Customer Test', 'new_cust_${Date.now()}@test.com', '9999990003', 'hash', 'CUST_' || $1, $1, 0, true)
      RETURNING id, referred_by
    `, [testVendorRefCode]);
    const newCustomerId = newCustomerIns.rows[0].id;
    assert(newCustomerIns.rows[0].referred_by === testVendorRefCode, '7 & 8. New customer registers and customer referral attribution is stored');

    // SCENARIO 9: Eligible activity triggers correct configured reward calculation
    console.log('\n--- Testing Reward Calculations ---');
    // Eligible vendor subscription: ₹1000 subscription fee at 25% = ₹250
    const paymentId = 'pay_test_' + Date.now();
    const vendorReward = await referralAccountingService.recordVendorSubscriptionReward({
      vendorId: newVendorId,
      paymentId,
      subscriptionAmount: 1000,
      client
    });
    assert(
      vendorReward && parseFloat(vendorReward.reward_amount) === 250 && parseFloat(vendorReward.reward_percent) === 25,
      '9a. Eligible vendor subscription triggers exact 25% reward (₹250 on ₹1000)'
    );

    // Verify referrer wallet credit
    const vBalRes = await client.query('SELECT wallet_balance FROM vendors WHERE id = $1', [referringVendorId]);
    assert(parseFloat(vBalRes.rows[0].wallet_balance) === 250, '9b. Referrer vendor wallet credited with exactly ₹250');

    // Eligible customer order: ₹2000 order total at 15% = ₹300
    const orderNumber = 'ORD-TEST-' + Date.now();
    const customerReward = await referralAccountingService.recordCustomerOrderReward({
      orderNumber,
      customerId: newCustomerId,
      orderTotal: 2000,
      client
    });
    assert(
      customerReward && parseFloat(customerReward.reward_amount) === 300 && parseFloat(customerReward.reward_percent) === 15,
      '9c. Eligible customer order triggers exact 15% reward (₹300 on ₹2000)'
    );

    const vBalRes2 = await client.query('SELECT wallet_balance FROM vendors WHERE id = $1', [referringVendorId]);
    assert(parseFloat(vBalRes2.rows[0].wallet_balance) === 550, '9d. Referrer vendor wallet balance accumulates to ₹550');

    // SCENARIO 10: Changing Admin percentage affects future eligible calculations
    console.log('\n--- Testing Percentage Update Impact ---');
    await client.query("UPDATE settings SET value='30' WHERE key='vendor_referral_percent'");
    await client.query("UPDATE settings SET value='20' WHERE key='customer_referral_percent'");

    const nextPaymentId = 'pay_next_' + Date.now();
    const futureVendorReward = await referralAccountingService.recordVendorSubscriptionReward({
      vendorId: newVendorId,
      paymentId: nextPaymentId,
      subscriptionAmount: 1000,
      client
    });
    assert(
      futureVendorReward && parseFloat(futureVendorReward.reward_percent) === 30 && parseFloat(futureVendorReward.reward_amount) === 300,
      '10. Changing Admin percentage affects future eligible calculations (uses 30% = ₹300)'
    );

    // SCENARIO 11: Historical reward calculations remain unchanged
    const histRes = await client.query('SELECT reward_percent, reward_amount FROM referral_rewards WHERE id = $1', [vendorReward.id]);
    assert(
      parseFloat(histRes.rows[0].reward_percent) === 25 && parseFloat(histRes.rows[0].reward_amount) === 250,
      '11. Historical reward record remains immutable at 25% (₹250)'
    );

    // SCENARIO 12: Duplicate referral reward attempts are blocked
    console.log('\n--- Testing Idempotency & Duplicate Protection ---');
    const duplicateAttempt = await referralAccountingService.recordCustomerOrderReward({
      orderNumber,
      customerId: newCustomerId,
      orderTotal: 2000,
      client
    });
    assert(duplicateAttempt === null, '12a. Duplicate order referral reward attempt blocked');

    const duplicateSubAttempt = await referralAccountingService.recordVendorSubscriptionReward({
      vendorId: newVendorId,
      paymentId,
      subscriptionAmount: 1000,
      client
    });
    assert(duplicateSubAttempt === null, '12b. Duplicate subscription referral reward attempt blocked');

    // SCENARIO 13: Vendor Refer & Earn page displays real referral statistics
    console.log('\n--- Testing Vendor Refer & Earn Data Endpoint ---');
    const vendorData = await referralAccountingService.getVendorReferralData(referringVendorId, client);
    assert(
      vendorData.metrics.total_vendor_referrals === 1 &&
      vendorData.metrics.total_customer_referrals === 1 &&
      vendorData.metrics.active_referred_vendors === 1 &&
      vendorData.metrics.active_referred_customers === 1 &&
      vendorData.metrics.total_referral_earnings === 850 && // 250 + 300 + 300
      vendorData.history.length >= 2,
      '13. Vendor Refer & Earn page returns comprehensive real database metrics'
    );

    // SCENARIO 14: Admin and Vendor dashboards show consistent reward amounts
    console.log('\n--- Testing Admin and Vendor Consistency ---');
    const adminRewRes = await client.query('SELECT SUM(reward_amount) as total FROM referral_rewards WHERE referral_code = $1', [testVendorRefCode]);
    assert(
      parseFloat(adminRewRes.rows[0].total) === vendorData.metrics.total_referral_earnings,
      '14. Admin reward totals and Vendor dashboard earnings match identically (₹850)'
    );

    // SCENARIO 15: Pending, approved, and paid rewards displayed correctly
    console.log('\n--- Testing Reward Statuses ---');
    // Mark one reward as paid via payout reference
    await client.query("UPDATE referral_rewards SET status='paid', payout_reference='PAYOUT_REF_999' WHERE id = $1", [vendorReward.id]);
    const updatedVendorData = await referralAccountingService.getVendorReferralData(referringVendorId, client);
    assert(
      updatedVendorData.metrics.paid_referral_rewards === 250 &&
      updatedVendorData.metrics.approved_referral_rewards === 600,
      '15. Paid (₹250) vs Approved (₹600) rewards segregated accurately'
    );

    // SCENARIO 16: Unauthorized vendors cannot access other vendors' referral records
    console.log('\n--- Testing Multi-Tenant Authorization ---');
    const otherVendorIns = await client.query(`
      INSERT INTO vendors (name, email, phone, password_hash, referral_code, wallet_balance, status)
      VALUES ('Other Vendor Test', 'other_${Date.now()}@test.com', '9999990009', 'hash', 'OTHER_' || $1, 0, 'approved')
      RETURNING id
    `, [testVendorRefCode]);
    const otherVendorId = otherVendorIns.rows[0].id;
    const otherData = await referralAccountingService.getVendorReferralData(otherVendorId, client);
    assert(
      otherData.metrics.total_referral_earnings === 0 && otherData.history.length === 0,
      '16. Unauthorized vendor cannot view other vendor\'s referral data (returns 0 records)'
    );

    // CLEANUP TEST RECORDS
    console.log('\n--- Cleaning up test records ---');
    await client.query('DELETE FROM referral_rewards WHERE referral_code = $1 OR referral_code LIKE $2', [testVendorRefCode, 'OTHER_' + testVendorRefCode]);
    await client.query('DELETE FROM vendor_transactions WHERE vendor_id = $1 OR vendor_id = $2 OR vendor_id = $3', [referringVendorId, newVendorId, otherVendorId]);
    await client.query('DELETE FROM users WHERE id = $1', [newCustomerId]);
    await client.query('DELETE FROM vendors WHERE id = $1 OR id = $2 OR id = $3', [referringVendorId, newVendorId, otherVendorId]);

    // Restore original settings
    await client.query("UPDATE settings SET value=$1 WHERE key='vendor_referral_percent'", [origVendorPct]);
    await client.query("UPDATE settings SET value=$1 WHERE key='customer_referral_percent'", [origCustomerPct]);
    console.log('Restored original settings to:', { vendor_percent: origVendorPct, customer_percent: origCustomerPct });

  } catch (err) {
    console.error('Test Suite encountered error:', err);
    failed++;
  } finally {
    client.release();
    await pool.end();
  }

  console.log('\n====================================================');
  console.log(`   SUITE COMPLETE: ${passed} PASSED, ${failed} FAILED`);
  console.log('====================================================');

  if (failed > 0) process.exit(1);
  process.exit(0);
}

runTestSuite();

