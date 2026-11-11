require('dotenv').config();
const { Pool } = require('pg');
const pool = new Pool({ connectionString: process.env.DATABASE_URL });
pool.query('ALTER TABLE categories ADD COLUMN IF NOT EXISTS subcategories JSONB DEFAULT \'[]\'::jsonb')
  .then(() => { console.log('Column added'); process.exit(0); })
  .catch(e => { console.error(e); process.exit(1); });
