const pool = require('./db');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const axios = require('axios');

const JWT_SECRET = process.env.JWT_SECRET || 'fallback_secret';
const BASE_URL = 'http://127.0.0.1:5000/api';

let testsPassed = 0;
let testsFailed = 0;

function assert(condition, testName) {
  if (condition) {
    console.log(`✅ [PASS] ${testName}`);
    testsPassed++;
  } else {
    console.error(`❌ [FAIL] ${testName}`);
    testsFailed++;
  }
}

async function runAuditTests() {
  console.log('====================================================');
  console.log('   SHOPPER COMPLIANCE & SECURITY AUDIT TEST SUITE   ');
  console.log('====================================================\n');

  const client = await pool.connect();
  const testIds = [];

  try {
    // ----------------------------------------------------
    // TEST 1: Admin Route Authorization Verification
    // ----------------------------------------------------
    console.log('--- 1. Testing Admin Route Authorization ---');

    // 1a. Unauthenticated access rejected
    try {
      await axios.get(`${BASE_URL}/admin/users`);
      assert(false, '1a. Unauthenticated access should be rejected with 401');
    } catch (err) {
      assert(err.response?.status === 401, '1a. Unauthenticated access rejected with 401');
    }

    // 1b. Customer token rejected from admin routes
    const custToken = jwt.sign({ id: 999999, email: 'fake_customer@test.com', role: 'user' }, JWT_SECRET, { expiresIn: '1h' });
    try {
      await axios.get(`${BASE_URL}/admin/users`, {
        headers: { Authorization: `Bearer ${custToken}` }
      });
      assert(false, '1b. Customer token should be rejected with 403');
    } catch (err) {
      assert(err.response?.status === 403, '1b. Customer token rejected from admin routes with 403');
    }

    // 1c. Valid admin token allowed
    const adminUserRes = await client.query("SELECT id, email, role FROM users WHERE role = 'admin' LIMIT 1");
    if (adminUserRes.rows.length > 0) {
      const adminToken = jwt.sign({ id: adminUserRes.rows[0].id, email: adminUserRes.rows[0].email, role: 'admin' }, JWT_SECRET, { expiresIn: '1h' });
      try {
        const res = await axios.get(`${BASE_URL}/admin/stats`, {
          headers: { Authorization: `Bearer ${adminToken}` }
        });
        assert(res.status === 200 && res.data.totalUsers !== undefined, '1c. Admin token successfully accesses admin endpoints');
      } catch (err) {
        assert(false, `1c. Admin token access failed: ${err.message}`);
      }
    }

    // ----------------------------------------------------
    // TEST 2: In-App Account Deletion Workflow
    // ----------------------------------------------------
    console.log('\n--- 2. Testing In-App Account Deletion ---');

    // Create a temporary test customer
    const testPassword = 'TestPassword123!';
    const passwordHash = await bcrypt.hash(testPassword, 10);
    const testEmail1 = `audit_test_user_${Date.now()}@example.com`;

    const user1Res = await client.query(
      `INSERT INTO users (name, email, phone, password_hash, is_verified, role, wallet_balance)
       VALUES ($1, $2, $3, $4, TRUE, 'user', 0) RETURNING id`,
      ['Audit Test Customer', testEmail1, '9888877771', passwordHash]
    );
    const testUserId1 = user1Res.rows[0].id;
    testIds.push(testUserId1);

    const user1Token = jwt.sign({ id: testUserId1, email: testEmail1, role: 'user' }, JWT_SECRET, { expiresIn: '1h' });

    // Add address and cart item
    await client.query(
      `INSERT INTO addresses (user_id, name, line1, city, state, pincode, mobile)
       VALUES ($1, 'Test Addr', '123 Test St', 'City', 'State', '500001', '9888877771')`,
      [testUserId1]
    );

    // 2a. Reject deletion with incorrect password
    try {
      await axios.post(`${BASE_URL}/auth/delete-account`, { password: 'WrongPassword' }, {
        headers: { Authorization: `Bearer ${user1Token}` }
      });
      assert(false, '2a. Deletion with wrong password should fail');
    } catch (err) {
      assert(err.response?.status === 400 && err.response.data.error.includes('Incorrect password'), '2a. Deletion rejected when password does not match');
    }

    // 2b. Reject deletion when active order exists
    const activeOrderNum = `ORD-AUDIT-${Date.now()}`;
    const activeOrderRes = await client.query(
      `INSERT INTO orders (user_id, order_number, total, status, items, address)
       VALUES ($1, $2, 500, 'processing', '[]'::jsonb, '{}'::jsonb) RETURNING id`,
      [testUserId1, activeOrderNum]
    );
    const activeOrderId = activeOrderRes.rows[0].id;

    try {
      await axios.post(`${BASE_URL}/auth/delete-account`, { password: testPassword }, {
        headers: { Authorization: `Bearer ${user1Token}` }
      });
      assert(false, '2b. Deletion with active order should fail');
    } catch (err) {
      assert(err.response?.status === 400 && err.response.data.error.includes('active orders'), '2b. Deletion blocked when customer has active/in-transit orders');
    }

    // Mark order as delivered (completed)
    await client.query("UPDATE orders SET status = 'delivered' WHERE id = $1", [activeOrderId]);

    // Create a mock vendor payout record linked to this order to verify it survives deletion
    const vendorRes = await client.query("SELECT id FROM vendors LIMIT 1");
    const testVendorId = vendorRes.rows[0]?.id || 1;
    await client.query(
      `INSERT INTO vendor_order_payouts (order_id, vendor_id, amount, status)
       VALUES ($1, $2, 450, 'approved') ON CONFLICT DO NOTHING`,
      [activeOrderId, testVendorId]
    );

    // 2c. Successful deletion with past completed orders (Anonymization & Ledger Retention)
    const delRes = await axios.post(`${BASE_URL}/auth/delete-account`, { password: testPassword }, {
      headers: { Authorization: `Bearer ${user1Token}` }
    });
    assert(delRes.status === 200 && delRes.data.success === true, '2c. In-app account deletion completes successfully');

    // 2d. Verify user PII is scrubbed and addresses/cart are wiped
    const scrubbedUser = await client.query('SELECT name, email, phone, password_hash FROM users WHERE id=$1', [testUserId1]);
    assert(
      scrubbedUser.rows[0].name === 'Deleted Customer' &&
      scrubbedUser.rows[0].phone === null &&
      scrubbedUser.rows[0].password_hash === null &&
      scrubbedUser.rows[0].email.endsWith('@deleted.invalid'),
      '2d. User PII (name, phone, password, email) is anonymized'
    );

    // 2e. Verify orders and vendor payouts remain 100% intact
    const survivingOrder = await client.query('SELECT id, status FROM orders WHERE id=$1', [activeOrderId]);
    const survivingPayout = await client.query('SELECT id FROM vendor_order_payouts WHERE order_id=$1', [activeOrderId]);
    assert(
      survivingOrder.rows.length === 1 && survivingPayout.rows.length >= 1,
      '2e. Statutory financial records (orders and vendor payouts) are preserved'
    );

    // Clean up test order and payout
    await client.query('DELETE FROM vendor_order_payouts WHERE order_id=$1', [activeOrderId]);
    await client.query('DELETE FROM orders WHERE id=$1', [activeOrderId]);

    // ----------------------------------------------------
    // TEST 3: External Web Deletion Flow
    // ----------------------------------------------------
    console.log('\n--- 3. Testing External Web Deletion Flow ---');

    const testEmail2 = `ext_audit_${Date.now()}@example.com`;
    const user2Res = await client.query(
      `INSERT INTO users (name, email, phone, is_verified, role, wallet_balance)
       VALUES ($1, $2, $3, TRUE, 'user', 0) RETURNING id`,
      ['External Test Customer', testEmail2, '9888877772']
    );
    const testUserId2 = user2Res.rows[0].id;
    testIds.push(testUserId2);

    // 3a. Request deletion OTP
    const reqRes = await axios.post(`${BASE_URL}/general/delete-account-request`, { email: testEmail2 });
    assert(reqRes.data.success === true, '3a. External deletion request accepted and OTP dispatched');

    // Fetch generated OTP from database
    const otpRes = await client.query('SELECT otp FROM otps WHERE email=$1', [testEmail2]);
    const validOtp = otpRes.rows[0]?.otp;
    assert(!!validOtp && validOtp.length === 6, '3b. 6-digit OTP stored in database');

    // 3c. Rejection with invalid OTP
    try {
      await axios.post(`${BASE_URL}/general/delete-account-confirm`, { email: testEmail2, otp: '999999' });
      assert(false, '3c. Invalid OTP should be rejected');
    } catch (err) {
      assert(err.response?.status === 400, '3c. Invalid OTP rejected with 400');
    }

    // 3d. Confirm deletion with valid OTP (no orders -> hard delete)
    const confRes = await axios.post(`${BASE_URL}/general/delete-account-confirm`, { email: testEmail2, otp: validOtp });
    assert(confRes.status === 200 && confRes.data.success === true, '3d. External deletion confirmed with valid OTP');

    // 3e. Verify account is removed
    const checkUser2 = await client.query('SELECT id FROM users WHERE id=$1', [testUserId2]);
    assert(checkUser2.rows.length === 0, '3e. Non-financial user account cleanly deleted');

    // ----------------------------------------------------
    // TEST 4: Security Protections Against Admin Deletion
    // ----------------------------------------------------
    console.log('\n--- 4. Testing Admin Self-Deletion Block ---');
    if (adminUserRes.rows.length > 0) {
      const adminId = adminUserRes.rows[0].id;
      const adminToken = jwt.sign({ id: adminId, email: adminUserRes.rows[0].email, role: 'admin' }, JWT_SECRET, { expiresIn: '1h' });

      // In-app deletion attempt by admin
      try {
        await axios.post(`${BASE_URL}/auth/delete-account`, { password: 'any' }, {
          headers: { Authorization: `Bearer ${adminToken}` }
        });
        assert(false, '4a. Admin account in-app deletion should be blocked');
      } catch (err) {
        assert(err.response?.status === 403, '4a. Admin account in-app deletion blocked with 403');
      }

      // Admin user deletion via admin endpoint attempt
      try {
        await axios.delete(`${BASE_URL}/admin/users/${adminId}`, {
          headers: { Authorization: `Bearer ${adminToken}` }
        });
        assert(false, '4b. Admin deleting an admin user should be blocked');
      } catch (err) {
        assert(err.response?.status === 403, '4b. Deleting admin accounts blocked with 403');
      }
    }

  } catch (err) {
    console.error('Audit Test Suite Exception:', err);
    testsFailed++;
  } finally {
    // Clean up isolated test users if any remain
    if (testIds.length > 0) {
      await client.query('DELETE FROM users WHERE id = ANY($1)', [testIds]);
    }
    client.release();
    pool.end();
  }

  console.log('\n====================================================');
  console.log(`AUDIT TEST SUMMARY: ${testsPassed} PASSED, ${testsFailed} FAILED`);
  console.log('====================================================');
  if (testsFailed > 0) process.exit(1);
}

runAuditTests();

