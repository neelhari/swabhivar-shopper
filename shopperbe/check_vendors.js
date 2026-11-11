require('dotenv').config();
const { Pool } = require('pg');
const pool = new Pool({ connectionString: process.env.DATABASE_URL });
async function run() {
  const result = await pool.query(`SELECT column_name FROM information_schema.columns WHERE table_name = 'vendors'`);
  console.log(result.rows.map(r => r.column_name));
  pool.end();
}
run();
