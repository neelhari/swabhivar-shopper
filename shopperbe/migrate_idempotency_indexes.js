const pool = require('./db');

async function migrateIndexes() {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    console.log('Creating unique partial indexes for vendor transaction idempotency...');

    await client.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS uq_vendor_tx_order_credit 
      ON vendor_transactions (vendor_id, order_number, type) 
      WHERE type = 'credit' AND order_number IS NOT NULL;
    `);

    await client.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS uq_vendor_tx_order_reversal 
      ON vendor_transactions (vendor_id, order_number, type) 
      WHERE type = 'reversal' AND order_number IS NOT NULL;
    `);

    await client.query('COMMIT');
    console.log('✅ Unique idempotency indexes verified and created successfully.');
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('❌ Failed creating idempotency indexes:', err);
    throw err;
  } finally {
    client.release();
    if (require.main === module) {
      await pool.end();
    }
  }
}

if (require.main === module) {
  migrateIndexes().catch(err => {
    console.error(err);
    process.exit(1);
  });
}

module.exports = migrateIndexes;

