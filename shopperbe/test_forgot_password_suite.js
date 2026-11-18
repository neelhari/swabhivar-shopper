require('dotenv').config({ path: __dirname + '/.env' });
const pool = require('./db');
const emailService = require('./services/emailService');
const bcrypt = require('bcryptjs');
const axios = require('axios');
const jwt = require('jsonwebtoken');

const BASE_URL = process.env.TEST_API_URL || 'http://127.0.0.1:5000/api';

async function runForgotPasswordSuite() {
  console.log('================================================================');
  console.log('    SWABHIVAR SHOPPERS - FORGOT PASSWORD E2E AUDIT & TEST SUITE ');
  console.log('================================================================\n');

  const timestamp = Date.now();
  // Using real delivery to swabhivarshopper@gmail.com to test actual Gmail SMTP
  const testEmail = process.env.EMAIL_USER || 'swabhivarshopper@gmail.com';
  const testName = 'Forgot Password Verification User';
  const testPhone = '98765' + Math.floor(10000 + Math.random() * 90000);
  const initialPassword = 'InitialSecure123!';
  const newPassword = 'NewSecretPassword456!';

  let testUserId = null;
  let originalPasswordHash = null;

  try {
    // ----------------------------------------------------------------
    // 0. Preparation: Setup or update test account in database
    // ----------------------------------------------------------------
    console.log('[SETUP] Preparing verified customer test account...');
    const initialHash = await bcrypt.hash(initialPassword, 10);

    const existingUser = await pool.query('SELECT id, password_hash FROM users WHERE LOWER(email) = LOWER($1)', [testEmail]);
    if (existingUser.rows.length > 0) {
      testUserId = existingUser.rows[0].id;
      originalPasswordHash = existingUser.rows[0].password_hash;
      await pool.query(
        'UPDATE users SET password_hash = $1, is_verified = true, name = $2 WHERE id = $3',
        [initialHash, testName, testUserId]
      );
      console.log(`   Found existing test account (ID: ${testUserId}), reset password to initial test password.`);
    } else {
      const insertRes = await pool.query(
        `INSERT INTO users (name, email, phone, password_hash, is_verified, referral_code)
         VALUES ($1, $2, $3, $4, true, $5) RETURNING id`,
        [testName, testEmail, testPhone, initialHash, 'FP' + timestamp.toString().slice(-4)]
      );
      testUserId = insertRes.rows[0].id;
      console.log(`   Created fresh verified test account (ID: ${testUserId}).`);
    }

    // Clean previous OTPs for this email
    await pool.query('DELETE FROM otps WHERE LOWER(email) = LOWER($1)', [testEmail]);

    // ----------------------------------------------------------------
    // 1. Verify Initial Login with initialPassword
    // ----------------------------------------------------------------
    console.log('\n[TEST 1] Verifying customer login with INITIAL password...');
    const initialLoginRes = await axios.post(`${BASE_URL}/auth/login`, {
      email: testEmail,
      password: initialPassword
    });
    if (initialLoginRes.status === 200 && initialLoginRes.data.token) {
      console.log('   ✅ Initial login succeeded (JWT token generated).');
    } else {
      throw new Error('Initial login failed unexpectedly');
    }

    // ----------------------------------------------------------------
    // 2. Customer Requests Password Reset (POST /api/auth/forgot-password)
    // ----------------------------------------------------------------
    console.log('\n[TEST 2] Customer enters registered email and requests OTP...');
    const forgotRes = await axios.post(`${BASE_URL}/auth/forgot-password`, {
      email: testEmail
    });
    console.log('   Response status:', forgotRes.status);
    console.log('   Response message:', forgotRes.data.message);
    if (!forgotRes.data.success && forgotRes.data.message !== 'OTP sent to your email') {
      throw new Error('Forgot password request failed: ' + JSON.stringify(forgotRes.data));
    }
    console.log('   ✅ Real Gmail SMTP OTP dispatched successfully.');

    // Verify OTP in PostgreSQL database
    const otpDbRes = await pool.query(
      'SELECT * FROM otps WHERE LOWER(email) = LOWER($1) AND expires_at > NOW() ORDER BY created_at DESC LIMIT 1',
      [testEmail]
    );
    if (!otpDbRes.rows.length) {
      throw new Error('OTP was not stored in database!');
    }
    const realOtpRecord = otpDbRes.rows[0];
    const generatedOtp = realOtpRecord.otp;
    console.log(`   ✅ OTP stored in database: length=${generatedOtp.length}, expires_at=${realOtpRecord.expires_at}`);

    // ----------------------------------------------------------------
    // 3. Test Invalid & Expired OTP Rejection
    // ----------------------------------------------------------------
    console.log('\n[TEST 3] Testing rejection of incorrect OTP...');
    try {
      await axios.post(`${BASE_URL}/auth/verify-reset-otp`, {
        email: testEmail,
        otp: '000000'
      });
      throw new Error('Incorrect OTP was accepted when it should be rejected!');
    } catch (err) {
      if (err.response && err.response.status === 400) {
        console.log('   ✅ Incorrect OTP properly rejected with HTTP 400.');
      } else {
        throw err;
      }
    }

    console.log('\n[TEST 4] Testing rejection of expired OTP...');
    // Create temporary expired OTP record
    const expiredOtp = '999999';
    const pastTime = new Date(Date.now() - 5 * 60 * 1000);
    await pool.query(
      'INSERT INTO otps (email, otp, expires_at, attempts) VALUES ($1, $2, $3, 0)',
      ['expired_test@swabhivar.com', expiredOtp, pastTime]
    );
    try {
      await axios.post(`${BASE_URL}/auth/verify-reset-otp`, {
        email: 'expired_test@swabhivar.com',
        otp: expiredOtp
      });
      throw new Error('Expired OTP was accepted when it should be rejected!');
    } catch (err) {
      if (err.response && err.response.status === 400) {
        console.log('   ✅ Expired OTP properly rejected with HTTP 400.');
      } else {
        throw err;
      }
    } finally {
      await pool.query('DELETE FROM otps WHERE email = $1', ['expired_test@swabhivar.com']);
    }

    // ----------------------------------------------------------------
    // 4. Verify Valid OTP (POST /api/auth/verify-reset-otp)
    // ----------------------------------------------------------------
    console.log('\n[TEST 5] Submitting valid OTP verification...');
    const verifyRes = await axios.post(`${BASE_URL}/auth/verify-reset-otp`, {
      email: testEmail,
      otp: generatedOtp
    });
    if (verifyRes.status === 200 && verifyRes.data.success) {
      console.log('   ✅ Valid OTP accepted: OTP verified successfully.');
    } else {
      throw new Error('Valid OTP verification failed: ' + JSON.stringify(verifyRes.data));
    }

    // ----------------------------------------------------------------
    // 5. Test Password Validation (<6 chars) on Reset
    // ----------------------------------------------------------------
    console.log('\n[TEST 6] Testing weak password rejection (< 6 chars)...');
    try {
      await axios.post(`${BASE_URL}/auth/reset-password`, {
        email: testEmail,
        otp: generatedOtp,
        newPassword: '123'
      });
      throw new Error('Weak password was accepted when it should be rejected!');
    } catch (err) {
      if (err.response && err.response.status === 400) {
        console.log('   ✅ Weak password (<6 characters) rejected with HTTP 400.');
      } else {
        throw err;
      }
    }

    // ----------------------------------------------------------------
    // 6. Reset Password with Valid New Password (POST /api/auth/reset-password)
    // ----------------------------------------------------------------
    console.log('\n[TEST 7] Setting new password...');
    const resetRes = await axios.post(`${BASE_URL}/auth/reset-password`, {
      email: testEmail,
      otp: generatedOtp,
      newPassword: newPassword
    });
    if (resetRes.status === 200 && resetRes.data.success) {
      console.log('   ✅ Password reset confirmed by API.');
    } else {
      throw new Error('Password reset failed: ' + JSON.stringify(resetRes.data));
    }

    // ----------------------------------------------------------------
    // 7. Verify Secure Hashing & OTP Invalidation in PostgreSQL
    // ----------------------------------------------------------------
    console.log('\n[TEST 8] Checking database state & password hash...');
    const userCheckRes = await pool.query('SELECT password_hash FROM users WHERE id = $1', [testUserId]);
    const updatedHash = userCheckRes.rows[0].password_hash;

    const isNewPassValid = await bcrypt.compare(newPassword, updatedHash);
    const isOldPassValid = await bcrypt.compare(initialPassword, updatedHash);

    if (isNewPassValid && !isOldPassValid) {
      console.log('   ✅ New password correctly bcrypt-hashed and saved in database.');
      console.log('   ✅ Old password is no longer valid against stored hash.');
    } else {
      throw new Error('Hash comparison failed: newPassValid=' + isNewPassValid + ', oldPassValid=' + isOldPassValid);
    }

    // Verify OTP consumed
    const remainingOtpRes = await pool.query('SELECT * FROM otps WHERE LOWER(email) = LOWER($1)', [testEmail]);
    if (remainingOtpRes.rows.length === 0) {
      console.log('   ✅ OTP record deleted from PostgreSQL. Replay attack prevented.');
    } else {
      throw new Error('OTP was not deleted after reset!');
    }

    // ----------------------------------------------------------------
    // 8. Verify Old Password Login Rejection & New Password Login Success
    // ----------------------------------------------------------------
    console.log('\n[TEST 9] Verifying old password login fails...');
    try {
      await axios.post(`${BASE_URL}/auth/login`, {
        email: testEmail,
        password: initialPassword
      });
      throw new Error('Login with old password succeeded when it should fail!');
    } catch (err) {
      if (err.response && (err.response.status === 401 || err.response.status === 400)) {
        console.log('   ✅ Login with old password rejected with HTTP 401 Unauthorized.');
      } else {
        throw err;
      }
    }

    console.log('\n[TEST 10] Verifying customer can log in using NEW password...');
    const newLoginRes = await axios.post(`${BASE_URL}/auth/login`, {
      email: testEmail,
      password: newPassword
    });
    if (newLoginRes.status === 200 && newLoginRes.data.token) {
      console.log('   ✅ Login with new password SUCCEEDED!');
      console.log(`   Customer authenticated: ID=${newLoginRes.data.user.id}, Email=${newLoginRes.data.user.email}`);
    } else {
      throw new Error('Login with new password failed: ' + JSON.stringify(newLoginRes.data));
    }

    // ----------------------------------------------------------------
    // 9. Regression Check: Existing Signup & Account Deletion OTP Workflows
    // ----------------------------------------------------------------
    console.log('\n[TEST 11] Regression check: Verifying Account Deletion OTP flow...');
    const delOtpReq = await axios.post(`${BASE_URL}/general/delete-account-request`, {
      email: testEmail
    });
    if (delOtpReq.status === 200 && delOtpReq.data.success) {
      console.log('   ✅ Account deletion OTP request accepted & dispatched without disturbance.');
    } else {
      throw new Error('Account deletion OTP request failed: ' + JSON.stringify(delOtpReq.data));
    }

    console.log('\n================================================================');
    console.log('   ALL FORGOT PASSWORD WORKFLOW TESTS PASSED (11/11 SUCCESS)    ');
    console.log('================================================================\n');

    process.exit(0);
  } catch (err) {
    console.error('\n❌ Forgot Password Suite Error:', err.response?.data || err.message);
    process.exit(1);
  } finally {
    // Clean up test data
    if (originalPasswordHash && testUserId) {
      await pool.query('UPDATE users SET password_hash = $1 WHERE id = $2', [originalPasswordHash, testUserId]);
      console.log('[CLEANUP] Restored test user original password hash.');
    }
    await pool.query('DELETE FROM otps WHERE LOWER(email) = LOWER($1)', [testEmail]);
    await pool.end();
  }
}

runForgotPasswordSuite();

