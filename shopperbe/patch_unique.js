const fs = require('fs');

try {
  // 1. Patch auth.js
  const authPath = '/Users/hemanthkancharla/shopperbe/routes/auth.js';
  let authCode = fs.readFileSync(authPath, 'utf8');

  authCode = authCode.replace(
    "'INSERT INTO users (name, email, phone, password_hash, referred_by) VALUES ($1,$2,$3,$4,$5)'",
    "'INSERT INTO users (name, email, phone, password_hash, referred_by, referral_code) VALUES ($1,$2,$3,$4,$5,$6)'"
  );
  authCode = authCode.replace(
    "[name, email, phone, hash, referral_code]",
    "[name, email, phone, hash, referral_code, 'USER' + Date.now().toString(36).toUpperCase() + Math.random().toString(36).substring(2,5).toUpperCase()]"
  );
  
  fs.writeFileSync(authPath, authCode);
  console.log("Patched auth.js for unique user referral codes.");

  // 2. Patch vendorAuth.js
  const vendorPath = '/Users/hemanthkancharla/shopperbe/routes/vendorAuth.js';
  let vendorCode = fs.readFileSync(vendorPath, 'utf8');

  // Add referral_code to INSERT INTO vendors
  vendorCode = vendorCode.replace(
    /INSERT INTO vendors \(name, store_name, email, phone, password_hash, address, status, pending_plan_id, pending_payment_id\)\s*VALUES \(\$1, \$2, \$3, \$4, \$5, \$6, 'unverified', \$7, \$8\)/,
    "INSERT INTO vendors (name, store_name, email, phone, password_hash, address, status, pending_plan_id, pending_payment_id, referral_code)\n         VALUES ($1, $2, $3, $4, $5, $6, 'unverified', $7, $8, $9)"
  );
  
  vendorCode = vendorCode.replace(
    /\[name, store_name, email, phone, password_hash, address, plan_id, payment_id\]/,
    "[name, store_name, email, phone, password_hash, address, plan_id, payment_id, 'VEND' + Date.now().toString(36).toUpperCase() + Math.random().toString(36).substring(2,5).toUpperCase()]"
  );

  // Expose referral_code in /me
  if (!vendorCode.includes('v.referral_code')) {
    vendorCode = vendorCode.replace(
      'v.subscription_expires_at, v.created_at,',
      'v.subscription_expires_at, v.created_at, v.referral_code,'
    );
  }

  fs.writeFileSync(vendorPath, vendorCode);
  console.log("Patched vendorAuth.js for unique vendor referral codes.");

} catch (err) {
  console.error(err);
}
