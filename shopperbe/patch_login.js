const fs = require('fs');

try {
  const authPath = '/Users/hemanthkancharla/shopperbe/routes/auth.js';
  let authCode = fs.readFileSync(authPath, 'utf8');

  // Patch login
  authCode = authCode.replace(
    "res.json({ token, user: { id: user.id, name: user.name, email: user.email, phone: user.phone, role: user.role } });",
    "res.json({ token, user: { id: user.id, name: user.name, email: user.email, phone: user.phone, role: user.role, referral_code: user.referral_code, wallet_balance: user.wallet_balance } });"
  );
  
  fs.writeFileSync(authPath, authCode);
  console.log("Patched login in auth.js");
} catch (e) {
  console.error(e);
}
