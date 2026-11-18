const fs = require('fs');
const { Pool } = require('pg');

const pool = new Pool({
  connectionString: process.env.DATABASE_URL
});

async function main() {
  try {
    // 1. Patch auth.js
    const authPath = '/Users/hemanthkancharla/shopperbe/routes/auth.js';
    let authCode = fs.readFileSync(authPath, 'utf8');

    authCode = authCode.replace(
      "[name, email, phone, hash, referral_code, 'USER' + Date.now().toString(36).toUpperCase() + Math.random().toString(36).substring(2,5).toUpperCase()]",
      "[name, email, phone, hash, referral_code, Math.random().toString(36).substring(2,8).toLowerCase()]"
    );
    
    fs.writeFileSync(authPath, authCode);
    console.log("Patched auth.js for 6-char codes.");

    // 2. Patch vendorAuth.js
    const vendorPath = '/Users/hemanthkancharla/shopperbe/routes/vendorAuth.js';
    let vendorCode = fs.readFileSync(vendorPath, 'utf8');

    vendorCode = vendorCode.replace(
      "[name, store_name, email, phone, password_hash, address, plan_id, payment_id, 'VEND' + Date.now().toString(36).toUpperCase() + Math.random().toString(36).substring(2,5).toUpperCase()]",
      "[name, store_name, email, phone, password_hash, address, plan_id, payment_id, Math.random().toString(36).substring(2,8).toLowerCase()]"
    );

    fs.writeFileSync(vendorPath, vendorCode);
    console.log("Patched vendorAuth.js for 6-char codes.");

    // 3. Update existing users/vendors in DB to 6-char codes
    // Get all users
    const users = await pool.query('SELECT id FROM users');
    for (const u of users.rows) {
      const code = Math.random().toString(36).substring(2,8).toLowerCase();
      await pool.query('UPDATE users SET referral_code = $1 WHERE id = $2', [code, u.id]);
    }
    const vendors = await pool.query('SELECT id FROM vendors');
    for (const v of vendors.rows) {
      const code = Math.random().toString(36).substring(2,8).toLowerCase();
      await pool.query('UPDATE vendors SET referral_code = $1 WHERE id = $2', [code, v.id]);
    }
    console.log("Updated existing DB codes to 6-char.");

  } catch (err) {
    console.error(err);
  } finally {
    pool.end();
  }
}
main();
