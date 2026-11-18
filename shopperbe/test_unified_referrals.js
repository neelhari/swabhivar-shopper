const pool = require('./db');
const referralAccountingService = require('./services/referralAccountingService');

async function runTests() {
  console.log('--- Starting Unified Referral Test Suite ---');

  try {
    // 1. Test getRewardPercent
    const custPercent = await referralAccountingService.getRewardPercent('customer_referral_percent');
    const vendPercent = await referralAccountingService.getRewardPercent('vendor_referral_percent');
    console.log(`[PASS] Reward rates loaded: Customer = ${custPercent}%, Vendor = ${vendPercent}%`);

    // 2. Test Vendor referral data retrieval
    const vendorRes = await pool.query('SELECT id, referral_code FROM vendors LIMIT 1');
    if (vendorRes.rows.length > 0) {
      const vId = vendorRes.rows[0].id;
      const vData = await referralAccountingService.getVendorReferralData(vId);
      console.log(`[PASS] getVendorReferralData succeeded for vendor ${vId}:`);
      console.log(`       Code: ${vData.referral_code}, Metrics:`, vData.metrics);
      console.log(`       History entries: ${vData.history.length}`);
    } else {
      console.log('[SKIP] No vendor found in database');
    }

    // 3. Test Customer referral data retrieval
    const userRes = await pool.query('SELECT id, referral_code FROM users LIMIT 1');
    if (userRes.rows.length > 0) {
      const uId = userRes.rows[0].id;
      const uData = await referralAccountingService.getCustomerReferralData(uId);
      console.log(`[PASS] getCustomerReferralData succeeded for customer ${uId}:`);
      console.log(`       Code: ${uData.referral_code}, Metrics:`, uData.metrics);
      console.log(`       History entries: ${uData.history.length}`);

      if (!uData.referral_code) {
        throw new Error('Customer referral code was not generated/retrieved');
      }
    } else {
      console.log('[SKIP] No user found in database');
    }

    console.log('--- ALL REFERRAL INTEGRATION TESTS PASSED ---');
  } catch (err) {
    console.error('[FAIL] Referral test error:', err);
    process.exit(1);
  } finally {
    await pool.end();
  }
}

runTests();
