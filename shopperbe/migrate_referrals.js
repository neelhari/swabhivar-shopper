const { Pool } = require('pg');

const pool = new Pool({
  connectionString: process.env.DATABASE_URL
});

async function main() {
  try {
    console.log("Running DB migrations for referrals...");
    await pool.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS referral_code VARCHAR(50) UNIQUE;`);
    await pool.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS referred_by VARCHAR(50);`);
    await pool.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS wallet_balance NUMERIC(10,2) DEFAULT 0;`);
    await pool.query(`ALTER TABLE vendors ADD COLUMN IF NOT EXISTS referral_code VARCHAR(50) UNIQUE;`);
    
    await pool.query(`UPDATE vendors SET referral_code = 'STORE' || id WHERE referral_code IS NULL;`);
    await pool.query(`UPDATE users SET referral_code = 'USER' || id WHERE referral_code IS NULL;`);
    console.log("Success");
  } catch (err) {
    console.error(err);
  } finally {
    pool.end();
  }
}
main();
