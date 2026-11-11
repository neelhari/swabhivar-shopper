const pool = require('./db');
async function run() {
  const result = await pool.query("SELECT id, name, referral_code, wallet_balance FROM vendors ORDER BY id DESC LIMIT 5");
  console.log('Vendors:', result.rows);
  const trans = await pool.query("SELECT * FROM vendor_transactions ORDER BY id DESC LIMIT 5");
  console.log('Vendor Transactions:', trans.rows);
  process.exit(0);
}
run();
