const pool = require('./db');
async function run() {
  const v = await pool.query('SELECT id, store_name, subscription_expires_at FROM vendors WHERE id = 1');
  console.log('Vendor 1:', v.rows[0]);
  const p = await pool.query('SELECT id, name, vendor_id, is_active FROM products WHERE vendor_id = 1');
  console.log('Products for Vendor 1:', p.rows);
  process.exit(0);
}
run();
