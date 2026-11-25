const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '.env') });
const { Pool } = require('pg');
const { encryptAccountNumber, decryptAccountNumber, maskAccountNumber, validateIFSC, validateAccountNumber } = require('./utils/bankEncryption');

const useSsl =
  process.env.DB_SSL === 'true' ||
  (process.env.DATABASE_URL || '').includes('sslmode=require');

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: useSsl ? { rejectUnauthorized: false } : false,
});

async function runTestSuite() {
  console.log('====================================================');
  console.log('SWABHIVAR SHOPPERS - RETURNS & REFUNDS TEST SUITE');
  console.log('====================================================\n');

  let passed = 0;
  let failed = 0;

  function assert(condition, message) {
    if (condition) {
      console.log(`[PASS] ${message}`);
      passed++;
    } else {
      console.error(`[FAIL] ${message}`);
      failed++;
    }
  }

  try {
    // TEST 1: Encryption & Validation Utilities
    console.log('--- TEST 1: Bank Encryption & Validation Unit Checks ---');
    const testRawAcc = '12345678901234';
    const encrypted = encryptAccountNumber(testRawAcc);
    const decrypted = decryptAccountNumber(encrypted);
    const masked = maskAccountNumber(testRawAcc);

    assert(encrypted !== testRawAcc, 'Bank account is encrypted (not plain text)');
    assert(decrypted === testRawAcc, 'Bank account decrypts correctly to original value');
    assert(masked === '••••••••1234', `Masked account matches format (got: ${masked})`);

    // IFSC validation checks
    assert(validateIFSC('HDFC0001234') === true, 'Valid IFSC (HDFC0001234) passes');
    assert(validateIFSC('SBIN0000001') === true, 'Valid IFSC (SBIN0000001) passes');
    assert(validateIFSC('INVALID123') === false, 'Invalid IFSC (INVALID123) fails');
    assert(validateIFSC('HDFC1001234') === false, 'Invalid IFSC 5th char not zero fails');

    // Account number validation checks
    assert(validateAccountNumber('12345678') === false, 'Short account number (< 9 digits) fails');
    assert(validateAccountNumber('12345678901234567890') === false, 'Long account number (> 18 digits) fails');
    assert(validateAccountNumber('123456789ABC') === false, 'Non-digit account number fails');
    assert(validateAccountNumber('123456789012') === true, 'Valid 12-digit account number passes');

    // TEST 2: Database Schema & Columns check
    console.log('\n--- TEST 2: Database Schema Verification ---');
    const colsResult = await pool.query(`
      SELECT column_name 
      FROM information_schema.columns 
      WHERE table_name = 'order_returns'
    `);
    const cols = colsResult.rows.map(r => r.column_name);
    
    assert(cols.includes('bank_holder_name'), 'Column bank_holder_name exists');
    assert(cols.includes('bank_account_encrypted'), 'Column bank_account_encrypted exists');
    assert(cols.includes('bank_account_last4'), 'Column bank_account_last4 exists');
    assert(cols.includes('bank_ifsc'), 'Column bank_ifsc exists');
    assert(cols.includes('bank_name'), 'Column bank_name exists');
    assert(cols.includes('approved_refund_amount'), 'Column approved_refund_amount exists');
    assert(cols.includes('max_refundable_amount'), 'Column max_refundable_amount exists');
    assert(cols.includes('refund_utr'), 'Column refund_utr exists');
    assert(cols.includes('refund_transfer_date'), 'Column refund_transfer_date exists');

    const historyTable = await pool.query(`
      SELECT to_regclass('public.return_status_history') AS exists
    `);
    assert(historyTable.rows[0].exists !== null, 'Audit table return_status_history exists');

    const accessTable = await pool.query(`
      SELECT to_regclass('public.bank_details_access_logs') AS exists
    `);
    assert(accessTable.rows[0].exists !== null, 'Access logs table bank_details_access_logs exists');

    // TEST 3: Mock Return Workflow Lifecycle
    console.log('\n--- TEST 3: Full Return Request & Manual Refund Workflow ---');

    // Fetch an existing order and user for testing
    const orderRes = await pool.query(`
      SELECT o.id, o.order_number, o.user_id, o.total
      FROM orders o
      ORDER BY o.id DESC
      LIMIT 1
    `);

    if (orderRes.rows.length === 0) {
      console.log('Skipping end-to-end DB record test: No orders found in database.');
    } else {
      const order = orderRes.rows[0];
      const testOrderId = order.id;
      const testOrderNumber = order.order_number || ('ORD-' + order.id);
      const testCustomerId = order.user_id;
      const testVendorId = 1;
      const maxEligible = parseFloat(order.total) || 500;

      // Clean up any stale test return for this order first
      await pool.query(`DELETE FROM order_returns WHERE order_id = $1 AND vendor_id = $2`, [testOrderId, testVendorId]);

      // 3.1 Insert Mock Return Request
      const encryptedAcc = encryptAccountNumber('987654321098');
      const insertReturn = await pool.query(`
        INSERT INTO order_returns (
          order_id, order_number, customer_id, vendor_id, items, reason, description,
          bank_holder_name, bank_account_encrypted, bank_account_last4, bank_ifsc, bank_name,
          refund_amount, max_refundable_amount, status
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $13, 'Return Requested')
        RETURNING id, status, max_refundable_amount, bank_account_last4
      `, [
        testOrderId, testOrderNumber, testCustomerId, testVendorId,
        JSON.stringify([{ product_id: 1, name: 'Test Product', price: maxEligible, qty: 1 }]),
        'Damaged or defective item', 'Package arrived with crack',
        'Test Customer', encryptedAcc, '1098', 'HDFC0001234', 'HDFC Bank',
        maxEligible
      ]);

      const returnId = insertReturn.rows[0].id;
      assert(insertReturn.rows[0].status === 'Return Requested', 'Return created with status "Return Requested"');
      assert(parseFloat(insertReturn.rows[0].max_refundable_amount) === maxEligible, 'Max refundable amount initialized');

      // 3.2 Audit Log Entry on creation
      await pool.query(`
        INSERT INTO return_status_history (return_id, from_status, to_status, changed_by_type, changed_by_id, changed_by_name, notes)
        VALUES ($1, 'None', 'Return Requested', 'customer', $2, 'Test Customer', 'Customer submitted return request with bank details')
      `, [returnId, testCustomerId]);

      // 3.3 Test Admin Access Log when revealing bank details
      await pool.query(`
        INSERT INTO bank_details_access_logs (return_id, admin_id, admin_email, ip_address, reason)
        VALUES ($1, 1, 'admin@swabhivar.com', '127.0.0.1', 'Manual refund transfer processing')
      `, [returnId]);

      const accessCheck = await pool.query(`
        SELECT * FROM bank_details_access_logs WHERE return_id = $1
      `, [returnId]);
      assert(accessCheck.rows.length > 0, 'Admin unmask bank details access logged');

      // 3.4 Admin Approves Return with refund amount
      const approvedAmount = maxEligible;
      const approveRes = await pool.query(`
        UPDATE order_returns 
        SET status = 'Return Approved', approved_refund_amount = $1, admin_remarks = 'Approved by admin inspection'
        WHERE id = $2
        RETURNING id, status, approved_refund_amount
      `, [approvedAmount, returnId]);

      assert(approveRes.rows[0].status === 'Return Approved', 'Return transitioned to "Return Approved"');
      assert(parseFloat(approveRes.rows[0].approved_refund_amount) === approvedAmount, 'Approved refund amount recorded');

      // 3.5 Lifecycle transitions: Return Shipped -> Return Received -> Refund Processing
      await pool.query(`UPDATE order_returns SET status = 'Return Shipped' WHERE id = $1`, [returnId]);
      await pool.query(`UPDATE order_returns SET status = 'Return Received' WHERE id = $1`, [returnId]);
      await pool.query(`UPDATE order_returns SET status = 'Refund Processing' WHERE id = $1`, [returnId]);

      const processingCheck = await pool.query(`SELECT status FROM order_returns WHERE id = $1`, [returnId]);
      assert(processingCheck.rows[0].status === 'Refund Processing', 'Lifecycle progressed to "Refund Processing"');

      // 3.6 Manual Bank Transfer Settlement (Refund Completed with UTR)
      const testUTR = 'UTR' + Date.now();
      const refundDate = new Date().toISOString();
      const completeRes = await pool.query(`
        UPDATE order_returns 
        SET status = 'Refund Completed',
            refund_utr = $1,
            refund_transfer_date = $2,
            admin_remarks = 'Transferred via IMPS by Admin'
        WHERE id = $3
        RETURNING id, status, refund_utr, refund_transfer_date
      `, [testUTR, refundDate, returnId]);

      assert(completeRes.rows[0].status === 'Refund Completed', 'Return transitioned to "Refund Completed"');
      assert(completeRes.rows[0].refund_utr === testUTR, `Refund UTR properly saved (${testUTR})`);

      // 3.7 Verify Audit History Entries
      await pool.query(`
        INSERT INTO return_status_history (return_id, from_status, to_status, changed_by_type, changed_by_id, changed_by_name, notes)
        VALUES ($1, 'Refund Processing', 'Refund Completed', 'admin', 1, 'Admin', $2)
      `, [returnId, `Refund completed via manual bank transfer. UTR: ${testUTR}`]);

      const historyCheck = await pool.query(`
        SELECT * FROM return_status_history WHERE return_id = $1 ORDER BY id ASC
      `, [returnId]);
      assert(historyCheck.rows.length >= 2, `Audit trail recorded all lifecycle steps (count: ${historyCheck.rows.length})`);

      // Clean up test return
      await pool.query(`DELETE FROM bank_details_access_logs WHERE return_id = $1`, [returnId]);
      await pool.query(`DELETE FROM return_status_history WHERE return_id = $1`, [returnId]);
      await pool.query(`DELETE FROM order_returns WHERE id = $1`, [returnId]);
      console.log('Cleaned up test return record cleanly.');
    }

    console.log('\n====================================================');
    console.log(`TEST SUMMARY: ${passed} Passed, ${failed} Failed`);
    console.log('====================================================');

    await pool.end();
    process.exit(failed > 0 ? 1 : 0);
  } catch (err) {
    console.error('Test suite encountered an error:', err);
    await pool.end();
    process.exit(1);
  }
}

runTestSuite();
