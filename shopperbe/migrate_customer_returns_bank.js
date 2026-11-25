const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '.env') });
const pool = require('./db');

async function migrateCustomerReturnsBank() {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    console.log('Running Customer Returns & Bank Details schema migration...');

    // 1. Ensure order_returns table has bank details and refund management columns
    await client.query(`
      ALTER TABLE order_returns
      ADD COLUMN IF NOT EXISTS bank_holder_name VARCHAR(150),
      ADD COLUMN IF NOT EXISTS bank_account_encrypted TEXT,
      ADD COLUMN IF NOT EXISTS bank_account_last4 VARCHAR(4),
      ADD COLUMN IF NOT EXISTS bank_ifsc VARCHAR(20),
      ADD COLUMN IF NOT EXISTS bank_name VARCHAR(150),
      ADD COLUMN IF NOT EXISTS approved_refund_amount NUMERIC(10,2),
      ADD COLUMN IF NOT EXISTS max_refundable_amount NUMERIC(10,2),
      ADD COLUMN IF NOT EXISTS refund_utr VARCHAR(100),
      ADD COLUMN IF NOT EXISTS refund_transfer_date TIMESTAMP,
      ADD COLUMN IF NOT EXISTS admin_remarks TEXT;
    `);

    // 2. Ensure user_saved_banks table exists and has encryption columns
    await client.query(`
      CREATE TABLE IF NOT EXISTS user_saved_banks (
        id SERIAL PRIMARY KEY,
        user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        account_name VARCHAR(150) NOT NULL,
        account_number VARCHAR(50),
        account_encrypted TEXT,
        account_last4 VARCHAR(4),
        ifsc_code VARCHAR(20) NOT NULL,
        bank_name VARCHAR(150) NOT NULL,
        created_at TIMESTAMP NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMP NOT NULL DEFAULT NOW()
      );
    `);

    await client.query(`
      ALTER TABLE user_saved_banks
      ADD COLUMN IF NOT EXISTS account_encrypted TEXT,
      ADD COLUMN IF NOT EXISTS account_last4 VARCHAR(4),
      ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP NOT NULL DEFAULT NOW();
    `);

    // 3. Create return_status_history table for auditing every state change
    await client.query(`
      CREATE TABLE IF NOT EXISTS return_status_history (
        id SERIAL PRIMARY KEY,
        return_id INTEGER NOT NULL REFERENCES order_returns(id) ON DELETE CASCADE,
        from_status VARCHAR(50),
        to_status VARCHAR(50) NOT NULL,
        changed_by_type VARCHAR(20) NOT NULL, -- 'customer', 'admin', 'vendor', 'system'
        changed_by_id INTEGER,
        changed_by_name VARCHAR(150),
        notes TEXT,
        metadata JSONB DEFAULT '{}'::jsonb,
        created_at TIMESTAMP NOT NULL DEFAULT NOW()
      );
    `);

    // 4. Create bank_details_access_logs for security audit compliance
    await client.query(`
      CREATE TABLE IF NOT EXISTS bank_details_access_logs (
        id SERIAL PRIMARY KEY,
        return_id INTEGER NOT NULL REFERENCES order_returns(id) ON DELETE CASCADE,
        admin_id INTEGER NOT NULL,
        admin_email VARCHAR(150),
        ip_address VARCHAR(50),
        reason TEXT,
        accessed_at TIMESTAMP NOT NULL DEFAULT NOW()
      );
    `);

    // 5. Create performance indexes
    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_return_history_return_id ON return_status_history(return_id);
      CREATE INDEX IF NOT EXISTS idx_bank_access_logs_return_id ON bank_details_access_logs(return_id);
      CREATE INDEX IF NOT EXISTS idx_order_returns_refund_status ON order_returns(refund_status);
    `);

    await client.query('COMMIT');
    console.log('✅ Customer Returns & Bank Details schema migration completed successfully.');
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('❌ Migration failed:', err);
    throw err;
  } finally {
    client.release();
    if (require.main === module) {
      await pool.end();
    }
  }
}

if (require.main === module) {
  migrateCustomerReturnsBank().catch(err => {
    console.error(err);
    process.exit(1);
  });
}

module.exports = migrateCustomerReturnsBank;
