const { authMiddleware } = require('./auth');
const router = require('express').Router();
const pool = require('../db');
const Razorpay = require('razorpay');
const crypto = require('crypto');
const nodemailer = require('nodemailer');
const vendorAccountingService = require('../services/vendorAccountingService');
const emailService = require('../services/emailService');
const pricingService = require('../services/pricingService');

const transporter = {
  sendMail: (options) => emailService.sendMail(options)
};

async function sendOrderEmailToAdmin(orderNumber, total, address, items, paymentMethod) {
  try {
    const addr = typeof address === 'string' ? JSON.parse(address) : address;
    const itemsList = (typeof items === 'string' ? JSON.parse(items) : items) || [];
    const itemsHtml = itemsList.map(item => `
      <tr>
        <td style="padding:8px 12px;border-bottom:1px solid #eee;">${item.product?.name || 'Product'}</td>
        <td style="padding:8px 12px;border-bottom:1px solid #eee;">${item.variant?.color ? item.variant.color + ' / ' : ''}${item.variant?.size || '-'}</td>
        <td style="padding:8px 12px;border-bottom:1px solid #eee;text-align:center;">${item.qty}</td>
        <td style="padding:8px 12px;border-bottom:1px solid #eee;text-align:right;">₹${(item.qty * (item.variant?.price || item.product?.price || 0)).toLocaleString()}</td>
      </tr>
    `).join('');

    await transporter.sendMail({
      from: `"Swabhivar Shoppers " <${process.env.EMAIL_USER}>`,
      to: process.env.EMAIL_USER,
      subject: `🛒 New Order Received - ${orderNumber}`,
      html: `
        <div style="font-family:'Segoe UI',Arial,sans-serif;max-width:600px;margin:0 auto;background:#fff;border:1px solid #e5e7eb;border-radius:12px;overflow:hidden;">
          <div style="background:linear-gradient(135deg,#fe6603,#ff8534);padding:24px;text-align:center;">
            <h1 style="color:#fff;margin:0;font-size:22px;">New Order Received!</h1>
            <p style="color:rgba(255,255,255,0.9);margin:8px 0 0;font-size:14px;">${orderNumber}</p>
          </div>
          <div style="padding:24px;">
            <h3 style="margin:0 0 12px;color:#111;">Customer Details</h3>
            <p style="margin:4px 0;color:#555;"><strong>${addr?.name || 'Guest'}</strong> &middot; ${addr?.mobile || ''}</p>
            <p style="margin:4px 0;color:#555;">${addr?.addressLine1 || ''} ${addr?.addressLine2 || ''}, ${addr?.city || ''}, ${addr?.state || ''} - ${addr?.pincode || ''}</p>
            <hr style="border:none;border-top:1px solid #eee;margin:16px 0;">
            <h3 style="margin:0 0 12px;color:#111;">Order Items</h3>
            <table style="width:100%;border-collapse:collapse;font-size:13px;">
              <tr style="background:#f9fafb;"><th style="padding:8px 12px;text-align:left;">Product</th><th style="padding:8px 12px;text-align:left;">Variant</th><th style="padding:8px 12px;text-align:center;">Qty</th><th style="padding:8px 12px;text-align:right;">Amount</th></tr>
              ${itemsHtml}
            </table>
            <div style="text-align:right;margin-top:12px;font-size:18px;font-weight:bold;color:#111;">Total: ₹${parseFloat(total).toLocaleString()}</div>
            <p style="margin-top:8px;text-align:right;font-size:12px;color:#888;">Payment: ${paymentMethod === 'cod' ? 'Cash on Delivery' : 'Prepaid (Online)'}</p>
          </div>
        </div>
      `
    });
  } catch (err) {
    console.error('Admin email send failed:', err);
  }
}

async function sendOrderEmailToCustomer(email, orderNumber, total, address, items, paymentMethod) {
  if (!email) return;
  try {
    const addr = typeof address === 'string' ? JSON.parse(address) : address;
    const itemsList = (typeof items === 'string' ? JSON.parse(items) : items) || [];
    const itemsHtml = itemsList.map(item => `
      <tr>
        <td style="padding:10px 12px;border-bottom:1px solid #f3f4f6;">
          <div style="display:flex;align-items:center;gap:10px;">
            <img src="${item.product?.image_url || item.product?.images?.[0] || ''}" alt="" style="width:48px;height:48px;border-radius:8px;object-fit:cover;" />
            <div>
              <p style="margin:0;font-weight:600;color:#111;">${item.product?.name || 'Product'}</p>
              <p style="margin:2px 0 0;font-size:12px;color:#888;">${item.variant?.color ? item.variant.color + ' / ' : ''}${item.variant?.size || ''}</p>
            </div>
          </div>
        </td>
        <td style="padding:10px 12px;border-bottom:1px solid #f3f4f6;text-align:center;">${item.qty}</td>
        <td style="padding:10px 12px;border-bottom:1px solid #f3f4f6;text-align:right;font-weight:600;">₹${(item.qty * (item.variant?.price || item.product?.price || 0)).toLocaleString()}</td>
      </tr>
    `).join('');

    await transporter.sendMail({
      from: `"Swabhivar Shoppers" <${process.env.EMAIL_USER}>`,
      to: email,
      subject: `✅ Order Confirmed - ${orderNumber}`,
      html: `
        <div style="font-family:'Segoe UI',Arial,sans-serif;max-width:600px;margin:0 auto;background:#fff;border:1px solid #e5e7eb;border-radius:12px;overflow:hidden;">
          <div style="background:linear-gradient(135deg,#10b981,#059669);padding:28px;text-align:center;">
            <div style="font-size:40px;margin-bottom:8px;">✅</div>
            <h1 style="color:#fff;margin:0;font-size:22px;">Order Confirmed!</h1>
            <p style="color:rgba(255,255,255,0.9);margin:8px 0 0;font-size:14px;">Thank you for your order, ${addr?.name || 'Customer'}!</p>
          </div>
          <div style="padding:24px;">
            <div style="background:#f0fdf4;border:1px solid #bbf7d0;border-radius:8px;padding:14px;margin-bottom:20px;text-align:center;">
              <p style="margin:0;font-size:13px;color:#166534;">Order Number</p>
              <p style="margin:4px 0 0;font-size:18px;font-weight:bold;color:#111;letter-spacing:1px;">${orderNumber}</p>
            </div>
            <h3 style="margin:0 0 12px;color:#111;font-size:15px;">Items Ordered</h3>
            <table style="width:100%;border-collapse:collapse;font-size:13px;">
              <tr style="background:#f9fafb;"><th style="padding:8px 12px;text-align:left;">Product</th><th style="padding:8px 12px;text-align:center;">Qty</th><th style="padding:8px 12px;text-align:right;">Amount</th></tr>
              ${itemsHtml}
            </table>
            <div style="background:#f9fafb;border-radius:8px;padding:14px;margin-top:16px;">
              <div style="display:flex;justify-content:space-between;margin-bottom:6px;"><span style="color:#666;">Payment</span><span style="font-weight:600;">${paymentMethod === 'cod' ? 'Cash on Delivery' : 'Paid Online'}</span></div>
              <div style="display:flex;justify-content:space-between;font-size:18px;"><span style="font-weight:bold;color:#111;">Total</span><span style="font-weight:bold;color:#059669;">₹${parseFloat(total).toLocaleString()}</span></div>
            </div>
            <hr style="border:none;border-top:1px solid #eee;margin:20px 0;">
            <h3 style="margin:0 0 8px;color:#111;font-size:15px;">Delivering To</h3>
            <p style="margin:4px 0;color:#555;line-height:1.6;">${addr?.name || ''}<br>${addr?.addressLine1 || ''} ${addr?.addressLine2 || ''}<br>${addr?.city || ''}, ${addr?.state || ''} - ${addr?.pincode || ''}<br>📞 ${addr?.mobile || ''}</p>
            <div style="text-align:center;margin-top:24px;">
              <p style="color:#888;font-size:12px;margin:0;">Need help? Reply to this email or contact us.</p>
            </div>
          </div>
        </div>
      `
    });
  } catch (err) {
    console.error('Customer email send failed:', err);
  }
}

async function sendOrderEmailToVendor(vendorEmail, vendorName, orderNumber, vendorItems, vendorTotal, address, paymentMethod) {
  if (!vendorEmail) return;
  try {
    const addr = typeof address === 'string' ? JSON.parse(address) : address;
    const itemsHtml = vendorItems.map(item => `
      <tr>
        <td style="padding:8px 12px;border-bottom:1px solid #eee;">${item.product?.name || 'Product'}</td>
        <td style="padding:8px 12px;border-bottom:1px solid #eee;">${item.variant?.color ? item.variant.color + ' / ' : ''}${item.variant?.size || '-'}</td>
        <td style="padding:8px 12px;border-bottom:1px solid #eee;text-align:center;">${item.qty}</td>
        <td style="padding:8px 12px;border-bottom:1px solid #eee;text-align:right;">₹${(item.qty * (item.variant?.price || item.product?.price || 0)).toLocaleString()}</td>
      </tr>
    `).join('');

    await transporter.sendMail({
      from: `"Swabhivar Shoppers" <${process.env.EMAIL_USER}>`,
      to: vendorEmail,
      subject: `🎉 New Order for Your Products - ${orderNumber}`,
      html: `
        <div style="font-family:'Segoe UI',Arial,sans-serif;max-width:600px;margin:0 auto;background:#fff;border:1px solid #e5e7eb;border-radius:12px;overflow:hidden;">
          <div style="background:linear-gradient(135deg,#7c3aed,#6d28d9);padding:28px;text-align:center;">
            <div style="font-size:40px;margin-bottom:8px;">🎉</div>
            <h1 style="color:#fff;margin:0;font-size:22px;">New Order for Your Products!</h1>
            <p style="color:rgba(255,255,255,0.9);margin:8px 0 0;font-size:14px;">Hi ${vendorName}, you have a new sale!</p>
          </div>
          <div style="padding:24px;">
            <div style="background:#f5f3ff;border:1px solid #ddd6fe;border-radius:8px;padding:14px;margin-bottom:20px;text-align:center;">
              <p style="margin:0;font-size:13px;color:#5b21b6;">Order Number</p>
              <p style="margin:4px 0 0;font-size:18px;font-weight:bold;color:#111;letter-spacing:1px;">${orderNumber}</p>
            </div>
            <h3 style="margin:0 0 12px;color:#111;font-size:15px;">Your Products in This Order</h3>
            <table style="width:100%;border-collapse:collapse;font-size:13px;">
              <tr style="background:#f9fafb;"><th style="padding:8px 12px;text-align:left;">Product</th><th style="padding:8px 12px;text-align:left;">Variant</th><th style="padding:8px 12px;text-align:center;">Qty</th><th style="padding:8px 12px;text-align:right;">Amount</th></tr>
              ${itemsHtml}
            </table>
            <div style="background:#f5f3ff;border-radius:8px;padding:14px;margin-top:16px;">
              <div style="display:flex;justify-content:space-between;font-size:18px;"><span style="font-weight:bold;color:#111;">Your Earnings</span><span style="font-weight:bold;color:#7c3aed;">₹${vendorTotal.toLocaleString()}</span></div>
              <p style="margin:8px 0 0;font-size:12px;color:#888;">This amount has been credited to your virtual wallet.</p>
            </div>
            <hr style="border:none;border-top:1px solid #eee;margin:20px 0;">
            <h3 style="margin:0 0 8px;color:#111;font-size:15px;">Ship To</h3>
            <p style="margin:4px 0;color:#555;line-height:1.6;">${addr?.name || ''}<br>${addr?.addressLine1 || ''} ${addr?.addressLine2 || ''}<br>${addr?.city || ''}, ${addr?.state || ''} - ${addr?.pincode || ''}<br>📞 ${addr?.mobile || ''}</p>
            <div style="text-align:center;margin-top:24px;">
              <p style="color:#888;font-size:12px;margin:0;">Please prepare and ship the order promptly. Check your vendor dashboard for details.</p>
            </div>
          </div>
        </div>
      `
    });
  } catch (err) {
    console.error('Vendor email send failed:', err);
  }
}

// GET /api/general/db-test
router.get('/db-test', async (req, res) => {
  try {
    const result = await pool.query('SELECT NOW()');
    res.json({ time: result.rows[0] });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/general/categories
router.get('/categories', async (req, res) => {
  try {
    const result = await pool.query('SELECT * FROM categories ORDER BY id ASC');
    res.json({ categories: result.rows });
  } catch (err) {
    res.status(500).json({ error: 'Server error' });
  }
});

// GET /api/general/products
router.get('/products', async (req, res) => {
  try {
    // Exclude inactive/archived products and products from vendors whose subscription has expired
    const result = await pool.query(`
      SELECT p.* FROM products p
      WHERE p.is_active = true
      AND (p.is_deleted IS NULL OR p.is_deleted = false)
      AND (p.status IS NULL OR p.status != 'archived')
      AND (
        p.vendor_id IS NULL
        OR EXISTS (
          SELECT 1 FROM vendors v
          WHERE v.id = p.vendor_id
          AND v.subscription_expires_at IS NOT NULL
          AND v.subscription_expires_at > NOW()
        )
      )
      ORDER BY p.id DESC
    `);
    res.json({ products: pricingService.formatProductsList(result.rows) });
  } catch (err) {
    res.status(500).json({ error: 'Server error' });
  }
});

// GET /api/general/products/:id
router.get('/products/:id', async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT p.* FROM products p
      WHERE p.id = $1 
      AND p.is_active = true
      AND (p.is_deleted IS NULL OR p.is_deleted = false)
      AND (p.status IS NULL OR p.status != 'archived')
      AND (
        p.vendor_id IS NULL
        OR EXISTS (
          SELECT 1 FROM vendors v
          WHERE v.id = p.vendor_id
          AND v.subscription_expires_at IS NOT NULL
          AND v.subscription_expires_at > NOW()
        )
      )
    `, [req.params.id]);

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Product not found' });
    }
    res.json({ product: pricingService.formatProductPricing(result.rows[0]) });
  } catch (err) {
    res.status(500).json({ error: 'Server error' });
  }
});

// POST /api/general/orders (Checkout)
router.post('/orders', async (req, res) => {
  const { 
    items, 
    address, 
    total, 
    subtotal = 0, 
    delivery_charge = 0, 
    platform_fee = 0, 
    discount_amount = 0, 
    cod_collectible_amount = 0, 
    coupon_code, 
    payment_method, 
    advance_paid,
    razorpay_payment_id,
    razorpay_order_id,
    razorpay_signature
  } = req.body;
  
  if (!items || items.length === 0) {
    return res.status(400).json({ error: 'Cart is empty' });
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // Duplicate order prevention: if this Razorpay payment ID already generated an order, return it safely
    if (razorpay_payment_id && typeof razorpay_payment_id === 'string' && razorpay_payment_id.trim().startsWith('pay_')) {
      const existing = await client.query('SELECT * FROM orders WHERE payment_id = $1', [razorpay_payment_id.trim()]);
      if (existing.rows.length > 0) {
        await client.query('COMMIT');
        return res.json({ success: true, order: existing.rows[0], duplicatePrevented: true });
      }
    }

    // Independently recalculate all order financials against the database
    const verified = await pricingService.verifyAndCalculateOrder({
      items,
      deliveryCharge: delivery_charge,
      couponCode: coupon_code,
      paymentMethod: payment_method || 'prepaid',
      client
    });

    const orderNumber = `ORD-${Date.now()}`;
    const itemsJson = JSON.stringify(verified.verifiedItems);
    const addressJson = JSON.stringify(address);
    const pMethod = verified.isCod ? 'cod' : 'prepaid';
    const paymentStatus = pMethod === 'cod' ? 'advance_paid' : 'completed';
    
    const result = await client.query(
      `INSERT INTO orders 
        (order_number, total, subtotal, delivery_charge, platform_fee, discount_amount, cod_collectible_amount, items, address, status, payment_method, advance_paid, payment_id, razorpay_order_id, razorpay_signature, payment_status)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16) RETURNING *`,
      [
        orderNumber, 
        verified.grandTotal, 
        verified.productSubtotal, 
        verified.deliveryCharge, 
        verified.platformFee, 
        verified.discountAmount, 
        verified.collectibleAmount, 
        itemsJson, 
        addressJson, 
        'pending', 
        pMethod, 
        verified.advanceAmount,
        razorpay_payment_id || null,
        razorpay_order_id || null,
        razorpay_signature || null,
        paymentStatus
      ]
    );

    // Call reusable vendor accounting service for subscription commission, debt recovery & credit
    const vendorAccounting = await vendorAccountingService.processOrderVendorAccounting({
      orderNumber,
      verifiedItems: verified.verifiedItems,
      orderId: result.rows[0].id,
      paymentMethod: pMethod,
      client
    });

    await client.query('COMMIT');

    // Send emails asynchronously after transaction commit
    try {
      for (const [vid, vData] of Object.entries(vendorAccounting)) {
        const vendorRes = await pool.query('SELECT name, email FROM vendors WHERE id = $1', [vid]);
        if (vendorRes.rows[0]) {
          sendOrderEmailToVendor(vendorRes.rows[0].email, vendorRes.rows[0].name, orderNumber, vData.items, vData.grossAmount, address, pMethod);
        }
      }
      sendOrderEmailToAdmin(orderNumber, total, address, items, pMethod);
      sendOrderEmailToCustomer(address?.email, orderNumber, total, address, items, pMethod);
    } catch (emailErr) {
      console.warn('Non-blocking order email delivery error:', emailErr.message);
    }
    
    res.json({ success: true, order: result.rows[0] });
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('Guest order placement error:', err);
    res.status(500).json({ error: 'Failed to place order' });
  } finally {
    client.release();
  }
});

// POST /api/general/razorpay/order
router.post('/razorpay/order', async (req, res) => {
  const { amount, items, delivery_charge, coupon_code, payment_method } = req.body;

  try {
    let verifiedPayableAmount = 0;

    // If items are provided, authoritatively recalculate the exact payable amount from the DB
    if (items && Array.isArray(items) && items.length > 0) {
      const verified = await pricingService.verifyAndCalculateOrder({
        items,
        deliveryCharge: delivery_charge,
        couponCode: coupon_code,
        paymentMethod: payment_method || 'prepaid',
        client: pool
      });
      verifiedPayableAmount = verified.advanceAmount;
    } else if (amount && !isNaN(Number(amount)) && Number(amount) > 0) {
      verifiedPayableAmount = parseFloat(amount);
    } else {
      return res.status(400).json({ error: 'Valid items or payable amount required' });
    }

    const razorpay = new Razorpay({
      key_id: process.env.RAZORPAY_KEY_ID,
      key_secret: process.env.RAZORPAY_KEY_SECRET,
    });

    const options = {
      amount: Math.round(verifiedPayableAmount * 100), // amount in paise
      currency: 'INR',
      receipt: `receipt_${Date.now()}`
    };

    const order = await razorpay.orders.create(options);
    res.json({ 
      success: true, 
      order, 
      key: process.env.RAZORPAY_KEY_ID,
      verifiedAmount: verifiedPayableAmount 
    });
  } catch (err) {
    console.error('Razorpay order creation error:', err);
    const errDesc = err.error?.description || err.message || '';
    if (errDesc.includes('Amount exceeds maximum amount allowed')) {
      return res.status(400).json({ 
        error: `Order amount (₹${Math.round(verifiedPayableAmount).toLocaleString('en-IN')}) exceeds Razorpay test mode transaction limit. Please reduce item quantity or test with an order under ₹50,000.` 
      });
    }
    res.status(500).json({ error: 'Failed to create Razorpay order: ' + err.message });
  }
});

// POST /api/general/razorpay/verify
router.post('/razorpay/verify', async (req, res) => {
  const { razorpay_order_id, razorpay_payment_id, razorpay_signature } = req.body;

  if (!razorpay_order_id || !razorpay_payment_id || !razorpay_signature) {
    return res.status(400).json({ error: 'Missing payment details' });
  }

  try {
    const generated_signature = crypto
      .createHmac('sha256', process.env.RAZORPAY_KEY_SECRET)
      .update(razorpay_order_id + '|' + razorpay_payment_id)
      .digest('hex');

    if (generated_signature === razorpay_signature) {
      res.json({ success: true, message: 'Payment verified successfully' });
    } else {
      res.status(400).json({ error: 'Invalid signature' });
    }
  } catch (err) {
    console.error('Razorpay verification error:', err);
    res.status(500).json({ error: 'Verification failed' });
  }
});

// POST /api/general/coupon/verify
router.post('/coupon/verify', async (req, res) => {
  const { code, items, subtotal, qty } = req.body;
  if (!code) return res.status(400).json({ error: 'Coupon code is required' });

  try {
    // Check admin coupons table first
    const adminResult = await pool.query(
      'SELECT *, \'admin\' as source FROM coupons WHERE UPPER(code) = UPPER($1) AND is_active = true',
      [code]
    );

    // Check vendor offers table (offer_type = coupon)
    const vendorResult = await pool.query(
      "SELECT *, 'vendor' as source FROM offers WHERE UPPER(code) = UPPER($1) AND is_active = true AND offer_type = 'coupon'",
      [code]
    );

    const row = adminResult.rows[0] || vendorResult.rows[0];
    if (!row) return res.status(400).json({ error: 'Invalid or expired coupon' });

    // Check expiry
    if (row.expires_at && new Date(row.expires_at) < new Date()) {
      return res.status(400).json({ error: 'This coupon has expired' });
    }

    let applicableSubtotal = 0;
    let applicableQty = 0;

    if (row.source === 'vendor' && row.vendor_id) {
       (items || []).forEach(item => {
          if (item.vendor_id === row.vendor_id) {
             applicableSubtotal += (item.price || 0) * (item.quantity || 1);
             applicableQty += (item.quantity || 1);
          }
       });
       if (applicableQty === 0) {
          return res.status(400).json({ error: 'This coupon is not applicable to any items in your cart.' });
       }
    } else {
       (items || []).forEach(item => {
          applicableSubtotal += (item.price || 0) * (item.quantity || 1);
          applicableQty += (item.quantity || 1);
       });
    }

    // Restriction check
    const restrictionType = row.restriction_type || row.min_type || 'min_amount';
    const restrictionValue = parseFloat(row.restriction_value || row.min_value || row.min_order_value || 0);

    if ((restrictionType === 'min_qty' || restrictionType === 'qty') && applicableQty < restrictionValue) {
      return res.status(400).json({ error: `Minimum ${restrictionValue} applicable items required` });
    }
    if (restrictionType !== 'min_qty' && restrictionType !== 'qty' && applicableSubtotal < restrictionValue) {
      return res.status(400).json({ error: `Minimum applicable order amount ₹${restrictionValue} required` });
    }

    // Normalise coupon fields for frontend
    const discountType = row.discount_type || 'percent';
    const couponVal = parseFloat(row.discount_value || row.discount_percent || 0);
    let calculatedDiscount = 0;
    if (discountType === 'percentage' || discountType === 'percent') {
      calculatedDiscount = Math.round((applicableSubtotal * couponVal) / 100);
    } else {
      calculatedDiscount = Math.min(couponVal, applicableSubtotal);
    }

    const coupon = {
      ...row,
      code: row.code,
      discount_type: discountType,
      type: discountType,
      value: couponVal,
      discount_value: couponVal,
      calculated_discount: calculatedDiscount,
      applicable_subtotal: applicableSubtotal
    };

    res.json({ coupon, discountAmount: calculatedDiscount, applicableSubtotal });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/general/banners
router.get('/banners', async (req, res) => {
  try {
    const { type } = req.query;
    let query = 'SELECT * FROM banners WHERE is_active = true';
    const params = [];
    if (type) {
      params.push(type);
      query += ' AND (type = $1 OR (type IS NULL AND $1 = \'homepage_hero\'))';
    }
    query += ' ORDER BY created_at DESC';
    const result = await pool.query(query, params);
    res.json({ banners: result.rows });
  } catch (err) {
    res.status(500).json({ error: 'Server error' });
  }
});


// GET /api/general/vendors
router.get('/vendors', async (req, res) => {
  try {
    const result = await pool.query(
      "SELECT id, store_name AS business_name, name, address, phone, store_image FROM vendors WHERE status = 'approved' ORDER BY created_at DESC"
    );
    res.json({ vendors: result.rows });
  } catch (err) {
    res.status(500).json({ error: 'Server error' });
  }
});


// GET /api/general/settings/referral_amount
router.get('/settings/referral_amount', async (req, res) => {
  try {
    const result = await pool.query("SELECT value FROM settings WHERE key = 'customer_referral_amount'");
    if (result.rows.length > 0) {
      res.json({ amount: parseInt(result.rows[0].value) || 50 });
    } else {
      res.json({ amount: 50 });
    }
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});


// GET /api/general/cart
router.get('/cart', authMiddleware, async (req, res) => {
  try {
    // Standard stock clamping: if any item in cart exceeds available product stock, normalize it
    await pool.query(
      `UPDATE cart_items c
       SET qty = p.stock
       FROM products p
       WHERE c.product_id = p.id 
         AND p.stock IS NOT NULL 
         AND p.stock >= 0 
         AND c.qty > p.stock 
         AND c.user_id = $1`,
      [req.user.id]
    );

    const result = await pool.query(
      `SELECT c.id as cart_item_id, c.product_id, c.variant, c.qty,
              p.name, p.price, p.mrp, p.image_url, p.images, p.stock, p.vendor_id
       FROM cart_items c
       JOIN products p ON c.product_id = p.id
       WHERE c.user_id = $1
       ORDER BY c.created_at ASC`,
      [req.user.id]
    );
    // Format to match frontend structure with authoritative pricing: { product: {...}, variant, qty }
    const items = result.rows.map(row => {
      const formattedProd = pricingService.formatProductPricing({
        id: row.product_id,
        vendor_id: row.vendor_id,
        name: row.name,
        price: row.price,
        mrp: row.mrp,
        image_url: (() => {
          let url = row.image_url;
          if (typeof url === 'string' && url.startsWith('[')) {
            try { 
              const arr = JSON.parse(url);
              if (Array.isArray(arr) && arr.length > 0) return arr[0];
            } catch(e) {}
          }
          return url;
        })(),
        images: (() => {
          let imgs = row.images;
          if (typeof imgs === 'string' && imgs.startsWith('[')) {
            try { imgs = JSON.parse(imgs); } catch(e) {}
          }
          return Array.isArray(imgs) ? imgs : [];
        })(),
        stock: row.stock
      });

      let variantObj = null;
      if (typeof row.variant === 'string' && row.variant.startsWith('{')) {
        try { variantObj = JSON.parse(row.variant); } catch(e) {}
      } else {
        variantObj = row.variant;
      }

      if (variantObj && typeof variantObj === 'object') {
        const vPrice = parseFloat(variantObj.price) || formattedProd.price;
        let vMrp = parseFloat(variantObj.mrp);
        if (isNaN(vMrp) || vMrp <= 0) vMrp = formattedProd.mrp >= vPrice ? formattedProd.mrp : vPrice;
        const vDiscountAmount = vMrp > vPrice ? Math.round((vMrp - vPrice) * 100) / 100 : 0;
        const vDiscountPercent = vMrp > vPrice ? Math.round(((vMrp - vPrice) / vMrp) * 100) : 0;
        variantObj = {
          ...variantObj,
          price: vPrice,
          mrp: vMrp,
          discount_amount: vDiscountAmount,
          discount_percent: vDiscountPercent
        };
      }

      return {
        cart_item_id: row.cart_item_id,
        product: formattedProd,
        variant: variantObj,
        qty: row.qty
      };
    });
    res.json(items);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/general/cart
router.post('/cart', authMiddleware, async (req, res) => {
  try {
    const { product_id, variant, qty = 1 } = req.body;
    const variantStr = typeof variant === 'object' ? JSON.stringify(variant) : (variant || '');
    const addQty = Math.max(1, parseInt(qty, 10) || 1);

    // Validate product existence, active status and available stock
    const prodRes = await pool.query(
      'SELECT id, name, stock, is_active, is_deleted, status FROM products WHERE id = $1', 
      [product_id]
    );
    if (prodRes.rows.length === 0) {
      return res.status(404).json({ error: 'Product not found' });
    }
    const product = prodRes.rows[0];
    if (product.is_active === false || product.is_deleted === true || product.status === 'archived') {
      return res.status(400).json({ error: `${product.name} is no longer available in the store.` });
    }
    const maxStock = product.stock !== null && product.stock !== undefined ? parseInt(product.stock, 10) : 999;

    if (maxStock <= 0) {
      return res.status(400).json({ error: `${product.name} is currently out of stock.` });
    }
    
    // Check if item exists in cart
    const existing = await pool.query(
      'SELECT id, qty FROM cart_items WHERE user_id = $1 AND product_id = $2 AND variant = $3',
      [req.user.id, product_id, variantStr]
    );
    
    if (existing.rows.length > 0) {
      const currentQty = parseInt(existing.rows[0].qty, 10) || 0;
      const newQty = currentQty + addQty;
      if (newQty > maxStock) {
        const remainingCanAdd = Math.max(0, maxStock - currentQty);
        return res.status(400).json({
          error: remainingCanAdd > 0
            ? `Only ${maxStock} unit(s) available in stock. You can add at most ${remainingCanAdd} more.`
            : `Maximum available stock (${maxStock}) already reached in your cart.`
        });
      }
      await pool.query('UPDATE cart_items SET qty = $1 WHERE id = $2', [newQty, existing.rows[0].id]);
    } else {
      if (addQty > maxStock) {
        return res.status(400).json({
          error: `Only ${maxStock} unit(s) available in stock for ${product.name}.`
        });
      }
      await pool.query(
        'INSERT INTO cart_items (user_id, product_id, variant, qty) VALUES ($1, $2, $3, $4)',
        [req.user.id, product_id, variantStr, addQty]
      );
    }
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// PUT /api/general/cart
router.put('/cart', authMiddleware, async (req, res) => {
  try {
    const { product_id, variant, qty } = req.body;
    const variantStr = typeof variant === 'object' ? JSON.stringify(variant) : (variant || '');
    const newQty = parseInt(qty, 10);

    if (isNaN(newQty) || newQty <= 0) {
      await pool.query(
        'DELETE FROM cart_items WHERE user_id = $1 AND product_id = $2 AND variant = $3',
        [req.user.id, product_id, variantStr]
      );
    } else {
      // Validate against product stock
      const prodRes = await pool.query('SELECT id, name, stock FROM products WHERE id = $1', [product_id]);
      if (prodRes.rows.length === 0) {
        return res.status(404).json({ error: 'Product not found' });
      }
      const product = prodRes.rows[0];
      const maxStock = product.stock !== null && product.stock !== undefined ? parseInt(product.stock, 10) : 999;
      if (newQty > maxStock) {
        return res.status(400).json({
          error: `Cannot exceed available stock of ${maxStock} unit(s) for ${product.name}.`
        });
      }

      await pool.query(
        'UPDATE cart_items SET qty = $1 WHERE user_id = $2 AND product_id = $3 AND variant = $4',
        [newQty, req.user.id, product_id, variantStr]
      );
    }
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// DELETE /api/general/cart
router.delete('/cart', authMiddleware, async (req, res) => {
  try {
    const { product_id, variant } = req.body;
    const variantStr = typeof variant === 'object' ? JSON.stringify(variant) : variant || '';
    await pool.query(
      'DELETE FROM cart_items WHERE user_id = $1 AND product_id = $2 AND variant = $3',
      [req.user.id, product_id, variantStr]
    );
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// DELETE /api/general/cart/clear
router.delete('/cart/clear', authMiddleware, async (req, res) => {
  try {
    await pool.query('DELETE FROM cart_items WHERE user_id = $1', [req.user.id]);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ==========================================
// EXTERNAL ACCOUNT DELETION (Google Play Compliance)
// Accessible via public web URL without needing active app login
// ==========================================

function generateDeletionOTP() {
  return Math.floor(100000 + Math.random() * 900000).toString();
}

// POST /api/general/delete-account-request
router.post('/delete-account-request', async (req, res) => {
  const { email } = req.body;
  if (!email || !email.includes('@')) {
    return res.status(400).json({ error: 'Please provide a valid email address.' });
  }

  try {
    const userRes = await pool.query('SELECT id, name, role FROM users WHERE LOWER(email) = LOWER($1)', [email.trim()]);
    if (userRes.rows.length === 0) {
      // Return success message to avoid email enumeration
      return res.json({
        success: true,
        message: 'If an account exists with this email, a verification code has been sent.'
      });
    }

    const user = userRes.rows[0];
    if (user.role === 'admin') {
      return res.status(403).json({ error: 'Admin accounts cannot be deleted through this form.' });
    }

    const cleanEmail = email.trim().toLowerCase();

    // Resend cooldown check (60 seconds)
    const recentOtp = await pool.query(
      "SELECT created_at FROM otps WHERE LOWER(email) = $1 AND created_at > NOW() - INTERVAL '60 seconds'",
      [cleanEmail]
    );
    if (recentOtp.rows.length > 0) {
      return res.status(429).json({ error: 'Please wait at least 60 seconds before requesting a new verification code.' });
    }

    const otp = generateDeletionOTP();
    const expiresAt = new Date(Date.now() + 10 * 60 * 1000);

    await pool.query('DELETE FROM otps WHERE LOWER(email) = $1', [cleanEmail]);
    await pool.query(
      'INSERT INTO otps (email, otp, expires_at, attempts) VALUES ($1, $2, $3, 0)',
      [cleanEmail, otp, expiresAt]
    );

    // Send deletion verification email
    try {
      await transporter.sendMail({
        from: `"Swabhivar Shoppers" <${process.env.EMAIL_USER}>`,
        to: email.trim(),
        subject: 'Account Deletion Request - Verification Code',
        html: `
          <div style="font-family:'Segoe UI',Arial,sans-serif;max-width:500px;margin:auto;padding:28px;border:1px solid #fee2e2;border-radius:16px;background:#fff;">
            <h2 style="color:#dc2626;margin:0 0 12px;font-size:20px;">Account Deletion Request</h2>
            <p style="color:#4b5563;font-size:14px;line-height:1.5;">Hi <strong>${user.name || 'Customer'}</strong>,</p>
            <p style="color:#4b5563;font-size:14px;line-height:1.5;">We received a request to permanently delete your Swabhivar Shoppers account and associated personal data.</p>
            <div style="font-family:monospace;font-size:36px;font-weight:bold;color:#dc2626;letter-spacing:10px;text-align:center;padding:20px;background:#fef2f2;border:2px dashed #fca5a5;border-radius:12px;margin:20px 0;">
              ${otp}
            </div>
            <p style="color:#6b7280;font-size:12px;text-align:center;">This code is valid for 10 minutes. If you did not request this, please disregard this email or change your password immediately.</p>
          </div>
        `
      });
    } catch (mailErr) {
      console.warn('Failed to send deletion OTP email:', mailErr.message);
    }

    res.json({
      success: true,
      message: 'If an account exists with this email, a verification code has been sent.'
    });
  } catch (err) {
    console.error('Delete account request error:', err);
    res.status(500).json({ error: 'Server error processing deletion request.' });
  }
});

// POST /api/general/delete-account-confirm
router.post('/delete-account-confirm', async (req, res) => {
  const { email, otp } = req.body;
  if (!email || !otp) {
    return res.status(400).json({ error: 'Email and verification code are required.' });
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const cleanEmail = email.trim().toLowerCase();

    // Verify OTP
    const otpRes = await client.query(
      'SELECT otp, expires_at, COALESCE(attempts, 0) as attempts FROM otps WHERE LOWER(email) = $1 ORDER BY id DESC LIMIT 1',
      [cleanEmail]
    );

    if (otpRes.rows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(400).json({ error: 'No active verification code found. Please request a new code.' });
    }

    const currentAttempts = parseInt(otpRes.rows[0].attempts) || 0;
    if (currentAttempts >= 5) {
      await client.query('DELETE FROM otps WHERE LOWER(email) = $1', [cleanEmail]);
      await client.query('COMMIT');
      return res.status(429).json({ error: 'Too many incorrect attempts. This verification code has been invalidated for security. Please request a new code.' });
    }

    if (otpRes.rows[0].otp !== String(otp).trim()) {
      await client.query('UPDATE otps SET attempts = attempts + 1 WHERE LOWER(email) = $1', [cleanEmail]);
      await client.query('COMMIT');
      const remaining = 5 - (currentAttempts + 1);
      return res.status(400).json({ error: `Invalid verification code. (${remaining > 0 ? remaining : 0} attempts remaining)` });
    }

    if (new Date() > new Date(otpRes.rows[0].expires_at)) {
      await client.query('ROLLBACK');
      return res.status(400).json({ error: 'Verification code has expired. Please request a new one.' });
    }

    // Find User
    const userRes = await client.query(
      'SELECT id, role FROM users WHERE LOWER(email) = $1',
      [cleanEmail]
    );

    if (userRes.rows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: 'User account not found.' });
    }

    const userId = userRes.rows[0].id;
    if (userRes.rows[0].role === 'admin') {
      await client.query('ROLLBACK');
      return res.status(403).json({ error: 'Admin accounts cannot be deleted.' });
    }

    // Check for active orders
    const activeOrdersRes = await client.query(
      `SELECT order_number, status FROM orders 
       WHERE user_id = $1 AND status IN ('pending', 'processing', 'partially_shipped', 'shipped')`,
      [userId]
    );
    if (activeOrdersRes.rows.length > 0) {
      const orderList = activeOrdersRes.rows.map(o => `${o.order_number} (${o.status})`).join(', ');
      await client.query('ROLLBACK');
      return res.status(400).json({
        error: `Cannot delete account while you have active orders in transit: ${orderList}. Please wait until delivery or cancel them before deleting your account.`
      });
    }

    // Check for open return requests
    const openReturnsRes = await client.query(
      `SELECT id FROM order_returns 
       WHERE customer_id = $1 AND status IN ('requested', 'approved', 'pickup_scheduled')`,
      [userId]
    );
    if (openReturnsRes.rows.length > 0) {
      await client.query('ROLLBACK');
      return res.status(400).json({
        error: 'Cannot delete account while you have open return/refund requests. Please wait until they are completed.'
      });
    }

    // Delete personal non-financial records
    await client.query('DELETE FROM addresses WHERE user_id = $1', [userId]);
    await client.query('DELETE FROM cart_items WHERE user_id = $1', [userId]);
    await client.query('DELETE FROM user_saved_banks WHERE user_id = $1', [userId]);
    await client.query('DELETE FROM otps WHERE LOWER(email) = $1', [cleanEmail]);

    // Check past orders
    const pastOrdersRes = await client.query('SELECT COUNT(*) FROM orders WHERE user_id = $1', [userId]);
    const hasOrderHistory = parseInt(pastOrdersRes.rows[0].count) > 0;

    if (hasOrderHistory) {
      const anonEmail = `deleted_usr_${userId}_${Date.now()}@deleted.invalid`;
      await client.query(
        `UPDATE users 
         SET name = 'Deleted Customer',
             email = $1,
             phone = NULL,
             password_hash = NULL,
             avatar_url = NULL,
             referral_code = NULL,
             referred_by = NULL,
             wallet_balance = 0,
             is_verified = FALSE
         WHERE id = $2`,
        [anonEmail, userId]
      );
    } else {
      await client.query('DELETE FROM users WHERE id = $1', [userId]);
    }

    await client.query('COMMIT');
    res.json({
      success: true,
      message: 'Your account and personal data have been permanently deleted.'
    });
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('Delete account confirm error:', err);
    res.status(500).json({ error: 'Server error confirming account deletion.' });
  } finally {
    client.release();
  }
});

module.exports = router;
