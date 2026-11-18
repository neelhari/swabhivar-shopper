const router = require('express').Router();
const pool = require('../db');
const { supportAuthMiddleware } = require('./supportAuth');


// POST /api/support/send-email (Publicly accessible for ticketing mockup)
router.post('/send-email', async (req, res) => {
  try {
    const { ticket_id, vendor_id, event, subject, message } = req.body;

    const emailService = require('../services/emailService');

    let vendorEmail = 'vendor@example.com';

    // If vendor_id is actually a JWT token from the frontend mockup
    let actual_vendor_id = vendor_id;
    if (vendor_id && String(vendor_id).startsWith('ey')) {
      try {
        const jwt = require('jsonwebtoken');
        const decoded = jwt.decode(vendor_id);
        if (decoded && decoded.id) {
          actual_vendor_id = decoded.id;
        }
      } catch (e) {
        console.log("Could not decode token", e.message);
      }
    }

    if (actual_vendor_id) {
      try {
        const db = require('../db');
        const vendorRes = await db.query('SELECT email FROM vendors WHERE id = $1', [actual_vendor_id]);
        if (vendorRes.rows.length > 0) {
          vendorEmail = vendorRes.rows[0].email;
        }
      } catch (e) {
        console.log("Could not query vendor email", e.message);
      }
    }

    const mailOptions = {
      from: '"Swabhivar Shoppers Support" <' + (process.env.EMAIL_USER || 'support@swabhivarshoppers.com') + '>',
      to: vendorEmail,
      subject: subject,
      text: message + "\n\nTicket ID: " + ticket_id
    };

    await emailService.sendMail(mailOptions);
    console.log('Email sent successfully to', vendorEmail, 'for ticket:', ticket_id);

    res.json({ success: true, message: 'Email request processed' });
  } catch (err) {
    console.error('Email sending error:', err);
    res.status(500).json({ error: 'Failed to send email' });
  }
});

router.use(supportAuthMiddleware);


// GET /api/support/orders
router.get('/orders', async (req, res) => {
  try {
    let result;
    if (req.scope === 'vendor' && req.agentVendorId) {
      // Fetch all orders then filter to only those containing this vendor's products
      const all = await pool.query(
        `SELECT o.*, u.name as user_name, u.email as user_email, u.phone as user_phone
         FROM orders o LEFT JOIN users u ON o.user_id = u.id
         ORDER BY o.created_at DESC`
      );
      const vendorId = req.agentVendorId;
      const filtered = [];
      all.rows.forEach(order => {
        let items = [];
        try { items = typeof order.items === 'string' ? JSON.parse(order.items) : (order.items || []); } catch (e) { }
        const vendorItems = items.filter(i => i.product && i.product.vendor_id === vendorId);
        if (vendorItems.length > 0) {
          filtered.push({
            ...order,
            items: vendorItems,
            total: vendorItems.reduce((s, i) => s + i.qty * (i.variant?.price || i.product?.price || 0), 0),
          });
        }
      });
      return res.json({ orders: filtered });
    }
    // admin scope — all orders
    result = await pool.query(
      `SELECT o.*, u.name as user_name, u.email as user_email, u.phone as user_phone
       FROM orders o LEFT JOIN users u ON o.user_id = u.id
       ORDER BY o.created_at DESC`
    );
    res.json({ orders: result.rows });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/support/products
router.get('/products', async (req, res) => {
  try {
    let result;
    if (req.scope === 'vendor' && req.agentVendorId) {
      result = await pool.query(
        `SELECT p.*, c.name as category_name
         FROM products p LEFT JOIN categories c ON p.category = c.name
         WHERE p.vendor_id = $1
         ORDER BY p.created_at DESC`,
        [req.agentVendorId]
      );
    } else {
      result = await pool.query(
        `SELECT p.*, c.name as category_name
         FROM products p LEFT JOIN categories c ON p.category = c.name
         ORDER BY p.created_at DESC`
      );
    }
    res.json({ products: result.rows });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/support/categories
router.get('/categories', async (req, res) => {
  try {
    let result;
    if (req.scope === 'vendor' && req.agentVendorId) {
      // Only categories that have at least one product from this vendor
      result = await pool.query(
        `SELECT c.*, COUNT(p.id)::int as product_count
         FROM categories c
         INNER JOIN products p ON p.category = c.name AND p.vendor_id = $1
         GROUP BY c.id
         ORDER BY c.id ASC`,
        [req.agentVendorId]
      );
    } else {
      result = await pool.query(
        `SELECT c.*, COUNT(p.id)::int as product_count
         FROM categories c LEFT JOIN products p ON p.category = c.name
         GROUP BY c.id ORDER BY c.id ASC`
      );
    }
    res.json({ categories: result.rows });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});



module.exports = router;
