const pool = require('./db');
async function run() {
  const p = await pool.query('SELECT id, name, vendor_id, is_active FROM products LIMIT 5');
  console.log('Products:', p.rows);
  process.exit(0);
}
run();
