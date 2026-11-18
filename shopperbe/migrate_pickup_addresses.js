const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '.env') });
const pool = require('./db');

async function migrate() {
  const client = await pool.connect();
  try {
    console.log('--- Starting Vendor Pickup Address & Shipment Migration ---');
    await client.query('BEGIN');

    // 1. Add pickup address columns to vendors table if they don't exist
    await client.query(`
      ALTER TABLE vendors
      ADD COLUMN IF NOT EXISTS pickup_contact_name VARCHAR(150),
      ADD COLUMN IF NOT EXISTS pickup_phone VARCHAR(20),
      ADD COLUMN IF NOT EXISTS pickup_address_line1 TEXT,
      ADD COLUMN IF NOT EXISTS pickup_address_line2 TEXT,
      ADD COLUMN IF NOT EXISTS pickup_landmark VARCHAR(150),
      ADD COLUMN IF NOT EXISTS pickup_city VARCHAR(100),
      ADD COLUMN IF NOT EXISTS pickup_state VARCHAR(100),
      ADD COLUMN IF NOT EXISTS pickup_pincode VARCHAR(10),
      ADD COLUMN IF NOT EXISTS shiprocket_pickup_name VARCHAR(100),
      ADD COLUMN IF NOT EXISTS shiprocket_pickup_id BIGINT;
    `);
    console.log('✓ Added pickup address columns to vendors table.');

    // 2. Create vendor_shipments table
    await client.query(`
      CREATE TABLE IF NOT EXISTS vendor_shipments (
        id SERIAL PRIMARY KEY,
        order_id INTEGER NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
        vendor_id INTEGER NOT NULL REFERENCES vendors(id) ON DELETE CASCADE,
        shiprocket_shipment_id VARCHAR(100),
        shiprocket_order_id VARCHAR(100),
        awb_code VARCHAR(100),
        courier_name VARCHAR(100),
        courier_id VARCHAR(100),
        tracking_url TEXT,
        pickup_location VARCHAR(100) NOT NULL,
        pickup_address JSONB NOT NULL,
        shipping_address JSONB NOT NULL,
        items JSONB NOT NULL,
        status VARCHAR(50) DEFAULT 'shipped',
        label_url TEXT,
        manifest_url TEXT,
        created_at TIMESTAMP DEFAULT NOW(),
        updated_at TIMESTAMP DEFAULT NOW(),
        CONSTRAINT uq_vendor_order_shipment UNIQUE (order_id, vendor_id)
      );
    `);
    console.log('✓ Created vendor_shipments table with unique constraint on (order_id, vendor_id).');

    // 3. Create indexes for fast lookup
    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_vendor_shipments_order ON vendor_shipments(order_id);
      CREATE INDEX IF NOT EXISTS idx_vendor_shipments_vendor ON vendor_shipments(vendor_id);
      CREATE INDEX IF NOT EXISTS idx_vendor_shipments_awb ON vendor_shipments(awb_code);
    `);
    console.log('✓ Created indexes on vendor_shipments.');

    await client.query('COMMIT');
    console.log('--- Migration Successfully Completed! ---');
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('Migration failed:', err);
    throw err;
  } finally {
    client.release();
    pool.end();
  }
}

migrate();

