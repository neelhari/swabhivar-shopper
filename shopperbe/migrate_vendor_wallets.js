const pool = require('./db');

async function migrateVendorWallets() {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    console.log('Applying vendor bank details and wallet accounting migrations...');

    // 1. Vendors: bank account and verification status
    await client.query(`
      ALTER TABLE vendors 
      ADD COLUMN IF NOT EXISTS bank_account_holder_name VARCHAR(150),
      ADD COLUMN IF NOT EXISTS bank_account_number VARCHAR(50),
      ADD COLUMN IF NOT EXISTS bank_ifsc_code VARCHAR(20),
      ADD COLUMN IF NOT EXISTS bank_name VARCHAR(100),
      ADD COLUMN IF NOT EXISTS bank_verification_status VARCHAR(50) DEFAULT 'not_provided',
      ADD COLUMN IF NOT EXISTS outstanding_debt NUMERIC(10,2) DEFAULT 0;
    `);

    // 2. Vendor transactions: financial tracking & bank transfer reference / UTR
    await client.query(`
      ALTER TABLE vendor_transactions 
      ADD COLUMN IF NOT EXISTS gross_amount NUMERIC(10,2),
      ADD COLUMN IF NOT EXISTS commission_percent NUMERIC(5,2),
      ADD COLUMN IF NOT EXISTS commission_amount NUMERIC(10,2),
      ADD COLUMN IF NOT EXISTS net_amount NUMERIC(10,2),
      ADD COLUMN IF NOT EXISTS debt_recovered NUMERIC(10,2) DEFAULT 0,
      ADD COLUMN IF NOT EXISTS bank_reference VARCHAR(100);
    `);

    // 3. Backfill historical credit transactions if gross_amount is NULL
    await client.query(`
      UPDATE vendor_transactions
      SET gross_amount = COALESCE(gross_amount, amount),
          net_amount = COALESCE(net_amount, amount)
      WHERE type = 'credit' AND gross_amount IS NULL;
    `);

    await client.query('COMMIT');
    console.log('✅ Vendor wallet & bank migrations applied successfully.');
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
  migrateVendorWallets().catch(err => {
    console.error(err);
    process.exit(1);
  });
}

module.exports = migrateVendorWallets;

