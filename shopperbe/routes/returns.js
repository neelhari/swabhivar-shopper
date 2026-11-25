const router = require('express').Router();
const pool = require('../db');
const jwt = require('jsonwebtoken');
const Razorpay = require('razorpay');
const vendorAccountingService = require('../services/vendorAccountingService');
const {
  encryptAccountNumber,
  decryptAccountNumber,
  maskAccountNumber,
  validateIFSC,
  validateAccountNumber
} = require('../utils/bankEncryption');
const { sendReturnStatusEmail } = require('../services/emailService');
const pushService = require('../services/pushNotificationService');

const JWT_SECRET = process.env.JWT_SECRET || 'your-secret-key';

function getRazorpayClient() {
  if (process.env.RAZORPAY_KEY_ID && process.env.RAZORPAY_KEY_SECRET) {
    return new Razorpay({
      key_id: process.env.RAZORPAY_KEY_ID,
      key_secret: process.env.RAZORPAY_KEY_SECRET,
    });
  }
  return null;
}

// Helper to record audit history for status changes
async function logReturnStatusChange(client, { returnId, fromStatus, toStatus, changedByType, changedById, changedByName, notes, metadata = {} }) {
  try {
    await client.query(`
      INSERT INTO return_status_history 
        (return_id, from_status, to_status, changed_by_type, changed_by_id, changed_by_name, notes, metadata)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
    `, [returnId, fromStatus, toStatus, changedByType, changedById, changedByName, notes, JSON.stringify(metadata)]);
  } catch (err) {
    console.warn('[Audit History] Failed to log return status change:', err.message);
  }
}

// Customer Auth Middleware
function customerAuth(req, res, next) {
  const token = req.headers.authorization?.split(' ')[1];
  if (!token) return res.status(401).json({ error: 'Customer authentication required' });
  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    if (!decoded.id) return res.status(401).json({ error: 'Invalid customer token' });
    req.user = decoded;
    next();
  } catch {
    res.status(401).json({ error: 'Invalid or expired token' });
  }
}

// Vendor Auth Middleware
function vendorAuth(req, res, next) {
  const token = req.headers.authorization?.split(' ')[1];
  if (!token) return res.status(401).json({ error: 'Vendor authentication required' });
  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    if (decoded.role !== 'vendor' || !decoded.id) {
      return res.status(403).json({ error: 'Vendor access required' });
    }
    req.vendorId = decoded.id;
    req.vendor = decoded;
    next();
  } catch {
    res.status(401).json({ error: 'Invalid or expired token' });
  }
}

// Admin Auth Middleware
function adminAuth(req, res, next) {
  const token = req.headers.authorization?.split(' ')[1];
  if (!token) return res.status(401).json({ error: 'Admin authentication required' });
  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    if (decoded.role !== 'admin') {
      return res.status(403).json({ error: 'Admin access required' });
    }
    req.admin = decoded;
    next();
  } catch {
    res.status(401).json({ error: 'Invalid or expired token' });
  }
}

// =========================================================================
// CUSTOMER ENDPOINTS
// =========================================================================

// GET /api/returns/saved-bank - Retrieve customer's saved bank details for prefill
router.get('/saved-bank', customerAuth, async (req, res) => {
  try {
    const r = await pool.query(`
      SELECT account_name, account_last4, ifsc_code, bank_name 
      FROM user_saved_banks 
      WHERE user_id = $1 
      ORDER BY id DESC LIMIT 1
    `, [req.user.id]);
    if (r.rows.length === 0) return res.json({ savedBank: null });
    res.json({
      savedBank: {
        account_name: r.rows[0].account_name,
        account_last4: r.rows[0].account_last4,
        account_number_masked: maskAccountNumber(r.rows[0].account_last4),
        ifsc_code: r.rows[0].ifsc_code,
        bank_name: r.rows[0].bank_name
      }
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/returns/request - Customer submits a return request with mandatory bank details
router.post('/request', customerAuth, async (req, res) => {
  const {
    order_id,
    vendor_id,
    items,
    reason,
    description,
    images,
    account_holder_name,
    bank_holder_name,
    bank_account_number,
    confirm_bank_account_number,
    ifsc_code,
    bank_ifsc,
    bank_name
  } = req.body;

  if (!order_id || !items || !items.length || !reason || !description) {
    return res.status(400).json({ error: 'order_id, items, reason, and description are required' });
  }

  // 1. Mandatory Bank Details Validation
  const holderName = (account_holder_name || bank_holder_name || '').trim();
  const accNo = (bank_account_number || '').trim();
  const confirmAccNo = (confirm_bank_account_number || '').trim();
  const ifsc = (ifsc_code || bank_ifsc || '').trim().toUpperCase();
  const bName = (bank_name || '').trim();

  if (!holderName || !accNo || !confirmAccNo || !ifsc || !bName) {
    return res.status(400).json({
      error: 'All bank details (Account holder name, Bank account number, Confirm account number, IFSC code, and Bank name) are mandatory'
    });
  }

  if (accNo !== confirmAccNo) {
    return res.status(400).json({
      error: 'Bank account number and confirm account number do not match'
    });
  }

  if (!validateAccountNumber(accNo)) {
    return res.status(400).json({
      error: 'Bank account number must be between 9 and 18 numeric digits'
    });
  }

  if (!validateIFSC(ifsc)) {
    return res.status(400).json({
      error: 'Invalid IFSC code format. IFSC must be 11 characters (e.g. SBIN0001234, HDFC0000123)'
    });
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // 2. Fetch order and verify ownership
    const orderRes = await client.query('SELECT * FROM orders WHERE id = $1 FOR UPDATE', [order_id]);
    if (orderRes.rows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: 'Order not found' });
    }
    const order = orderRes.rows[0];

    if (order.user_id !== req.user.id) {
      await client.query('ROLLBACK');
      return res.status(403).json({ error: 'You do not have permission to return items from this order' });
    }

    if (order.status !== 'delivered') {
      await client.query('ROLLBACK');
      return res.status(400).json({ error: `Only delivered orders are eligible for return. Current status: ${order.status}` });
    }

    // 3. Validate 7-day return window
    const deliveredAt = order.delivered_at || order.created_at;
    const returnDeadline = new Date(deliveredAt).getTime() + (7 * 24 * 60 * 60 * 1000);
    if (Date.now() > returnDeadline) {
      await client.query('ROLLBACK');
      return res.status(400).json({ error: 'Return window expired. Returns must be requested within 7 days of delivery.' });
    }

    // Determine target vendor
    let targetVendorId = vendor_id;
    if (!targetVendorId) {
      for (const it of items) {
        if (it.vendor_id || it.product?.vendor_id) {
          targetVendorId = it.vendor_id || it.product?.vendor_id;
          break;
        }
      }
      if (!targetVendorId && order.items && Array.isArray(order.items)) {
        targetVendorId = order.items[0]?.vendor_id || order.items[0]?.product?.vendor_id || 1;
      }
    }

    // 4. Prevent duplicate active return for this order & vendor
    const existingRes = await client.query(`
      SELECT id, status FROM order_returns 
      WHERE order_id = $1 AND vendor_id = $2 AND status NOT IN ('Return Rejected', 'Closed')
    `, [order_id, targetVendorId]);

    if (existingRes.rows.length > 0) {
      await client.query('ROLLBACK');
      return res.status(400).json({
        error: 'An active return request already exists for this order',
        return_id: existingRes.rows[0].id,
        current_status: existingRes.rows[0].status
      });
    }

    // 5. Calculate refund amount for returned items
    let refundAmount = 0;
    for (const item of items) {
      const price = parseFloat(item.price || item.variant?.price || item.product?.price || 0);
      const qty = parseInt(item.qty || 1, 10);
      refundAmount += price * qty;
    }
    const orderTotal = parseFloat(order.total || 0);
    if (refundAmount <= 0 || refundAmount > orderTotal) {
      refundAmount = orderTotal;
    }
    refundAmount = Math.round(refundAmount * 100) / 100;

    // 6. Encrypt bank details for security at rest
    const encryptedAccount = encryptAccountNumber(accNo);
    const last4 = accNo.slice(-4);

    // 7. Insert return request with bank details
    const insertRes = await client.query(`
      INSERT INTO order_returns 
        (order_id, order_number, customer_id, vendor_id, items, reason, description, images, status, 
         refund_amount, max_refundable_amount, approved_refund_amount, bank_holder_name, bank_account_encrypted, 
         bank_account_last4, bank_ifsc, bank_name)
      VALUES 
        ($1, $2, $3, $4, $5, $6, $7, $8, 'Return Requested', 
         $9, $9, $9, $10, $11, $12, $13, $14)
      RETURNING *
    `, [
      order.id,
      order.order_number,
      req.user.id,
      targetVendorId,
      JSON.stringify(items),
      reason.trim(),
      description.trim(),
      JSON.stringify(images || []),
      refundAmount,
      holderName,
      encryptedAccount,
      last4,
      ifsc,
      bName
    ]);

    const returnRequest = insertRes.rows[0];

    // 8. Safely save bank details to user_saved_banks for customer convenience
    try {
      await client.query(`
        INSERT INTO user_saved_banks 
          (user_id, account_name, account_encrypted, account_last4, ifsc_code, bank_name, updated_at)
        VALUES ($1, $2, $3, $4, $5, $6, NOW())
      `, [req.user.id, holderName, encryptedAccount, last4, ifsc, bName]);
    } catch (saveErr) {
      console.warn('Notice saving bank info to user_saved_banks:', saveErr.message);
    }

    // 9. Hold affected order's vendor earnings
    await vendorAccountingService.holdOrderEarnings(order.id, targetVendorId, 'return_requested', client);

    // 10. Audit history log
    const userRes = await client.query('SELECT name, email FROM users WHERE id = $1', [req.user.id]);
    const userName = userRes.rows[0]?.name || 'Customer';
    const userEmail = userRes.rows[0]?.email || order.address?.email;

    await logReturnStatusChange(client, {
      returnId: returnRequest.id,
      fromStatus: null,
      toStatus: 'Return Requested',
      changedByType: 'customer',
      changedById: req.user.id,
      changedByName: userName,
      notes: `Return requested for reason: "${reason}". Bank account details recorded for refund.`
    });

    // 11. Initial thread message
    await client.query(`
      INSERT INTO return_messages (return_id, sender_type, sender_id, sender_name, message, attachments)
      VALUES ($1, 'customer', $2, $3, $4, $5)
    `, [
      returnRequest.id,
      req.user.id,
      userName,
      `Return requested for reason: "${reason}". Description: ${description}`,
      JSON.stringify(images || [])
    ]);

    await client.query('COMMIT');

    // 12. Asynchronous email & push notification
    sendReturnStatusEmail({
      to: userEmail,
      customerName: userName,
      orderNumber: order.order_number,
      status: 'Return Requested',
      refundAmount: refundAmount,
      bankName: bName,
      bankAccountMasked: maskAccountNumber(last4)
    }).catch(e => console.warn('[Return Request Email]:', e.message));

    // Sanitize response: never return encrypted account
    delete returnRequest.bank_account_encrypted;
    returnRequest.bank_account_masked = maskAccountNumber(returnRequest.bank_account_last4);

    res.json({ success: true, returnRequest });
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('Customer return request error:', err);
    res.status(500).json({ error: err.message || 'Failed to submit return request' });
  } finally {
    client.release();
  }
});

// Helper to sanitize return record before sending to customer/admin list
function sanitizeReturnRecord(ret) {
  if (!ret) return null;
  const sanitized = { ...ret };
  delete sanitized.bank_account_encrypted;
  sanitized.bank_account_masked = maskAccountNumber(sanitized.bank_account_last4);
  return sanitized;
}

// GET /api/returns/my-returns - List customer's returns
router.get('/my-returns', customerAuth, async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT ret.*, 
             v.name as vendor_name, 
             v.store_name, 
             v.email as vendor_email,
             v.phone as vendor_phone,
             o.created_at as order_created_at,
             o.delivered_at,
             (SELECT COUNT(*) FROM return_messages WHERE return_id = ret.id) as message_count
      FROM order_returns ret
      JOIN vendors v ON ret.vendor_id = v.id
      JOIN orders o ON ret.order_id = o.id
      WHERE ret.customer_id = $1
      ORDER BY ret.created_at DESC
    `, [req.user.id]);

    const sanitized = result.rows.map(sanitizeReturnRecord);
    res.json({ returns: sanitized });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/returns/order/:orderId - Get return status for specific order
router.get('/order/:orderId', customerAuth, async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT ret.*, v.store_name
      FROM order_returns ret
      JOIN vendors v ON ret.vendor_id = v.id
      WHERE ret.order_id = $1 AND ret.customer_id = $2
      ORDER BY ret.created_at DESC
    `, [req.params.orderId, req.user.id]);

    const sanitized = result.rows.map(sanitizeReturnRecord);
    res.json({ returns: sanitized });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/returns/:id - Customer get single return details with message and audit history
router.get('/:id', customerAuth, async (req, res) => {
  try {
    const retRes = await pool.query(`
      SELECT ret.*, v.store_name, v.name as vendor_name, v.email as vendor_email,
             o.delivered_at, o.payment_method
      FROM order_returns ret
      JOIN vendors v ON ret.vendor_id = v.id
      JOIN orders o ON ret.order_id = o.id
      WHERE ret.id = $1 AND ret.customer_id = $2
    `, [req.params.id, req.user.id]);

    if (retRes.rows.length === 0) {
      return res.status(404).json({ error: 'Return request not found' });
    }

    const messagesRes = await pool.query(`
      SELECT * FROM return_messages WHERE return_id = $1 ORDER BY created_at ASC
    `, [req.params.id]);

    const historyRes = await pool.query(`
      SELECT id, from_status, to_status, changed_by_type, changed_by_name, notes, created_at
      FROM return_status_history
      WHERE return_id = $1
      ORDER BY created_at ASC
    `, [req.params.id]);

    const sanitized = sanitizeReturnRecord(retRes.rows[0]);

    res.json({
      returnRequest: sanitized,
      messages: messagesRes.rows,
      history: historyRes.rows
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/returns/:id/message - Customer posts a message in return thread
router.post('/:id/message', customerAuth, async (req, res) => {
  const { message, attachments } = req.body;
  if (!message || !message.trim()) return res.status(400).json({ error: 'Message cannot be empty' });

  try {
    const retCheck = await pool.query('SELECT customer_id FROM order_returns WHERE id = $1', [req.params.id]);
    if (retCheck.rows.length === 0 || retCheck.rows[0].customer_id !== req.user.id) {
      return res.status(403).json({ error: 'Unauthorized to post to this return request' });
    }

    const userRes = await pool.query('SELECT name FROM users WHERE id = $1', [req.user.id]);
    const userName = userRes.rows[0]?.name || 'Customer';

    const msgRes = await pool.query(`
      INSERT INTO return_messages (return_id, sender_type, sender_id, sender_name, message, attachments)
      VALUES ($1, 'customer', $2, $3, $4, $5)
      RETURNING *
    `, [req.params.id, req.user.id, userName, message.trim(), JSON.stringify(attachments || [])]);

    await pool.query('UPDATE order_returns SET updated_at = NOW() WHERE id = $1', [req.params.id]);

    res.json({ success: true, message: msgRes.rows[0] });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/returns/:id/ship - Customer marks return product as shipped
router.post('/:id/ship', customerAuth, async (req, res) => {
  const { return_tracking_id, return_courier } = req.body;
  if (!return_tracking_id || !return_tracking_id.trim()) {
    return res.status(400).json({ error: 'Tracking ID is required' });
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const retRes = await client.query('SELECT * FROM order_returns WHERE id = $1 FOR UPDATE', [req.params.id]);
    if (retRes.rows.length === 0 || retRes.rows[0].customer_id !== req.user.id) {
      await client.query('ROLLBACK');
      return res.status(403).json({ error: 'Unauthorized' });
    }

    const currentReturn = retRes.rows[0];
    if (currentReturn.status !== 'Return Approved') {
      await client.query('ROLLBACK');
      return res.status(400).json({ error: `Product can only be marked shipped after return is approved. Current status: ${currentReturn.status}` });
    }

    const updatedRes = await client.query(`
      UPDATE order_returns 
      SET status = 'Return Shipped',
          return_tracking_id = $1,
          return_courier = $2,
          updated_at = NOW()
      WHERE id = $3
      RETURNING *
    `, [return_tracking_id.trim(), (return_courier || 'Courier').trim(), req.params.id]);

    const userRes = await client.query('SELECT name FROM users WHERE id = $1', [req.user.id]);
    const userName = userRes.rows[0]?.name || 'Customer';

    await logReturnStatusChange(client, {
      returnId: req.params.id,
      fromStatus: currentReturn.status,
      toStatus: 'Return Shipped',
      changedByType: 'customer',
      changedById: req.user.id,
      changedByName: userName,
      notes: `Customer shipped return item via ${return_courier || 'Courier'}. Tracking ID: ${return_tracking_id.trim()}`
    });

    await client.query(`
      INSERT INTO return_messages (return_id, sender_type, sender_id, sender_name, message)
      VALUES ($1, 'customer', $2, $3, $4)
    `, [req.params.id, req.user.id, userName, `Return parcel shipped via ${return_courier || 'Courier'}. Tracking ID: ${return_tracking_id.trim()}`]);

    await client.query('COMMIT');
    res.json({ success: true, returnRequest: sanitizeReturnRecord(updatedRes.rows[0]) });
  } catch (err) {
    await client.query('ROLLBACK');
    res.status(500).json({ error: err.message });
  } finally {
    client.release();
  }
});

// POST /api/returns/:id/appeal - Customer appeals rejected return
router.post('/:id/appeal', customerAuth, async (req, res) => {
  const { appeal_reason } = req.body;
  if (!appeal_reason || !appeal_reason.trim()) {
    return res.status(400).json({ error: 'Appeal reason is required' });
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const retRes = await client.query('SELECT * FROM order_returns WHERE id = $1 FOR UPDATE', [req.params.id]);
    if (retRes.rows.length === 0 || retRes.rows[0].customer_id !== req.user.id) {
      await client.query('ROLLBACK');
      return res.status(403).json({ error: 'Unauthorized' });
    }

    const currentReturn = retRes.rows[0];
    if (currentReturn.status !== 'Return Rejected') {
      await client.query('ROLLBACK');
      return res.status(400).json({ error: `Only rejected returns can be appealed. Current status: ${currentReturn.status}` });
    }

    const updatedRes = await client.query(`
      UPDATE order_returns 
      SET status = 'Appeal Raised',
          appeal_reason = $1,
          appeal_at = NOW(),
          updated_at = NOW()
      WHERE id = $2
      RETURNING *
    `, [appeal_reason.trim(), req.params.id]);

    // Hold vendor earnings while appeal is under admin dispute investigation
    await vendorAccountingService.holdOrderEarnings(currentReturn.order_id, currentReturn.vendor_id, 'appeal_raised', client);

    const userRes = await client.query('SELECT name FROM users WHERE id = $1', [req.user.id]);
    const userName = userRes.rows[0]?.name || 'Customer';

    await logReturnStatusChange(client, {
      returnId: req.params.id,
      fromStatus: currentReturn.status,
      toStatus: 'Appeal Raised',
      changedByType: 'customer',
      changedById: req.user.id,
      changedByName: userName,
      notes: `Customer appealed rejection: "${appeal_reason.trim()}"`
    });

    await client.query(`
      INSERT INTO return_messages (return_id, sender_type, sender_id, sender_name, message)
      VALUES ($1, 'customer', $2, $3, $4)
    `, [req.params.id, req.user.id, userName, `[CUSTOMER APPEAL RAISED TO ADMIN] Reason: ${appeal_reason.trim()}`]);

    await client.query('COMMIT');
    res.json({ success: true, returnRequest: sanitizeReturnRecord(updatedRes.rows[0]) });
  } catch (err) {
    await client.query('ROLLBACK');
    res.status(500).json({ error: err.message });
  } finally {
    client.release();
  }
});

// =========================================================================
// VENDOR ENDPOINTS
// =========================================================================

// GET /api/returns/vendor/list - Vendor lists returns for their products
router.get('/vendor/list', vendorAuth, async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT ret.*,
             u.name as customer_name,
             u.email as customer_email,
             u.phone as customer_phone,
             o.delivered_at,
             o.payment_method,
             (SELECT COUNT(*) FROM return_messages WHERE return_id = ret.id) as message_count
      FROM order_returns ret
      JOIN users u ON ret.customer_id = u.id
      JOIN orders o ON ret.order_id = o.id
      WHERE ret.vendor_id = $1
      ORDER BY ret.created_at DESC
    `, [req.vendorId]);

    const sanitized = result.rows.map(sanitizeReturnRecord);
    res.json({ returns: sanitized });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/returns/vendor/:id - Vendor get single return request
router.get('/vendor/:id', vendorAuth, async (req, res) => {
  try {
    const retRes = await pool.query(`
      SELECT ret.*,
             u.name as customer_name,
             u.email as customer_email,
             u.phone as customer_phone,
             o.delivered_at,
             o.payment_method,
             o.address as order_address
      FROM order_returns ret
      JOIN users u ON ret.customer_id = u.id
      JOIN orders o ON ret.order_id = o.id
      WHERE ret.id = $1 AND ret.vendor_id = $2
    `, [req.params.id, req.vendorId]);

    if (retRes.rows.length === 0) {
      return res.status(404).json({ error: 'Return request not found or unauthorized' });
    }

    const messagesRes = await pool.query(`
      SELECT * FROM return_messages WHERE return_id = $1 ORDER BY created_at ASC
    `, [req.params.id]);

    const sanitized = sanitizeReturnRecord(retRes.rows[0]);
    res.json({ returnRequest: sanitized, messages: messagesRes.rows });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// PUT /api/returns/vendor/:id/status - Vendor updates return status
router.put('/vendor/:id/status', vendorAuth, async (req, res) => {
  const { status, rejection_reason, vendor_response } = req.body;

  const validStatuses = [
    'Under Vendor Review',
    'Additional Information Requested',
    'Return Approved',
    'Return Rejected',
    'Return Received'
  ];

  if (!status || !validStatuses.includes(status)) {
    return res.status(400).json({ error: `Invalid status. Must be one of: ${validStatuses.join(', ')}` });
  }

  if (status === 'Return Rejected' && (!rejection_reason || !rejection_reason.trim())) {
    return res.status(400).json({ error: 'A mandatory rejection reason is required to reject a return request' });
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const retRes = await client.query(`
      SELECT ret.*, u.email as customer_email, u.name as customer_name
      FROM order_returns ret
      JOIN users u ON ret.customer_id = u.id
      WHERE ret.id = $1 AND ret.vendor_id = $2
      FOR UPDATE
    `, [req.params.id, req.vendorId]);

    if (retRes.rows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: 'Return request not found or unauthorized' });
    }

    const currentReturn = retRes.rows[0];

    const updatedRes = await client.query(`
      UPDATE order_returns 
      SET status = $1,
          rejection_reason = CASE WHEN $1 = 'Return Rejected' THEN $2 ELSE rejection_reason END,
          vendor_response = COALESCE($3, vendor_response),
          vendor_action_at = NOW(),
          updated_at = NOW()
      WHERE id = $4
      RETURNING *
    `, [
      status,
      rejection_reason ? rejection_reason.trim() : null,
      vendor_response ? vendor_response.trim() : null,
      req.params.id
    ]);

    if (status === 'Return Rejected') {
      await vendorAccountingService.releaseOrderEarningsHold(currentReturn.order_id, req.vendorId, client);
    }

    const vRes = await client.query('SELECT store_name, name FROM vendors WHERE id = $1', [req.vendorId]);
    const vendorName = vRes.rows[0]?.store_name || vRes.rows[0]?.name || 'Vendor';

    await logReturnStatusChange(client, {
      returnId: req.params.id,
      fromStatus: currentReturn.status,
      toStatus: status,
      changedByType: 'vendor',
      changedById: req.vendorId,
      changedByName: vendorName,
      notes: status === 'Return Rejected' ? `Rejected: ${rejection_reason.trim()}` : (vendor_response ? vendor_response.trim() : `Status set to ${status}`)
    });

    let threadMessage = `Vendor updated status to: "${status}".`;
    if (status === 'Return Rejected') {
      threadMessage += ` Reason: ${rejection_reason.trim()}`;
    } else if (vendor_response && vendor_response.trim()) {
      threadMessage += ` Note: ${vendor_response.trim()}`;
    }

    await client.query(`
      INSERT INTO return_messages (return_id, sender_type, sender_id, sender_name, message)
      VALUES ($1, 'vendor', $2, $3, $4)
    `, [req.params.id, req.vendorId, vendorName, threadMessage]);

    await client.query('COMMIT');

    sendReturnStatusEmail({
      to: currentReturn.customer_email,
      customerName: currentReturn.customer_name,
      orderNumber: currentReturn.order_number,
      status: status,
      rejectionReason: rejection_reason,
      refundAmount: currentReturn.refund_amount
    }).catch(e => console.warn('[Vendor Status Email]:', e.message));

    res.json({ success: true, returnRequest: sanitizeReturnRecord(updatedRes.rows[0]) });
  } catch (err) {
    await client.query('ROLLBACK');
    res.status(500).json({ error: err.message });
  } finally {
    client.release();
  }
});

// POST /api/returns/vendor/:id/message - Vendor sends message
router.post('/vendor/:id/message', vendorAuth, async (req, res) => {
  const { message, attachments } = req.body;
  if (!message || !message.trim()) return res.status(400).json({ error: 'Message cannot be empty' });

  try {
    const retCheck = await pool.query('SELECT vendor_id FROM order_returns WHERE id = $1', [req.params.id]);
    if (retCheck.rows.length === 0 || retCheck.rows[0].vendor_id !== req.vendorId) {
      return res.status(403).json({ error: 'Unauthorized to post to this return request' });
    }

    const vRes = await pool.query('SELECT store_name, name FROM vendors WHERE id = $1', [req.vendorId]);
    const vendorName = vRes.rows[0]?.store_name || vRes.rows[0]?.name || 'Vendor';

    const msgRes = await pool.query(`
      INSERT INTO return_messages (return_id, sender_type, sender_id, sender_name, message, attachments)
      VALUES ($1, 'vendor', $2, $3, $4, $5)
      RETURNING *
    `, [req.params.id, req.vendorId, vendorName, message.trim(), JSON.stringify(attachments || [])]);

    await pool.query('UPDATE order_returns SET updated_at = NOW() WHERE id = $1', [req.params.id]);

    res.json({ success: true, message: msgRes.rows[0] });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// =========================================================================
// ADMIN ENDPOINTS (Return Management, Bank Details & Refund Processing)
// =========================================================================

// GET /api/returns/admin/list - Admin lists all returns with filters
router.get('/admin/list', adminAuth, async (req, res) => {
  const { vendor_id, status, search, start_date, end_date } = req.query;

  try {
    let query = `
      SELECT ret.*,
             u.name as customer_name,
             u.email as customer_email,
             u.phone as customer_phone,
             v.name as vendor_name,
             v.store_name,
             v.email as vendor_email,
             v.phone as vendor_phone,
             o.delivered_at,
             o.payment_method,
             o.total as order_total,
             (SELECT COUNT(*) FROM return_messages WHERE return_id = ret.id) as message_count
      FROM order_returns ret
      JOIN users u ON ret.customer_id = u.id
      JOIN vendors v ON ret.vendor_id = v.id
      JOIN orders o ON ret.order_id = o.id
      WHERE 1=1
    `;
    const params = [];

    if (vendor_id) {
      params.push(vendor_id);
      query += ` AND ret.vendor_id = $${params.length}`;
    }

    if (status && status !== 'ALL') {
      params.push(status);
      query += ` AND ret.status = $${params.length}`;
    }

    if (search && search.trim()) {
      params.push(`%${search.trim()}%`);
      query += ` AND (ret.order_number ILIKE $${params.length} OR v.store_name ILIKE $${params.length} OR u.name ILIKE $${params.length} OR u.email ILIKE $${params.length} OR ret.refund_utr ILIKE $${params.length})`;
    }

    if (start_date) {
      params.push(start_date);
      query += ` AND ret.created_at >= $${params.length}`;
    }

    if (end_date) {
      params.push(end_date);
      query += ` AND ret.created_at <= $${params.length}`;
    }

    query += ' ORDER BY ret.created_at DESC';

    const result = await pool.query(query, params);
    const sanitized = result.rows.map(sanitizeReturnRecord);
    res.json({ returns: sanitized });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/returns/admin/:id - Admin single return details with message & audit history
router.get('/admin/:id', adminAuth, async (req, res) => {
  try {
    const retRes = await pool.query(`
      SELECT ret.*,
             u.name as customer_name,
             u.email as customer_email,
             u.phone as customer_phone,
             v.name as vendor_name,
             v.store_name,
             v.email as vendor_email,
             v.phone as vendor_phone,
             o.delivered_at,
             o.payment_method,
             o.address as order_address,
             o.total as order_total
      FROM order_returns ret
      JOIN users u ON ret.customer_id = u.id
      JOIN vendors v ON ret.vendor_id = v.id
      JOIN orders o ON ret.order_id = o.id
      WHERE ret.id = $1
    `, [req.params.id]);

    if (retRes.rows.length === 0) {
      return res.status(404).json({ error: 'Return request not found' });
    }

    const messagesRes = await pool.query(`
      SELECT * FROM return_messages WHERE return_id = $1 ORDER BY created_at ASC
    `, [req.params.id]);

    const historyRes = await pool.query(`
      SELECT id, from_status, to_status, changed_by_type, changed_by_name, notes, created_at
      FROM return_status_history
      WHERE return_id = $1
      ORDER BY created_at ASC
    `, [req.params.id]);

    const sanitized = sanitizeReturnRecord(retRes.rows[0]);

    res.json({
      returnRequest: sanitized,
      messages: messagesRes.rows,
      history: historyRes.rows
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/returns/admin/:id/reveal-bank-details - Secure endpoint for authorized admin to unmask bank details
router.post('/admin/:id/reveal-bank-details', adminAuth, async (req, res) => {
  const { reason } = req.body;
  const adminId = req.admin.id || 1;
  const adminEmail = req.admin.email || 'admin@swabhivar.com';
  const ip = req.headers['x-forwarded-for'] || req.socket.remoteAddress || 'unknown';

  try {
    const retRes = await pool.query(`
      SELECT id, bank_holder_name, bank_name, bank_ifsc, bank_account_encrypted, bank_account_last4
      FROM order_returns 
      WHERE id = $1
    `, [req.params.id]);

    if (retRes.rows.length === 0) {
      return res.status(404).json({ error: 'Return request not found' });
    }

    const row = retRes.rows[0];
    if (!row.bank_account_encrypted) {
      return res.status(400).json({ error: 'No bank account details recorded for this return' });
    }

    // Decrypt securely
    let fullAccountNumber = '';
    try {
      fullAccountNumber = decryptAccountNumber(row.bank_account_encrypted);
    } catch (decErr) {
      console.error('Decryption error for return', req.params.id, decErr);
      return res.status(500).json({ error: 'Failed to securely decrypt bank account details' });
    }

    // Audit Log: Record access event
    await pool.query(`
      INSERT INTO bank_details_access_logs 
        (return_id, admin_id, admin_email, ip_address, reason, accessed_at)
      VALUES ($1, $2, $3, $4, $5, NOW())
    `, [req.params.id, adminId, adminEmail, ip, (reason || 'Admin viewed bank details for refund processing').trim()]);

    res.json({
      success: true,
      bankDetails: {
        account_holder_name: row.bank_holder_name,
        bank_name: row.bank_name,
        ifsc_code: row.bank_ifsc,
        account_number: fullAccountNumber,
        accessed_at: new Date().toISOString()
      }
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// PUT /api/returns/admin/:id/status - Admin status update & refund recording
router.put('/admin/:id/status', adminAuth, async (req, res) => {
  const {
    status,
    rejection_reason,
    admin_notes,
    admin_remarks,
    approved_refund_amount,
    refund_amount,
    refund_utr,
    refund_transfer_date
  } = req.body;

  const validStatuses = [
    'Return Requested',
    'Return Approved',
    'Return Rejected',
    'Return Shipped',
    'Return Received',
    'Refund Processing',
    'Refund Completed',
    'Closed'
  ];

  if (!status || !validStatuses.includes(status)) {
    return res.status(400).json({ error: `Invalid status. Must be one of: ${validStatuses.join(', ')}` });
  }

  if (status === 'Return Rejected' && (!rejection_reason || !rejection_reason.trim())) {
    return res.status(400).json({ error: 'A mandatory rejection reason is required to reject a return request' });
  }

  if (status === 'Refund Completed') {
    if (!refund_utr || !refund_utr.trim()) {
      return res.status(400).json({ error: 'Bank transfer reference / UTR number is strictly mandatory to mark a refund completed' });
    }
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const retRes = await client.query(`
      SELECT ret.*, 
             u.name as customer_name, 
             u.email as customer_email,
             o.total as order_total
      FROM order_returns ret
      JOIN users u ON ret.customer_id = u.id
      JOIN orders o ON ret.order_id = o.id
      WHERE ret.id = $1
      FOR UPDATE
    `, [req.params.id]);

    if (retRes.rows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: 'Return request not found' });
    }

    const currentReturn = retRes.rows[0];

    // Prevent duplicate refunds
    if (status === 'Refund Completed' && currentReturn.refund_status === 'completed') {
      await client.query('ROLLBACK');
      return res.status(400).json({
        error: 'Duplicate refund prevented: A refund has already been recorded and completed for this return request.'
      });
    }

    // Validate approved refund amount against max eligible amount
    const maxEligible = parseFloat(currentReturn.max_refundable_amount || currentReturn.refund_amount || currentReturn.order_total || 0);

    let finalApprovedAmount = currentReturn.approved_refund_amount || currentReturn.refund_amount;
    if (approved_refund_amount !== undefined && approved_refund_amount !== null) {
      const parsed = parseFloat(approved_refund_amount);
      if (isNaN(parsed) || parsed <= 0) {
        await client.query('ROLLBACK');
        return res.status(400).json({ error: 'Approved refund amount must be a positive number' });
      }
      if (parsed > maxEligible) {
        await client.query('ROLLBACK');
        return res.status(400).json({
          error: `Approved refund amount (₹${parsed.toFixed(2)}) cannot exceed maximum eligible refundable amount (₹${maxEligible.toFixed(2)})`
        });
      }
      finalApprovedAmount = parsed;
    }

    // Validate refund amount on completion
    let finalRefundAmount = finalApprovedAmount;
    if (status === 'Refund Completed') {
      if (refund_amount !== undefined && refund_amount !== null) {
        const parsedRefund = parseFloat(refund_amount);
        if (isNaN(parsedRefund) || parsedRefund <= 0) {
          await client.query('ROLLBACK');
          return res.status(400).json({ error: 'Refund amount must be a positive number' });
        }
        if (parsedRefund > maxEligible) {
          await client.query('ROLLBACK');
          return res.status(400).json({
            error: `Refund amount (₹${parsedRefund.toFixed(2)}) cannot exceed maximum eligible refundable amount (₹${maxEligible.toFixed(2)})`
          });
        }
        finalRefundAmount = parsedRefund;
      }
    }

    // Determine new refund_status
    let newRefundStatus = currentReturn.refund_status;
    if (status === 'Refund Completed') {
      newRefundStatus = 'completed';
    } else if (status === 'Refund Processing') {
      newRefundStatus = 'processing';
    } else if (status === 'Return Rejected') {
      newRefundStatus = 'rejected';
    }

    const cleanUtr = refund_utr ? refund_utr.trim() : currentReturn.refund_utr;
    const transferDate = refund_transfer_date ? new Date(refund_transfer_date) : (status === 'Refund Completed' ? new Date() : currentReturn.refund_transfer_date);
    const notes = admin_notes ? admin_notes.trim() : currentReturn.admin_notes;
    const remarks = admin_remarks ? admin_remarks.trim() : currentReturn.admin_remarks;

    const updatedRes = await client.query(`
      UPDATE order_returns 
      SET status = $1,
          rejection_reason = CASE WHEN $1 = 'Return Rejected' THEN $2 ELSE rejection_reason END,
          approved_refund_amount = $3,
          refund_amount = CASE WHEN $1 = 'Refund Completed' THEN $4 ELSE refund_amount END,
          refund_status = $5,
          refund_utr = $6,
          refund_reference = COALESCE($6, refund_reference),
          refund_method = CASE WHEN $1 = 'Refund Completed' THEN 'Bank Transfer (Manual)' ELSE refund_method END,
          refund_transfer_date = $7,
          refunded_at = CASE WHEN $1 = 'Refund Completed' THEN NOW() ELSE refunded_at END,
          admin_notes = $8,
          admin_remarks = $9,
          admin_action_at = NOW(),
          updated_at = NOW()
      WHERE id = $10
      RETURNING *
    `, [
      status,
      rejection_reason ? rejection_reason.trim() : null,
      finalApprovedAmount,
      finalRefundAmount,
      newRefundStatus,
      cleanUtr,
      transferDate,
      notes,
      remarks,
      req.params.id
    ]);

    // Handle vendor earnings hold:
    if (status === 'Return Rejected' || status === 'Closed') {
      await vendorAccountingService.releaseOrderEarningsHold(currentReturn.order_id, currentReturn.vendor_id, client);
    } else if (['Return Approved', 'Return Shipped', 'Return Received', 'Refund Processing', 'Refund Completed'].includes(status)) {
      await vendorAccountingService.holdOrderEarnings(currentReturn.order_id, currentReturn.vendor_id, 'admin_' + status.toLowerCase().replace(/\s+/g, '_'), client);
    }

    const adminName = req.admin.email || 'Admin';

    // Log status change to audit history
    await logReturnStatusChange(client, {
      returnId: req.params.id,
      fromStatus: currentReturn.status,
      toStatus: status,
      changedByType: 'admin',
      changedById: req.admin.id || 1,
      changedByName: adminName,
      notes: remarks || notes || `Admin updated status to: ${status}`,
      metadata: {
        approved_refund_amount: finalApprovedAmount,
        refund_amount: finalRefundAmount,
        refund_utr: cleanUtr,
        rejection_reason: rejection_reason
      }
    });

    // Add thread message
    let threadMsg = `[ADMIN UPDATE] Status changed to "${status}".`;
    if (status === 'Return Approved') {
      threadMsg += ` Approved refund amount: ₹${finalApprovedAmount.toFixed(2)}.`;
    } else if (status === 'Return Rejected') {
      threadMsg += ` Reason: ${rejection_reason.trim()}.`;
    } else if (status === 'Refund Completed') {
      threadMsg += ` Refund of ₹${finalRefundAmount.toFixed(2)} completed. UTR / Ref: ${cleanUtr}.`;
    }
    if (remarks) threadMsg += ` Remarks: ${remarks}.`;

    await client.query(`
      INSERT INTO return_messages (return_id, sender_type, sender_id, sender_name, message)
      VALUES ($1, 'admin', $2, 'Admin Support', $3)
    `, [req.params.id, req.admin.id || 1, threadMsg]);

    await client.query('COMMIT');

    // Trigger Email Notification
    sendReturnStatusEmail({
      to: currentReturn.customer_email,
      customerName: currentReturn.customer_name,
      orderNumber: currentReturn.order_number,
      status: status,
      refundAmount: status === 'Refund Completed' ? finalRefundAmount : finalApprovedAmount,
      utr: cleanUtr,
      remarks: remarks || notes,
      rejectionReason: rejection_reason,
      bankName: currentReturn.bank_name,
      bankAccountMasked: maskAccountNumber(currentReturn.bank_account_last4)
    }).catch(e => console.warn('[Admin Status Email Notification Error]:', e.message));

    // Trigger Push Notification
    pushService.notifyCustomer(currentReturn.customer_id, {
      title: `Return Status: ${status}`,
      body: `Your return for order #${currentReturn.order_number} is now ${status}.`
    }).catch(() => {});

    res.json({ success: true, returnRequest: sanitizeReturnRecord(updatedRes.rows[0]) });
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('Admin return status update error:', err);
    res.status(500).json({ error: err.message || 'Failed to update return status' });
  } finally {
    client.release();
  }
});

// POST /api/returns/admin/:id/dispute-decision - Admin exceptional dispute intervention
router.post('/admin/:id/dispute-decision', adminAuth, async (req, res) => {
  const { decision, admin_notes } = req.body;

  if (!decision || !['uphold', 'overrule'].includes(decision)) {
    return res.status(400).json({ error: 'Decision must be "uphold" (keep rejected & close) or "overrule" (approve return)' });
  }
  if (!admin_notes || !admin_notes.trim()) {
    return res.status(400).json({ error: 'Admin notes explaining the decision are required' });
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const retRes = await client.query('SELECT * FROM order_returns WHERE id = $1 FOR UPDATE', [req.params.id]);
    if (retRes.rows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: 'Return request not found' });
    }

    const currentReturn = retRes.rows[0];
    let newStatus = '';

    if (decision === 'uphold') {
      newStatus = 'Closed';
      await vendorAccountingService.releaseOrderEarningsHold(currentReturn.order_id, currentReturn.vendor_id, client);
    } else {
      newStatus = 'Return Approved';
      await vendorAccountingService.holdOrderEarnings(currentReturn.order_id, currentReturn.vendor_id, 'admin_approved', client);
    }

    const updateRes = await client.query(`
      UPDATE order_returns 
      SET status = $1,
          admin_notes = $2,
          admin_action_at = NOW(),
          updated_at = NOW()
      WHERE id = $3
      RETURNING *
    `, [newStatus, admin_notes.trim(), req.params.id]);

    await logReturnStatusChange(client, {
      returnId: req.params.id,
      fromStatus: currentReturn.status,
      toStatus: newStatus,
      changedByType: 'admin',
      changedById: req.admin.id || 1,
      changedByName: req.admin.email || 'Admin',
      notes: `[DISPUTE INTERVENTION] Decision: ${decision.toUpperCase()}. ${admin_notes.trim()}`
    });

    await client.query(`
      INSERT INTO return_messages (return_id, sender_type, sender_id, sender_name, message)
      VALUES ($1, 'admin', $2, 'Admin Support', $3)
    `, [
      req.params.id,
      req.admin.id || 1,
      `[ADMIN DISPUTE INTERVENTION] Decision: ${decision.toUpperCase()}. Resolution notes: ${admin_notes.trim()}`
    ]);

    await client.query('COMMIT');
    res.json({ success: true, returnRequest: sanitizeReturnRecord(updateRes.rows[0]) });
  } catch (err) {
    await client.query('ROLLBACK');
    res.status(500).json({ error: err.message });
  } finally {
    client.release();
  }
});

// POST /api/returns/admin/:id/message - Admin posts message in thread
router.post('/admin/:id/message', adminAuth, async (req, res) => {
  const { message } = req.body;
  if (!message || !message.trim()) return res.status(400).json({ error: 'Message cannot be empty' });

  try {
    const msgRes = await pool.query(`
      INSERT INTO return_messages (return_id, sender_type, sender_id, sender_name, message)
      VALUES ($1, 'admin', $2, 'Admin Support', $3)
      RETURNING *
    `, [req.params.id, req.admin.id || 1, message.trim()]);

    await pool.query('UPDATE order_returns SET updated_at = NOW() WHERE id = $1', [req.params.id]);

    res.json({ success: true, message: msgRes.rows[0] });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
