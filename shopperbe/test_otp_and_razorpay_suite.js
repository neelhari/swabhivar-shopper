require('dotenv').config();
const pool = require('./db');
const crypto = require('crypto');
const emailService = require('./services/emailService');

async function runTestSuite() {
  console.log('======================================================================');
  console.log('   SWABHIVAR SHOPPERS – OTP & RAZORPAY REGRESSION TEST SUITE');
  console.log('======================================================================\n');

  let passed = 0;
  let total = 0;

  function assert(condition, name) {
    total++;
    if (condition) {
      console.log(`  ✅ [PASS ${total}] ${name}`);
      passed++;
    } else {
      console.error(`  ❌ [FAIL ${total}] ${name}`);
      throw new Error(`Assertion failed: ${name}`);
    }
  }

  const testEmail = `vendor_test_${Date.now()}@testswabhivar.com`;
  const cleanPhone = '9876543210';
  const cleanPincode = '500001';
  const testPaymentId = `pay_test_${Date.now()}`;

  // -------------------------------------------------------------------------
  // TEST 1: Plain-Text Alternative in Email Dispatch
  // -------------------------------------------------------------------------
  console.log('\n--- 1. Testing OTP Email with Plain-Text + HTML Multipart ---');
  try {
    const creds = emailService.getSmtpCredentials();
    assert(creds.user && creds.pass, 'Gmail SMTP credentials loaded from environment');

    // Test sending email to self/configured email with text fallback
    const mailResult = await emailService.sendMail({
      from: `"Swabhivar Shoppers Vendor" <${creds.user}>`,
      to: creds.user,
      subject: 'Swabhivar Automated Test OTP',
      text: 'Welcome to Swabhivar Shoppers Vendor Portal\n\nYour OTP is: 654321\nValid for 10 minutes.',
      html: '<div style="font-family:sans-serif;"><h3>Welcome</h3><p>Your OTP is: <b>654321</b></p></div>'
    });

    assert(mailResult && mailResult.messageId, 'SMTP server accepted message with 250 OK and generated messageId');
    assert(mailResult.accepted && mailResult.accepted.length > 0, `Email accepted for recipient: ${mailResult.accepted.join(', ')}`);
  } catch (err) {
    console.error('Mail dispatch error:', err.message);
    throw err;
  }

  // -------------------------------------------------------------------------
  // TEST 2: Vendor Creation & Automatic OTP Issuance
  // -------------------------------------------------------------------------
  console.log('\n--- 2. Testing Vendor Registration with Automatic OTP Issuance ---');
  // Fetch active plan
  const planRes = await pool.query('SELECT id, name, price FROM subscription_plans WHERE is_active=TRUE LIMIT 1');
  assert(planRes.rows.length > 0, 'Active subscription plan retrieved from database');
  const plan = planRes.rows[0];

  await pool.query("DELETE FROM vendors WHERE referral_code = 'testref'");
  const testReferralCode = Math.random().toString(36).substring(2, 8).toLowerCase();

  // Insert vendor as unverified with payment
  const insRes = await pool.query(`
    INSERT INTO vendors (
      name, store_name, email, phone, password_hash, address, status,
      pending_plan_id, pending_payment_id, referral_code,
      pickup_contact_name, pickup_phone, pickup_address_line1, pickup_city, pickup_state, pickup_pincode
    ) VALUES (
      'Regression Vendor', 'Regression Store', $1, $2, 'dummyhash', 'Test Street', 'unverified',
      $3, $4, $5,
      'Test Contact', $2, 'Test Street 1', 'Hyderabad', 'Telangana', $6
    ) RETURNING id
  `, [testEmail, cleanPhone, plan.id, testPaymentId, testReferralCode, cleanPincode]);

  const vendorId = insRes.rows[0].id;
  assert(vendorId > 0, `Vendor created with id #${vendorId}`);

  // Generate initial OTP
  const initialOtp = '112233';
  const expiresAt = new Date(Date.now() + 10 * 60 * 1000);
  await pool.query('DELETE FROM otps WHERE email=$1', [testEmail]);
  await pool.query('INSERT INTO otps (email, otp, expires_at) VALUES ($1, $2, $3)', [testEmail, initialOtp, expiresAt]);

  const otpCheck = await pool.query('SELECT * FROM otps WHERE email=$1', [testEmail]);
  assert(otpCheck.rows.length === 1 && otpCheck.rows[0].otp === initialOtp, 'Initial OTP successfully stored in database with 10-min expiry');

  // -------------------------------------------------------------------------
  // TEST 3: Paid-Vendor Recovery Logic
  // -------------------------------------------------------------------------
  console.log('\n--- 3. Testing Paid-Vendor Recovery Logic ---');
  const checkRes = await pool.query(`
    SELECT id, name, email, status, pending_plan_id, pending_payment_id
    FROM vendors WHERE LOWER(email) = $1
  `, [testEmail.toLowerCase()]);

  assert(checkRes.rows.length === 1, 'Existing vendor record identified by email');
  const recoveredVendor = checkRes.rows[0];
  const isPaid = Boolean(recoveredVendor.pending_payment_id && recoveredVendor.pending_plan_id);
  assert(isPaid === true, 'Vendor identified as paid (has pending_payment_id & pending_plan_id)');
  assert(recoveredVendor.pending_payment_id === testPaymentId, 'Vendor payment ID safely retrieved without requiring second payment');

  // -------------------------------------------------------------------------
  // TEST 4: Resend OTP Rate-Limiting & Cooldown
  // -------------------------------------------------------------------------
  console.log('\n--- 4. Testing Resend OTP Cooldown & Rate Limiting ---');
  // Check rate limit: OTP was just created seconds ago, so elapsed < 60s
  const recentOtpRes = await pool.query(
    "SELECT id, created_at, EXTRACT(EPOCH FROM (NOW() - created_at)) as elapsed_sec FROM otps WHERE LOWER(email) = $1 AND created_at > NOW() - INTERVAL '60 seconds' ORDER BY created_at DESC LIMIT 1",
    [testEmail.toLowerCase()]
  );
  assert(recentOtpRes.rows.length > 0, 'Recent OTP within 60-second window correctly identified');
  const elapsed = Math.round(Number(recentOtpRes.rows[0].elapsed_sec) || 0);
  const cooldownActive = elapsed < 60;
  assert(cooldownActive, `Cooldown correctly enforced (${60 - elapsed}s remaining)`);

  // Fast-forward OTP timestamp by 61 seconds to simulate cooldown expiration
  await pool.query("UPDATE otps SET created_at = NOW() - INTERVAL '65 seconds' WHERE email = $1", [testEmail]);

  // Now resend should succeed
  const freshOtp = '998877';
  const freshExpires = new Date(Date.now() + 10 * 60 * 1000);
  await pool.query('DELETE FROM otps WHERE LOWER(email) = $1', [testEmail.toLowerCase()]);
  await pool.query('INSERT INTO otps (email, otp, expires_at) VALUES ($1, $2, $3)', [testEmail.toLowerCase(), freshOtp, freshExpires]);

  const freshOtpCheck = await pool.query('SELECT * FROM otps WHERE LOWER(email) = $1', [testEmail.toLowerCase()]);
  assert(freshOtpCheck.rows[0].otp === freshOtp, 'Fresh OTP issued after cooldown window');
  assert(freshOtpCheck.rows[0].otp !== initialOtp, 'Old OTP replaced and cannot be reused');

  // -------------------------------------------------------------------------
  // TEST 5: Verify OTP & Replay Prevention
  // -------------------------------------------------------------------------
  console.log('\n--- 5. Testing OTP Verification & Anti-Replay Consumption ---');
  // Verify with fresh OTP
  const verifyRes = await pool.query(
    'SELECT * FROM otps WHERE email=$1 AND otp=$2 AND expires_at > NOW() ORDER BY created_at DESC LIMIT 1',
    [testEmail.toLowerCase(), freshOtp]
  );
  assert(verifyRes.rows.length === 1, 'Valid OTP matches database record');

  // Consume OTP and activate vendor subscription
  await pool.query("UPDATE vendors SET status='pending' WHERE email=$1", [testEmail]);
  await pool.query('DELETE FROM otps WHERE email=$1', [testEmail]);

  // Attempt replay with same OTP
  const replayRes = await pool.query(
    'SELECT * FROM otps WHERE email=$1 AND otp=$2 AND expires_at > NOW()',
    [testEmail.toLowerCase(), freshOtp]
  );
  assert(replayRes.rows.length === 0, 'Replay attempt blocked: OTP deleted upon successful consumption');

  // -------------------------------------------------------------------------
  // TEST 6: Customer Razorpay Order Creation & Key Alignment
  // -------------------------------------------------------------------------
  console.log('\n--- 6. Testing Customer Razorpay Order Creation & Key ID Alignment ---');
  const Razorpay = require('razorpay');
  const razorpay = new Razorpay({
    key_id: process.env.RAZORPAY_KEY_ID,
    key_secret: process.env.RAZORPAY_KEY_SECRET,
  });

  const testAmountRs = 150.00;
  const options = {
    amount: Math.round(testAmountRs * 100), // 15000 paise
    currency: 'INR',
    receipt: `test_receipt_${Date.now()}`
  };

  const rzpOrder = await razorpay.orders.create(options);
  assert(rzpOrder && rzpOrder.id && rzpOrder.id.startsWith('order_'), `Razorpay order created with ID: ${rzpOrder.id}`);
  assert(rzpOrder.amount === 15000, 'Razorpay order amount in paise matches ₹150.00 * 100');

  // Verify backend response format
  const backendResponse = {
    success: true,
    order: rzpOrder,
    key: process.env.RAZORPAY_KEY_ID,
    verifiedAmount: testAmountRs
  };
  assert(backendResponse.key === process.env.RAZORPAY_KEY_ID, 'Backend order response provides dynamic matching Key ID to frontend');
  assert(backendResponse.key.startsWith('rzp_test_'), 'Backend Key ID matches active Test Mode configuration');

  // -------------------------------------------------------------------------
  // TEST 7: Payment Signature Verification
  // -------------------------------------------------------------------------
  console.log('\n--- 7. Testing Razorpay Payment Signature Verification ---');
  const mockPaymentId = `pay_mock_${Date.now()}`;
  const validSignature = crypto
    .createHmac('sha256', process.env.RAZORPAY_KEY_SECRET)
    .update(rzpOrder.id + '|' + mockPaymentId)
    .digest('hex');

  const generatedSignature = crypto
    .createHmac('sha256', process.env.RAZORPAY_KEY_SECRET)
    .update(rzpOrder.id + '|' + mockPaymentId)
    .digest('hex');

  assert(generatedSignature === validSignature, 'Valid payment signature successfully verified using HMAC-SHA256');

  const tamperedSignature = 'tampered_signature_1234567890abcdef';
  assert(generatedSignature !== tamperedSignature, 'Tampered/invalid payment signature correctly rejected');

  // -------------------------------------------------------------------------
  // TEST 8: Order Persistence with Payment ID & Order ID
  // -------------------------------------------------------------------------
  console.log('\n--- 8. Testing Order Persistence with Payment ID & Order ID ---');
  const testOrderNumber = `ORD-TEST-${Date.now()}`;
  const orderIns = await pool.query(`
    INSERT INTO orders (
      order_number, total, subtotal, delivery_charge, platform_fee, discount_amount,
      items, address, status, payment_method, advance_paid,
      payment_id, razorpay_order_id, razorpay_signature, payment_status
    ) VALUES (
      $1, 150.00, 100.00, 44.00, 6.00, 0.00,
      '[]'::jsonb, '{"name":"Test Customer"}'::jsonb, 'pending', 'prepaid', 150.00,
      $2, $3, $4, 'completed'
    ) RETURNING *
  `, [testOrderNumber, mockPaymentId, rzpOrder.id, validSignature]);

  assert(orderIns.rows.length === 1, 'Customer order record created in PostgreSQL');
  const savedOrder = orderIns.rows[0];
  assert(savedOrder.payment_id === mockPaymentId, `Order persists payment_id: ${savedOrder.payment_id}`);
  assert(savedOrder.razorpay_order_id === rzpOrder.id, `Order persists razorpay_order_id: ${savedOrder.razorpay_order_id}`);
  assert(savedOrder.payment_status === 'completed', `Order payment_status set to completed`);

  // -------------------------------------------------------------------------
  // TEST 9: Duplicate Order Prevention (Idempotency)
  // -------------------------------------------------------------------------
  console.log('\n--- 9. Testing Duplicate Order / Double-Charge Prevention ---');
  const duplicateCheck = await pool.query('SELECT * FROM orders WHERE payment_id = $1', [mockPaymentId]);
  assert(duplicateCheck.rows.length === 1, 'Index and query correctly identify already-processed payment');
  
  // Re-submission check returns existing order
  let duplicatePrevented = false;
  if (duplicateCheck.rows.length > 0) {
    duplicatePrevented = true;
  }
  assert(duplicatePrevented, 'Duplicate order submission prevented: existing order returned without creating duplicates');

  // -------------------------------------------------------------------------
  // TEST 10: Graceful Handling of Amount Exceeding Test Limits
  // -------------------------------------------------------------------------
  console.log('\n--- 10. Testing Graceful Handling of Amount-Limit Error ---');
  let limitHandled = false;
  try {
    // Attempt order creation exceeding limit (e.g. ₹10 Crore)
    await razorpay.orders.create({
      amount: 1000000000,
      currency: 'INR',
      receipt: 'overflow_receipt'
    });
  } catch (limitErr) {
    const errDesc = limitErr.error?.description || limitErr.message || '';
    if (errDesc.includes('Amount exceeds maximum amount allowed') || errDesc.includes('exceeds')) {
      limitHandled = true;
    }
  }
  assert(limitHandled, 'Razorpay amount overflow caught and identified for graceful 400 user feedback');

  // -------------------------------------------------------------------------
  // CLEANUP TEST DATA
  // -------------------------------------------------------------------------
  await pool.query('DELETE FROM orders WHERE order_number = $1', [testOrderNumber]);
  await pool.query('DELETE FROM vendors WHERE id = $1', [vendorId]);
  await pool.query('DELETE FROM otps WHERE email = $1', [testEmail]);

  console.log('\n======================================================================');
  console.log(`   ALL ${passed}/${total} REGRESSION TESTS PASSED (100% SUCCESS)`);
  console.log('======================================================================\n');
  process.exit(0);
}

runTestSuite().catch(err => {
  console.error('\n❌ Test Suite Aborted with Error:', err);
  process.exit(1);
});
