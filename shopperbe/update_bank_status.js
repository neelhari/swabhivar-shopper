const pool = require('./db');

async function updateBankStatus() {
  await pool.query("UPDATE vendors SET bank_verification_status = 'verified' WHERE id = 1");
  const res = await pool.query("SELECT id, name, bank_verification_status, bank_account_number FROM vendors WHERE id = 1");
  console.log('Vendor bank status updated:', res.rows[0]);
  pool.end();
}

updateBankStatus().catch(console.error);

