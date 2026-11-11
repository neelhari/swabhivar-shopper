const pool = require('./db');
async function run() {
  await pool.query('ALTER TABLE orders ADD COLUMN IF NOT EXISTS payment_method VARCHAR(20) DEFAULT \'prepaid\'');
  await pool.query('ALTER TABLE orders ADD COLUMN IF NOT EXISTS advance_paid NUMERIC DEFAULT 0');
  console.log('Columns added successfully.');
  process.exit(0);
}
run();
