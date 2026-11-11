const pool = require('./db');
async function run() {
  const orders = await pool.query("SELECT id, total, created_at FROM orders WHERE user_id = 6");
  console.log('Orders by user 6:', orders.rows);
  process.exit(0);
}
run();
