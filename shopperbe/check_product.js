const pool = require('./db');
async function run() {
  const p = await pool.query("SELECT id, vendor_id, name FROM products WHERE id = 109");
  console.log('Product:', p.rows[0]);
  process.exit(0);
}
run();
