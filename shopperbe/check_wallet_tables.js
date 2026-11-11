const pool = require('./db');
async function run() {
  try {
    await pool.query('SELECT 1 FROM user_saved_banks LIMIT 1');
    await pool.query('SELECT 1 FROM payout_requests LIMIT 1');
    console.log('Tables exist!');
  } catch (err) {
    console.error('Error:', err.message);
  }
  process.exit(0);
}
run();
