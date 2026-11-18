const { Pool } = require('pg');
require('dotenv').config();

const useSsl =
  process.env.DB_SSL === 'true' ||
  (process.env.DATABASE_URL || '').includes('sslmode=require');

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: useSsl ? { rejectUnauthorized: false } : false,
});

pool.connect()
  .then(() => console.log('✅ PostgreSQL database connected'))
  .catch(err => console.error('❌ DB error:', err.message));

pool.on('error', (err, client) => {
  console.error('Unexpected error on idle client', err);
});

module.exports = pool;
