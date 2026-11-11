const fs = require('fs');
let code = fs.readFileSync('routes/admin.js', 'utf8');
code = code.replace("v.business_name as vendor_name", "v.store_name as vendor_name");
fs.writeFileSync('routes/admin.js', code);
console.log('Fixed query');
