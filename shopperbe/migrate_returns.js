const pool = require('./db');

async function migrateReturns() {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    console.log('Applying Vendor-Led Return & Refund Management schema migrations...');

    // 1. Add delivered_at to orders if not exists
    await client.query(`
      ALTER TABLE orders 
      ADD COLUMN IF NOT EXISTS delivered_at TIMESTAMP;
    `);

    // Backfill delivered_at for historical delivered orders if empty
    await client.query(`
      UPDATE orders 
      SET delivered_at = created_at 
      WHERE status = 'delivered' AND delivered_at IS NULL;
    `);

    // 2. Add hold columns to vendor_order_payouts if not exists
    await client.query(`
      ALTER TABLE vendor_order_payouts
      ADD COLUMN IF NOT EXISTS hold_status VARCHAR(50) DEFAULT 'none',
      ADD COLUMN IF NOT EXISTS hold_reason VARCHAR(100),
      ADD COLUMN IF NOT EXISTS eligible_at TIMESTAMP;
    `);

    // 3. Create order_returns table
    await client.query(`
      CREATE TABLE IF NOT EXISTS order_returns (
        id SERIAL PRIMARY KEY,
        order_id INTEGER NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
        order_number VARCHAR(50) NOT NULL,
        customer_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        vendor_id INTEGER NOT NULL REFERENCES vendors(id) ON DELETE CASCADE,
        items JSONB NOT NULL DEFAULT '[]'::jsonb,
        reason VARCHAR(100) NOT NULL,
        description TEXT NOT NULL,
        images JSONB NOT NULL DEFAULT '[]'::jsonb,
        status VARCHAR(50) NOT NULL DEFAULT 'Return Requested',
        rejection_reason TEXT,
        vendor_response TEXT,
        vendor_action_at TIMESTAMP,
        appeal_reason TEXT,
        appeal_at TIMESTAMP,
        admin_notes TEXT,
        admin_action_at TIMESTAMP,
        refund_amount NUMERIC(10,2),
        refund_method VARCHAR(50),
        refund_reference VARCHAR(100),
        refund_status VARCHAR(50) NOT NULL DEFAULT 'unrefunded',
        refunded_at TIMESTAMP,
        return_tracking_id VARCHAR(100),
        return_courier VARCHAR(100),
        created_at TIMESTAMP NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMP NOT NULL DEFAULT NOW()
      );
    `);

    // 4. Create return_messages table for customer-vendor communication
    await client.query(`
      CREATE TABLE IF NOT EXISTS return_messages (
        id SERIAL PRIMARY KEY,
        return_id INTEGER NOT NULL REFERENCES order_returns(id) ON DELETE CASCADE,
        sender_type VARCHAR(20) NOT NULL, -- 'customer', 'vendor', 'admin'
        sender_id INTEGER NOT NULL,
        sender_name VARCHAR(150),
        message TEXT NOT NULL,
        attachments JSONB NOT NULL DEFAULT '[]'::jsonb,
        created_at TIMESTAMP NOT NULL DEFAULT NOW()
      );
    `);

    // 5. Create idempotency index: one active return per (order_id, vendor_id)
    await client.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS uq_active_order_vendor_return
      ON order_returns (order_id, vendor_id)
      WHERE status NOT IN ('Return Rejected', 'Closed');
    `);

    // 6. Helpful indexes for performance
    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_order_returns_vendor_id ON order_returns(vendor_id);
      CREATE INDEX IF NOT EXISTS idx_order_returns_customer_id ON order_returns(customer_id);
      CREATE INDEX IF NOT EXISTS idx_order_returns_status ON order_returns(status);
      CREATE INDEX IF NOT EXISTS idx_return_messages_return_id ON return_messages(return_id);
    `);

    await client.query('COMMIT');
    console.log('✅ Return & Refund migrations successfully applied.');
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
  migrateReturns().catch(err => {
    console.error(err);
    process.exit(1);
  });
}

module.exports = migrateReturns;

