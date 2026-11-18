require('dotenv').config();
const pool = require('./db');

async function migrate() {
  console.log('Adding payment columns to orders table if not exists...');
  await pool.query(`
    ALTER TABLE orders 
    ADD COLUMN IF NOT EXISTS payment_id VARCHAR(255),
    ADD COLUMN IF NOT EXISTS razorpay_order_id VARCHAR(255),
    ADD COLUMN IF NOT EXISTS razorpay_signature VARCHAR(255),
    ADD COLUMN IF NOT EXISTS payment_status VARCHAR(50) DEFAULT 'pending';
  `);

  console.log('Adding index on payment_id to prevent duplicate order placement...');
  await pool.query(`
    CREATE INDEX IF NOT EXISTS idx_orders_payment_id ON orders (payment_id) WHERE payment_id IS NOT NULL;
  `);

  console.log('✅ Migration completed successfully.');
  process.exit(0);
}

migrate().catch(err => {
  console.error('Migration error:', err);
  process.exit(1);
});
