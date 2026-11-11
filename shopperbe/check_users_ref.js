const pool = require('./db');
async function run() {
  const users = await pool.query("SELECT id, email, referred_by FROM users WHERE referred_by = '8w4q98'");
  console.log('Users referred by vendor:', users.rows);
  process.exit(0);
}
run();
