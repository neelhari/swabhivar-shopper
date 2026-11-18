const router = require('express').Router();
const pool = require('../db');
const jwt = require('jsonwebtoken');
const Razorpay = require('razorpay');
const vendorAccountingService = require('../services/vendorAccountingService');

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

// POST /api/returns/request - Customer submits a return request
router.post('/request', customerAuth, async (req, res) => {
  const { order_id, vendor_id, items, reason, description, images } = req.body;

  if (!order_id || !vendor_id || !items || !items.length || !reason || !description) {
    return res.status(400).json({ error: 'order_id, vendor_id, items, reason, and description are required' });
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // 1. Fetch order and verify ownership
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

    // 2. Validate 7-day return window
    const deliveredAt = order.delivered_at || order.created_at;
    const returnDeadline = new Date(deliveredAt).getTime() + (7 * 24 * 60 * 60 * 1000);
    if (Date.now() > returnDeadline) {
      await client.query('ROLLBACK');
      return res.status(400).json({ error: 'Return window expired. Returns must be requested within 7 days of delivery.' });
    }

    // 3. Prevent duplicate active return for this order & vendor
    const existingRes = await client.query(`
      SELECT id, status FROM order_returns 
      WHERE order_id = $1 AND vendor_id = $2 AND status NOT IN ('Return Rejected', 'Closed')
    `, [order_id, vendor_id]);

    if (existingRes.rows.length > 0) {
      await client.query('ROLLBACK');
      return res.status(400).json({
        error: 'An active return request already exists for this order',
        return_id: existingRes.rows[0].id,
        current_status: existingRes.rows[0].status
      });
    }

    // 4. Calculate refund amount for returned items
    let refundAmount = 0;
    for (const item of items) {
      const price = parseFloat(item.price || item.variant?.price || item.product?.price || 0);
      const qty = parseInt(item.qty || 1, 10);
      refundAmount += price * qty;
    }
    refundAmount = Math.round(refundAmount * 100) / 100;

    // 5. Create return request
    const insertRes = await client.query(`
      INSERT INTO order_returns 
        (order_id, order_number, customer_id, vendor_id, items, reason, description, images, status, refund_amount)
      VALUES 
        ($1, $2, $3, $4, $5, $6, $7, $8, 'Return Requested', $9)
      RETURNING *
    `, [
      order.id,
      order.order_number,
      req.user.id,
      vendor_id,
      JSON.stringify(items),
      reason.trim(),
      description.trim(),
      JSON.stringify(images || []),
      refundAmount
    ]);

    const returnRequest = insertRes.rows[0];

    // 6. Hold affected order's vendor earnings
    await vendorAccountingService.holdOrderEarnings(order.id, vendor_id, 'return_requested', client);

    // 7. Insert initial message in communication thread
    const userRes = await client.query('SELECT name FROM users WHERE id = $1', [req.user.id]);
    const userName = userRes.rows[0]?.name || 'Customer';

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
    res.json({ success: true, returnRequest });
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('Customer return request error:', err);
    res.status(500).json({ error: err.message || 'Failed to submit return request' });
  } finally {
    client.release();
  }
});

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

    res.json({ returns: result.rows });
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

    res.json({ returns: result.rows });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/returns/:id - Customer get single return details with message history
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

    res.json({ returnRequest: retRes.rows[0], messages: messagesRes.rows });
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

  try {
    const retRes = await pool.query('SELECT * FROM order_returns WHERE id = $1', [req.params.id]);
    if (retRes.rows.length === 0 || retRes.rows[0].customer_id !== req.user.id) {
      return res.status(403).json({ error: 'Unauthorized' });
    }

    const currentReturn = retRes.rows[0];
    if (currentReturn.status !== 'Return Approved') {
      return res.status(400).json({ error: `Product can only be shipped after return is approved. Current status: ${currentReturn.status}` });
    }

    const updatedRes = await pool.query(`
      UPDATE order_returns 
      SET status = 'Return Shipped',
          return_tracking_id = $1,
          return_courier = $2,
          updated_at = NOW()
      WHERE id = $3
      RETURNING *
    `, [return_tracking_id.trim(), (return_courier || '').trim(), req.params.id]);

    const userRes = await pool.query('SELECT name FROM users WHERE id = $1', [req.user.id]);
    const userName = userRes.rows[0]?.name || 'Customer';

    await pool.query(`
      INSERT INTO return_messages (return_id, sender_type, sender_id, sender_name, message)
      VALUES ($1, 'customer', $2, $3, $4)
    `, [
      req.params.id,
      req.user.id,
      userName,
      `Returned item dispatched via ${return_courier || 'Courier'}. Tracking ID: ${return_tracking_id}`
    ]);

    res.json({ success: true, returnRequest: updatedRes.rows[0] });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/returns/:id/appeal - Customer raises appeal to Admin
router.post('/:id/appeal', customerAuth, async (req, res) => {
  const { appeal_reason } = req.body;
  if (!appeal_reason || !appeal_reason.trim()) {
    return res.status(400).json({ error: 'Reason for appeal is required' });
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
      return res.status(400).json({ error: `Appeals can only be raised for rejected requests. Current status: ${currentReturn.status}` });
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

    // Re-hold vendor order payout pending admin dispute review
    await vendorAccountingService.holdOrderEarnings(currentReturn.order_id, currentReturn.vendor_id, 'appeal_raised', client);

    const userRes = await client.query('SELECT name FROM users WHERE id = $1', [req.user.id]);
    const userName = userRes.rows[0]?.name || 'Customer';

    await client.query(`
      INSERT INTO return_messages (return_id, sender_type, sender_id, sender_name, message)
      VALUES ($1, 'customer', $2, $3, $4)
    `, [
      req.params.id,
      req.user.id,
      userName,
      `Customer raised appeal to Admin: "${appeal_reason.trim()}"`
    ]);

    await client.query('COMMIT');
    res.json({ success: true, returnRequest: updatedRes.rows[0] });
  } catch (err) {
    await client.query('ROLLBACK');
    res.status(500).json({ error: err.message });
  } finally {
    client.release();
  }
});

// =========================================================================
// VENDOR ENDPOINTS (Full Operational Control)
// =========================================================================

// GET /api/returns/vendor - Vendor lists their own returns only
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

    res.json({ returns: result.rows });
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

    res.json({ returnRequest: retRes.rows[0], messages: messagesRes.rows });
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
    'Product Received'
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
      SELECT * FROM order_returns 
      WHERE id = $1 AND vendor_id = $2
      FOR UPDATE
    `, [req.params.id, req.vendorId]);

    if (retRes.rows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: 'Return request not found or unauthorized' });
    }

    const currentReturn = retRes.rows[0];

    // Update return record
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

    // If rejected: release payout hold so vendor can withdraw once standard eligibility conditions are met
    if (status === 'Return Rejected') {
      await vendorAccountingService.releaseOrderEarningsHold(currentReturn.order_id, req.vendorId, client);
    }

    // Get vendor name for thread notification
    const vRes = await client.query('SELECT store_name, name FROM vendors WHERE id = $1', [req.vendorId]);
    const vendorName = vRes.rows[0]?.store_name || vRes.rows[0]?.name || 'Vendor';

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
    res.json({ success: true, returnRequest: updatedRes.rows[0] });
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

// POST /api/returns/vendor/:id/refund - Vendor completes refund
router.post('/vendor/:id/refund', vendorAuth, async (req, res) => {
  const { refund_method, refund_reference, notes } = req.body;

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const retRes = await client.query(`
      SELECT ret.*, o.payment_method
      FROM order_returns ret
      JOIN orders o ON ret.order_id = o.id
      WHERE ret.id = $1 AND ret.vendor_id = $2
      FOR UPDATE
    `, [req.params.id, req.vendorId]);

    if (retRes.rows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: 'Return request not found or unauthorized' });
    }

    const returnRequest = retRes.rows[0];

    if (returnRequest.refund_status === 'completed') {
      await client.query('ROLLBACK');
      return res.status(400).json({ error: 'Refund has already been completed for this return' });
    }

    const eligibleRefundStatuses = ['Return Approved', 'Product Received', 'Refund Initiated'];
    if (!eligibleRefundStatuses.includes(returnRequest.status)) {
      await client.query('ROLLBACK');
      return res.status(400).json({
        error: `Cannot issue refund in current status "${returnRequest.status}". Return must be approved or product received.`
      });
    }

    let finalRef = (refund_reference || '').trim();
    const finalMethod = refund_method || returnRequest.payment_method || 'manual';

    if (!finalRef) {
      finalRef = `REF-${Date.now()}-${Math.random().toString(36).substring(2, 7).toUpperCase()}`;
    }

    // Apply financial reversal to vendor wallet/debt atomically exactly once
    await vendorAccountingService.reverseVendorOrderCredit({
      vendorId: req.vendorId,
      orderNumber: returnRequest.order_number,
      reason: `Return #${returnRequest.id} refund completed (${finalMethod}: ${finalRef})`,
      client
    });

    // Update return request to Refund Completed
    const updateRes = await client.query(`
      UPDATE order_returns 
      SET status = 'Refund Completed',
          refund_status = 'completed',
          refund_method = $1,
          refund_reference = $2,
          refunded_at = NOW(),
          updated_at = NOW()
      WHERE id = $3
      RETURNING *
    `, [finalMethod, finalRef, req.params.id]);

    const vRes = await client.query('SELECT store_name FROM vendors WHERE id = $1', [req.vendorId]);
    const vendorName = vRes.rows[0]?.store_name || 'Vendor';

    await client.query(`
      INSERT INTO return_messages (return_id, sender_type, sender_id, sender_name, message)
      VALUES ($1, 'vendor', $2, $3, $4)
    `, [
      req.params.id,
      req.vendorId,
      vendorName,
      `Refund of ₹${returnRequest.refund_amount} completed via ${finalMethod}. Reference: ${finalRef}. ${notes ? `Notes: ${notes}` : ''}`
    ]);

    await client.query('COMMIT');
    res.json({ success: true, returnRequest: updateRes.rows[0] });
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('Vendor refund execution error:', err);
    res.status(500).json({ error: err.message || 'Failed to process refund' });
  } finally {
    client.release();
  }
});

// =========================================================================
// ADMIN ENDPOINTS (Monitoring & Exceptional Dispute Handling)
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
      query += ` AND (ret.order_number ILIKE $${params.length} OR v.store_name ILIKE $${params.length} OR u.name ILIKE $${params.length} OR u.email ILIKE $${params.length})`;
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
    res.json({ returns: result.rows });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/returns/admin/:id - Admin single return details with message history
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

    res.json({ returnRequest: retRes.rows[0], messages: messagesRes.rows });
  } catch (err) {
    res.status(500).json({ error: err.message });
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
      // Release hold on vendor earnings
      await vendorAccountingService.releaseOrderEarningsHold(currentReturn.order_id, currentReturn.vendor_id, client);
    } else {
      newStatus = 'Return Approved';
      // Maintain hold on vendor earnings
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

    await client.query(`
      INSERT INTO return_messages (return_id, sender_type, sender_id, sender_name, message)
      VALUES ($1, 'admin', $2, 'Admin Support', $3)
    `, [
      req.params.id,
      req.admin.id || 0,
      `[ADMIN DISPUTE INTERVENTION] Decision: ${decision.toUpperCase()}. Resolution notes: ${admin_notes.trim()}`
    ]);

    await client.query('COMMIT');
    res.json({ success: true, returnRequest: updateRes.rows[0] });
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
    `, [req.params.id, req.admin.id || 0, message.trim()]);

    await pool.query('UPDATE order_returns SET updated_at = NOW() WHERE id = $1', [req.params.id]);

    res.json({ success: true, message: msgRes.rows[0] });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;

