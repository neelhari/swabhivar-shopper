const pool = require('./db');
async function run() {
  const order = await pool.query("SELECT id, items FROM orders ORDER BY created_at DESC LIMIT 1");
  console.log('Order Items:', order.rows[0]?.items);
  process.exit(0);
}
run();
