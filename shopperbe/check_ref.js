const pool = require('./db');
async function run() {
  const users = await pool.query('SELECT id, name, email, referral_code, referred_by, wallet_balance FROM users ORDER BY created_at DESC LIMIT 5');
  console.log('Users:', users.rows);
  const orders = await pool.query('SELECT id, user_id, total, created_at FROM orders ORDER BY created_at DESC LIMIT 1');
  console.log('Latest Order:', orders.rows[0]);
  const transactions = await pool.query('SELECT * FROM vendor_transactions ORDER BY created_at DESC LIMIT 5');
  console.log('Recent Vendor Transactions:', transactions.rows);
  process.exit(0);
}
run();
