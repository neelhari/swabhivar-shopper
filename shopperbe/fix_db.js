const pool = require('./db');
async function run() {
  await pool.query('UPDATE products SET vendor_id = NULL WHERE id IN (9, 10, 11, 12, 13)');
  await pool.query('UPDATE products SET vendor_id = 1 WHERE id = 109');
  console.log('Reverted 9-13 to NULL, assigned 109 to vendor 1');
  process.exit(0);
}
run();
