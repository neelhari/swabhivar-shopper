const fs = require('fs');
let code = fs.readFileSync('routes/vendorAuth.js', 'utf8');

// Update signup route
code = code.replace(
  "const { name, store_name, email, phone, password, address, plan_id, payment_id, referral_code } = req.body;",
  "const { name, store_name, store_image, email, phone, password, address, plan_id, payment_id, referral_code } = req.body;"
);

code = code.replace(
  "'UPDATE vendors SET name=$1, store_name=$2, phone=$3, password_hash=$4, address=$5, pending_plan_id=$6, pending_payment_id=$7, referred_by=COALESCE(referred_by, $9) WHERE email=$8',",
  "'UPDATE vendors SET name=$1, store_name=$2, phone=$3, password_hash=$4, address=$5, pending_plan_id=$6, pending_payment_id=$7, referred_by=COALESCE(referred_by, $9), store_image=$10 WHERE email=$8',"
);

code = code.replace(
  "[name, store_name, phone, password_hash, address, plan_id, payment_id, email, referral_code]",
  "[name, store_name, phone, password_hash, address, plan_id, payment_id, email, referral_code, store_image]"
);

code = code.replace(
  "`INSERT INTO vendors (name, store_name, email, phone, password_hash, address, status, pending_plan_id, pending_payment_id, referral_code, referred_by)",
  "`INSERT INTO vendors (name, store_name, email, phone, password_hash, address, status, pending_plan_id, pending_payment_id, referral_code, referred_by, store_image)"
);

code = code.replace(
  "VALUES ($1, $2, $3, $4, $5, $6, 'unverified', $7, $8, $9, $10)`",
  "VALUES ($1, $2, $3, $4, $5, $6, 'unverified', $7, $8, $9, $10, $11)`"
);

code = code.replace(
  "[name, store_name, email, phone, password_hash, address, plan_id, payment_id, Math.random().toString(36).substring(2,8).toLowerCase(), referral_code]",
  "[name, store_name, email, phone, password_hash, address, plan_id, payment_id, Math.random().toString(36).substring(2,8).toLowerCase(), referral_code, store_image]"
);

fs.writeFileSync('routes/vendorAuth.js', code);
console.log('patched store_image in vendorAuth.js');
