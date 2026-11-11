const router = require('express').Router();
const pool = require('../db');

// GET /api/vendors/public - Get all active stores
router.get('/public', async (req, res) => {
  try {
    const result = await pool.query(
      "SELECT id, name, store_name, store_image, address FROM vendors WHERE status = 'active' ORDER BY created_at DESC"
    );
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/vendors/public/:id - Get a single store profile
router.get('/public/:id', async (req, res) => {
  try {
    const result = await pool.query(
      "SELECT id, name, store_name, store_image, address FROM vendors WHERE id = $1 AND status = 'active'",
      [req.params.id]
    );
    if (!result.rows.length) return res.status(404).json({ error: 'Store not found' });
    res.json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/vendors/public/:id/products - Get store products
router.get('/public/:id/products', async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT p.*,
        (SELECT url FROM product_media pm WHERE pm.product_id = p.id AND pm.media_type = 'image' LIMIT 1) as main_image,
        v.store_name
       FROM products p
       JOIN vendors v ON p.vendor_id = v.id
       WHERE p.vendor_id = $1 AND p.is_active = true
       ORDER BY p.created_at DESC`,
      [req.params.id]
    );
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
