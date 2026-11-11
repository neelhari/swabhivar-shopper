const pool = require('./db');
async function run() {
  const p = await pool.query('SELECT id, name, vendor_id, created_at FROM products WHERE vendor_id = 1 ORDER BY created_at DESC');
  console.log('Products for vendor 1:', p.rows);
  process.exit(0);
}
run();
