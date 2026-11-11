const pool = require('./db');
async function run() {
  const v = await pool.query('SELECT id, name, store_name, email, created_at FROM vendors ORDER BY created_at DESC LIMIT 5');
  console.log('Vendors:', v.rows);
  const p = await pool.query('SELECT id, name, vendor_id, created_at FROM products ORDER BY created_at DESC LIMIT 5');
  console.log('Products:', p.rows);
  process.exit(0);
}
run();
