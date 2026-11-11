const { Pool } = require('pg');
const fs = require('fs');

const pool = new Pool({
  connectionString: process.env.DATABASE_URL || 'postgresql://neondb_owner:npg_QI7hmyvja9kc@ep-sparkling-bird-axds23lr-pooler.c-4.us-east-2.aws.neon.tech/neondb?sslmode=require&channel_binding=require'
});

async function main() {
  try {
    const authPath = '/Users/hemanthkancharla/shopperbe/routes/auth.js';
    let authCode = fs.readFileSync(authPath, 'utf8');

    // 2. Patch auth.js
    console.log("Patching auth.js...");

    // Add GET /referrer-info endpoint before signup
    const referrerEndpoint = `
// GET /api/auth/referrer-info
router.get('/referrer-info', async (req, res) => {
  const { code } = req.query;
  if (!code) return res.status(400).json({ error: 'Code required' });
  try {
    // Check vendors first
    let result = await pool.query('SELECT name FROM vendors WHERE referral_code=$1', [code]);
    if (result.rows.length) return res.json({ name: result.rows[0].name });
    
    // Check users
    result = await pool.query('SELECT name FROM users WHERE referral_code=$1', [code]);
    if (result.rows.length) return res.json({ name: result.rows[0].name });
    
    return res.status(404).json({ error: 'Invalid code' });
  } catch (err) {
    res.status(500).json({ error: 'Server error' });
  }
});

// POST /api/auth/signup - send OTP
`;
    if (!authCode.includes('/referrer-info')) {
      authCode = authCode.replace('// POST /api/auth/signup - send OTP\n', referrerEndpoint);
    }

    // Update signup to capture referral_code
    authCode = authCode.replace(
      'const { name, email, phone, password } = req.body;',
      'const { name, email, phone, password, referral_code } = req.body;'
    );
    authCode = authCode.replace(
      'INSERT INTO users (name, email, phone, password_hash) VALUES ($1,$2,$3,$4)',
      'INSERT INTO users (name, email, phone, password_hash, referred_by) VALUES ($1,$2,$3,$4,$5)'
    );
    authCode = authCode.replace(
      '[name, email, phone, hash]',
      '[name, email, phone, hash, referral_code]'
    );
    
    authCode = authCode.replace(
      'UPDATE users SET name=$1, phone=$2, password_hash=$3 WHERE email=$4',
      'UPDATE users SET name=$1, phone=$2, password_hash=$3, referred_by=COALESCE(referred_by, $5) WHERE email=$4'
    );
    authCode = authCode.replace(
      '[name, phone, hash, email]',
      '[name, phone, hash, email, referral_code]'
    );

    // Update verify-otp to reward referrer
    const rewardLogic = `
    await pool.query('UPDATE users SET is_verified=TRUE WHERE email=$1', [email]);
    
    // Referral Reward Logic
    try {
      const userRes = await pool.query('SELECT id, referred_by FROM users WHERE email=$1', [email]);
      const referredBy = userRes.rows[0]?.referred_by;
      
      if (referredBy) {
        // Check if we already rewarded for this user to avoid double crediting on re-verification (optional but good practice)
        // Check if vendor
        const vendorCheck = await pool.query('SELECT id FROM vendors WHERE referral_code=$1', [referredBy]);
        if (vendorCheck.rows.length > 0) {
           await pool.query('UPDATE vendors SET wallet_balance = COALESCE(wallet_balance, 0) + 50 WHERE referral_code=$1', [referredBy]);
           await pool.query(
             "INSERT INTO vendor_transactions (vendor_id, type, amount, order_number, description) VALUES ($1, 'credit', 50, 'REFERRAL', 'Referral signup bonus')",
             [vendorCheck.rows[0].id]
           );
        } else {
           // Check if user
           await pool.query('UPDATE users SET wallet_balance = COALESCE(wallet_balance, 0) + 50 WHERE referral_code=$1', [referredBy]);
        }
        // clear referred_by so it doesn't trigger again
        await pool.query('UPDATE users SET referred_by = NULL WHERE email=$1', [email]);
      }
    } catch (refErr) {
      console.error("Referral reward error:", refErr);
    }
`;
    authCode = authCode.replace(
      "await pool.query('UPDATE users SET is_verified=TRUE WHERE email=$1', [email]);",
      rewardLogic
    );

    // Also include referral code and wallet balance in GET /profile
    authCode = authCode.replace(
      'SELECT id, name, email, phone, avatar_url, created_at FROM users WHERE id=$1',
      'SELECT id, name, email, phone, avatar_url, created_at, referral_code, wallet_balance FROM users WHERE id=$1'
    );

    fs.writeFileSync(authPath, authCode);
    console.log("Successfully patched auth.js");
    
  } catch (err) {
    console.error(err);
  } finally {
    pool.end();
  }
}
main();
