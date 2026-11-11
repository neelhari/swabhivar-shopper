const fs = require('fs');
let code = fs.readFileSync('index.js', 'utf8');
if (!code.includes("const vendorRoutes")) {
  code = code.replace(
    "const walletRoutes = require('./routes/wallet');",
    "const walletRoutes = require('./routes/wallet');\nconst vendorRoutes = require('./routes/vendors');"
  );
  code = code.replace(
    "app.use('/api/wallet', walletRoutes);",
    "app.use('/api/wallet', walletRoutes);\napp.use('/api/vendors', vendorRoutes);"
  );
  fs.writeFileSync('index.js', code);
  console.log('patched index.js');
} else {
  console.log('already patched');
}
