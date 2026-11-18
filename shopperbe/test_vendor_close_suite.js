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

async function runVendorCloseSuite() {
  console.log('====================================================');
  console.log('      VENDOR STORE CLOSURE & SAFETY TEST SUITE      ');
  console.log('====================================================\n');

  const client = await pool.connect();
  let testVendorId = null;
  let testOrderId = null;
  let testReturnId = null;

  try {
    const testPassword = 'VendorClosePass123!';
    const passwordHash = await bcrypt.hash(testPassword, 10);
    const testEmail = `close_test_vnd_${Date.now()}@example.com`;

    // Create an isolated temporary test vendor
    const vRes = await client.query(
      `INSERT INTO vendors (name, store_name, email, phone, password_hash, status, wallet_balance, outstanding_debt)
       VALUES ($1, $2, $3, '9888899991', $4, 'approved', 0, 0) RETURNING id`,
      ['Test Vendor Closure', 'Closure Store Test', testEmail, passwordHash]
    );
    testVendorId = vRes.rows[0].id;
    console.log(`Created isolated test vendor ID: ${testVendorId}`);

    // Create a product for this vendor
    const pRes = await client.query(
      `INSERT INTO products (name, slug, price, is_active, status, vendor_id)
       VALUES ($1, $2, 500, TRUE, 'Published', $3) RETURNING id`,
      ['Closure Test Product', `closure-test-prod-${Date.now()}`, testVendorId]
    );
    const testProductId = pRes.rows[0].id;

    const vendorToken = jwt.sign({ id: testVendorId, role: 'vendor' }, JWT_SECRET, { expiresIn: '1h' });
    const headers = { Authorization: `Bearer ${vendorToken}` };

    // --- TEST 1: Wrong password rejection ---
    try {
      await axios.post(`${BASE_URL}/vendor/close-store`, { password: 'WrongPassword' }, { headers });
      assert(false, '1. Closure with wrong password should fail');
    } catch (err) {
      assert(err.response?.status === 400 && err.response.data.error.includes('Incorrect password'), '1. Closure rejected when password does not match');
    }

    // --- TEST 2: Block closure when active orders exist ---
    const orderNum = `ORD-VND-TEST-${Date.now()}`;
    const orderItems = JSON.stringify([{ product: { id: testProductId, vendor_id: testVendorId, name: 'Closure Test Product' }, qty: 1 }]);
    const oRes = await client.query(
      `INSERT INTO orders (order_number, total, status, items)
       VALUES ($1, 500, 'processing', $2) RETURNING id`,
      [orderNum, orderItems]
    );
    testOrderId = oRes.rows[0].id;

    try {
      await axios.post(`${BASE_URL}/vendor/close-store`, { password: testPassword }, { headers });
      assert(false, '2. Closure with active order should fail');
    } catch (err) {
      assert(err.response?.status === 400 && err.response.data.error.includes('active or in-transit orders'), '2. Closure blocked when vendor has active/in-transit orders');
    }

    // Mark order as delivered
    await client.query("UPDATE orders SET status = 'delivered' WHERE id = $1", [testOrderId]);

    // --- TEST 3: Block closure when open returns/disputes exist ---
    const retRes = await client.query(
      `INSERT INTO order_returns (order_id, order_number, vendor_id, customer_id, reason, description, status)
       VALUES ($1, $2, $3, 1, 'Defective product', 'Test dispute description', 'requested') RETURNING id`,
      [testOrderId, orderNum, testVendorId]
    );
    testReturnId = retRes.rows[0].id;

    try {
      await axios.post(`${BASE_URL}/vendor/close-store`, { password: testPassword }, { headers });
      assert(false, '3. Closure with open returns should fail');
    } catch (err) {
      assert(err.response?.status === 400 && err.response.data.error.includes('open customer return'), '3. Closure blocked when vendor has open return disputes');
    }

    // Resolve return request
    await client.query("UPDATE order_returns SET status = 'resolved' WHERE id = $1", [testReturnId]);

    // --- TEST 4: Block closure when outstanding debt exists ---
    await client.query('UPDATE vendors SET outstanding_debt = 250 WHERE id = $1', [testVendorId]);

    try {
      await axios.post(`${BASE_URL}/vendor/close-store`, { password: testPassword }, { headers });
      assert(false, '4. Closure with debt should fail');
    } catch (err) {
      assert(err.response?.status === 400 && err.response.data.error.includes('outstanding platform debt'), '4. Closure blocked when vendor has platform debt');
    }

    // Clear debt
    await client.query('UPDATE vendors SET outstanding_debt = 0 WHERE id = $1', [testVendorId]);

    // Add a historical payout record to verify it survives closure
    await client.query(
      `INSERT INTO vendor_order_payouts (order_id, vendor_id, amount, status)
       VALUES ($1, $2, 450, 'paid') ON CONFLICT DO NOTHING`,
      [testOrderId, testVendorId]
    );

    // --- TEST 5: Successful store closure ---
    const closeRes = await axios.post(`${BASE_URL}/vendor/close-store`, { password: testPassword }, { headers });
    assert(closeRes.status === 200 && closeRes.data.success === true, '5a. Vendor store closure completes successfully');

    // Verify vendor status is 'closed' in database
    const vCheck = await client.query('SELECT status FROM vendors WHERE id = $1', [testVendorId]);
    assert(vCheck.rows[0].status === 'closed', '5b. Vendor record status set to closed in database');

    // Verify products are deactivated
    const pCheck = await client.query('SELECT is_active, status FROM products WHERE vendor_id = $1', [testVendorId]);
    assert(pCheck.rows[0].is_active === false && pCheck.rows[0].status === 'Archived', '5c. Vendor products unlisted and deactivated');

    // --- TEST 6: Closed vendor cannot log in ---
    try {
      await axios.post(`${BASE_URL}/vendorAuth/login`, { email: testEmail, password: testPassword });
      assert(false, '6. Closed vendor should not be able to log in');
    } catch (err) {
      assert(err.response?.status === 403 && err.response.data.error.includes('closed'), '6. Closed vendor login blocked with HTTP 403');
    }

    // --- TEST 7: Existing token rejected by vendorAuthMiddleware ---
    try {
      await axios.get(`${BASE_URL}/vendor/stats`, { headers });
      assert(false, '7. Closed vendor token should be rejected');
    } catch (err) {
      assert(err.response?.status === 403 && err.response.data.error.includes('closed'), '7. Closed vendor active session rejected by middleware');
    }

    // --- TEST 8: Historical financial records preserved ---
    const orderCheck = await client.query('SELECT id, status FROM orders WHERE id = $1', [testOrderId]);
    const payoutCheck = await client.query('SELECT id, amount, status FROM vendor_order_payouts WHERE order_id = $1', [testOrderId]);
    assert(orderCheck.rows.length === 1 && payoutCheck.rows.length >= 1, '8. Historical order, invoice and payout ledgers are preserved');

  } catch (err) {
    console.error('Vendor Close Suite Exception:', err);
    testsFailed++;
  } finally {
    // Clean up isolated test data
    if (testReturnId) await client.query('DELETE FROM order_returns WHERE id = $1', [testReturnId]);
    if (testOrderId) {
      await client.query('DELETE FROM vendor_order_payouts WHERE order_id = $1', [testOrderId]);
      await client.query('DELETE FROM orders WHERE id = $1', [testOrderId]);
    }
    if (testVendorId) {
      await client.query('DELETE FROM products WHERE vendor_id = $1', [testVendorId]);
      await client.query('DELETE FROM vendors WHERE id = $1', [testVendorId]);
    }
    client.release();
    pool.end();
  }

  console.log('\n====================================================');
  console.log(`VENDOR CLOSE TEST SUMMARY: ${testsPassed} PASSED, ${testsFailed} FAILED`);
  console.log('====================================================');
  if (testsFailed > 0) process.exit(1);
}

runVendorCloseSuite();
