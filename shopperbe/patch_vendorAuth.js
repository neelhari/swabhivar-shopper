const fs = require('fs');
let code = fs.readFileSync('routes/vendorAuth.js', 'utf8');

// Update signup route signature and query
code = code.replace(
  "const { name, store_name, email, phone, password, address, plan_id, payment_id } = req.body;",
  "const { name, store_name, email, phone, password, address, plan_id, payment_id, referral_code } = req.body;"
);

code = code.replace(
  "'UPDATE vendors SET name=$1, store_name=$2, phone=$3, password_hash=$4, address=$5, pending_plan_id=$6, pending_payment_id=$7 WHERE email=$8',",
  "'UPDATE vendors SET name=$1, store_name=$2, phone=$3, password_hash=$4, address=$5, pending_plan_id=$6, pending_payment_id=$7, referred_by=COALESCE(referred_by, $9) WHERE email=$8',"
);

code = code.replace(
  "[name, store_name, phone, password_hash, address, plan_id, payment_id, email]",
  "[name, store_name, phone, password_hash, address, plan_id, payment_id, email, referral_code]"
);

code = code.replace(
  "`INSERT INTO vendors (name, store_name, email, phone, password_hash, address, status, pending_plan_id, pending_payment_id, referral_code)",
  "`INSERT INTO vendors (name, store_name, email, phone, password_hash, address, status, pending_plan_id, pending_payment_id, referral_code, referred_by)"
);

code = code.replace(
  "VALUES ($1, $2, $3, $4, $5, $6, 'unverified', $7, $8, $9)`",
  "VALUES ($1, $2, $3, $4, $5, $6, 'unverified', $7, $8, $9, $10)`"
);

code = code.replace(
  "[name, store_name, email, phone, password_hash, address, plan_id, payment_id, Math.random().toString(36).substring(2,8).toLowerCase()]",
  "[name, store_name, email, phone, password_hash, address, plan_id, payment_id, Math.random().toString(36).substring(2,8).toLowerCase(), referral_code]"
);

// Update verify-otp route for reward
const oldVerifyOtpEnd = `        await pool.query(
          'UPDATE vendors SET subscription_expires_at=$1, pending_plan_id=NULL, pending_payment_id=NULL WHERE id=$2',
          [expiresAt, vendor.id]
        );
      }
    }

    await pool.query("UPDATE vendors SET status='pending' WHERE email=$1", [email]);
    await pool.query('DELETE FROM otps WHERE email=$1', [email]);
    res.json({ message: 'Application verified. Awaiting admin approval.' });`;

const newVerifyOtpEnd = `        await pool.query(
          'UPDATE vendors SET subscription_expires_at=$1, pending_plan_id=NULL, pending_payment_id=NULL WHERE id=$2',
          [expiresAt, vendor.id]
        );
      }
    }

    await pool.query("UPDATE vendors SET status='pending' WHERE email=$1", [email]);
    await pool.query('DELETE FROM otps WHERE email=$1', [email]);

    // Referral Reward Logic
    try {
      const vRes = await pool.query('SELECT id, referred_by FROM vendors WHERE email=$1', [email]);
      const referredBy = vRes.rows[0]?.referred_by;
      const newVendorId = vRes.rows[0]?.id;
      
      if (referredBy) {
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
        
        // Reward the REFERRED person (the new vendor)
        await pool.query('UPDATE vendors SET wallet_balance = COALESCE(wallet_balance, 0) + $1 WHERE id=$2', [rewardAmount, newVendorId]);
        await pool.query(
          "INSERT INTO vendor_transactions (vendor_id, type, amount, order_number, description) VALUES ($1, 'credit', $2, 'REFERRAL', 'Referral signup bonus')",
          [newVendorId, rewardAmount]
        );
        
        // clear referred_by so it doesn't trigger again
        await pool.query('UPDATE vendors SET referred_by = NULL WHERE email=$1', [email]);
      }
    } catch (refErr) {
      console.error('Referral reward error:', refErr);
    }

    res.json({ message: 'Application verified. Awaiting admin approval.' });`;

code = code.replace(oldVerifyOtpEnd, newVerifyOtpEnd);

fs.writeFileSync('routes/vendorAuth.js', code);
console.log('patched vendorAuth.js');
