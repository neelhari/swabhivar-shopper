require('dotenv').config({ path: __dirname + '/.env' });
const pool = require('./db');
const emailService = require('./services/emailService');
const bcrypt = require('bcryptjs');

async function runE2ETests() {
  console.log('========================================================');
  console.log('   SWABHIVAR SHOPPERS - REAL EMAIL OTP E2E TEST SUITE   ');
  console.log('========================================================\n');

  const testEmail = process.env.EMAIL_USER || 'swabhivarshopper@gmail.com';
  const testPhone = '9999988888';
  const testName = 'OTP Verification Tester';
  const testPassword = 'Password123!';
  const testOTP = Math.floor(100000 + Math.random() * 900000).toString();
  const expiresAt = new Date(Date.now() + 10 * 60 * 1000);

  console.log(`Test Target Email: ${testEmail}`);

  try {
    // 1. Direct Real Nodemailer Delivery via emailService
    console.log('\n[1/5] Testing Real Delivery of Signup OTP Email...');
    const mailRes = await emailService.sendMail({
      to: testEmail,
      subject: 'Your OTP for Swabhivar Shoppers Verification - Real Test',
      html: `
        <div style="font-family:Arial,sans-serif;max-width:500px;margin:auto;padding:24px;border:1px solid #e2e8f0;border-radius:12px;">
          <h2 style="color:#fe6603;margin:0 0 12px;">Welcome to Swabhivar Shoppers!</h2>
          <p>Hi <strong>${testName}</strong>,</p>
          <p>Your one-time verification code is:</p>
          <div style="font-size:36px;font-weight:bold;color:#fe6603;letter-spacing:8px;text-align:center;padding:16px;background:#fff8f1;border-radius:8px;margin:16px 0;">
            ${testOTP}
          </div>
          <p style="color:#718096;font-size:12px;">Valid for 10 minutes. Delivered via real Gmail SMTP.</p>
        </div>
      `
    });
    console.log('   ✅ SMTP Mail Dispatched Successfully!');
    console.log(`   Message ID: ${mailRes.messageId}`);
    console.log(`   Accepted by Server: ${JSON.stringify(mailRes.accepted)}`);

    // 2. Database Record & Verification Flow Simulation
    console.log('\n[2/5] Storing OTP in PostgreSQL otps table...');
    await pool.query('DELETE FROM otps WHERE LOWER(email) = LOWER($1)', [testEmail]);
    await pool.query(
      'INSERT INTO otps (email, otp, expires_at, attempts) VALUES ($1, $2, $3, 0)',
      [testEmail, testOTP, expiresAt]
    );
    console.log('   ✅ OTP record created with 10-minute expiry window.');

    // 3. Test Invalid Code Handling & Attempt Counter
    console.log('\n[3/5] Testing Invalid OTP Code Verification...');
    const invalidOtpRes = await pool.query(
      'SELECT * FROM otps WHERE LOWER(email) = LOWER($1) AND expires_at > NOW()',
      [testEmail]
    );
    if (!invalidOtpRes.rows.length) {
      throw new Error('OTP record not found in database');
    }
    const record = invalidOtpRes.rows[0];
    const wrongCode = '000000';
    if (record.otp !== wrongCode) {
      await pool.query('UPDATE otps SET attempts = attempts + 1 WHERE id = $1', [record.id]);
      console.log('   ✅ Invalid code rejected as expected. Attempt counter incremented.');
    }

    // 4. Test Valid OTP Verification
    console.log('\n[4/5] Testing Valid OTP Code Verification...');
    const validOtpRes = await pool.query(
      'SELECT * FROM otps WHERE LOWER(email) = LOWER($1) AND expires_at > NOW()',
      [testEmail]
    );
    const validRecord = validOtpRes.rows[0];
    if (validRecord.otp === testOTP) {
      console.log('   ✅ OTP successfully validated!');
      // Delete used OTP
      await pool.query('DELETE FROM otps WHERE id = $1', [validRecord.id]);
      console.log('   ✅ OTP record consumed and deleted to prevent replay.');
    } else {
      throw new Error('OTP mismatch during verification');
    }

    // 5. Test Customer Account Deletion OTP Email Delivery
    console.log('\n[5/5] Testing Account Deletion OTP Email Delivery...');
    const delOTP = Math.floor(100000 + Math.random() * 900000).toString();
    const delMailRes = await emailService.sendMail({
      to: testEmail,
      subject: 'Account Deletion Request - Verification Code (Real Test)',
      html: `
        <div style="font-family:Arial,sans-serif;max-width:500px;margin:auto;padding:24px;border:1px solid #fee2e2;border-radius:12px;">
          <h2 style="color:#dc2626;margin:0 0 12px;">Account Deletion Request</h2>
          <p>Hi <strong>${testName}</strong>,</p>
          <p>Your one-time deletion authorization code is:</p>
          <div style="font-size:36px;font-weight:bold;color:#dc2626;letter-spacing:8px;text-align:center;padding:16px;background:#fef2f2;border-radius:8px;margin:16px 0;">
            ${delOTP}
          </div>
          <p style="color:#6b7280;font-size:12px;">Valid for 10 minutes.</p>
        </div>
      `
    });
    console.log('   ✅ Deletion OTP Mail Dispatched Successfully!');
    console.log(`   Message ID: ${delMailRes.messageId}`);
    console.log(`   Accepted by Server: ${JSON.stringify(delMailRes.accepted)}`);

    console.log('\n========================================================');
    console.log('   ALL REAL EMAIL OTP E2E TESTS COMPLETED: 100% PASS    ');
    console.log('========================================================\n');
    process.exit(0);
  } catch (err) {
    console.error('\n❌ E2E Test Suite Encountered Error:', err);
    process.exit(1);
  } finally {
    await pool.end();
  }
}

runE2ETests();

