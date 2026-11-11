const fs = require('fs');
let code = fs.readFileSync('routes/general.js', 'utf8');
code = code.replace(
  "const result = await pool.query(\"SELECT value FROM settings WHERE key = 'referral_amount'\");",
  "const result = await pool.query(\"SELECT value FROM settings WHERE key = 'customer_referral_amount'\");"
);
fs.writeFileSync('routes/general.js', code);
console.log('patched general.js');
