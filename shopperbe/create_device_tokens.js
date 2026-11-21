const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '.env') });
const pool = require('./db');

async function createDeviceTokensTable() {
  try {
    console.log('Creating device_tokens table...');
    await pool.query(`
      CREATE TABLE IF NOT EXISTS device_tokens (
        id SERIAL PRIMARY KEY,
        user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
        vendor_id INTEGER REFERENCES vendors(id) ON DELETE CASCADE,
        token TEXT NOT NULL UNIQUE,
        platform VARCHAR(20) DEFAULT 'android',
        app_type VARCHAR(20) NOT NULL, -- 'customer' or 'vendor'
        created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
        updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
        CONSTRAINT chk_token_owner CHECK (
          (app_type = 'customer' AND user_id IS NOT NULL) OR
          (app_type = 'vendor' AND vendor_id IS NOT NULL)
        )
      );

      CREATE INDEX IF NOT EXISTS idx_device_tokens_user ON device_tokens(user_id);
      CREATE INDEX IF NOT EXISTS idx_device_tokens_vendor ON device_tokens(vendor_id);
      CREATE INDEX IF NOT EXISTS idx_device_tokens_token ON device_tokens(token);
    `);
    console.log('✅ device_tokens table and indexes created successfully.');
  } catch (err) {
    console.error('❌ Error creating device_tokens table:', err);
    throw err;
  }
}

if (require.main === module) {
  createDeviceTokensTable()
    .then(() => process.exit(0))
    .catch(() => process.exit(1));
}

module.exports = { createDeviceTokensTable };
