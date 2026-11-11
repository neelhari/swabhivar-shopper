require('dotenv').config();
const { Pool } = require('pg');
const pool = new Pool({
  connectionString: process.env.DATABASE_URL
});
async function run() {
  try {
    await pool.query('ALTER TABLE vendors ADD COLUMN IF NOT EXISTS referred_by VARCHAR(50);');
    console.log('Added referred_by column');
  } catch (err) {
    console.error(err);
  } finally {
    pool.end();
  }
}
run();
