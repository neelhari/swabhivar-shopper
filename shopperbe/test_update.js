const pool = require('./db');
async function run() {
  const result = await pool.query("UPDATE users SET wallet_balance = COALESCE(wallet_balance, 0) + $1 WHERE referral_code = $2 RETURNING wallet_balance", [10.01, 'eyup4l']);
  console.log('Result:', result.rows);
  process.exit(0);
}
run();
