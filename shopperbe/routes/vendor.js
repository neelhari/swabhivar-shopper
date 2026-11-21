const router = require('express').Router();
const pool = require('../db');
const bcrypt = require('bcryptjs');
const { vendorAuthMiddleware } = require('./vendorAuth');
const shiprocket = require('../utils/shiprocket');
const orderDispatchService = require('../services/orderDispatchService');
const pricingService = require('../services/pricingService');

router.use(vendorAuthMiddleware);

// --- Stats ---
router.get('/stats', async (req, res) => {
  try {
    const productsRes = await pool.query("SELECT COUNT(*) FROM products WHERE vendor_id = $1 AND (is_deleted IS NULL OR is_deleted = false) AND (status IS NULL OR status != 'archived')", [req.vendorId]);

    // For vendor orders, we look at orders that have items with this vendor's ID.
    // In PostgreSQL, you can use jsonb array elements to query.
    // Alternatively, just query orders and filter in JS if it's simpler and not too large.
    const ordersRes = await pool.query(`
      SELECT o.total, o.items 
      FROM orders o 
      WHERE o.status != 'cancelled'
    `);

    let totalVendorOrders = 0;
    let totalVendorRevenue = 0;

    ordersRes.rows.forEach(order => {
      let items = [];
      try { items = typeof order.items === 'string' ? JSON.parse(order.items) : (order.items || []); } catch (e) { }

      let hasVendorItem = false;
      items.forEach(item => {
        // If product has vendor_id, match it. Assuming items store product details including vendor_id, 
        // or we need to join products on order creation. For now, rely on product.vendor_id in JSON
        if (item.product && item.product.vendor_id === req.vendorId) {
          hasVendorItem = true;
          totalVendorRevenue += parseFloat(item.qty * (item.variant?.price || item.product?.price || 0));
        }
      });
      if (hasVendorItem) totalVendorOrders++;
    });

    const payoutsRes = await pool.query('SELECT amount, status FROM vendor_order_payouts WHERE vendor_id = $1', [req.vendorId]);
    let pendingSettlements = 0;
    let paidSettlements = 0;

    payoutsRes.rows.forEach(p => {
      if (p.status === 'pending') {
        pendingSettlements += parseFloat(p.amount || 0);
      } else if (p.status === 'paid') {
        paidSettlements += parseFloat(p.amount || 0);
      }
    });

    res.json({
      totalProducts: parseInt(productsRes.rows[0].count),
      totalOrders: totalVendorOrders,
      totalRevenue: totalVendorRevenue,
      pendingSettlements,
      paidSettlements
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// --- Products ---
router.get('/products', async (req, res) => {
  try {
    const showArchived = req.query.status === 'archived';
    let queryText = 'SELECT * FROM products WHERE vendor_id = $1';
    if (showArchived) {
      queryText += " AND (status = 'archived' OR is_deleted = true)";
    } else {
      queryText += " AND (is_deleted IS NULL OR is_deleted = false) AND (status IS NULL OR status != 'archived')";
    }
    queryText += ' ORDER BY created_at DESC';
    const result = await pool.query(queryText, [req.vendorId]);
    const products = result.rows;

    // Get count of active vs archived products
    const countsRes = await pool.query(
      `SELECT 
        COUNT(*) FILTER (WHERE (is_deleted IS NULL OR is_deleted = false) AND (status IS NULL OR status != 'archived'))::int as active_count,
        COUNT(*) FILTER (WHERE status = 'archived' OR is_deleted = true)::int as archived_count
       FROM products 
       WHERE vendor_id = $1`,
      [req.vendorId]
    );
    const activeCount = countsRes.rows[0]?.active_count || 0;
    const archivedCount = countsRes.rows[0]?.archived_count || 0;

    const subRes = await pool.query('SELECT features FROM vendor_subscriptions WHERE vendor_id = $1 AND expires_at > NOW() ORDER BY created_at DESC LIMIT 1', [req.vendorId]);
    let maxProducts = 10; // Default limit for free/no sub
    let isUnlimited = false;

    if (subRes.rows.length > 0) {
      const features = typeof subRes.rows[0].features === 'string' ? JSON.parse(subRes.rows[0].features) : (subRes.rows[0].features || {});
      if (features.product_limit === -1 || String(features.product_limit).toLowerCase() === 'unlimited') {
        isUnlimited = true;
      } else {
        maxProducts = parseInt(features.product_limit) || maxProducts;
      }
    }

    res.json({
      products: pricingService.formatProductsList(products),
      activeCount,
      archivedCount,
      subscriptionStats: {
        added: activeCount,
        max: maxProducts,
        isUnlimited,
        remaining: isUnlimited ? 'Unlimited' : Math.max(0, maxProducts - activeCount)
      }
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/products/:id', async (req, res) => {
  try {
    const result = await pool.query('SELECT * FROM products WHERE id = $1 AND vendor_id = $2', [req.params.id, req.vendorId]);
    if (result.rows.length === 0) return res.status(404).json({ error: 'Product not found' });
    res.json({ product: pricingService.formatProductPricing(result.rows[0]) });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/products', async (req, res) => {
  const { name, slug, short_description, description, category, image_url, images, custom_attributes, variants, gender, price, mrp, stock, brand, sku, weight, length, width, height } = req.body;

  try {
    // Enforce subscription product limit
    const subRes = await pool.query(
      'SELECT features FROM vendor_subscriptions WHERE vendor_id=$1 ORDER BY created_at DESC LIMIT 1',
      [req.vendorId]
    );
    const productLimit = subRes.rows[0]?.features?.product_limit;
    if (productLimit) {
      const limit = parseInt(productLimit, 10);
      if (!isNaN(limit)) {
        const countRes = await pool.query("SELECT COUNT(*) FROM products WHERE vendor_id=$1 AND (is_deleted IS NULL OR is_deleted = false) AND (status IS NULL OR status != 'archived')", [req.vendorId]);
        const count = parseInt(countRes.rows[0].count, 10);
        if (count >= limit) {
          return res.status(403).json({ error: `You have reached your subscription limit of ${limit} products.` });
        }
      }
    }

    // Check Category restriction
    const vendorRes = await pool.query('SELECT selected_categories FROM vendors WHERE id=$1', [req.vendorId]);
    const selectedCats = vendorRes.rows[0]?.selected_categories || [];
    const categoryLimit = subRes.rows[0]?.features?.category_limit;

    // If a limit is present in subscription, they must have it in selected_categories
    if (categoryLimit && !isNaN(parseInt(categoryLimit, 10))) {
      if (!selectedCats.includes(category)) {
        return res.status(403).json({ error: `Category '${category}' is not in your allowed selected categories.` });
      }
    }

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
      `INSERT INTO products (
        name, slug, short_description, description, category, image_url, images, sizes, vendor_id, price, stock, custom_attributes, status, is_active, gender, mrp, brand, sku, weight, length, width, height, discount_percent
      ) VALUES (
        $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, 'pending', false, $13, $14, $15, $16, $17, $18, $19, $20, $21
      ) RETURNING *`,
      [
        name, slug, short_description, description, category, image_url, JSON.stringify(images || []), JSON.stringify(variants || []), req.vendorId, numPrice, stock || 0,
        JSON.stringify(attrs), gender || 'Any', numMrp, brand || '', sku || '', pWeight, pLen, pWid, pHgt, calcDiscountPercent
      ]
    );
    res.json({ product: pricingService.formatProductPricing(result.rows[0]), message: 'Product submitted for admin approval.' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.put('/products/:id', async (req, res) => {
  const { name, slug, short_description, description, category, image_url, images, custom_attributes, variants, gender, price, mrp, stock, brand, sku, weight, length, width, height } = req.body;
  try {
    // Ensure product belongs to vendor
    const check = await pool.query('SELECT id FROM products WHERE id=$1 AND vendor_id=$2', [req.params.id, req.vendorId]);
    if (check.rows.length === 0) return res.status(403).json({ error: 'Not authorized or product not found' });

    // Check Category restriction
    const subRes = await pool.query(
      'SELECT features FROM vendor_subscriptions WHERE vendor_id=$1 ORDER BY created_at DESC LIMIT 1',
      [req.vendorId]
    );
    const vendorRes = await pool.query('SELECT selected_categories FROM vendors WHERE id=$1', [req.vendorId]);
    const selectedCats = vendorRes.rows[0]?.selected_categories || [];
    const categoryLimit = subRes.rows[0]?.features?.category_limit;

    if (categoryLimit && !isNaN(parseInt(categoryLimit, 10))) {
      if (!selectedCats.includes(category)) {
        return res.status(403).json({ error: `Category '${category}' is not in your allowed selected categories.` });
      }
    }

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
           custom_attributes=$9, price=$10, stock=$11, gender=$13, mrp=$14, brand=$15, sku=$16,
           weight=$17, length=$18, width=$19, height=$20, discount_percent=$21
       WHERE id=$12 RETURNING *`,
      [
        name, slug, short_description, description, category, image_url, JSON.stringify(images || []), JSON.stringify(variants || []), 
        JSON.stringify(attrs), numPrice, stock || 0, req.params.id, gender || 'Any', numMrp, brand || '', sku || '',
        pWeight, pLen, pWid, pHgt, calcDiscountPercent
      ]
    );
    res.json({ product: pricingService.formatProductPricing(result.rows[0]) });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.delete('/products/:id', async (req, res) => {
  try {
    const check = await pool.query('SELECT id FROM products WHERE id=$1 AND vendor_id=$2', [req.params.id, req.vendorId]);
    if (check.rows.length === 0) return res.status(403).json({ error: 'Not authorized or product not found' });

    await pool.query('DELETE FROM products WHERE id=$1', [req.params.id]);
    res.json({ message: 'Product deleted' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// --- Pickup Address Management ---

// GET /api/vendor/pickup-address
router.get('/pickup-address', async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT pickup_contact_name, pickup_phone, pickup_address_line1, pickup_address_line2,
              pickup_landmark, pickup_city, pickup_state, pickup_pincode, shiprocket_pickup_name
       FROM vendors WHERE id = $1`,
      [req.vendorId]
    );
    if (result.rows.length === 0) return res.status(404).json({ error: 'Vendor not found' });
    res.json({ pickupAddress: result.rows[0] });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// PUT /api/vendor/pickup-address
router.put('/pickup-address', async (req, res) => {
  const {
    contact_name, phone, address_line1, address_line2,
    landmark, city, state, pincode
  } = req.body;

  if (!contact_name || !phone || !address_line1 || !city || !state || !pincode) {
    return res.status(400).json({ error: 'Please provide all required fields: Contact person, Phone, Address line 1, City, State, Pincode.' });
  }

  const cleanPhone = String(phone).replace(/\D/g, '').slice(-10);
  if (!/^[6-9]\d{9}$/.test(cleanPhone)) {
    return res.status(400).json({ error: 'Invalid phone number. Must be a valid 10-digit Indian mobile number.' });
  }

  const cleanPincode = String(pincode).trim();
  if (!/^\d{6}$/.test(cleanPincode)) {
    return res.status(400).json({ error: 'Invalid pincode. Must be a valid 6-digit Indian postal code.' });
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // Get vendor info
    const vRes = await client.query('SELECT id, name, email, store_name FROM vendors WHERE id = $1 FOR UPDATE', [req.vendorId]);
    if (vRes.rows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: 'Vendor not found' });
    }
    const vendor = vRes.rows[0];

    // Nickname follows the format: vnd_{id}_{pincode}
    const srNickname = `vnd_${vendor.id}_${cleanPincode}`;

    // Register or synchronize with Shiprocket
    let srResult = null;
    let registeredNickname = srNickname;
    let finalAddress1 = address_line1.trim();
    let finalCity = city.trim();

    try {
      srResult = await shiprocket.addPickupLocation({
        pickup_location: srNickname,
        name: contact_name.trim(),
        email: vendor.email || 'vendor@swabhivarshoppers.com',
        phone: cleanPhone,
        address: address_line1.trim(),
        address_2: (address_line2 || '').trim(),
        city: city.trim(),
        state: state.trim(),
        pin_code: cleanPincode
      });
      if (srResult?.pickup_location) {
        registeredNickname = srResult.pickup_location;
      }
      if (srResult?.address) {
        finalAddress1 = srResult.address;
      }
      if (srResult?.city) {
        finalCity = srResult.city;
      }
    } catch (srErr) {
      console.error('Shiprocket addPickupLocation failed:', srErr.message);
      await client.query('ROLLBACK');
      return res.status(400).json({ 
        error: `Shiprocket address validation failed: ${srErr.message}. Note: Address line 1 must include a Shop, Flat, Plot, or House number.` 
      });
    }

    const updateRes = await client.query(
      `UPDATE vendors
       SET pickup_contact_name = $1,
           pickup_phone = $2,
           pickup_address_line1 = $3,
           pickup_address_line2 = $4,
           pickup_landmark = $5,
           pickup_city = $6,
           pickup_state = $7,
           pickup_pincode = $8,
           shiprocket_pickup_name = $9
       WHERE id = $10
       RETURNING pickup_contact_name, pickup_phone, pickup_address_line1, pickup_address_line2,
                 pickup_landmark, pickup_city, pickup_state, pickup_pincode, shiprocket_pickup_name`,
      [
        contact_name.trim(), cleanPhone, finalAddress1,
        (address_line2 || '').trim(), (landmark || '').trim(),
        finalCity, state.trim(), cleanPincode, registeredNickname,
        req.vendorId
      ]
    );

    await client.query('COMMIT');
    res.json({
      message: 'Pickup address updated and synced successfully',
      pickupAddress: updateRes.rows[0],
      shiprocket: srResult
    });
  } catch (err) {
    await client.query('ROLLBACK');
    res.status(500).json({ error: err.message });
  } finally {
    client.release();
  }
});

// --- Orders ---
router.get('/orders', async (req, res) => {
  try {
    const result = await pool.query('SELECT * FROM orders ORDER BY created_at DESC');
    const payoutsRes = await pool.query('SELECT * FROM vendor_order_payouts WHERE vendor_id = $1', [req.vendorId]);
    const payouts = payoutsRes.rows;

    const shipmentsRes = await pool.query('SELECT * FROM vendor_shipments WHERE vendor_id = $1', [req.vendorId]);
    const shipments = shipmentsRes.rows;

    const vendorRes = await pool.query(
      `SELECT pickup_contact_name, pickup_phone, pickup_address_line1, pickup_city, pickup_pincode 
       FROM vendors WHERE id = $1`,
      [req.vendorId]
    );
    const vRow = vendorRes.rows[0] || {};
    const hasPickupAddress = Boolean(vRow.pickup_contact_name && vRow.pickup_phone && vRow.pickup_address_line1 && vRow.pickup_city && vRow.pickup_pincode);

    const vendorOrders = [];

    result.rows.forEach(order => {
      let items = [];
      try { items = typeof order.items === 'string' ? JSON.parse(order.items) : (order.items || []); } catch (e) { }

      const vendorItems = items.filter(item => item.product && item.product.vendor_id === req.vendorId);
      if (vendorItems.length > 0) {
        order.items = vendorItems; // Only show their items
        // Recalculate order total for this vendor
        order.total = vendorItems.reduce((acc, item) => acc + (item.qty * (item.variant?.price || item.product?.price || 0)), 0);

        const payout = payouts.find(p => p.order_id === order.id);
        order.payout_status = payout ? payout.status : 'pending';

        const shipment = shipments.find(s => s.order_id === order.id);
        order.shipment = shipment || null;
        order.dispatched_by = shipment ? (shipment.dispatched_by || 'vendor') : null;
        order.has_pickup_address = hasPickupAddress;
        order.can_dispatch = !shipment && !['cancelled', 'delivered'].includes(String(order.status).toLowerCase());

        // Privacy protection: do not disclose customer personal info to vendors
        delete order.user_name;
        delete order.user_phone;
        delete order.user_email;
        delete order.shipping_address;
        delete order.address;

        vendorOrders.push(order);
      }
    });

    res.json({ orders: vendorOrders });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/vendor/orders/:id/dispatch
router.post('/orders/:id/dispatch', async (req, res) => {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const orderId = req.params.id;

    const shipment = await orderDispatchService.dispatchVendorPackage({
      orderId,
      vendorId: req.vendorId,
      dispatchedBy: 'vendor',
      client
    });

    await client.query('COMMIT');

    res.json({
      message: 'Shipment created and dispatched successfully with Shiprocket!',
      shipment
    });
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('Vendor order dispatch error:', err);
    res.status(400).json({ error: err.message });
  } finally {
    client.release();
  }
});

// PUT /api/vendor/orders/:id/status
router.put('/orders/:id/status', async (req, res) => {
  const { status } = req.body;
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
    if (status === 'cancelled' && order.status !== 'cancelled') {
      const vendorAccountingService = require('../services/vendorAccountingService');
      await vendorAccountingService.reverseVendorOrderCredit({
        vendorId: req.vendorId,
        orderNumber: order.order_number,
        reason: 'Order cancelled by Vendor',
        client
      });
    }

    await client.query(
      `UPDATE orders 
       SET status = $1,
           delivered_at = CASE WHEN $1 = 'delivered' AND delivered_at IS NULL THEN NOW() ELSE delivered_at END
       WHERE id = $2`,
      [status, req.params.id]
    );
    await client.query('COMMIT');

    // Trigger push notification to customer on status update
    try {
      const pushNotificationService = require('../services/pushNotificationService');
      if (status === 'shipped') {
        pushNotificationService.notifyOrderDispatched({
          orderNumber: order.order_number,
          customerId: order.user_id,
          trackingId: order.tracking_id
        });
      } else if (status === 'delivered') {
        pushNotificationService.notifyOrderDelivered({
          orderNumber: order.order_number,
          customerId: order.user_id
        });
      }
    } catch (pushErr) {
      console.warn('Vendor status push notification non-blocking error:', pushErr.message);
    }

    res.json({ message: 'Order status updated' });
  } catch (err) {
    await client.query('ROLLBACK');
    res.status(500).json({ error: err.message });
  } finally {
    client.release();
  }
});


// --- Categories Selection (Subscription Limit & Replacement) ---
router.get('/categories/selected', async (req, res) => {
  try {
    // 1. Get vendor's selected categories
    const vendorRes = await pool.query('SELECT selected_categories FROM vendors WHERE id=$1', [req.vendorId]);
    const selected = vendorRes.rows[0]?.selected_categories || [];

    // 2. Get subscription category limit
    const subRes = await pool.query(
      'SELECT features FROM vendor_subscriptions WHERE vendor_id=$1 ORDER BY created_at DESC LIMIT 1',
      [req.vendorId]
    );
    const categoryLimit = subRes.rows[0]?.features?.category_limit;

    // 3. Count active products by category for this vendor
    const countsRes = await pool.query(
      `SELECT category, COUNT(*)::int as count 
       FROM products 
       WHERE vendor_id = $1 
         AND (is_deleted IS NULL OR is_deleted = false) 
         AND (status IS NULL OR status != 'archived')
       GROUP BY category`,
      [req.vendorId]
    );
    const productCountsByCategory = {};
    let totalActiveProducts = 0;
    for (const r of countsRes.rows) {
      if (r.category) {
        productCountsByCategory[r.category] = r.count;
        totalActiveProducts += r.count;
      }
    }

    // 4. Fetch recent replacement history (audit trail)
    const historyRes = await pool.query(
      `SELECT * FROM vendor_category_history 
       WHERE vendor_id = $1 
       ORDER BY created_at DESC 
       LIMIT 10`,
      [req.vendorId]
    );

    res.json({
      selected_categories: selected,
      category_limit: categoryLimit ? parseInt(categoryLimit, 10) : null,
      product_counts_by_category: productCountsByCategory,
      total_active_products: totalActiveProducts,
      category_history: historyRes.rows
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Initial Category Selection (first-time lock)
router.post('/categories/selected', async (req, res) => {
  const { categories } = req.body;
  if (!Array.isArray(categories)) return res.status(400).json({ error: 'categories must be an array' });

  try {
    // 1. Check if vendor has already selected categories
    const vendorRes = await pool.query('SELECT selected_categories FROM vendors WHERE id=$1', [req.vendorId]);
    const existing = vendorRes.rows[0]?.selected_categories || [];

    if (existing && existing.length > 0) {
      return res.status(400).json({ 
        error: 'Categories have already been selected. Please use the Edit / Replace Categories option.',
        code: 'ALREADY_SELECTED'
      });
    }

    // 2. Check limits
    const subRes = await pool.query(
      'SELECT features FROM vendor_subscriptions WHERE vendor_id=$1 ORDER BY created_at DESC LIMIT 1',
      [req.vendorId]
    );
    const categoryLimit = subRes.rows[0]?.features?.category_limit;

    if (categoryLimit) {
      const limit = parseInt(categoryLimit, 10);
      if (!isNaN(limit) && categories.length > limit) {
        return res.status(400).json({ error: `You can only select up to ${limit} categories.` });
      }
    }

    // 3. Save
    await pool.query('UPDATE vendors SET selected_categories=$1 WHERE id=$2', [JSON.stringify(categories), req.vendorId]);
    res.json({ message: 'Categories saved successfully!', selected_categories: categories });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Preview Category Replacement & Affected Products
router.post('/categories/preview-replacement', async (req, res) => {
  const { new_categories } = req.body;
  if (!Array.isArray(new_categories) || new_categories.length === 0) {
    return res.status(400).json({ error: 'new_categories must be a non-empty array' });
  }

  try {
    // 1. Get vendor's current categories
    const vendorRes = await pool.query('SELECT selected_categories FROM vendors WHERE id=$1', [req.vendorId]);
    const currentCategories = vendorRes.rows[0]?.selected_categories || [];

    // 2. Validate category limits from active subscription
    const subRes = await pool.query(
      'SELECT features FROM vendor_subscriptions WHERE vendor_id=$1 ORDER BY created_at DESC LIMIT 1',
      [req.vendorId]
    );
    const categoryLimit = subRes.rows[0]?.features?.category_limit;
    if (categoryLimit) {
      const limit = parseInt(categoryLimit, 10);
      if (!isNaN(limit) && new_categories.length > limit) {
        return res.status(400).json({ error: `You can only select up to ${limit} categories under your plan.` });
      }
    }

    // 3. Validate category existence in master categories table
    const validCatsRes = await pool.query('SELECT name FROM categories WHERE name = ANY($1)', [new_categories]);
    const validNames = new Set(validCatsRes.rows.map(r => r.name));
    const invalid = new_categories.filter(c => !validNames.has(c));
    if (invalid.length > 0) {
      return res.status(400).json({ error: `Invalid category: ${invalid.join(', ')}` });
    }

    // 4. Compute differences
    const removedCategories = currentCategories.filter(c => !new_categories.includes(c));
    const addedCategories = new_categories.filter(c => !currentCategories.includes(c));
    const keptCategories = currentCategories.filter(c => new_categories.includes(c));

    // 5. Query affected active products in removed categories
    let affectedProducts = [];
    if (removedCategories.length > 0) {
      const prodRes = await pool.query(
        `SELECT id, name, category, price, image_url 
         FROM products 
         WHERE vendor_id = $1 
           AND category = ANY($2) 
           AND (is_deleted IS NULL OR is_deleted = false) 
           AND (status IS NULL OR status != 'archived')
         ORDER BY id DESC`,
        [req.vendorId, removedCategories]
      );
      affectedProducts = prodRes.rows;
    }

    res.json({
      current_categories: currentCategories,
      new_categories,
      removed_categories: removedCategories,
      added_categories: addedCategories,
      kept_categories: keptCategories,
      affected_products: affectedProducts,
      affected_count: affectedProducts.length,
      category_limit: categoryLimit ? parseInt(categoryLimit, 10) : null
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Execute Category Replacement with Atomic Product Archiving
router.post('/categories/replace', async (req, res) => {
  const { new_categories, confirmed } = req.body;
  if (!Array.isArray(new_categories) || new_categories.length === 0) {
    return res.status(400).json({ error: 'new_categories must be a non-empty array' });
  }
  if (!confirmed) {
    return res.status(400).json({ error: 'Confirmation required to execute category replacement' });
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // 1. Lock and get vendor's current categories
    const vendorRes = await client.query('SELECT selected_categories FROM vendors WHERE id=$1 FOR UPDATE', [req.vendorId]);
    if (vendorRes.rows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: 'Vendor not found' });
    }
    const currentCategories = vendorRes.rows[0]?.selected_categories || [];

    // 2. Validate category limits from active subscription
    const subRes = await client.query(
      'SELECT features FROM vendor_subscriptions WHERE vendor_id=$1 ORDER BY created_at DESC LIMIT 1',
      [req.vendorId]
    );
    const categoryLimit = subRes.rows[0]?.features?.category_limit;
    if (categoryLimit) {
      const limit = parseInt(categoryLimit, 10);
      if (!isNaN(limit) && new_categories.length > limit) {
        await client.query('ROLLBACK');
        return res.status(400).json({ error: `You can only select up to ${limit} categories under your plan.` });
      }
    }

    // 3. Validate category existence in master categories table
    const validCatsRes = await client.query('SELECT name FROM categories WHERE name = ANY($1)', [new_categories]);
    const validNames = new Set(validCatsRes.rows.map(r => r.name));
    const invalid = new_categories.filter(c => !validNames.has(c));
    if (invalid.length > 0) {
      await client.query('ROLLBACK');
      return res.status(400).json({ error: `Invalid category: ${invalid.join(', ')}` });
    }

    // 4. Compute differences
    const removedCategories = currentCategories.filter(c => !new_categories.includes(c));
    const addedCategories = new_categories.filter(c => !currentCategories.includes(c));
    const keptCategories = currentCategories.filter(c => new_categories.includes(c));

    // 5. Atomic archive of products in removed categories
    let archivedProductIds = [];
    let archivedCount = 0;

    if (removedCategories.length > 0) {
      const archiveRes = await client.query(
        `UPDATE products 
         SET is_active = false,
             is_deleted = true,
             stock = 0,
             status = 'archived'
         WHERE vendor_id = $1 
           AND category = ANY($2) 
           AND (is_deleted IS NULL OR is_deleted = false) 
           AND (status IS NULL OR status != 'archived')
         RETURNING id, name, category`,
        [req.vendorId, removedCategories]
      );
      archivedProductIds = archiveRes.rows.map(r => r.id);
      archivedCount = archiveRes.rows.length;
    }

    // 6. Update vendor selected_categories
    await client.query(
      'UPDATE vendors SET selected_categories = $1 WHERE id = $2',
      [JSON.stringify(new_categories), req.vendorId]
    );

    // 7. Insert audit record in vendor_category_history
    await client.query(
      `INSERT INTO vendor_category_history (
        vendor_id, previous_categories, new_categories, removed_categories, added_categories,
        affected_product_ids, affected_products_count, reason, created_at
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, NOW())`,
      [
        req.vendorId,
        JSON.stringify(currentCategories),
        JSON.stringify(new_categories),
        JSON.stringify(removedCategories),
        JSON.stringify(addedCategories),
        JSON.stringify(archivedProductIds),
        archivedCount,
        `Vendor category replacement: replaced [${removedCategories.join(', ')}] with [${addedCategories.join(', ')}]`
      ]
    );

    await client.query('COMMIT');

    res.json({
      success: true,
      message: archivedCount > 0 
        ? `Categories updated successfully! ${archivedCount} product(s) from removed categories were safely archived.`
        : 'Categories updated successfully!',
      selected_categories: new_categories,
      removed_categories: removedCategories,
      added_categories: addedCategories,
      archived_count: archivedCount,
      archived_product_ids: archivedProductIds
    });
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('Category replacement error:', err);
    res.status(500).json({ error: err.message || 'Failed to replace categories' });
  } finally {
    client.release();
  }
});

// --- Categories ---

router.get('/categories', async (req, res) => {
  try {
    const result = await pool.query('SELECT * FROM categories ORDER BY id ASC');
    res.json({ categories: result.rows });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// --- Vendor Transactions (Payout History) ---
router.get('/transactions', async (req, res) => {
  try {
    const result = await pool.query(
      'SELECT * FROM vendor_transactions WHERE vendor_id = $1 ORDER BY created_at DESC',
      [req.vendorId]
    );
    res.json({ transactions: result.rows });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// --- Vendor Bank Details ---
router.put('/bank-details', async (req, res) => {
  const { bank_account_holder_name, bank_account_number, bank_ifsc_code, bank_name } = req.body;
  if (!bank_account_number || !bank_ifsc_code) {
    return res.status(400).json({ error: 'Bank account number and IFSC code are required' });
  }

  const cleanAccNum = String(bank_account_number).trim();
  const cleanIfsc = String(bank_ifsc_code).trim().toUpperCase();
  const cleanHolder = String(bank_account_holder_name || '').trim();
  const cleanBankName = String(bank_name || '').trim();

  try {
    const result = await pool.query(`
       UPDATE vendors 
       SET bank_account_holder_name = $1,
           bank_account_number = $2,
           bank_ifsc_code = $3,
           bank_name = $4,
           bank_verification_status = 'verified'
       WHERE id = $5
       RETURNING id, name, store_name, bank_account_holder_name, bank_account_number, bank_ifsc_code, bank_name, bank_verification_status`,
      [cleanHolder, cleanAccNum, cleanIfsc, cleanBankName, req.vendorId]
    );

    res.json({
      message: 'Bank details saved successfully as active payout method',
      vendor: result.rows[0]
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});
// --- Vendor Referrals ---
router.get('/referrals', async (req, res) => {
  try {
    const referralAccountingService = require('../services/referralAccountingService');
    const data = await referralAccountingService.getVendorReferralData(req.vendorId, pool);
    res.json({
      ...data,
      referrals: data.history,
      stats: {
        total: (data.metrics.total_vendor_referrals || 0) + (data.metrics.total_customer_referrals || 0),
        customers: data.metrics.total_customer_referrals || 0,
        vendors: data.metrics.total_vendor_referrals || 0,
        active: (data.metrics.active_referred_vendors || 0) + (data.metrics.active_referred_customers || 0)
      }
    });
  } catch (err) {
    console.error('Vendor referrals endpoint error:', err);
    res.status(500).json({ error: err.message });
  }
});

// --- Vendor Support Agents ---
// GET /api/vendor/support-agents
router.get('/support-agents', async (req, res) => {
  try {
    const result = await pool.query(
      "SELECT id, name, email, is_active, created_at, access_pages FROM support_agents WHERE scope='vendor' AND vendor_id=$1 ORDER BY created_at DESC",
      [req.vendorId]
    );
    res.json({ agents: result.rows });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/vendor/support-agents
router.post('/support-agents', async (req, res) => {
  const { name, email, password, access_pages, gender } = req.body;
  if (!name || !email || !password) return res.status(400).json({ error: 'name, email and password required' });
  try {
    const existing = await pool.query('SELECT id FROM support_agents WHERE email = $1', [email]);
    if (existing.rows.length > 0) return res.status(400).json({ error: 'Email already exists' });
    const password_hash = await bcrypt.hash(password, 10);
    const pages = Array.isArray(access_pages) ? JSON.stringify(access_pages) : '[]';
    const result = await pool.query(
      "INSERT INTO support_agents (name, email, password_hash, scope, vendor_id, access_pages) VALUES ($1, $2, $3, 'vendor', $4, $5) RETURNING id, name, email, is_active, created_at, access_pages",
      [name, email, password_hash, req.vendorId, pages]
    );
    res.json({ agent: result.rows[0] });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// PUT /api/vendor/support-agents/:id/toggle
router.put('/support-agents/:id/toggle', async (req, res) => {
  try {
    const result = await pool.query(
      "UPDATE support_agents SET is_active = NOT is_active WHERE id=$1 AND scope='vendor' AND vendor_id=$2 RETURNING id, name, email, is_active, access_pages",
      [req.params.id, req.vendorId]
    );
    if (result.rows.length === 0) return res.status(404).json({ error: 'Agent not found' });
    res.json({ agent: result.rows[0] });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// DELETE /api/vendor/support-agents/:id
router.delete('/support-agents/:id', async (req, res) => {
  try {
    await pool.query("DELETE FROM support_agents WHERE id=$1 AND scope='vendor' AND vendor_id=$2", [req.params.id, req.vendorId]);
    res.json({ message: 'Agent deleted' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});


// GET /api/vendor/tickets
router.get('/tickets', async (req, res) => {
  try {
    const result = await pool.query('SELECT * FROM vendor_support_tickets WHERE vendor_id = $1 ORDER BY created_at DESC', [req.vendorId]);
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/vendor/tickets
router.post('/tickets', async (req, res) => {
  try {
    const { subject, message } = req.body;
    const ticket_id = "TICK-" + Math.floor(Math.random() * 100000);
    const result = await pool.query(
      'INSERT INTO vendor_support_tickets (vendor_id, subject, message, status) VALUES ($1, $2, $3, $4) RETURNING *',
      [req.vendorId, subject, message, 'open']
    );

    // Try sending email
    try {
      const emailService = require('../services/emailService');
      const vendorRes = await pool.query('SELECT email FROM vendors WHERE id = $1', [req.vendorId]);
      if (vendorRes.rows.length > 0 && process.env.EMAIL_USER) {
        await emailService.sendMail({
          from: '"Swabhivar Shoppers Support" <' + process.env.EMAIL_USER + '>',
          to: vendorRes.rows[0].email + (process.env.EMAIL_USER ? ',' + process.env.EMAIL_USER : ''),
          subject: 'Your ticket has been created',
          text: 'Your ticket has been created and our team will contact you shortly.\n\nTicket ID: ' + result.rows[0].id
        });
      }
    } catch (e) { console.log('Email send failed', e.message); }

    res.json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/vendor/close-store
// Self-service vendor store closure & deactivation with business safety checks
router.post('/close-store', async (req, res) => {
  const { password, reason } = req.body;
  if (!password) {
    return res.status(400).json({ error: 'Please enter your password to confirm store closure.' });
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // 1. Fetch vendor
    const vendorRes = await client.query(
      'SELECT id, name, email, password_hash, status, wallet_balance, COALESCE(outstanding_debt, 0) as outstanding_debt FROM vendors WHERE id=$1',
      [req.vendorId]
    );
    if (!vendorRes.rows.length) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: 'Vendor not found' });
    }
    const vendor = vendorRes.rows[0];

    if (vendor.status === 'closed') {
      await client.query('ROLLBACK');
      return res.status(400).json({ error: 'This vendor store is already closed.' });
    }

    // 2. Verify password
    const valid = await bcrypt.compare(password, vendor.password_hash);
    if (!valid) {
      await client.query('ROLLBACK');
      return res.status(400).json({ error: 'Incorrect password. Store closure cancelled.' });
    }

    // 3. Check for unresolved business activities
    // 3a. Active / unfulfilled customer orders containing this vendor's products
    const ordersRes = await client.query(
      `SELECT o.id, o.order_number, o.status, o.items
       FROM orders o
       WHERE o.status IN ('pending', 'processing', 'partially_shipped', 'shipped')`
    );
    const activeVendorOrders = [];
    for (const order of ordersRes.rows) {
      let items = [];
      try {
        items = typeof order.items === 'string' ? JSON.parse(order.items) : (order.items || []);
      } catch (e) {}
      const hasVendorItem = items.some(item => item.product && item.product.vendor_id === req.vendorId);
      if (hasVendorItem) {
        activeVendorOrders.push(`${order.order_number} (${order.status})`);
      }
    }
    if (activeVendorOrders.length > 0) {
      await client.query('ROLLBACK');
      return res.status(400).json({
        error: `Cannot close store while you have active or in-transit orders: ${activeVendorOrders.join(', ')}. Please dispatch, complete, or cancel these orders before closing your store.`
      });
    }

    // 3b. Open returns or disputes for this vendor's items
    const openReturnsRes = await client.query(
      `SELECT r.id, o.order_number, r.status
       FROM order_returns r
       JOIN orders o ON r.order_id = o.id
       WHERE r.vendor_id = $1 AND r.status IN ('requested', 'approved', 'pickup_scheduled')`,
      [req.vendorId]
    );
    if (openReturnsRes.rows.length > 0) {
      const returnList = openReturnsRes.rows.map(r => `${r.order_number} (${r.status})`).join(', ');
      await client.query('ROLLBACK');
      return res.status(400).json({
        error: `Cannot close store while you have open customer return or refund requests: ${returnList}. Please resolve these requests first.`
      });
    }

    // 3c. Outstanding platform debt
    const debtAmount = parseFloat(vendor.outstanding_debt) || 0;
    if (debtAmount > 0) {
      await client.query('ROLLBACK');
      return res.status(400).json({
        error: `Cannot close store while you have outstanding platform debt (₹${debtAmount.toLocaleString()}). Please settle your dues with administration first.`
      });
    }

    const walletBalance = parseFloat(vendor.wallet_balance) || 0;

    // 4. Deactivate store and products
    await client.query(
      "UPDATE vendors SET status = 'closed' WHERE id = $1",
      [req.vendorId]
    );

    // Deactivate products (hides them from storefront/search, while retaining catalog data)
    await client.query(
      "UPDATE products SET is_active = FALSE, status = 'Archived' WHERE vendor_id = $1",
      [req.vendorId]
    );

    await client.query('COMMIT');

    res.json({
      success: true,
      message: 'Your store has been successfully closed and deactivated. Your products have been unlisted from customer browsing. Historical orders, payouts, and financial records remain preserved.',
      wallet_balance: walletBalance
    });
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('Vendor close store error:', err);
    res.status(500).json({ error: 'Server error while closing store: ' + err.message });
  } finally {
    client.release();
  }
});

// POST /api/vendor/device-token - Register FCM Push Token for Vendor
router.post('/device-token', async (req, res) => {
  try {
    const { token, platform } = req.body;
    if (!token) return res.status(400).json({ error: 'Device token is required' });

    const pushNotificationService = require('../services/pushNotificationService');
    const saved = await pushNotificationService.saveDeviceToken({
      vendorId: req.vendorId,
      token,
      platform: platform || 'android',
      appType: 'vendor'
    });
    res.json({ success: true, token: saved });
  } catch (err) {
    console.error('Save vendor device token error:', err);
    res.status(500).json({ error: 'Failed to save device token' });
  }
});

// DELETE /api/vendor/device-token - Remove FCM Push Token for Vendor
router.delete('/device-token', async (req, res) => {
  try {
    const { token } = req.body;
    if (!token) return res.status(400).json({ error: 'Device token is required' });

    const pushNotificationService = require('../services/pushNotificationService');
    const result = await pushNotificationService.removeDeviceToken({
      vendorId: req.vendorId,
      token,
      appType: 'vendor'
    });
    res.json({ success: true, removed: result.removed });
  } catch (err) {
    console.error('Delete vendor device token error:', err);
    res.status(500).json({ error: 'Failed to delete device token' });
  }
});

module.exports = router;
