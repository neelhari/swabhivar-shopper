const pool = require('./db');
async function run() {
  const users = await pool.query("SELECT id, email, referral_code, wallet_balance FROM users WHERE email = 'kancharlahemanth89@gmail.com'");
  console.log('User:', users.rows[0]);
  process.exit(0);
}
run();
