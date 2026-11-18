require('dotenv').config({ path: __dirname + '/.env' });
const pool = require('./db');

async function migrate() {
  console.log('Migrating otps table for MSG91 phone OTP & security...');
  
  // Make email nullable in otps if it had NOT NULL constraint
  await pool.query('ALTER TABLE otps ALTER COLUMN email DROP NOT NULL;');
  
  // Widen otp column to allow hashes
  await pool.query('ALTER TABLE otps ALTER COLUMN otp TYPE VARCHAR(255);');
  
  // Add phone, purpose, otp_hash, attempts, last_sent_at
  await pool.query('ALTER TABLE otps ADD COLUMN IF NOT EXISTS phone VARCHAR(20);');
  await pool.query("ALTER TABLE otps ADD COLUMN IF NOT EXISTS purpose VARCHAR(50) DEFAULT 'general';");
  await pool.query('ALTER TABLE otps ADD COLUMN IF NOT EXISTS otp_hash VARCHAR(255);');
  await pool.query('ALTER TABLE otps ADD COLUMN IF NOT EXISTS attempts INTEGER DEFAULT 0;');
  await pool.query('ALTER TABLE otps ADD COLUMN IF NOT EXISTS last_sent_at TIMESTAMP DEFAULT NOW();');

  // Create performance indexes
  await pool.query('CREATE INDEX IF NOT EXISTS idx_otps_phone_purpose ON otps(phone, purpose);');
  await pool.query('CREATE INDEX IF NOT EXISTS idx_otps_email_purpose ON otps(email, purpose);');

  const cols = await pool.query("SELECT column_name, data_type, is_nullable FROM information_schema.columns WHERE table_name = 'otps' ORDER BY ordinal_position;");
  console.log('✅ otps table columns:', cols.rows);
  
  pool.end();
}

migrate().catch(err => {
  console.error('Migration failed:', err);
  process.exit(1);
});
