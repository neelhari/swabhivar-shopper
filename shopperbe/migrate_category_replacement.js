const pool = require('./db');

async function migrateCategoryReplacement() {
  const client = await pool.connect();
  try {
    console.log('--- Starting Category Replacement Migration ---');
    await client.query('BEGIN');

    // 1. Add is_deleted column to products if not exists
    await client.query(`
      ALTER TABLE products 
      ADD COLUMN IF NOT EXISTS is_deleted BOOLEAN DEFAULT false;
    `);
    console.log('✅ Column is_deleted verified on products table');

    // 2. Create index on products for active filtering
    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_products_vendor_archive 
      ON products(vendor_id, is_active, is_deleted, status);
    `);
    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_products_category_archive 
      ON products(category, is_active, is_deleted, status);
    `);
    console.log('✅ Indexes verified on products table');

    // 3. Create vendor_category_history table for atomic audit trail
    await client.query(`
      CREATE TABLE IF NOT EXISTS vendor_category_history (
        id SERIAL PRIMARY KEY,
        vendor_id INT NOT NULL REFERENCES vendors(id) ON DELETE CASCADE,
        previous_categories JSONB DEFAULT '[]'::jsonb,
        new_categories JSONB DEFAULT '[]'::jsonb,
        removed_categories JSONB DEFAULT '[]'::jsonb,
        added_categories JSONB DEFAULT '[]'::jsonb,
        affected_product_ids JSONB DEFAULT '[]'::jsonb,
        affected_products_count INT DEFAULT 0,
        reason TEXT DEFAULT 'Vendor category replacement',
        created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
      );
    `);
    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_vch_vendor_id 
      ON vendor_category_history(vendor_id);
    `);
    console.log('✅ Table vendor_category_history verified');

    await client.query('COMMIT');
    console.log('--- Migration Completed Successfully ---');
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('❌ Migration Failed:', err);
    process.exit(1);
  } finally {
    client.release();
    process.exit(0);
  }
}

migrateCategoryReplacement();
