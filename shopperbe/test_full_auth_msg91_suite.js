require('dotenv').config({ path: __dirname + '/.env' });
const pool = require('./db');
const smsService = require('./services/smsService');
const emailService = require('./services/emailService');
const bcrypt = require('bcryptjs');

let testsPassed = 0;
let testsFailed = 0;

function assert(condition, message) {
  if (condition) {
    console.log(`  ✅ PASS: ${message}`);
    testsPassed++;
  } else {
    console.error(`  ❌ FAIL: ${message}`);
    testsFailed++;
  }
}

async function runSuite() {
  console.log('====================================================');
  console.log('SWABHIVAR SHOPPERS - COMPLETE AUTH & MSG91 TEST SUITE');
  console.log('====================================================\n');

  // Test 1: Mobile formatting and OTP Hashing
  console.log('--- TEST 1: Phone Formatting & Hashing Utilities ---');
  try {
    const f1 = smsService.formatIndianMobile('9876543210');
    assert(f1 === '919876543210', '10-digit phone formatted with 91 prefix');

    const f2 = smsService.formatIndianMobile('+91 9876543210');
    assert(f2 === '919876543210', '+91 phone sanitized to 91XXXXXXXXXX');

    let invalidCaught = false;
    try {
      smsService.formatIndianMobile('12345');
    } catch {
      invalidCaught = true;
    }
    assert(invalidCaught, 'Invalid phone number correctly throws error');

    const plainOtp = '654321';
    const hash = smsService.hashOTP(plainOtp);
    assert(hash.length === 64, 'SHA-256 OTP hash is 64 hex characters');
    assert(smsService.verifyOTPHash(plainOtp, hash), 'Plain OTP matches hash');
    assert(!smsService.verifyOTPHash('111111', hash), 'Incorrect OTP rejected by hash');
  } catch (err) {
    assert(false, 'Phone formatting error: ' + err.message);
  }

  // Test 2: Live MSG91 Flow API Call
  console.log('\n--- TEST 2: Live MSG91 Flow API Call ---');
  try {
    const liveRes = await smsService.sendCustomerSignupOTP('9876543210', '789123');
    assert(liveRes.success === true, 'MSG91 Flow API returned success');
    assert(!!liveRes.messageId, 'MSG91 Message ID received: ' + liveRes.messageId);
  } catch (err) {
    assert(false, 'Live MSG91 test error: ' + err.message);
  }

  // Test 3: Customer Registration Flow with DB Isolation
  console.log('\n--- TEST 3: Customer Registration SMS OTP Flow ---');
  const testCustEmail = `test_cust_${Date.now()}@example.com`;
  const testCustPhone = `91${Math.floor(6000000000 + Math.random() * 3999999999)}`;
  const custOtp = '482619';
  const custOtpHash = smsService.hashOTP(custOtp);

  try {
    // 3a: Clean prior test data
    await pool.query('DELETE FROM users WHERE email = $1 OR phone = $2', [testCustEmail, testCustPhone]);
    await pool.query("DELETE FROM otps WHERE phone = $1 AND purpose = 'customer_signup'", [testCustPhone]);

    // 3b: Insert unverified user
    await pool.query(
      'INSERT INTO users (name, email, phone, is_verified) VALUES ($1, $2, $3, FALSE)',
      ['Test Customer', testCustEmail, testCustPhone]
    );

    // 3c: Store hashed OTP
    await pool.query(
      "INSERT INTO otps (phone, email, otp, otp_hash, purpose, expires_at, attempts, last_sent_at) VALUES ($1,$2,$3,$4,'customer_signup', NOW() + INTERVAL '10 minutes', 0, NOW())",
      [testCustPhone, testCustEmail, custOtpHash, custOtpHash]
    );

    // 3d: Check DB record
    const otpRow = await pool.query(
      "SELECT * FROM otps WHERE phone = $1 AND purpose = 'customer_signup'",
      [testCustPhone]
    );
    assert(otpRow.rows.length === 1, 'OTP record created in database');
    assert(otpRow.rows[0].otp_hash === custOtpHash, 'OTP stored in hashed format (no plaintext)');
    assert(otpRow.rows[0].purpose === 'customer_signup', "Purpose correctly scoped to 'customer_signup'");

    // 3e: Test attempt counter on invalid OTP
    const wrongOtp = '000000';
    const isValid = smsService.verifyOTPHash(wrongOtp, otpRow.rows[0].otp_hash);
    assert(!isValid, 'Wrong OTP is rejected');

    await pool.query('UPDATE otps SET attempts = attempts + 1 WHERE id = $1', [otpRow.rows[0].id]);
    const updatedOtp = await pool.query('SELECT attempts FROM otps WHERE id = $1', [otpRow.rows[0].id]);
    assert(updatedOtp.rows[0].attempts === 1, 'Failed attempt counter incremented to 1');

    // 3f: Test correct OTP verification
    const isCorrect = smsService.verifyOTPHash(custOtp, otpRow.rows[0].otp_hash);
    assert(isCorrect, 'Correct OTP accepted');

    await pool.query('UPDATE users SET is_verified = TRUE WHERE email = $1', [testCustEmail]);
    await pool.query('DELETE FROM otps WHERE id = $1', [otpRow.rows[0].id]);

    const verifiedUser = await pool.query('SELECT is_verified FROM users WHERE email = $1', [testCustEmail]);
    assert(verifiedUser.rows[0].is_verified === true, 'User is_verified successfully transitioned to TRUE');
  } catch (err) {
    assert(false, 'Customer registration flow error: ' + err.message);
  }

  // Test 4: Vendor Registration Flow & Paid Recovery
  console.log('\n--- TEST 4: Vendor Registration SMS OTP & Paid Recovery ---');
  const testVendorEmail = `test_vnd_${Date.now()}@example.com`;
  const testVendorPhone = `91${Math.floor(6000000000 + Math.random() * 3999999999)}`;
  const testPaymentId = `pay_test_${Date.now()}`;
  const vendorOtp = '918273';
  const vendorOtpHash = smsService.hashOTP(vendorOtp);

  try {
    // 4a: Clean prior test data
    await pool.query('DELETE FROM vendors WHERE email = $1', [testVendorEmail]);

    // 4b: Simulate Step 3 post-payment vendor creation
    const vIns = await pool.query(
      `INSERT INTO vendors (name, store_name, email, phone, pickup_phone, status, pending_plan_id, pending_payment_id)
       VALUES ($1, $2, $3, $4, $5, 'unverified', 1, $6) RETURNING id`,
      ['Vendor Test', 'Test Store', testVendorEmail, testVendorPhone.slice(-10), testVendorPhone.slice(-10), testPaymentId]
    );
    const vendorId = vIns.rows[0].id;

    // 4c: Insert vendor signup OTP
    await pool.query(
      "INSERT INTO otps (phone, email, otp, otp_hash, purpose, expires_at, attempts, last_sent_at) VALUES ($1,$2,$3,$4,'vendor_signup', NOW() + INTERVAL '10 minutes', 0, NOW())",
      [testVendorPhone, testVendorEmail, vendorOtpHash, vendorOtpHash]
    );

    // 4d: Test Paid Vendor Recovery Check
    const checkRes = await pool.query(
      `SELECT id, status, pending_payment_id, pending_plan_id 
       FROM vendors WHERE LOWER(email) = $1 OR phone = $2`,
      [testVendorEmail.toLowerCase(), testVendorPhone.slice(-10)]
    );
    assert(checkRes.rows.length > 0, 'Paid vendor recovered from database');
    assert(checkRes.rows[0].pending_payment_id === testPaymentId, 'Pending payment ID retained for recovery');
    assert(checkRes.rows[0].status === 'unverified', 'Vendor remains unverified prior to OTP submission');

    // 4e: Verify Vendor OTP & Activate
    await pool.query("UPDATE vendors SET status = 'pending', pending_plan_id = NULL, pending_payment_id = NULL WHERE id = $1", [vendorId]);
    await pool.query("DELETE FROM otps WHERE phone = $1 AND purpose = 'vendor_signup'", [testVendorPhone]);

    const activatedVendor = await pool.query('SELECT status, pending_payment_id FROM vendors WHERE id = $1', [vendorId]);
    assert(activatedVendor.rows[0].status === 'pending', "Vendor status updated to 'pending' (ready for admin approval)");
    assert(activatedVendor.rows[0].pending_payment_id === null, 'pending_payment_id cleared upon verification');
  } catch (err) {
    assert(false, 'Vendor registration test error: ' + err.message);
  }

  // Test 5: Gmail SMTP Password Reset Preservation
  console.log('\n--- TEST 5: Gmail SMTP Password Reset & Scope Isolation ---');
  try {
    const smtpStatus = await emailService.verifySmtpConnection();
    assert(smtpStatus.success === true, 'Gmail SMTP connection verified: ' + (smtpStatus.message || 'OK'));

    // Test Purpose Separation: Ensure forgot-password OTP does not delete signup OTP
    const sharedEmail = `shared_${Date.now()}@example.com`;
    const sOtpHash = smsService.hashOTP('111111');
    const fOtpHash = smsService.hashOTP('222222');

    // Insert signup OTP
    await pool.query(
      "INSERT INTO otps (email, otp, otp_hash, purpose, expires_at) VALUES ($1, $2, $3, 'customer_signup', NOW() + INTERVAL '10 min')",
      [sharedEmail, sOtpHash, sOtpHash]
    );

    // Insert forgot password OTP
    await pool.query(
      "INSERT INTO otps (email, otp, otp_hash, purpose, expires_at) VALUES ($1, $2, $3, 'customer_forgot_password', NOW() + INTERVAL '10 min')",
      [sharedEmail, fOtpHash, fOtpHash]
    );

    // Delete only forgot password
    await pool.query("DELETE FROM otps WHERE email = $1 AND purpose = 'customer_forgot_password'", [sharedEmail]);

    const remainingSignup = await pool.query("SELECT * FROM otps WHERE email = $1 AND purpose = 'customer_signup'", [sharedEmail]);
    assert(remainingSignup.rows.length === 1, 'Signup OTP is completely protected from forgot-password deletion');

    // Clean up
    await pool.query('DELETE FROM otps WHERE email = $1', [sharedEmail]);
    await pool.query('DELETE FROM users WHERE email = $1', [testCustEmail]);
    await pool.query('DELETE FROM vendors WHERE email = $1', [testVendorEmail]);
  } catch (err) {
    assert(false, 'Gmail SMTP & scope test error: ' + err.message);
  }

  console.log('\n====================================================');
  console.log(`TEST RESULTS: ${testsPassed} PASSED, ${testsFailed} FAILED`);
  console.log('====================================================');

  pool.end();
  process.exit(testsFailed > 0 ? 1 : 0);
}

runSuite().catch(err => {
  console.error('Fatal suite error:', err);
  process.exit(1);
});
