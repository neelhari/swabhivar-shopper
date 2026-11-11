const pool = require('./db');
async function run() {
  const order = await pool.query("SELECT id, user_id, total, created_at FROM orders ORDER BY created_at DESC LIMIT 1");
  console.log('Order:', order.rows[0]);
  if (order.rows[0]) {
    const user = await pool.query("SELECT id, email, referred_by FROM users WHERE id = $1", [order.rows[0].user_id]);
    console.log('User who placed order:', user.rows[0]);
  }
  process.exit(0);
}
run();
