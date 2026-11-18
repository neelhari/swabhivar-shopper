require('dotenv').config({ path: __dirname + '/.env' });
const pool = require('./db');

async function migrate() {
  console.log('Adding attempts column to otps table if not exists...');
  await pool.query('ALTER TABLE otps ADD COLUMN IF NOT EXISTS attempts INTEGER DEFAULT 0');
  console.log('✅ otps table updated with attempts column.');
  pool.end();
}
migrate().catch(console.error);

