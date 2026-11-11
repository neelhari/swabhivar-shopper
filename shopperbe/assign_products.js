const pool = require('./db');
async function run() {
  await pool.query('UPDATE products SET vendor_id = 1 WHERE id IN (9, 10, 11, 12, 13)');
  console.log('Assigned products 9-13 to vendor 1');
  process.exit(0);
}
run();
