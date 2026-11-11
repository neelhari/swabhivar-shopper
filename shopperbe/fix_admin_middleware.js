const fs = require('fs');
let code = fs.readFileSync('routes/admin.js', 'utf8');
code = code.replace(/adminAuthMiddleware/g, "authMiddleware, adminOnly");
fs.writeFileSync('routes/admin.js', code);
console.log('Fixed adminAuthMiddleware to authMiddleware, adminOnly');
