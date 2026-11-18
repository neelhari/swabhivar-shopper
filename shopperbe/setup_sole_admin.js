const pool = require('/var/www/shoopp/shopperbe/db');
const bcrypt = require('/var/www/shoopp/shopperbe/node_modules/bcryptjs');

async function setup() {
  const plainPassword = 'Vishnu@9059';
  const targetEmail = 'swabhivarshopper@gmail.com';
  
  // 1. Generate bcrypt hash
  const hash = await bcrypt.hash(plainPassword, 10);
  console.log('Generated bcrypt hash for Vishnu@9059:');
  console.log(hash);

  // 2. Revert customer 6301646462 / dacnikhil02@gmail.com back to standard user role
  await pool.query("UPDATE users SET role = 'user' WHERE phone LIKE '%6301646462%' OR email = 'dacnikhil02@gmail.com'");
  console.log('✅ Reverted 6301646462 / dacnikhil02@gmail.com back to customer role (user)');

  // 3. Remove admin role from old demo account admin@swabhivar.com
  await pool.query("UPDATE users SET role = 'user' WHERE email = 'admin@swabhivar.com'");
  console.log('✅ Removed admin role from demo admin@swabhivar.com');

  // 4. Check if swabhivarshopper@gmail.com exists
  const existing = await pool.query("SELECT id, name, email FROM users WHERE LOWER(email) = $1", [targetEmail]);
  if (existing.rows.length > 0) {
    await pool.query(
      "UPDATE users SET password_hash = $1, role = 'admin', is_verified = true, name = 'Swabhivar Admin' WHERE LOWER(email) = $2",
      [hash, targetEmail]
    );
    console.log('✅ Updated existing user swabhivarshopper@gmail.com to sole admin with password Vishnu@9059');
  } else {
    await pool.query(
      "INSERT INTO users (name, email, password_hash, role, is_verified, wallet_balance, referral_code) VALUES ('Swabhivar Admin', $1, $2, 'admin', true, 0, 'admin1')",
      [targetEmail, hash]
    );
    console.log('✅ Created new sole admin user swabhivarshopper@gmail.com with password Vishnu@9059');
  }

  // 5. Query and print all admin users
  const adminRes = await pool.query("SELECT id, name, email, phone, role FROM users WHERE role = 'admin'");
  console.log('\n--- ACTIVE ADMIN IN DATABASE ---');
  console.log(adminRes.rows);

  process.exit(0);
}

setup().catch(err => {
  console.error(err);
  process.exit(1);
});
