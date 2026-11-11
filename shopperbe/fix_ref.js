const pool = require('./db');
async function run() {
  await pool.query("UPDATE users SET referred_by = 'eyup4l' WHERE id = 5");
  console.log('Set referred_by to eyup4l for user 5');
  process.exit(0);
}
run();
