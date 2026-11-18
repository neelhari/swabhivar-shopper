const pool = require('./db');

async function migrate() {
  const client = await pool.connect();
  try {
    console.log('--- Starting Migration: Unified Admin & Vendor Dispatch Management ---');
    await client.query('BEGIN');

    // 1. Add dispatched_by column to vendor_shipments if not exists
    await client.query(`
      ALTER TABLE vendor_shipments 
      ADD COLUMN IF NOT EXISTS dispatched_by VARCHAR(50) DEFAULT 'vendor'
    `);
    console.log('✓ Added/verified dispatched_by on vendor_shipments');

    // 2. Add platform shipment columns to orders if not exists
    await client.query(`
      ALTER TABLE orders 
      ADD COLUMN IF NOT EXISTS platform_shipment_id VARCHAR(100),
      ADD COLUMN IF NOT EXISTS platform_awb VARCHAR(100),
      ADD COLUMN IF NOT EXISTS platform_courier_name VARCHAR(100),
      ADD COLUMN IF NOT EXISTS platform_tracking_url TEXT,
      ADD COLUMN IF NOT EXISTS platform_pickup_location VARCHAR(100),
      ADD COLUMN IF NOT EXISTS platform_dispatched_by VARCHAR(50),
      ADD COLUMN IF NOT EXISTS platform_status VARCHAR(50) DEFAULT 'pending'
    `);
    console.log('✓ Added/verified platform shipment tracking columns on orders');

    // 3. Populate existing rows if any
    await client.query(`
      UPDATE vendor_shipments 
      SET dispatched_by = 'vendor' 
      WHERE dispatched_by IS NULL
    `);

    await client.query('COMMIT');
    console.log('✓ Migration successfully committed.');

    // Verify columns
    const cols = await client.query(`
      SELECT column_name, data_type 
      FROM information_schema.columns 
      WHERE table_name IN ('vendor_shipments', 'orders') 
        AND column_name IN ('dispatched_by', 'platform_shipment_id', 'platform_awb', 'platform_courier_name', 'platform_status')
    `);
    console.log('Verified columns in DB:', cols.rows);

  } catch (err) {
    await client.query('ROLLBACK');
    console.error('Migration failed:', err);
    process.exit(1);
  } finally {
    client.release();
    pool.end();
  }
}

migrate();

