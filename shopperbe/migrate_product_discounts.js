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

async function migrate() {
  try {
    console.log('Updating discount_percent on existing products...');
    const res = await pool.query(`
      UPDATE products 
      SET discount_percent = ROUND(((mrp - price) / mrp) * 100)
      WHERE mrp IS NOT NULL AND price IS NOT NULL AND mrp > price AND mrp > 0
      RETURNING id, name, price, mrp, discount_percent
    `);
    console.log(`Updated ${res.rowCount} products:`, res.rows);
  } catch (err) {
    console.error('Migration error:', err);
  } finally {
    await pool.end();
  }
}

migrate();
