const pool = require('./db');
async function run() {
  const orders = await pool.query("SELECT id, user_id, total, created_at FROM orders ORDER BY created_at DESC LIMIT 3");
  console.log('Orders:', orders.rows);
  const users = await pool.query("SELECT id, email, referred_by FROM users WHERE id IN (SELECT user_id FROM orders ORDER BY created_at DESC LIMIT 3)");
  console.log('Users for those orders:', users.rows);
  process.exit(0);
}
run();
