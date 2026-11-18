const pool = require('./db');

async function migrateShippingFinancials() {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    console.log('--- Migrating Database Schema for Shipping & Financial Architecture ---');

    // 1. Orders table: add financial columns
    await client.query(`
      ALTER TABLE orders 
        ADD COLUMN IF NOT EXISTS subtotal numeric(12,2) DEFAULT 0,
        ADD COLUMN IF NOT EXISTS delivery_charge numeric(12,2) DEFAULT 0,
        ADD COLUMN IF NOT EXISTS platform_fee numeric(12,2) DEFAULT 0,
        ADD COLUMN IF NOT EXISTS discount_amount numeric(12,2) DEFAULT 0,
        ADD COLUMN IF NOT EXISTS cod_collectible_amount numeric(12,2) DEFAULT 0;
    `);
    console.log('✓ orders table columns added/verified');

    // 2. Vendor Shipments table: add shipping cost tracking and settlement columns
    await client.query(`
      ALTER TABLE vendor_shipments 
        ADD COLUMN IF NOT EXISTS estimated_shipping_charge numeric(10,2) DEFAULT 0,
        ADD COLUMN IF NOT EXISTS actual_shipping_charge numeric(10,2) DEFAULT 0,
        ADD COLUMN IF NOT EXISTS shipping_surplus numeric(10,2) DEFAULT 0,
        ADD COLUMN IF NOT EXISTS shipping_discrepancy numeric(10,2) DEFAULT 0,
        ADD COLUMN IF NOT EXISTS declared_weight numeric(8,3) DEFAULT 0.5,
        ADD COLUMN IF NOT EXISTS volumetric_weight numeric(8,3) DEFAULT 0.5,
        ADD COLUMN IF NOT EXISTS charged_weight numeric(8,3) DEFAULT 0.5,
        ADD COLUMN IF NOT EXISTS parcel_length numeric(8,2) DEFAULT 10,
        ADD COLUMN IF NOT EXISTS parcel_width numeric(8,2) DEFAULT 10,
        ADD COLUMN IF NOT EXISTS parcel_height numeric(8,2) DEFAULT 10,
        ADD COLUMN IF NOT EXISTS vendor_subtotal numeric(12,2) DEFAULT 0,
        ADD COLUMN IF NOT EXISTS vendor_commission_amount numeric(12,2) DEFAULT 0,
        ADD COLUMN IF NOT EXISTS vendor_net_payable numeric(12,2) DEFAULT 0,
        ADD COLUMN IF NOT EXISTS settlement_status varchar(30) DEFAULT 'pending',
        ADD COLUMN IF NOT EXISTS cod_remitted_amount numeric(12,2) DEFAULT 0,
        ADD COLUMN IF NOT EXISTS cod_remittance_status varchar(30) DEFAULT 'unremitted',
        ADD COLUMN IF NOT EXISTS settlement_approved_at timestamp without time zone,
        ADD COLUMN IF NOT EXISTS settlement_approved_by varchar(100),
        ADD COLUMN IF NOT EXISTS settlement_reference varchar(100);
    `);
    console.log('✓ vendor_shipments table columns added/verified');

    // 3. Vendor Transactions table: add shipping tracking columns
    await client.query(`
      ALTER TABLE vendor_transactions
        ADD COLUMN IF NOT EXISTS shipping_discrepancy numeric(10,2) DEFAULT 0,
        ADD COLUMN IF NOT EXISTS shipping_actual numeric(10,2) DEFAULT 0,
        ADD COLUMN IF NOT EXISTS shipping_estimated numeric(10,2) DEFAULT 0;
    `);
    console.log('✓ vendor_transactions table columns added/verified');

    // 4. Settings table: verify/add platform_fee_percent = 4
    await client.query(`
      INSERT INTO settings (key, value, updated_at)
      VALUES ('platform_fee_percent', '4', NOW())
      ON CONFLICT (key) DO UPDATE SET value = '4', updated_at = NOW();
    `);
    console.log('✓ settings platform_fee_percent set to 4%');

    await client.query('COMMIT');
    console.log('✅ All migrations applied successfully.');
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('❌ Migration failed:', err.message);
    throw err;
  } finally {
    client.release();
    process.exit(0);
  }
}

migrateShippingFinancials();
