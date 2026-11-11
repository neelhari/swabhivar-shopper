const pool = require('./db');
async function run() {
  const result = await pool.query(`
    SELECT column_name, data_type 
    FROM information_schema.columns 
    WHERE table_name = 'orders'
  `);
  console.log(result.rows);
  process.exit(0);
}
run();
