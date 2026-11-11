const fs = require('fs');
let code = fs.readFileSync('routes/auth.js', 'utf8');

const oldCode = `      if (referredBy) {
        // Fetch reward amount
        const refResU = await pool.query("SELECT value FROM settings WHERE key = 'referral_amount'");
        const rewardAmount = refResU.rows.length > 0 ? parseInt(refResU.rows[0].value) : 50;

        // Reward the REFERRER (can be a vendor or user)
        const vendorCheck = await pool.query('SELECT id FROM vendors WHERE referral_code=$1', [referredBy]);
        if (vendorCheck.rows.length > 0) {
           await pool.query('UPDATE vendors SET wallet_balance = COALESCE(wallet_balance, 0) + $2 WHERE referral_code=$1', [referredBy, rewardAmount]);
           await pool.query(
             "INSERT INTO vendor_transactions (vendor_id, type, amount, order_number, description) VALUES ($1, 'credit', $2, 'REFERRAL', 'Referral signup bonus')",
             [vendorCheck.rows[0].id, rewardAmount]
           );
        } else {
           await pool.query('UPDATE users SET wallet_balance = COALESCE(wallet_balance, 0) + $2 WHERE referral_code=$1', [referredBy, rewardAmount]);
        }
        
        // Reward the REFERRED person (the new user)
        await pool.query('UPDATE users SET wallet_balance = COALESCE(wallet_balance, 0) + $1 WHERE id=$2', [rewardAmount, newUserId]);`;

const newCode = `      if (referredBy) {
        // Reward the REFERRER (can be a vendor or user)
        const vendorCheck = await pool.query('SELECT id FROM vendors WHERE referral_code=$1', [referredBy]);
        let rewardAmount = 50;
        
        if (vendorCheck.rows.length > 0) {
           const refResV = await pool.query("SELECT value FROM settings WHERE key = 'vendor_referral_amount'");
           rewardAmount = refResV.rows.length > 0 ? parseInt(refResV.rows[0].value) : 100;
           await pool.query('UPDATE vendors SET wallet_balance = COALESCE(wallet_balance, 0) + $2 WHERE referral_code=$1', [referredBy, rewardAmount]);
           await pool.query(
             "INSERT INTO vendor_transactions (vendor_id, type, amount, order_number, description) VALUES ($1, 'credit', $2, 'REFERRAL', 'Referral signup bonus')",
             [vendorCheck.rows[0].id, rewardAmount]
           );
        } else {
           const refResU = await pool.query("SELECT value FROM settings WHERE key = 'customer_referral_amount'");
           rewardAmount = refResU.rows.length > 0 ? parseInt(refResU.rows[0].value) : 50;
           await pool.query('UPDATE users SET wallet_balance = COALESCE(wallet_balance, 0) + $2 WHERE referral_code=$1', [referredBy, rewardAmount]);
        }
        
        // Reward the REFERRED person (the new user) gets the same amount that was applied for the referrer
        await pool.query('UPDATE users SET wallet_balance = COALESCE(wallet_balance, 0) + $1 WHERE id=$2', [rewardAmount, newUserId]);`;

code = code.replace(oldCode, newCode);
fs.writeFileSync('routes/auth.js', code);
console.log('patched');
