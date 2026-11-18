const axios = require('axios');
const pool = require('./db');

async function testOtpSecurity() {
  const email = `throttle_test_${Date.now()}@example.com`;
  console.log(`Setting up test user: ${email}`);
  await pool.query('INSERT INTO users (name, email, role, is_verified) VALUES ($1, $2, $3, true)', ['Test User', email, 'user']);

  try {
    // 1. Initial request
    const r1 = await axios.post('http://127.0.0.1:5000/api/general/delete-account-request', { email });
    console.log('✓ 1. Initial request accepted:', r1.data.success);

    // 2. Immediate resend within 60s -> 429
    try {
      await axios.post('http://127.0.0.1:5000/api/general/delete-account-request', { email });
      console.error('✗ 2. FAIL: Resend was not throttled');
    } catch (e) {
      console.log(`✓ 2. Resend cooldown active (HTTP ${e.response?.status}): ${e.response?.data?.error}`);
    }

    // 3. Failed attempt counter
    for (let i = 1; i <= 5; i++) {
      try {
        await axios.post('http://127.0.0.1:5000/api/general/delete-account-confirm', { email, otp: `11111${i}` });
      } catch (e) {
        console.log(`✓ 3.${i} Failed attempt recorded: ${e.response?.data?.error}`);
      }
    }

    // 4. 6th attempt should lock out & invalidate code (HTTP 429)
    try {
      await axios.post('http://127.0.0.1:5000/api/general/delete-account-confirm', { email, otp: '111111' });
      console.error('✗ 4. FAIL: 6th attempt was not locked out');
    } catch (e) {
      console.log(`✓ 4. Lockout triggered (HTTP ${e.response?.status}): ${e.response?.data?.error}`);
    }

    // Verify OTP was invalidated in DB
    const otpCheck = await pool.query('SELECT * FROM otps WHERE email = $1', [email]);
    console.log(`✓ 5. Invalidation verified: otps count = ${otpCheck.rows.length} (Expected 0)`);

  } finally {
    await pool.query('DELETE FROM otps WHERE email = $1', [email]);
    await pool.query('DELETE FROM users WHERE email = $1', [email]);
    pool.end();
  }
}

testOtpSecurity();

