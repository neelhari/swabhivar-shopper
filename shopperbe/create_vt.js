const pool = require('./db');
async function run() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS vendor_transactions (
      id SERIAL PRIMARY KEY,
      vendor_id INTEGER NOT NULL,
      type VARCHAR(50) NOT NULL,
      amount NUMERIC NOT NULL,
      order_number VARCHAR(100),
      description TEXT,
      created_at TIMESTAMP DEFAULT NOW()
    )
  `);
  console.log('vendor_transactions created');
  process.exit(0);
}
run();
