const { Pool } = require('pg');

const pool = new Pool({
  connectionString: process.env.DATABASE_URL || 'postgresql://neondb_owner:npg_QI7hmyvja9kc@ep-sparkling-bird-axds23lr-pooler.c-4.us-east-2.aws.neon.tech/neondb?sslmode=require&channel_binding=require'
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
