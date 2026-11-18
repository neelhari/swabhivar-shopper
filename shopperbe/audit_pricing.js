const fs = require('fs');
const path = require('path');
const { Pool } = require(path.join(__dirname, 'node_modules', 'pg'));

const envContent = fs.readFileSync(path.join(__dirname, '.env'), 'utf-8');
const match = envContent.match(/DATABASE_URL=([^\r\n]+)/);
const dbUrl = match ? match[1].trim() : null;

const pool = new Pool({
  connectionString: dbUrl,
  ssl: { rejectUnauthorized: false }
});

async function run() {
  try {
    const res = await pool.query(`
      SELECT id, name, price, mrp, discount_percent 
      FROM products 
      WHERE price = 1300 OR mrp = 1800 OR name ILIKE '%1300%' OR name ILIKE '%1800%'
    `);
    console.log('Matches:', res.rows);
  } catch (err) {
    console.error(err);
  } finally {
    await pool.end();
  }
}

run();
