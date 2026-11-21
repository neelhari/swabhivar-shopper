const router = require('express').Router();
const pool = require('../db');
const { authMiddleware } = require('./auth');
const orderDispatchService = require('../services/orderDispatchService');
const pricingService = require('../services/pricingService');

function adminOnly(req, res, next) {
  if (req.user?.role !== 'admin') return res.status(403).json({ error: 'Admin access only' });
  next();
}

// Enforce authentication & admin authorization on all admin routes
router.use(authMiddleware);
router.use(adminOnly);

// GET /api/admin/stats
router.get('/stats', async (req, res) => {
  try {
    const [users, orders, revenue] = await Promise.all([
      pool.query('SELECT COUNT(*) FROM users WHERE role=$1', ['user']),
      pool.query('SELECT COUNT(*) FROM orders'),
      pool.query("SELECT COALESCE(SUM(total),0) as total FROM orders WHERE status != 'cancelled'"),
    ]);
    res.json({
      totalUsers: parseInt(users.rows[0].count),
      totalOrders: parseInt(orders.rows[0].count),
      totalRevenue: parseFloat(revenue.rows[0].total),
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/admin/users
router.get('/users', async (req, res) => {
  try {
    const result = await pool.query(
      'SELECT id, name, email, phone, role, is_verified, created_at FROM users ORDER BY created_at DESC'
    );
    res.json({ users: result.rows });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// DELETE /api/admin/users/:id (Safe Deletion with Financial Record Preservation)
router.delete('/users/:id', async (req, res) => {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const targetUserId = req.params.id;
    const userRes = await client.query('SELECT id, role, email FROM users WHERE id=$1', [targetUserId]);
    if (!userRes.rows.length) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: 'User not found' });
    }
    if (userRes.rows[0].role === 'admin') {
      await client.query('ROLLBACK');
      return res.status(403).json({ error: 'Cannot delete an administrator account' });
    }

    // Check if user has orders, transactions or payouts
    const ordersRes = await client.query('SELECT COUNT(*) FROM orders WHERE user_id=$1', [targetUserId]);
    const hasOrders = parseInt(ordersRes.rows[0].count) > 0;

    // Delete non-financial associations
    await client.query('DELETE FROM addresses WHERE user_id=$1', [targetUserId]);
    await client.query('DELETE FROM cart_items WHERE user_id=$1', [targetUserId]);
    await client.query('DELETE FROM user_saved_banks WHERE user_id=$1', [targetUserId]);
    await client.query('DELETE FROM otps WHERE email=$1', [userRes.rows[0].email]);

    if (hasOrders) {
      // User has placed orders: anonymize user to preserve tax, vendor payout and order ledger records
      const anonEmail = `deleted_usr_${targetUserId}_${Date.now()}@deleted.invalid`;
      await client.query(
        `UPDATE users 
         SET name = 'Deleted User',
             email = $1,
             phone = NULL,
             password_hash = NULL,
             avatar_url = NULL,
             referral_code = NULL,
             referred_by = NULL,
             wallet_balance = 0,
             is_verified = FALSE
         WHERE id = $2`,
        [anonEmail, targetUserId]
      );
    } else {
      // No order or financial history: safe to hard-delete
      await client.query('DELETE FROM users WHERE id=$1', [targetUserId]);
    }

    await client.query('COMMIT');
    res.json({ message: 'User deleted successfully with financial records preserved' });
  } catch (err) {
    await client.query('ROLLBACK');
    res.status(500).json({ error: err.message });
  } finally {
    client.release();
  }
});

// GET /api/admin/orders
router.get('/orders', async (req, res) => {
  try {
    const [result, payoutsRes, shipmentsRes, vendorsRes] = await Promise.all([
      pool.query(`
        SELECT o.*, u.name as user_name, u.email as user_email
        FROM orders o LEFT JOIN users u ON o.user_id = u.id
        ORDER BY o.created_at DESC
      `),
      pool.query('SELECT * FROM vendor_order_payouts'),
      pool.query('SELECT * FROM vendor_shipments ORDER BY created_at DESC'),
      pool.query(`
        SELECT id, name, email, phone, store_name, pickup_contact_name, pickup_phone,
               pickup_address_line1, pickup_address_line2, pickup_landmark, pickup_city,
               pickup_state, pickup_pincode, shiprocket_pickup_name
        FROM vendors
      `)
    ]);

    const payouts = payoutsRes.rows;
    const shipments = shipmentsRes.rows;
    const vendorsMap = {};
    vendorsRes.rows.forEach(v => { vendorsMap[v.id] = v; });

    const orders = result.rows.map(order => 
      orderDispatchService.formatOrderPackages(order, payouts, shipments, vendorsMap)
    );

    res.json({ orders });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// PUT /api/admin/orders/:id/status
router.put('/orders/:id/status', async (req, res) => {
  const { status, gender } = req.body;
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // Retrieve order to check current status and order number
    const orderRes = await client.query('SELECT * FROM orders WHERE id=$1 FOR UPDATE', [req.params.id]);
    if (orderRes.rows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: 'Order not found' });
    }
    const order = orderRes.rows[0];

    // If transitioning to cancelled, reverse vendor credits atomically
    if (status === 'cancelled' && order.status !== 'cancelled' && order.order_number) {
      const vCredits = await client.query(
        'SELECT DISTINCT vendor_id FROM vendor_transactions WHERE order_number = $1 AND type = $2',
        [order.order_number, 'credit']
      );
      const vendorAccountingService = require('../services/vendorAccountingService');
      for (const row of vCredits.rows) {
        await vendorAccountingService.reverseVendorOrderCredit({
          vendorId: row.vendor_id,
          orderNumber: order.order_number,
          reason: 'Order cancelled by Admin',
          client
        });
      }
    }

    const result = await client.query(
      `UPDATE orders 
       SET status = $1,
           delivered_at = CASE WHEN $1 = 'delivered' AND delivered_at IS NULL THEN NOW() ELSE delivered_at END
       WHERE id = $2 
       RETURNING *`,
      [status, req.params.id]
    );

    await client.query('COMMIT');

    // Trigger push notification to customer on status update
    try {
      const updatedOrder = result.rows[0];
      if (updatedOrder) {
        const pushNotificationService = require('../services/pushNotificationService');
        if (status === 'shipped') {
          pushNotificationService.notifyOrderDispatched({
            orderNumber: updatedOrder.order_number,
            customerId: updatedOrder.user_id,
            trackingId: updatedOrder.tracking_id
          });
        } else if (status === 'delivered') {
          pushNotificationService.notifyOrderDelivered({
            orderNumber: updatedOrder.order_number,
            customerId: updatedOrder.user_id
          });
        }
      }
    } catch (pushErr) {
      console.warn('Admin status push notification non-blocking error:', pushErr.message);
    }

    res.json({ order: result.rows[0] });
  } catch (err) {
    await client.query('ROLLBACK');
    res.status(500).json({ error: err.message });
  } finally {
    client.release();
  }
});

const shiprocket = require('../utils/shiprocket');

// POST /api/admin/orders/:id/dispatch-platform - Dispatch in-house items using Admin Warehouse
router.post('/orders/:id/dispatch-platform', async (req, res) => {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const result = await orderDispatchService.dispatchPlatformPackage({
      orderId: req.params.id,
      client
    });
    await client.query('COMMIT');
    res.json({
      message: 'Platform package dispatched successfully from Admin Warehouse',
      package: result
    });
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('Admin dispatch platform error:', err);
    res.status(500).json({ error: err.message });
  } finally {
    client.release();
  }
});

// POST /api/admin/orders/:id/dispatch-vendor/:vendorId - Dispatch specific vendor items using Vendor's Pickup Address
router.post('/orders/:id/dispatch-vendor/:vendorId', async (req, res) => {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const result = await orderDispatchService.dispatchVendorPackage({
      orderId: req.params.id,
      vendorId: parseInt(req.params.vendorId, 10),
      dispatchedBy: 'admin',
      client
    });
    await client.query('COMMIT');
    res.json({
      message: `Vendor #${req.params.vendorId} package dispatched successfully by Admin`,
      shipment: result
    });
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('Admin dispatch vendor package error:', err);
    res.status(500).json({ error: err.message });
  } finally {
    client.release();
  }
});

// POST /api/admin/orders/:id/ship
router.post('/orders/:id/ship', async (req, res) => {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const orderRes = await client.query('SELECT * FROM orders WHERE id=$1 FOR UPDATE', [req.params.id]);
    const order = orderRes.rows[0];
    if (!order) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: 'Order not found' });
    }

    let items = [];
    try { items = typeof order.items === 'string' ? JSON.parse(order.items) : (order.items || []); } catch(e) {}
    
    let address = {};
    try { address = typeof order.address === 'string' ? JSON.parse(order.address) : (order.address || {}); } catch(e) {}

    // Group items by owner: vendorId or 'admin'
    const grouped = {};
    items.forEach(item => {
      const vId = item.product?.vendor_id ? `vendor_${item.product.vendor_id}` : 'admin';
      if (!grouped[vId]) grouped[vId] = [];
      grouped[vId].push(item);
    });

    const createdShipments = [];

    for (const [groupKey, groupItems] of Object.entries(grouped)) {
      let pickupLocation = null;
      let vendorId = null;

      if (groupKey === 'admin') {
        // Admin-owned items: use admin warehouse pickup location in Shiprocket
        pickupLocation = 'suresh';
      } else {
        vendorId = parseInt(groupKey.replace('vendor_', ''), 10);
        // Vendor-owned items: strictly use this respective vendor's saved pickup address
        const vRes = await client.query(
          `SELECT id, name, email, pickup_contact_name, pickup_phone, pickup_address_line1,
                  pickup_address_line2, pickup_city, pickup_state, pickup_pincode, shiprocket_pickup_name
           FROM vendors WHERE id = $1`,
          [vendorId]
        );
        const vRow = vRes.rows[0];
        if (!vRow || !vRow.pickup_contact_name || !vRow.pickup_address_line1 || !vRow.pickup_city || !vRow.pickup_pincode) {
          throw new Error(`Cannot ship order: Vendor #${vendorId} (${vRow?.name || 'Unknown'}) does not have a valid pickup address configured.`);
        }

        pickupLocation = vRow.shiprocket_pickup_name || `vnd_${vendorId}_${vRow.pickup_pincode}`;
        // Register or verify in Shiprocket
        try {
          await shiprocket.addPickupLocation({
            pickup_location: pickupLocation,
            name: vRow.pickup_contact_name,
            email: vRow.email || 'vendor@swabhivarshoppers.com',
            phone: vRow.pickup_phone,
            address: vRow.pickup_address_line1,
            address_2: vRow.pickup_address_line2 || '',
            city: vRow.pickup_city,
            state: vRow.pickup_state,
            pin_code: vRow.pickup_pincode
          });
        } catch (addErr) {
          console.warn(`Vendor #${vendorId} pickup location registration check:`, addErr.message);
        }
      }

      // Check if shipment already created for this vendor
      if (vendorId) {
        const existRes = await client.query(
          'SELECT * FROM vendor_shipments WHERE order_id = $1 AND vendor_id = $2',
          [order.id, vendorId]
        );
        if (existRes.rows.length > 0) {
          createdShipments.push(existRes.rows[0]);
          continue;
        }
      }

      const orderItems = groupItems.map(item => ({
        name: item.product?.name || item.name || 'Product',
        sku: `${item.product?.id || 'PROD'}-${item.variant?.size || 'STD'}`,
        units: parseInt(item.qty || 1, 10),
        selling_price: parseFloat(item.variant?.price || item.product?.price || 0),
      }));

      const groupSubtotal = groupItems.reduce(
        (acc, item) => acc + (parseInt(item.qty || 1, 10) * parseFloat(item.variant?.price || item.product?.price || 0)), 
        0
      );

      const isCod = String(order.payment_method || '').toLowerCase() === 'cod';

      const shiprocketPayload = {
        order_id: vendorId ? `${order.order_number || order.id}-V${vendorId}` : (order.order_number || order.id.toString()),
        order_date: new Date(order.created_at || Date.now()).toISOString().split('T')[0],
        pickup_location: pickupLocation,
        billing_customer_name: address.name || order.user_name || 'Customer',
        billing_last_name: '',
        billing_address: address.line1 || address.addressLine1 || address.address || 'Address',
        billing_city: address.city || 'City',
        billing_pincode: address.pincode || '110001',
        billing_state: address.state || 'State',
        billing_country: 'India',
        billing_email: order.user_email || 'test@test.com',
        billing_phone: String(order.user_phone || address.mobile || '9999999999').replace(/\D/g, '').slice(-10),
        shipping_is_billing: true,
        order_items: orderItems,
        payment_method: isCod ? 'COD' : 'Prepaid',
        sub_total: groupSubtotal,
        length: 10,
        breadth: 10,
        height: 10,
        weight: Math.max(0.5, groupItems.length * 0.5)
      };

      // 1. Create Custom Order in Shiprocket
      const srOrder = await shiprocket.createCustomOrder(shiprocketPayload);
      const shipmentId = srOrder?.shipment_id || srOrder?.payload?.shipment_id;
      if (!shipmentId) {
        const errMsg = srOrder?.message || (srOrder?.errors ? JSON.stringify(srOrder.errors) : 'Shiprocket did not return a shipment_id');
        throw new Error(errMsg);
      }

      // 2. Generate AWB
      let awbCode = null;
      let courierName = 'Shiprocket Courier';
      let trackingUrl = null;
      let courierId = null;

      try {
        const awbRes = await shiprocket.assignAWB(shipmentId);
        awbCode = awbRes.awb_code;
        courierName = awbRes.courier_name || courierName;
        courierId = awbRes.courier_company_id || null;
        trackingUrl = awbRes.tracking_url || `https://shiprocket.co/tracking/${awbCode}`;
      } catch (awbErr) {
        console.warn('AWB auto-assignment warning:', awbErr.message);
        trackingUrl = `https://shiprocket.co/tracking/${shipmentId}`;
      }

      if (vendorId) {
        const shipIns = await client.query(
          `INSERT INTO vendor_shipments (
            order_id, vendor_id, shiprocket_shipment_id, shiprocket_order_id,
            awb_code, courier_name, courier_id, tracking_url, pickup_location,
            pickup_address, shipping_address, items, status
          ) VALUES (
            $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, 'shipped'
          ) RETURNING *`,
          [
            order.id, vendorId, String(shipmentId), String(srOrder.order_id || shiprocketPayload.order_id),
            awbCode, courierName, courierId, trackingUrl, pickupLocation,
            JSON.stringify({ pickup_location: pickupLocation }), JSON.stringify(address), JSON.stringify(groupItems), 'shipped'
          ]
        );
        createdShipments.push(shipIns.rows[0]);
      } else {
        createdShipments.push({
          shipment_id: shipmentId,
          awb_code: awbCode,
          courier_name: courierName,
          tracking_url: trackingUrl
        });
      }
    }

    const primaryAwb = createdShipments[0]?.awb_code;
    const primaryTracking = createdShipments[0]?.tracking_url || `https://shiprocket.co/tracking/${primaryAwb}`;

    // 3. Save to database
    const shipResult = await client.query(
      'UPDATE orders SET tracking_id=$1, tracking_link=$2, status=$3 WHERE id=$4 RETURNING *',
      [primaryAwb, primaryTracking, 'shipped', req.params.id]
    );

    await client.query('COMMIT');

    try {
      const shippedOrder = shipResult.rows[0];
      if (shippedOrder) {
        const pushNotificationService = require('../services/pushNotificationService');
        pushNotificationService.notifyOrderDispatched({
          orderNumber: shippedOrder.order_number,
          customerId: shippedOrder.user_id,
          trackingId: primaryAwb
        });
      }
    } catch (pushErr) {
      console.warn('Admin ship push notification non-blocking error:', pushErr.message);
    }

    res.json({
      message: 'Order shipped successfully',
      awb: primaryAwb,
      tracking_link: primaryTracking,
      shipments: createdShipments
    });
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('Ship error:', err);
    res.status(500).json({ error: err.message });
  } finally {
    client.release();
  }
});

// --- Products ---
router.get('/products', async (req, res) => {
  try {
    const result = await pool.query('SELECT * FROM products ORDER BY created_at DESC');
    res.json({ products: pricingService.formatProductsList(result.rows) });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/products/:id', async (req, res) => {
  try {
    const result = await pool.query('SELECT * FROM products WHERE id = $1', [req.params.id]);
    if (result.rows.length === 0) return res.status(404).json({ error: 'Product not found' });
    res.json({ product: pricingService.formatProductPricing(result.rows[0]) });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/products', async (req, res) => {
  const { name, slug, short_description, description, category, image_url, images, custom_attributes, vendor_id, variants, gender, price, mrp, stock, brand, sku, weight, length, width, height } = req.body;
  
  try {
    let attrs = custom_attributes || {};
    if (typeof attrs === 'string') {
      try { attrs = JSON.parse(attrs); } catch (e) { attrs = {}; }
    }
    const pWeight = weight !== undefined && weight !== null ? String(weight) : (attrs.shipping_weight || attrs.weight || null);
    const pLen = length !== undefined && length !== null ? String(length) : (attrs.length || null);
    const pWid = width !== undefined && width !== null ? String(width) : (attrs.width || null);
    const pHgt = height !== undefined && height !== null ? String(height) : (attrs.height || null);

    const numPrice = parseFloat(price) || 0;
    let numMrp = parseFloat(mrp);
    if (isNaN(numMrp) || numMrp <= 0) numMrp = numPrice;
    else if (numMrp < numPrice) numMrp = numPrice;
    const calcDiscountPercent = (numMrp > numPrice && numMrp > 0) ? Math.round(((numMrp - numPrice) / numMrp) * 100) : 0;

    const result = await pool.query(
      `INSERT INTO products 
       (name, slug, short_description, description, category, image_url, images, sizes, custom_attributes, price, stock, vendor_id, gender, mrp, brand, sku, weight, length, width, height, discount_percent) 
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21) RETURNING *`,
      [name, slug, short_description, description, category, image_url, JSON.stringify(images || []), JSON.stringify(variants || []), JSON.stringify(attrs), numPrice, stock || 0, vendor_id || null, gender || 'Any', numMrp, brand || '', sku || '', pWeight, pLen, pWid, pHgt, calcDiscountPercent]
    );
    res.json({ product: pricingService.formatProductPricing(result.rows[0]) });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.put('/products/:id', async (req, res) => {
  const { name, slug, short_description, description, category, image_url, images, custom_attributes, vendor_id, variants, gender, price, mrp, stock, brand, sku, weight, length, width, height } = req.body;
  try {
    let attrs = custom_attributes || {};
    if (typeof attrs === 'string') {
      try { attrs = JSON.parse(attrs); } catch (e) { attrs = {}; }
    }
    const pWeight = weight !== undefined && weight !== null ? String(weight) : (attrs.shipping_weight || attrs.weight || null);
    const pLen = length !== undefined && length !== null ? String(length) : (attrs.length || null);
    const pWid = width !== undefined && width !== null ? String(width) : (attrs.width || null);
    const pHgt = height !== undefined && height !== null ? String(height) : (attrs.height || null);

    const numPrice = parseFloat(price) || 0;
    let numMrp = parseFloat(mrp);
    if (isNaN(numMrp) || numMrp <= 0) numMrp = numPrice;
    else if (numMrp < numPrice) numMrp = numPrice;
    const calcDiscountPercent = (numMrp > numPrice && numMrp > 0) ? Math.round(((numMrp - numPrice) / numMrp) * 100) : 0;

    const result = await pool.query(
      `UPDATE products 
       SET name=$1, slug=$2, short_description=$3, description=$4, category=$5, image_url=$6, images=$7, sizes=$8, 
           custom_attributes=$9, price=$10, stock=$11, vendor_id=$12, gender=$13, mrp=$14, brand=$15, sku=$16,
           weight=$17, length=$18, width=$19, height=$20, discount_percent=$21
       WHERE id=$22 RETURNING *`,
      [name, slug, short_description, description, category, image_url, JSON.stringify(images || []), JSON.stringify(variants || []), JSON.stringify(attrs), numPrice, stock || 0, vendor_id || null, gender || 'Any', numMrp, brand || '', sku || '', pWeight, pLen, pWid, pHgt, calcDiscountPercent, req.params.id]
    );
    res.json({ product: pricingService.formatProductPricing(result.rows[0]) });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.delete('/products/:id', async (req, res) => {
  try {
    await pool.query('DELETE FROM products WHERE id=$1', [req.params.id]);
    res.json({ message: 'Product deleted' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// --- Banners ---
router.get('/banners', async (req, res) => {
  try {
    const { type } = req.query;
    let query = 'SELECT * FROM banners WHERE 1=1';
    const params = [];
    if (type) {
      params.push(type);
      query += ' AND (type = $1 OR (type IS NULL AND $1 = \'homepage_hero\'))';
    }
    query += ' ORDER BY created_at DESC';
    const result = await pool.query(query, params);
    res.json({ banners: result.rows });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/banners', async (req, res) => {
  const { title, image_url, link_url, is_active, type } = req.body;
  try {
    const bannerType = type || 'homepage_hero';
    const result = await pool.query(
      'INSERT INTO banners (title, image_url, link_url, is_active, type) VALUES ($1, $2, $3, $4, $5) RETURNING *',
      [title, image_url, link_url, is_active ?? true, bannerType]
    );
    res.json({ banner: result.rows[0] });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.put('/banners/:id', async (req, res) => {
  const { title, image_url, link_url, is_active, type } = req.body;
  try {
    const result = await pool.query(
      'UPDATE banners SET title=$1, image_url=$2, link_url=$3, is_active=$4, type=COALESCE($5, type, \'homepage_hero\') WHERE id=$6 RETURNING *',
      [title, image_url, link_url, is_active ?? true, type, req.params.id]
    );
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Banner not found' });
    }
    res.json({ banner: result.rows[0] });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.delete('/banners/:id', async (req, res) => {
  try {
    await pool.query('DELETE FROM banners WHERE id=$1', [req.params.id]);
    res.json({ message: 'Banner deleted' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// --- Coupons ---
router.get('/coupons', async (req, res) => {
  try {
    const result = await pool.query('SELECT * FROM coupons ORDER BY created_at DESC');
    res.json({ coupons: result.rows });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/coupons', async (req, res) => {
  const { code, type, discount_type, value, discount_value, restriction_type, restriction_value, min_order_value, usage, usage_type, is_active, expires_at, gender } = req.body;
  try {
    const result = await pool.query(
      'INSERT INTO coupons (code, discount_type, discount_value, min_order_value, is_active, expires_at) VALUES ($1, $2, $3, $4, $5, $6) RETURNING *',
      [
        code,
        discount_type || type || 'percentage',
        discount_value || value,
        min_order_value || restriction_value || 0,
        is_active ?? true,
        expires_at || null
      ]
    );
    res.json({ coupon: result.rows[0] });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.put('/coupons/:id', async (req, res) => {
  const { code, type, discount_type, value, discount_value, restriction_type, restriction_value, min_order_value, usage, is_active, expires_at, gender } = req.body;
  try {
    const result = await pool.query(
      'UPDATE coupons SET code=$1, discount_type=$2, discount_value=$3, min_order_value=$4, is_active=$5, expires_at=$6 WHERE id=$7 RETURNING *',
      [
        code,
        discount_type || type || 'percentage',
        discount_value || value,
        min_order_value || restriction_value || 0,
        is_active ?? true,
        expires_at || null,
        req.params.id
      ]
    );
    res.json({ coupon: result.rows[0] });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.delete('/coupons/:id', async (req, res) => {
  try {
    await pool.query('DELETE FROM coupons WHERE id=$1', [req.params.id]);
    res.json({ message: 'Coupon deleted' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// --- CATEGORIES ---

// GET /api/admin/categories
router.get('/categories', async (req, res) => {
  try {
    const result = await pool.query('SELECT * FROM categories ORDER BY id ASC');
    res.json({ categories: result.rows });
  } catch (err) {
    res.status(500).json({ error: 'Server error' });
  }
});

// POST /api/admin/categories
router.post('/categories', async (req, res) => {
  const { name, models, image_url, banner_url, custom_fields, subcategories, gender } = req.body;
  try {
    const modelsJson = Array.isArray(models) ? JSON.stringify(models) : '[]';
    const fieldsJson = Array.isArray(custom_fields) ? JSON.stringify(custom_fields) : '[]';
    const subsJson = Array.isArray(subcategories) ? JSON.stringify(subcategories) : '[]';
    const result = await pool.query(
      'INSERT INTO categories (name, models, image_url, custom_fields, subcategories) VALUES ($1, $2, $3, $4, $5) RETURNING *',
      [name, modelsJson, image_url, fieldsJson, subsJson]
    );
    res.json({ category: result.rows[0] });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
});

// PUT /api/admin/categories/:id
router.put('/categories/:id', async (req, res) => {
  const { name, models, image_url, banner_url, custom_fields, subcategories, gender } = req.body;
  try {
    const modelsJson = Array.isArray(models) ? JSON.stringify(models) : '[]';
    const fieldsJson = Array.isArray(custom_fields) ? JSON.stringify(custom_fields) : '[]';
    const subsJson = Array.isArray(subcategories) ? JSON.stringify(subcategories) : '[]';
    const result = await pool.query(
      'UPDATE categories SET name=$1, models=$2, image_url=$3, custom_fields=$4, subcategories=$5 WHERE id=$6 RETURNING *',
      [name, modelsJson, image_url, fieldsJson, subsJson, req.params.id]
    );
    res.json({ category: result.rows[0] });
  } catch (err) {
    res.status(500).json({ error: 'Server error' });
  }
});

// DELETE /api/admin/categories/:id
router.delete('/categories/:id', async (req, res) => {
  try {
    await pool.query('DELETE FROM categories WHERE id=$1', [req.params.id]);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: 'Server error' });
  }
});

// --- VENDORS ---
router.get('/vendors', async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT v.id, v.name, v.store_name, v.email, v.phone, v.address, v.status, v.wallet_balance, v.created_at,
             COALESCE(v.outstanding_debt, 0) as outstanding_debt,
             COALESCE(stats.gross_sales, 0) as total_gross_sales,
             COALESCE(stats.commission_earned, 0) as total_commission_earned,
             COALESCE(stats.net_earnings, 0) as total_net_earnings,
             COALESCE(payouts.total_payouts, 0) as total_payouts_processed,
             COALESCE(held.held_earnings, 0) as held_earnings,
             GREATEST(0, v.wallet_balance - COALESCE(held.held_earnings, 0) - COALESCE(v.outstanding_debt, 0)) as withdrawable_balance,
             sub.plan_name,
             sub.commission_percent,
             sub.subscription_expires_at,
             v.bank_account_holder_name,
             v.bank_account_number,
             v.bank_ifsc_code,
             v.bank_name,
             COALESCE(v.bank_verification_status, 'not_provided') as bank_verification_status,
             v.pickup_contact_name,
             v.pickup_phone,
             v.pickup_address_line1,
             v.pickup_address_line2,
             v.pickup_landmark,
             v.pickup_city,
             v.pickup_state,
             v.pickup_pincode,
             v.shiprocket_pickup_name
      FROM vendors v
      LEFT JOIN LATERAL (
        SELECT 
          COALESCE(SUM(COALESCE(gross_amount, amount)), 0) as gross_sales,
          COALESCE(SUM(commission_amount), 0) as commission_earned,
          COALESCE(SUM(COALESCE(net_amount, amount)), 0) as net_earnings
        FROM vendor_transactions
        WHERE vendor_id = v.id AND type = 'credit'
      ) stats ON true
      LEFT JOIN LATERAL (
        SELECT 
          COALESCE(SUM(amount), 0) as total_payouts
        FROM vendor_transactions
        WHERE vendor_id = v.id AND type = 'debit'
      ) payouts ON true
      LEFT JOIN LATERAL (
        SELECT 
          COALESCE(SUM(vop.amount), 0) as held_earnings
        FROM vendor_order_payouts vop
        JOIN orders o ON vop.order_id = o.id
        WHERE vop.vendor_id = v.id 
          AND vop.status = 'pending'
          AND (
            vop.hold_status = 'on_hold' 
            OR o.status != 'delivered' 
            OR o.delivered_at IS NULL 
            OR o.delivered_at + INTERVAL '7 days' > NOW()
            OR EXISTS(
              SELECT 1 FROM order_returns ret 
              WHERE ret.order_id = vop.order_id 
                AND ret.vendor_id = vop.vendor_id 
                AND ret.status NOT IN ('Return Rejected', 'Closed')
            )
          )
      ) held ON true
      LEFT JOIN LATERAL (
        SELECT 
          plan_name,
          (features->>'commission_percent')::numeric as commission_percent,
          expires_at as subscription_expires_at
        FROM vendor_subscriptions
        WHERE vendor_id = v.id 
          AND status = 'active'
          AND (starts_at IS NULL OR starts_at <= NOW())
          AND (expires_at IS NULL OR expires_at >= NOW())
        ORDER BY created_at DESC
        LIMIT 1
      ) sub ON true
      ORDER BY v.created_at DESC
    `);
    res.json({ vendors: result.rows });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/admin/vendors/:id/bank-details - Fetch vendor's saved bank details from database
router.get('/vendors/:id/bank-details', async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT id, name, store_name, email, wallet_balance,
              bank_account_holder_name, bank_account_number, bank_ifsc_code, bank_name,
              COALESCE(bank_verification_status, 'not_provided') as bank_verification_status
       FROM vendors 
       WHERE id = $1`,
      [req.params.id]
    );
    if (result.rows.length === 0) return res.status(404).json({ error: 'Vendor not found' });
    res.json({ vendor: result.rows[0] });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.put('/vendors/:id/status', async (req, res) => {
  const { status, gender } = req.body;
  try {
    const result = await pool.query(
      'UPDATE vendors SET status=$1 WHERE id=$2 RETURNING id, name, store_name, email, status',
      [status, req.params.id]
    );
    res.json({ vendor: result.rows[0] });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/vendor-products', async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT p.*, v.store_name, v.email as vendor_email 
      FROM products p 
      JOIN vendors v ON p.vendor_id = v.id 
      ORDER BY p.created_at DESC
    `);
    res.json({ products: result.rows });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/vendor-orders', async (req, res) => {
  try {
    const [result, payoutsRes, shipmentsRes, vendorsRes] = await Promise.all([
      pool.query(`
        SELECT o.*, u.name as user_name, u.email as user_email
        FROM orders o LEFT JOIN users u ON o.user_id = u.id
        ORDER BY o.created_at DESC
      `),
      pool.query('SELECT * FROM vendor_order_payouts'),
      pool.query('SELECT * FROM vendor_shipments ORDER BY created_at DESC'),
      pool.query(`
        SELECT id, name, email, phone, store_name, pickup_contact_name, pickup_phone,
               pickup_address_line1, pickup_address_line2, pickup_landmark, pickup_city,
               pickup_state, pickup_pincode, shiprocket_pickup_name
        FROM vendors
      `)
    ]);

    const payouts = payoutsRes.rows;
    const shipments = shipmentsRes.rows;
    const vendorsMap = {};
    vendorsRes.rows.forEach(v => { vendorsMap[v.id] = v; });

    const vendorOrders = [];
    result.rows.forEach(order => {
      const formatted = orderDispatchService.formatOrderPackages(order, payouts, shipments, vendorsMap);
      if (formatted.vendor_packages && formatted.vendor_packages.length > 0) {
        vendorOrders.push(formatted);
      }
    });

    res.json({ orders: vendorOrders });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// PUT /api/admin/vendor-order-payout/:id - Individual order payout (Safeguarded)
router.put('/vendor-order-payout/:id', async (req, res) => {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const payoutId = req.params.id;
    const payoutRes = await client.query('SELECT * FROM vendor_order_payouts WHERE id = $1 FOR UPDATE', [payoutId]);
    if (payoutRes.rows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: 'Payout not found' });
    }
    
    const payout = payoutRes.rows[0];
    if (payout.status === 'completed' || payout.status === 'paid') {
      await client.query('ROLLBACK');
      return res.status(400).json({ error: 'Payout for this order has already been settled or paid' });
    }

    // Check vendor wallet balance to prevent negative balances
    const vRes = await client.query('SELECT wallet_balance FROM vendors WHERE id = $1 FOR UPDATE', [payout.vendor_id]);
    const currentBalance = parseFloat(vRes.rows[0]?.wallet_balance || 0);
    const payoutAmt = parseFloat(payout.amount || 0);

    if (currentBalance < payoutAmt) {
      await client.query('ROLLBACK');
      return res.status(400).json({ 
        error: `Cannot pay individual order: Vendor wallet balance (₹${currentBalance}) is less than payout amount (₹${payoutAmt}). Order may already have been settled in a bulk payout.` 
      });
    }

    const updateRes = await client.query(
      "UPDATE vendor_order_payouts SET status = 'paid', updated_at = NOW() WHERE id = $1 RETURNING *",
      [payoutId]
    );

    const vUpdate = await client.query(
      'UPDATE vendors SET wallet_balance = wallet_balance - $1 WHERE id = $2 AND wallet_balance >= $1 RETURNING wallet_balance',
      [payoutAmt, payout.vendor_id]
    );

    if (vUpdate.rowCount === 0) {
      await client.query('ROLLBACK');
      return res.status(400).json({ error: 'Insufficient wallet balance' });
    }

    const orderRes = await client.query('SELECT order_number FROM orders WHERE id = $1', [payout.order_id]);
    const orderNumber = orderRes.rows[0]?.order_number || 'Unknown';
    await client.query(
      "INSERT INTO vendor_transactions (vendor_id, type, amount, order_number, description) VALUES ($1, 'debit', $2, $3, $4)",
      [payout.vendor_id, payoutAmt, orderNumber, `Payout for Order ${orderNumber}`]
    );

    await client.query('COMMIT');
    res.json({ success: true, payout: updateRes.rows[0] });
  } catch (err) {
    await client.query('ROLLBACK');
    res.status(500).json({ error: err.message });
  } finally {
    client.release();
  }
});

// POST /api/admin/orders/:id/approve-cod-remittance
router.post('/orders/:id/approve-cod-remittance', async (req, res) => {
  const orderId = req.params.id;
  const { reference, remitted_amount } = req.body;
  const adminUser = req.admin?.name || req.admin?.email || 'admin';

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const orderRes = await client.query('SELECT * FROM orders WHERE id = $1 FOR UPDATE', [orderId]);
    if (orderRes.rows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: 'Order not found' });
    }

    const order = orderRes.rows[0];
    if (order.payment_method !== 'cod') {
      await client.query('ROLLBACK');
      return res.status(400).json({ error: 'Only COD orders require COD remittance approval' });
    }

    // Update order status to delivered if not already
    await client.query(`
      UPDATE orders 
      SET status = 'delivered',
          delivered_at = COALESCE(delivered_at, NOW())
      WHERE id = $1
    `, [orderId]);

    // Update vendor_shipments cod remittance info
    await client.query(`
      UPDATE vendor_shipments 
      SET cod_remitted_amount = $1,
          cod_remittance_status = 'remitted',
          settlement_status = 'approved',
          settlement_approved_at = NOW(),
          settlement_approved_by = $2,
          settlement_reference = $3
      WHERE order_id = $4
    `, [remitted_amount || order.total, adminUser, reference, orderId]);

    // Release held payouts to vendors
    const vendorAccountingService = require('../services/vendorAccountingService');
    const releaseRes = await vendorAccountingService.approveCodOrderSettlement({
      orderId,
      client,
      adminUser,
      reference
    });

    await client.query('COMMIT');
    res.json({ success: true, message: 'COD remittance approved and vendor payouts released.', details: releaseRes });
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('Approve COD remittance error:', err);
    res.status(500).json({ error: err.message || 'Server error' });
  } finally {
    client.release();
  }
});

router.post('/vendors/:id/payout', async (req, res) => {
  const { amount } = req.body;
  const reference = (
    req.body.reference ||
    req.body.utr ||
    req.body.bank_reference ||
    ''
  ).toString().trim();
  const idempotencyKey = (
    req.headers['idempotency-key'] ||
    req.body.idempotency_key ||
    req.body.requestId ||
    req.body.payout_id ||
    ''
  ).toString().trim();

  // 1. Validate positive monetary amount with at most 2 decimal places
  if (amount === undefined || amount === null || amount === '') {
    return res.status(400).json({ error: 'Payout amount is required' });
  }
  const amountStr = String(amount).trim();
  if (!/^\d+(\.\d{1,2})?$/.test(amountStr)) {
    return res.status(400).json({ error: 'Amount must be a positive number with at most 2 decimal places' });
  }
  const payoutAmount = Math.round(parseFloat(amountStr) * 100) / 100;
  if (isNaN(payoutAmount) || payoutAmount <= 0 || !isFinite(payoutAmount)) {
    return res.status(400).json({ error: 'Amount must be greater than zero' });
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // 2. Lock vendor row for update to serialize concurrent payout requests
    const vendorRes = await client.query(
      'SELECT id, name, store_name, email, wallet_balance FROM vendors WHERE id=$1 FOR UPDATE',
      [req.params.id]
    );
    if (vendorRes.rows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: 'Vendor not found' });
    }

    const vendor = vendorRes.rows[0];

    // 3. Idempotency check: if an idempotency key was supplied, check if already processed
    if (idempotencyKey) {
      const existingTx = await client.query(
        'SELECT * FROM vendor_transactions WHERE vendor_id = $1 AND order_number = $2 AND type = $3',
        [vendor.id, idempotencyKey, 'debit']
      );
      if (existingTx.rows.length > 0) {
        await client.query('ROLLBACK');
        return res.json({
          message: 'Payout already processed',
          vendor,
          alreadyProcessed: true,
          transaction: existingTx.rows[0]
        });
      }
    }

    // 4. Validate available withdrawable balance taking into account held earnings & debt
    const vendorAccountingService = require('../services/vendorAccountingService');
    const settlement = await vendorAccountingService.getVendorSettlementBalance(vendor.id, client);
    if (settlement.withdrawableBalance < payoutAmount) {
      await client.query('ROLLBACK');
      return res.status(400).json({
        error: `Insufficient withdrawable balance. Withdrawable: ₹${settlement.withdrawableBalance.toLocaleString()} (₹${settlement.heldAmount.toLocaleString()} held in unsettled orders/returns), Requested: ₹${payoutAmount.toLocaleString()}`
      });
    }

    // 5. Atomic deduction with safety guard
    const updateRes = await client.query(
      'UPDATE vendors SET wallet_balance = wallet_balance - $1 WHERE id = $2 AND wallet_balance >= $1 RETURNING id, name, store_name, wallet_balance',
      [payoutAmount, vendor.id]
    );

    if (updateRes.rowCount === 0) {
      await client.query('ROLLBACK');
      return res.status(400).json({ error: 'Insufficient wallet balance or concurrent payout conflict' });
    }

    // 6. Record payout in vendor_transactions within the same transaction
    const desc = reference
      ? `Payout of ₹${payoutAmount.toLocaleString()} processed via bank transfer (Ref/UTR: ${reference})`
      : `Payout of ₹${payoutAmount.toLocaleString()} processed to bank account`;

    const txRes = await client.query(
      `INSERT INTO vendor_transactions 
         (vendor_id, type, amount, order_number, description, gross_amount, commission_percent, commission_amount, net_amount, debt_recovered, bank_reference) 
       VALUES ($1, 'debit', $2, $3, $4, NULL, NULL, NULL, $2, 0, $5)
       RETURNING *`,
      [vendor.id, payoutAmount, idempotencyKey || null, desc, reference || null]
    );

    // 7. Update corresponding individual order payout statuses to 'paid' so they cannot be double-paid
    await client.query(`
      UPDATE vendor_order_payouts 
      SET status = 'paid', updated_at = NOW() 
      WHERE vendor_id = $1 AND status = 'pending' AND (hold_status IS NULL OR hold_status = 'none' OR hold_status = 'released')
    `, [vendor.id]);

    await client.query('COMMIT');
    res.json({ message: 'Payout successful', vendor: updateRes.rows[0], transaction: txRes.rows[0] });
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('Payout processing error:', err);
    res.status(500).json({ error: err.message || 'Server error' });
  } finally {
    client.release();
  }
});

// GET /api/admin/vendor-payouts - All vendor transactions for admin
router.get('/vendor-payouts', async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT vt.*, v.name as vendor_name, v.store_name, v.email as vendor_email
      FROM vendor_transactions vt 
      LEFT JOIN vendors v ON vt.vendor_id = v.id 
      ORDER BY vt.created_at DESC
    `);
    res.json({ payouts: result.rows });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// --- SUPPORT AGENTS ---
const bcrypt = require('bcryptjs');

// GET /api/admin/support-agents  (scope=admin only)
router.get('/support-agents', async (req, res) => {
  try {
    const result = await pool.query(
      "SELECT id, name, email, is_active, created_at, access_pages FROM support_agents WHERE scope='admin' ORDER BY created_at DESC"
    );
    res.json({ agents: result.rows });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/admin/support-agents
router.post('/support-agents', async (req, res) => {
  const { name, email, password, access_pages, gender } = req.body;
  if (!name || !email || !password) return res.status(400).json({ error: 'name, email and password required' });
  try {
    const existing = await pool.query('SELECT id FROM support_agents WHERE email = $1', [email]);
    if (existing.rows.length > 0) return res.status(400).json({ error: 'Email already exists' });
    const password_hash = await bcrypt.hash(password, 10);
    const pages = Array.isArray(access_pages) ? JSON.stringify(access_pages) : '[]';
    const result = await pool.query(
      "INSERT INTO support_agents (name, email, password_hash, scope, access_pages) VALUES ($1, $2, $3, 'admin', $4) RETURNING id, name, email, is_active, created_at, access_pages",
      [name, email, password_hash, pages]
    );
    res.json({ agent: result.rows[0] });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// PUT /api/admin/support-agents/:id/toggle
router.put('/support-agents/:id/toggle', async (req, res) => {
  try {
    const result = await pool.query(
      "UPDATE support_agents SET is_active = NOT is_active WHERE id = $1 AND scope='admin' RETURNING id, name, email, is_active, access_pages",
      [req.params.id]
    );
    if (result.rows.length === 0) return res.status(404).json({ error: 'Agent not found' });
    res.json({ agent: result.rows[0] });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// DELETE /api/admin/support-agents/:id
router.delete('/support-agents/:id', async (req, res) => {
  try {
    await pool.query("DELETE FROM support_agents WHERE id = $1 AND scope='admin'", [req.params.id]);
    res.json({ message: 'Agent deleted' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// --- PRODUCT REQUESTS (Vendor product approvals) ---

// GET /api/admin/product-requests
router.get('/product-requests', async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT p.*, v.name as vendor_name, v.store_name
       FROM products p
       LEFT JOIN vendors v ON p.vendor_id = v.id
       WHERE p.status = 'pending'
       ORDER BY p.created_at DESC`
    );
    res.json({ products: result.rows });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// PUT /api/admin/product-requests/:id/approve
router.put('/product-requests/:id/approve', async (req, res) => {
  try {
    const result = await pool.query(
      `UPDATE products SET status = 'approved', is_active = true WHERE id = $1 RETURNING *`,
      [req.params.id]
    );
    if (result.rows.length === 0) return res.status(404).json({ error: 'Product not found' });
    res.json({ product: result.rows[0], message: 'Product approved and is now live.' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// PUT /api/admin/product-requests/:id/reject
router.put('/product-requests/:id/reject', async (req, res) => {
  const { reason, gender } = req.body;
  try {
    const result = await pool.query(
      `UPDATE products SET status = 'rejected', is_active = false WHERE id = $1 RETURNING *`,
      [req.params.id]
    );
    if (result.rows.length === 0) return res.status(404).json({ error: 'Product not found' });
    res.json({ product: result.rows[0], message: 'Product rejected.' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});


// GET /api/admin/vendor-tickets
router.get('/vendor-tickets', async (req, res) => {
  try {
    const result = await pool.query(
      'SELECT t.*, v.email as vendor_email, v.name as vendor_name FROM vendor_support_tickets t LEFT JOIN vendors v ON t.vendor_id = v.id ORDER BY t.created_at DESC'
    );
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// PUT /api/admin/vendor-tickets/:id/status
router.put('/vendor-tickets/:id/status', async (req, res) => {
  try {
    const { status } = req.body;
    const result = await pool.query(
      'UPDATE vendor_support_tickets SET status = $1 WHERE id = $2 RETURNING *',
      [status, req.params.id]
    );
    
    if (result.rows.length > 0 && status === 'closed') {
      try {
        const emailService = require('../services/emailService');
        const vendorRes = await pool.query('SELECT email FROM vendors WHERE id = $1', [result.rows[0].vendor_id]);
        if (vendorRes.rows.length > 0 && process.env.EMAIL_USER) {
          await emailService.sendMail({
            from: '"Swabhivar Shoppers Support" <' + process.env.EMAIL_USER + '>',
            to: vendorRes.rows[0].email + (process.env.EMAIL_USER ? ',' + process.env.EMAIL_USER : ''),
            subject: 'Your ticket has been closed',
            text: 'Your support ticket has been marked as closed. Thank you!\n\nTicket ID: ' + req.params.id
          });
        }
      } catch(e) { console.log('Email send failed', e.message); }
    }
    
    res.json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/admin/email-status
router.get('/email-status', async (req, res) => {
  try {
    const emailService = require('../services/emailService');
    const creds = emailService.getSmtpCredentials();
    res.json({
      configured: !!(creds.user && creds.pass),
      sender: creds.user || '',
      host: creds.host,
      port: creds.port,
      secure: creds.port === 465
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/admin/test-email
router.post('/test-email', async (req, res) => {
  try {
    const emailService = require('../services/emailService');
    const { testRecipient } = req.body || {};
    
    // First, verify SMTP handshake
    const verifyResult = await emailService.verifySmtpConnection();
    if (!verifyResult.success) {
      return res.status(502).json({
        success: false,
        error: verifyResult.error || 'SMTP handshake failed',
        sender: verifyResult.user,
        host: verifyResult.host,
        port: verifyResult.port,
        timestamp: verifyResult.timestamp
      });
    }

    // Send real test email
    const recipient = (testRecipient || '').trim() || verifyResult.user;
    let sendResult = null;
    if (recipient) {
      sendResult = await emailService.sendTestEmail(recipient);
    }

    res.json({
      success: true,
      message: 'SMTP handshake successful' + (sendResult ? ` and test email delivered to ${recipient}` : ''),
      sender: verifyResult.user,
      recipient,
      messageId: sendResult?.messageId,
      host: verifyResult.host,
      port: verifyResult.port,
      timestamp: new Date().toISOString()
    });
  } catch (err) {
    console.error('Admin test-email error:', err);
    res.status(500).json({
      success: false,
      error: err.message || 'Failed to complete test email operation',
      timestamp: new Date().toISOString()
    });
  }
});


// GET /api/admin/settings
router.get('/settings', async (req, res) => {
  try {
    const result = await pool.query('SELECT key, value FROM settings');
    const settings = {};
    result.rows.forEach(r => settings[r.key] = r.value);
    res.json(settings);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/admin/settings
router.post('/settings', async (req, res) => {
  try {
    const { key, value } = req.body;
    if (!key || value === undefined || value === null) {
      return res.status(400).json({ error: 'Key and value are required' });
    }

    // Validate percentage settings
    if (key === 'customer_referral_percent' || key === 'vendor_referral_percent') {
      const num = parseFloat(value);
      if (isNaN(num) || num < 0 || num > 100) {
        return res.status(400).json({ error: `${key} must be a valid percentage between 0 and 100` });
      }
    }

    await pool.query(
      'INSERT INTO settings (key, value) VALUES ($1, $2) ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = CURRENT_TIMESTAMP',
      [key, String(value).trim()]
    );
    res.json({ success: true, key, value });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/admin/payouts - Fetch all payout requests
router.get('/payouts', async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT p.*, 
        u.name as user_name, u.email as user_email, 
        v.store_name as vendor_name, v.email as vendor_email
       FROM payout_requests p
       LEFT JOIN users u ON p.user_id = u.id
       LEFT JOIN vendors v ON p.vendor_id = v.id
       ORDER BY p.created_at DESC`
    );
    res.json(result.rows);
  } catch (err) {
    console.error("Error fetching admin payouts:", err);
    res.status(500).json({ error: 'Server error' });
  }
});

// PUT /api/admin/payouts/:id/status - Update payout status
router.put('/payouts/:id/status', async (req, res) => {
  const { id } = req.params;
  const { status } = req.body;
  if (!['paid', 'rejected'].includes(status)) return res.status(400).json({ error: 'Invalid status' });

  try {
    await pool.query('BEGIN');
    
    const payoutRes = await pool.query('SELECT * FROM payout_requests WHERE payout_id = $1 FOR UPDATE', [id]);
    if (!payoutRes.rows.length) {
      await pool.query('ROLLBACK');
      return res.status(404).json({ error: 'Payout not found' });
    }
    
    const payout = payoutRes.rows[0];
    if (payout.status !== 'pending') {
      await pool.query('ROLLBACK');
      return res.status(400).json({ error: 'Payout already processed' });
    }

    await pool.query('UPDATE payout_requests SET status = $1 WHERE payout_id = $2', [status, id]);

    if (status === 'rejected') {
      if (payout.user_id) {
        await pool.query('UPDATE users SET wallet_balance = wallet_balance + $1 WHERE id = $2', [payout.amount, payout.user_id]);
        await pool.query(
          "INSERT INTO user_wallet_transactions (user_id, type, amount, reference_id, description) VALUES ($1, 'credit', $2, $3, $4) ON CONFLICT (user_id, reference_id, type) DO NOTHING",
          [payout.user_id, payout.amount, id, `Refund for rejected payout ${id}`]
        );
      } else if (payout.vendor_id) {
        await pool.query('UPDATE vendors SET wallet_balance = wallet_balance + $1 WHERE id = $2', [payout.amount, payout.vendor_id]);
        await pool.query(
          "INSERT INTO vendor_transactions (vendor_id, type, amount, order_number, description) VALUES ($1, 'credit', $2, $3, $4) ON CONFLICT (vendor_id, order_number, type) DO NOTHING",
          [payout.vendor_id, payout.amount, id, `Refund for rejected payout ${id}`]
        );
      }
    } else if (status === 'paid') {
      // Record debit accounting confirmation
      if (payout.user_id) {
        await pool.query(
          "INSERT INTO user_wallet_transactions (user_id, type, amount, reference_id, description) VALUES ($1, 'debit', $2, $3, $4) ON CONFLICT (user_id, reference_id, type) DO NOTHING",
          [payout.user_id, payout.amount, id, `Bank transfer processed for payout ${id}`]
        );
      } else if (payout.vendor_id) {
        await pool.query(
          "INSERT INTO vendor_transactions (vendor_id, type, amount, order_number, description) VALUES ($1, 'debit', $2, $3, $4) ON CONFLICT (vendor_id, order_number, type) DO NOTHING",
          [payout.vendor_id, payout.amount, id, `Bank transfer processed for payout ${id}`]
        );
      }
    }

    await pool.query('COMMIT');
    res.json({ success: true });
  } catch (err) {
    await pool.query('ROLLBACK');
    console.error("Error updating payout:", err);
    res.status(500).json({ error: 'Server error' });
  }
});

// GET /api/admin/referrals - Comprehensive Referral Dashboard & List
router.get('/referrals', async (req, res) => {
  try {
    const { search = '', month, year } = req.query;

    // 1. Fetch settings (purely from database, no hardcoded defaults)
    const settingsRes = await pool.query("SELECT key, value FROM settings WHERE key IN ('customer_referral_percent', 'vendor_referral_percent')");
    const settings = {
      customer_referral_percent: null,
      vendor_referral_percent: null
    };
    settingsRes.rows.forEach(r => {
      const parsed = parseFloat(r.value);
      if (!isNaN(parsed)) settings[r.key] = parsed;
    });

    // 2. Build referrers collection from users and vendors
    const usersRes = await pool.query(`
      SELECT id, name, email, phone, referral_code, wallet_balance, created_at, 'customer' AS account_type,
             CASE WHEN is_verified THEN 'Active' ELSE 'Pending' END AS account_status
      FROM users
      WHERE referral_code IS NOT NULL AND referral_code != ''
    `);

    const vendorsRes = await pool.query(`
      SELECT id, name, store_name, email, phone, referral_code, wallet_balance, created_at, 'vendor' AS account_type,
             status AS account_status
      FROM vendors
      WHERE referral_code IS NOT NULL AND referral_code != ''
    `);

    // Fetch all customers & vendors with referred_by
    const allReferredUsers = await pool.query('SELECT id, name, phone, email, referred_by, created_at FROM users WHERE referred_by IS NOT NULL');
    const allReferredVendors = await pool.query('SELECT id, name, store_name, phone, email, referred_by, created_at, status FROM vendors WHERE referred_by IS NOT NULL');
    const allPayouts = await pool.query("SELECT * FROM payout_requests");
    const allUserTxns = await pool.query("SELECT * FROM user_wallet_transactions");
    const allVendorTxns = await pool.query("SELECT * FROM vendor_transactions");

    // Optional date filter helpers
    const matchesDate = (dateVal) => {
      if (!dateVal) return true;
      const d = new Date(dateVal);
      if (year && d.getFullYear() !== parseInt(year)) return false;
      if (month && (d.getMonth() + 1) !== parseInt(month)) return false;
      return true;
    };

    const combinedReferrers = [...usersRes.rows, ...vendorsRes.rows];

    const referralList = [];
    let grandTotalCustomers = 0;
    let grandTotalVendors = 0;
    let grandTotalEarned = 0;
    let grandTotalCredited = 0;
    let grandCurrentBalance = 0;

    for (const ref of combinedReferrers) {
      const code = ref.referral_code;

      // Filter referred users/vendors according to optional month/year
      const referredUsers = allReferredUsers.rows.filter(u => u.referred_by === code && matchesDate(u.created_at));
      const referredVendors = allReferredVendors.rows.filter(v => v.referred_by === code && matchesDate(v.created_at));

      // Earnings calculation:
      let totalEarned = 0;
      if (ref.account_type === 'vendor') {
        const vendorCredits = allVendorTxns.rows.filter(t => 
          t.vendor_id === ref.id && 
          t.type === 'credit' && 
          (t.order_number === 'REFERRAL' || (t.description || '').toLowerCase().includes('referral')) &&
          matchesDate(t.created_at)
        );
        totalEarned = vendorCredits.reduce((sum, t) => sum + parseFloat(t.amount || 0), 0);
      } else {
        const userCredits = allUserTxns.rows.filter(t => 
          t.user_id === ref.id && 
          t.type === 'credit' && 
          (t.description || '').toLowerCase().includes('referral') &&
          matchesDate(t.created_at)
        );
        totalEarned = userCredits.reduce((sum, t) => sum + parseFloat(t.amount || 0), 0);
      }

      // Payouts calculation (credited to bank)
      const paidPayouts = allPayouts.rows.filter(p => 
        (ref.account_type === 'vendor' ? p.vendor_id === ref.id : p.user_id === ref.id) &&
        p.status === 'paid' &&
        matchesDate(p.created_at)
      );
      const creditedToBank = paidPayouts.reduce((sum, p) => sum + parseFloat(p.amount || 0), 0);

      const availableBalance = parseFloat(ref.wallet_balance || 0);

      // Accumulate global stats
      grandTotalCustomers += referredUsers.length;
      grandTotalVendors += referredVendors.length;
      grandTotalEarned += totalEarned;
      grandTotalCredited += creditedToBank;
      grandCurrentBalance += availableBalance;

      // Search match
      const s = search.toLowerCase().trim();
      const matchSearch = !s ||
        (code && code.toLowerCase().includes(s)) ||
        (ref.name && ref.name.toLowerCase().includes(s)) ||
        (ref.phone && ref.phone.includes(s)) ||
        (ref.store_name && ref.store_name.toLowerCase().includes(s));

      if (matchSearch) {
        referralList.push({
          id: ref.id,
          referral_id: code,
          referrer_name: ref.name,
          store_name: ref.store_name || null,
          contact_number: ref.phone || '',
          email: ref.email || '',
          account_type: ref.account_type,
          account_status: ref.account_status,
          joining_date: ref.created_at,
          customers_referred: referredUsers.length,
          vendors_referred: referredVendors.length,
          total_earned: parseFloat(totalEarned.toFixed(2)),
          credited_amount: parseFloat(creditedToBank.toFixed(2)),
          available_balance: parseFloat(availableBalance.toFixed(2))
        });
      }
    }

    res.json({
      settings,
      stats: {
        total_referrals: combinedReferrers.length,
        customers_joined: grandTotalCustomers,
        vendors_joined: grandTotalVendors,
        total_earned: parseFloat(grandTotalEarned.toFixed(2)),
        total_credited_to_bank: parseFloat(grandTotalCredited.toFixed(2)),
        current_balance: parseFloat(grandCurrentBalance.toFixed(2))
      },
      referrals: referralList
    });
  } catch (err) {
    console.error('Error fetching admin referrals:', err);
    res.status(500).json({ error: 'Server error fetching referrals' });
  }
});

// GET /api/admin/referrals/:code/details - Detailed view of a single referrer
router.get('/referrals/:code/details', async (req, res) => {
  const { code } = req.params;
  try {
    let referrer = null;
    let accountType = 'customer';

    const uRes = await pool.query("SELECT id, name, email, phone, referral_code, wallet_balance, created_at, 'customer' as account_type, CASE WHEN is_verified THEN 'Active' ELSE 'Pending' END as status FROM users WHERE referral_code=$1", [code]);
    if (uRes.rows.length) {
      referrer = uRes.rows[0];
    } else {
      const vRes = await pool.query("SELECT id, name, store_name, email, phone, referral_code, wallet_balance, created_at, 'vendor' as account_type, status FROM vendors WHERE referral_code=$1", [code]);
      if (vRes.rows.length) {
        referrer = vRes.rows[0];
        accountType = 'vendor';
      }
    }

    if (!referrer) {
      return res.status(404).json({ error: 'Referrer not found' });
    }

    // Customers referred
    const customersRes = await pool.query(`
      SELECT u.id, u.name, u.phone, u.email, u.created_at AS join_date, 
             CASE WHEN u.is_verified THEN 'Active' ELSE 'Pending' END AS status,
             COUNT(o.id) AS total_orders
      FROM users u
      LEFT JOIN orders o ON u.id = o.user_id
      WHERE u.referred_by = $1
      GROUP BY u.id, u.name, u.phone, u.email, u.created_at, u.is_verified
      ORDER BY u.created_at DESC
    `, [code]);

    // Vendors referred
    const vendorsRes = await pool.query(`
      SELECT id, name, store_name, phone, email, created_at AS join_date, status
      FROM vendors
      WHERE referred_by = $1
      ORDER BY created_at DESC
    `, [code]);

    // Transaction History (both earnings & payouts)
    let transactions = [];
    if (accountType === 'vendor') {
      const vt = await pool.query('SELECT created_at AS date, type, amount, order_number AS reference_id, description FROM vendor_transactions WHERE vendor_id = $1 ORDER BY created_at DESC', [referrer.id]);
      transactions = vt.rows.map(t => ({
        date: t.date,
        type: t.type === 'credit' ? 'Earned' : 'Payout',
        amount: parseFloat(t.amount || 0),
        status: t.type === 'credit' ? 'Credited' : 'Debited',
        reference_id: t.reference_id,
        description: t.description,
        percentage_applied: t.description && t.description.includes('%') ? t.description.match(/\(([^)]+)\)/)?.[1] || null : null
      }));
    } else {
      const ut = await pool.query('SELECT created_at AS date, type, amount, reference_id, description, referral_percent FROM user_wallet_transactions WHERE user_id = $1 ORDER BY created_at DESC', [referrer.id]);
      transactions = ut.rows.map(t => ({
        date: t.date,
        type: t.type === 'credit' ? 'Earned' : 'Payout',
        amount: parseFloat(t.amount || 0),
        status: t.type === 'credit' ? 'Credited' : 'Debited',
        reference_id: t.reference_id,
        description: t.description,
        percentage_applied: t.referral_percent ? `${t.referral_percent}%` : null
      }));
    }

    // Payout Requests
    const payoutsRes = await pool.query(
      accountType === 'vendor'
        ? 'SELECT id, payout_id, amount, status, bank_details, created_at FROM payout_requests WHERE vendor_id = $1 ORDER BY created_at DESC'
        : 'SELECT id, payout_id, amount, status, bank_details, created_at FROM payout_requests WHERE user_id = $1 ORDER BY created_at DESC',
      [referrer.id]
    );

    // Dedicated referral reward records
    const rewardsRes = await pool.query(
      `SELECT * FROM referral_rewards WHERE referral_code = $1 ORDER BY created_at DESC`,
      [code]
    );

    const totalEarned = transactions.filter(t => t.type === 'Earned').reduce((sum, t) => sum + t.amount, 0);
    const totalCredited = payoutsRes.rows.filter(p => p.status === 'paid').reduce((sum, p) => sum + parseFloat(p.amount || 0), 0);

    res.json({
      profile: {
        id: referrer.id,
        name: referrer.name,
        store_name: referrer.store_name || null,
        phone: referrer.phone || '',
        email: referrer.email || '',
        referral_code: referrer.referral_code,
        status: referrer.status,
        joining_date: referrer.created_at,
        account_type: accountType
      },
      summary: {
        total_customers: customersRes.rows.length,
        total_vendors: vendorsRes.rows.length,
        total_earned: parseFloat(totalEarned.toFixed(2)),
        total_credited: parseFloat(totalCredited.toFixed(2)),
        available_balance: parseFloat(referrer.wallet_balance || 0)
      },
      customers: customersRes.rows,
      vendors: vendorsRes.rows,
      transactions,
      payouts: payoutsRes.rows,
      rewards: rewardsRes.rows
    });
  } catch (err) {
    console.error('Error fetching referrer details:', err);
    res.status(500).json({ error: 'Server error fetching referrer details' });
  }
});

module.exports = router;
