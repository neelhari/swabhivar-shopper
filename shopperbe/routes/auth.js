const router = require('express').Router();
const pool = require('../db');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const nodemailer = require('nodemailer');

const JWT_SECRET = process.env.JWT_SECRET || 'fallback_secret';

const transporter = nodemailer.createTransport({
  service: 'gmail',
  auth: { user: process.env.EMAIL_USER, pass: process.env.EMAIL_PASS },
});

function generateOTP() {
  return Math.floor(100000 + Math.random() * 900000).toString();
}

async function sendOrderEmailToAdmin(orderNumber, total, address, items, paymentMethod) {
  try {
    const addr = typeof address === 'string' ? JSON.parse(address) : address;
    const itemsList = (typeof items === 'string' ? JSON.parse(items) : items) || [];
    const itemsHtml = itemsList.map(item => `
      <tr>
        <td style="padding:8px 12px;border-bottom:1px solid #eee;">${item.product?.name || 'Product'}</td>
        <td style="padding:8px 12px;border-bottom:1px solid #eee;">${item.variant?.color ? item.variant.color + ' / ' : ''}${item.variant?.size || '-'}</td>
        <td style="padding:8px 12px;border-bottom:1px solid #eee;text-align:center;">${item.qty}</td>
        <td style="padding:8px 12px;border-bottom:1px solid #eee;text-align:right;">₹${(item.qty * (item.variant?.price || item.product?.price || 0)).toLocaleString()}</td>
      </tr>
    `).join('');

    await transporter.sendMail({
      from: `"Swabhivar Shoppers " <${process.env.EMAIL_USER}>`,
      to: process.env.EMAIL_USER,
      subject: `🛒 New Order Received - ${orderNumber}`,
      html: `
        <div style="font-family:'Segoe UI',Arial,sans-serif;max-width:600px;margin:0 auto;background:#fff;border:1px solid #e5e7eb;border-radius:12px;overflow:hidden;">
          <div style="background:linear-gradient(135deg,#fe6603,#ff8534);padding:24px;text-align:center;">
            <h1 style="color:#fff;margin:0;font-size:22px;">New Order Received!</h1>
            <p style="color:rgba(255,255,255,0.9);margin:8px 0 0;font-size:14px;">${orderNumber}</p>
          </div>
          <div style="padding:24px;">
            <h3 style="margin:0 0 12px;color:#111;">Customer Details</h3>
            <p style="margin:4px 0;color:#555;"><strong>${addr?.name || 'Customer'}</strong> &middot; ${addr?.mobile || ''}</p>
            <p style="margin:4px 0;color:#555;">${addr?.addressLine1 || ''} ${addr?.addressLine2 || ''}, ${addr?.city || ''}, ${addr?.state || ''} - ${addr?.pincode || ''}</p>
            <hr style="border:none;border-top:1px solid #eee;margin:16px 0;">
            <h3 style="margin:0 0 12px;color:#111;">Order Items</h3>
            <table style="width:100%;border-collapse:collapse;font-size:13px;">
              <tr style="background:#f9fafb;"><th style="padding:8px 12px;text-align:left;">Product</th><th style="padding:8px 12px;text-align:left;">Variant</th><th style="padding:8px 12px;text-align:center;">Qty</th><th style="padding:8px 12px;text-align:right;">Amount</th></tr>
              ${itemsHtml}
            </table>
            <div style="text-align:right;margin-top:12px;font-size:18px;font-weight:bold;color:#111;">Total: ₹${parseFloat(total).toLocaleString()}</div>
            <p style="margin-top:8px;text-align:right;font-size:12px;color:#888;">Payment: ${paymentMethod === 'cod' ? 'Cash on Delivery' : 'Prepaid (Online)'}</p>
          </div>
        </div>
      `
    });
  } catch (err) {
    console.error('Admin email send failed:', err);
  }
}

async function sendOrderEmailToCustomer(email, orderNumber, total, address, items, paymentMethod) {
  if (!email) return;
  try {
    const addr = typeof address === 'string' ? JSON.parse(address) : address;
    const itemsList = (typeof items === 'string' ? JSON.parse(items) : items) || [];
    const itemsHtml = itemsList.map(item => `
      <tr>
        <td style="padding:10px 12px;border-bottom:1px solid #f3f4f6;">
          <div style="display:flex;align-items:center;gap:10px;">
            <img src="${item.product?.image_url || item.product?.images?.[0] || ''}" alt="" style="width:48px;height:48px;border-radius:8px;object-fit:cover;" />
            <div>
              <p style="margin:0;font-weight:600;color:#111;">${item.product?.name || 'Product'}</p>
              <p style="margin:2px 0 0;font-size:12px;color:#888;">${item.variant?.color ? item.variant.color + ' / ' : ''}${item.variant?.size || ''}</p>
            </div>
          </div>
        </td>
        <td style="padding:10px 12px;border-bottom:1px solid #f3f4f6;text-align:center;">${item.qty}</td>
        <td style="padding:10px 12px;border-bottom:1px solid #f3f4f6;text-align:right;font-weight:600;">₹${(item.qty * (item.variant?.price || item.product?.price || 0)).toLocaleString()}</td>
      </tr>
    `).join('');

    await transporter.sendMail({
      from: `"Swabhivar Shoppers" <${process.env.EMAIL_USER}>`,
      to: email,
      subject: `✅ Order Confirmed - ${orderNumber}`,
      html: `
        <div style="font-family:'Segoe UI',Arial,sans-serif;max-width:600px;margin:0 auto;background:#fff;border:1px solid #e5e7eb;border-radius:12px;overflow:hidden;">
          <div style="background:linear-gradient(135deg,#10b981,#059669);padding:28px;text-align:center;">
            <div style="font-size:40px;margin-bottom:8px;">✅</div>
            <h1 style="color:#fff;margin:0;font-size:22px;">Order Confirmed!</h1>
            <p style="color:rgba(255,255,255,0.9);margin:8px 0 0;font-size:14px;">Thank you for your order, ${addr?.name || 'Customer'}!</p>
          </div>
          <div style="padding:24px;">
            <div style="background:#f0fdf4;border:1px solid #bbf7d0;border-radius:8px;padding:14px;margin-bottom:20px;text-align:center;">
              <p style="margin:0;font-size:13px;color:#166534;">Order Number</p>
              <p style="margin:4px 0 0;font-size:18px;font-weight:bold;color:#111;letter-spacing:1px;">${orderNumber}</p>
            </div>
            <h3 style="margin:0 0 12px;color:#111;font-size:15px;">Items Ordered</h3>
            <table style="width:100%;border-collapse:collapse;font-size:13px;">
              <tr style="background:#f9fafb;"><th style="padding:8px 12px;text-align:left;">Product</th><th style="padding:8px 12px;text-align:center;">Qty</th><th style="padding:8px 12px;text-align:right;">Amount</th></tr>
              ${itemsHtml}
            </table>
            <div style="background:#f9fafb;border-radius:8px;padding:14px;margin-top:16px;">
              <div style="display:flex;justify-content:space-between;margin-bottom:6px;"><span style="color:#666;">Payment</span><span style="font-weight:600;">${paymentMethod === 'cod' ? 'Cash on Delivery' : 'Paid Online'}</span></div>
              <div style="display:flex;justify-content:space-between;font-size:18px;"><span style="font-weight:bold;color:#111;">Total</span><span style="font-weight:bold;color:#059669;">₹${parseFloat(total).toLocaleString()}</span></div>
            </div>
            <hr style="border:none;border-top:1px solid #eee;margin:20px 0;">
            <h3 style="margin:0 0 8px;color:#111;font-size:15px;">Delivering To</h3>
            <p style="margin:4px 0;color:#555;line-height:1.6;">${addr?.name || ''}<br>${addr?.addressLine1 || ''} ${addr?.addressLine2 || ''}<br>${addr?.city || ''}, ${addr?.state || ''} - ${addr?.pincode || ''}<br>📞 ${addr?.mobile || ''}</p>
            <div style="text-align:center;margin-top:24px;">
              <p style="color:#888;font-size:12px;margin:0;">Need help? Reply to this email or contact us.</p>
            </div>
          </div>
        </div>
      `
    });
  } catch (err) {
    console.error('Customer email send failed:', err);
  }
}

async function sendOrderEmailToVendor(vendorEmail, vendorName, orderNumber, vendorItems, vendorTotal, address, paymentMethod) {
  if (!vendorEmail) return;
  try {
    const addr = typeof address === 'string' ? JSON.parse(address) : address;
    const itemsHtml = vendorItems.map(item => `
      <tr>
        <td style="padding:8px 12px;border-bottom:1px solid #eee;">${item.product?.name || 'Product'}</td>
        <td style="padding:8px 12px;border-bottom:1px solid #eee;">${item.variant?.color ? item.variant.color + ' / ' : ''}${item.variant?.size || '-'}</td>
        <td style="padding:8px 12px;border-bottom:1px solid #eee;text-align:center;">${item.qty}</td>
        <td style="padding:8px 12px;border-bottom:1px solid #eee;text-align:right;">₹${(item.qty * (item.variant?.price || item.product?.price || 0)).toLocaleString()}</td>
      </tr>
    `).join('');

    await transporter.sendMail({
      from: `"Swabhivar Shoppers" <${process.env.EMAIL_USER}>`,
      to: vendorEmail,
      subject: `🎉 New Order for Your Products - ${orderNumber}`,
      html: `
        <div style="font-family:'Segoe UI',Arial,sans-serif;max-width:600px;margin:0 auto;background:#fff;border:1px solid #e5e7eb;border-radius:12px;overflow:hidden;">
          <div style="background:linear-gradient(135deg,#7c3aed,#6d28d9);padding:28px;text-align:center;">
            <div style="font-size:40px;margin-bottom:8px;">🎉</div>
            <h1 style="color:#fff;margin:0;font-size:22px;">New Order for Your Products!</h1>
            <p style="color:rgba(255,255,255,0.9);margin:8px 0 0;font-size:14px;">Hi ${vendorName}, you have a new sale!</p>
          </div>
          <div style="padding:24px;">
            <div style="background:#f5f3ff;border:1px solid #ddd6fe;border-radius:8px;padding:14px;margin-bottom:20px;text-align:center;">
              <p style="margin:0;font-size:13px;color:#5b21b6;">Order Number</p>
              <p style="margin:4px 0 0;font-size:18px;font-weight:bold;color:#111;letter-spacing:1px;">${orderNumber}</p>
            </div>
            <h3 style="margin:0 0 12px;color:#111;font-size:15px;">Your Products in This Order</h3>
            <table style="width:100%;border-collapse:collapse;font-size:13px;">
              <tr style="background:#f9fafb;"><th style="padding:8px 12px;text-align:left;">Product</th><th style="padding:8px 12px;text-align:left;">Variant</th><th style="padding:8px 12px;text-align:center;">Qty</th><th style="padding:8px 12px;text-align:right;">Amount</th></tr>
              ${itemsHtml}
            </table>
            <div style="background:#f5f3ff;border-radius:8px;padding:14px;margin-top:16px;">
              <div style="display:flex;justify-content:space-between;font-size:18px;"><span style="font-weight:bold;color:#111;">Your Earnings</span><span style="font-weight:bold;color:#7c3aed;">₹${vendorTotal.toLocaleString()}</span></div>
              <p style="margin:8px 0 0;font-size:12px;color:#888;">This amount has been credited to your virtual wallet.</p>
            </div>
            <hr style="border:none;border-top:1px solid #eee;margin:20px 0;">
            <h3 style="margin:0 0 8px;color:#111;font-size:15px;">Ship To</h3>
            <p style="margin:4px 0;color:#555;line-height:1.6;">${addr?.name || ''}<br>${addr?.addressLine1 || ''} ${addr?.addressLine2 || ''}<br>${addr?.city || ''}, ${addr?.state || ''} - ${addr?.pincode || ''}<br>📞 ${addr?.mobile || ''}</p>
            <div style="text-align:center;margin-top:24px;">
              <p style="color:#888;font-size:12px;margin:0;">Please prepare and ship the order promptly. Check your vendor dashboard for details.</p>
            </div>
          </div>
        </div>
      `
    });
  } catch (err) {
    console.error('Vendor email send failed:', err);
  }
}

async function sendOTPEmail(email, otp, name) {
  await transporter.sendMail({
    from: `"Swabhivar Shoppers" <${process.env.EMAIL_USER}>`,
    to: email,
    subject: 'Your OTP for Swabhivar Shoppers Verification',
    html: `
      <div style="font-family:'Georgia',serif;max-width:500px;margin:auto;padding:32px;border:1px solid #e2e8f0;border-radius:16px;background-color:#ffffff;box-shadow:0 10px 25px rgba(0,0,0,0.05);">
        <div style="text-align:center;margin-bottom:24px;">
          <h1 style="color:#0b162c;margin:0;font-size:26px;letter-spacing:2px;text-transform:uppercase;">SWABHIVAR</h1>
          <p style="color:#fe6603;font-size:11px;font-weight:bold;letter-spacing:3px;text-transform:uppercase;margin:4px 0 0;">Shoppers</p>
        </div>
        <h2 style="color:#0b162c;font-size:20px;margin-bottom:16px;">Welcome to Swabhivar Shoppers! ✨</h2>
        <p style="color:#4a5568;font-family:Arial,sans-serif;font-size:15px;line-height:1.5;">Hi <strong>${name}</strong>,</p>
        <p style="color:#4a5568;font-family:Arial,sans-serif;font-size:15px;line-height:1.5;">Thank you for joining us. To complete your account verification, please use the following One-Time Password (OTP):</p>
        <div style="font-family:monospace;font-size:40px;font-weight:bold;color:#fe6603;letter-spacing:12px;text-align:center;padding:24px;background:#fff8f1;border:2px dashed #fed7aa;border-radius:12px;margin:24px 0;">
          ${otp}
        </div>
        <p style="color:#718096;font-family:Arial,sans-serif;font-size:13px;text-align:center;">This OTP is valid for 10 minutes. For your security, do not share this code with anyone.</p>
        <hr style="border:none;border-top:1px solid #edf2f7;margin:24px 0;" />
        <p style="color:#a0aec0;font-family:Arial,sans-serif;font-size:11px;text-align:center;margin:0;">&copy; ${new Date().getFullYear()} Swabhivar Shoppers. All rights reserved.</p>
      </div>
    `,
  });
}

async function sendPasswordResetOTPEmail(email, otp, name) {
  await transporter.sendMail({
    from: `"Swabhivar Shoppers" <${process.env.EMAIL_USER}>`,
    to: email,
    subject: 'Password Reset OTP',
    html: `
      <div style="font-family:Arial,sans-serif;max-width:480px;margin:auto;padding:24px;border:1px solid #e5e7eb;border-radius:12px;">
        <h2 style="color:#111;">Password Reset Request</h2>
        <p>Hi <strong>${name}</strong>,</p>
        <p>Your OTP to reset your password is:</p>
        <div style="font-size:36px;font-weight:bold;color:#fe6603;letter-spacing:8px;text-align:center;padding:16px;background:#fff7ed;border-radius:8px;margin:16px 0;">
          ${otp}
        </div>
        <p style="color:#6b7280;font-size:13px;">This OTP is valid for 10 minutes. Do not share it with anyone.</p>
      </div>
    `,
  });
}

// Middleware to verify JWT
function authMiddleware(req, res, next) {
  const token = req.headers.authorization?.split(' ')[1];
  if (!token) return res.status(401).json({ error: 'Unauthorized' });
  try {
    req.user = jwt.verify(token, JWT_SECRET);
    next();
  } catch {
    res.status(401).json({ error: 'Invalid token' });
  }
}


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
router.post('/signup', async (req, res) => {
  const { name, email, phone, password, referral_code } = req.body;
  if (!name || !email || !phone || !password)
    return res.status(400).json({ error: 'All fields are required' });

  try {
    const existing = await pool.query('SELECT id, is_verified FROM users WHERE email=$1', [email]);
    if (existing.rows.length && existing.rows[0].is_verified)
      return res.status(409).json({ error: 'Email already registered' });

    const hash = await bcrypt.hash(password, 10);
    const otp = generateOTP();
    const expiresAt = new Date(Date.now() + 10 * 60 * 1000);

    if (existing.rows.length) {
      await pool.query(
        'UPDATE users SET name=$1, phone=$2, password_hash=$3, referred_by=COALESCE(referred_by, $5) WHERE email=$4',
        [name, phone, hash, email, referral_code]
      );
    } else {
      await pool.query(
        'INSERT INTO users (name, email, phone, password_hash, referred_by, referral_code) VALUES ($1,$2,$3,$4,$5,$6)',
        [name, email, phone, hash, referral_code, Math.random().toString(36).substring(2,8).toLowerCase()]
      );
    }

    await pool.query('DELETE FROM otps WHERE email=$1', [email]);
    await pool.query('INSERT INTO otps (email, otp, expires_at) VALUES ($1,$2,$3)', [email, otp, expiresAt]);

    await sendOTPEmail(email, otp, name);
    res.json({ message: 'OTP sent to your email' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
});

// POST /api/auth/verify-otp
router.post('/verify-otp', async (req, res) => {
  const { email, otp } = req.body;
  if (!email || !otp) return res.status(400).json({ error: 'Email and OTP required' });

  try {
    const result = await pool.query(
      'SELECT * FROM otps WHERE email=$1 AND otp=$2 AND expires_at > NOW() ORDER BY created_at DESC LIMIT 1',
      [email, otp]
    );
    if (!result.rows.length) return res.status(400).json({ error: 'Invalid or expired OTP' });

    const userRes = await pool.query('SELECT id, referred_by, is_verified FROM users WHERE email=$1', [email]);
    const referredBy = userRes.rows[0]?.referred_by;
    const newUserId = userRes.rows[0]?.id;
    const wasVerified = userRes.rows[0]?.is_verified;
    
    await pool.query('UPDATE users SET is_verified=TRUE WHERE email=$1', [email]);
    
    // Referral Reward Logic
    try {
      if (referredBy && !wasVerified) {
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
        await pool.query('UPDATE users SET wallet_balance = COALESCE(wallet_balance, 0) + $1 WHERE id=$2', [rewardAmount, newUserId]);

      }
    } catch (refErr) {
      console.error("Referral reward error:", refErr);
    }

    await pool.query('DELETE FROM otps WHERE email=$1', [email]);

    const user = await pool.query('SELECT id, name, email, phone, role, wallet_balance FROM users WHERE email=$1', [email]);
    const u = user.rows[0];
    const token = jwt.sign({ id: u.id, email, role: u.role }, JWT_SECRET, { expiresIn: '7d' });
    res.json({ token, user: { id: u.id, name: u.name, email: u.email, phone: u.phone, role: u.role, wallet_balance: Number(u.wallet_balance || 0) } });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
});

// POST /api/auth/forgot-password
router.post('/forgot-password', async (req, res) => {
  const { email } = req.body;
  if (!email) return res.status(400).json({ error: 'Email required' });

  try {
    const user = await pool.query('SELECT name FROM users WHERE email=$1', [email]);
    if (!user.rows.length) return res.status(404).json({ error: 'User not found' });

    const otp = generateOTP();
    const expiresAt = new Date(Date.now() + 10 * 60 * 1000);

    await pool.query('DELETE FROM otps WHERE email=$1', [email]);
    await pool.query('INSERT INTO otps (email, otp, expires_at) VALUES ($1,$2,$3)', [email, otp, expiresAt]);

    await sendPasswordResetOTPEmail(email, otp, user.rows[0].name);
    res.json({ message: 'OTP sent to your email' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
});

// POST /api/auth/verify-reset-otp
router.post('/verify-reset-otp', async (req, res) => {
  const { email, otp } = req.body;
  if (!email || !otp) return res.status(400).json({ error: 'Email and OTP required' });

  try {
    const result = await pool.query(
      'SELECT * FROM otps WHERE email=$1 AND otp=$2 AND expires_at > NOW() ORDER BY created_at DESC LIMIT 1',
      [email, otp]
    );
    if (!result.rows.length) return res.status(400).json({ error: 'Invalid or expired OTP' });

    res.json({ success: true, message: 'OTP verified' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
});

// POST /api/auth/reset-password
router.post('/reset-password', async (req, res) => {
  const { email, otp, newPassword } = req.body;
  if (!email || !otp || !newPassword) return res.status(400).json({ error: 'Missing required fields' });

  try {
    const result = await pool.query(
      'SELECT * FROM otps WHERE email=$1 AND otp=$2 AND expires_at > NOW() ORDER BY created_at DESC LIMIT 1',
      [email, otp]
    );
    if (!result.rows.length) return res.status(400).json({ error: 'Invalid or expired OTP' });

    const hash = await bcrypt.hash(newPassword, 10);
    await pool.query('UPDATE users SET password_hash=$1 WHERE email=$2', [hash, email]);
    await pool.query('DELETE FROM otps WHERE email=$1', [email]);

    res.json({ success: true, message: 'Password reset successfully' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
});

// POST /api/auth/login
router.post('/login', async (req, res) => {
  const { email, password } = req.body;
  if (!email || !password) return res.status(400).json({ error: 'Email and password required' });

  try {
    const result = await pool.query('SELECT * FROM users WHERE email=$1', [email]);
    if (!result.rows.length) return res.status(401).json({ error: 'Invalid credentials' });

    const user = result.rows[0];
    if (!user.is_verified) return res.status(403).json({ error: 'Please verify your email first' });

    const valid = await bcrypt.compare(password, user.password_hash);
    if (!valid) return res.status(401).json({ error: 'Invalid credentials' });

    const token = jwt.sign({ id: user.id, email: user.email, role: user.role }, JWT_SECRET, { expiresIn: '7d' });
    res.json({ token, user: { id: user.id, name: user.name, email: user.email, phone: user.phone, role: user.role, referral_code: user.referral_code, wallet_balance: user.wallet_balance } });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
});

// GET /api/auth/profile
router.get('/profile', authMiddleware, async (req, res) => {
  try {
    const user = await pool.query(
      'SELECT id, name, email, phone, avatar_url, created_at, referral_code, wallet_balance FROM users WHERE id=$1',
      [req.user.id]
    );
    const addresses = await pool.query('SELECT * FROM addresses WHERE user_id=$1 ORDER BY is_default DESC', [req.user.id]);
    const orders = await pool.query('SELECT * FROM orders WHERE user_id=$1 ORDER BY created_at DESC', [req.user.id]);

    res.json({ user: user.rows[0], addresses: addresses.rows, orders: orders.rows });
  } catch (err) {
    res.status(500).json({ error: 'Server error' });
  }
});

// PUT /api/auth/profile
router.put('/profile', authMiddleware, async (req, res) => {
  const { name, phone } = req.body;
  try {
    const result = await pool.query(
      'UPDATE users SET name=$1, phone=$2 WHERE id=$3 RETURNING id, name, email, phone',
      [name, phone, req.user.id]
    );
    res.json({ user: result.rows[0] });
  } catch (err) {
    res.status(500).json({ error: 'Server error' });
  }
});

// POST /api/auth/address
router.post('/address', authMiddleware, async (req, res) => {
  const { name, line1, line2, city, state, pincode, mobile, is_default } = req.body;
  try {
    if (is_default) {
      await pool.query('UPDATE addresses SET is_default=FALSE WHERE user_id=$1', [req.user.id]);
    }
    const result = await pool.query(
      'INSERT INTO addresses (user_id, name, line1, line2, city, state, pincode, mobile, is_default) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING *',
      [req.user.id, name, line1, line2, city, state, pincode, mobile, is_default || false]
    );
    res.json({ address: result.rows[0] });
  } catch (err) {
    res.status(500).json({ error: 'Server error' });
  }
});

// POST /api/auth/orders
router.post('/orders', authMiddleware, async (req, res) => {
  const { items, address, total, coupon_code, payment_method, advance_paid } = req.body;
  
  if (!items || items.length === 0) {
    return res.status(400).json({ error: 'Cart is empty' });
  }

  try {
    const orderNumber = `ORD-${Date.now()}`;
    const itemsJson = JSON.stringify(items);
    const addressJson = JSON.stringify(address);
    const pMethod = payment_method || 'prepaid';
    const advancePaid = pMethod === 'cod' ? 1 : (parseFloat(total) || 0);
    
    const result = await pool.query(
      `INSERT INTO orders (user_id, order_number, total, items, address, status, payment_method, advance_paid)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING *`,
      [req.user.id, orderNumber, total, itemsJson, addressJson, 'pending', pMethod, advancePaid]
    );

    // Credit vendors, record transactions, send vendor emails
    const vendorData = {};
    for (const item of items) {
      if (item.product && item.product.vendor_id) {
        const vid = item.product.vendor_id;
        const amt = item.qty * (item.variant?.price || item.product?.price || 0);
        if (!vendorData[vid]) vendorData[vid] = { total: 0, items: [] };
        vendorData[vid].total += amt;
        vendorData[vid].items.push(item);
      }
    }
    for (const [vid, data] of Object.entries(vendorData)) {
      await pool.query('UPDATE vendors SET wallet_balance = COALESCE(wallet_balance, 0) + $1 WHERE id = $2', [data.total, vid]);
      await pool.query(
        'INSERT INTO vendor_transactions (vendor_id, type, amount, order_number, description) VALUES ($1, $2, $3, $4, $5)',
        [vid, 'credit', data.total, orderNumber, `Order ${orderNumber} - ${data.items.length} item(s)`]
      );
      await pool.query(
        'INSERT INTO vendor_order_payouts (order_id, vendor_id, amount, status) VALUES ($1, $2, $3, $4)',
        [result.rows[0].id, vid, data.total, 'pending']
      );
      const vendorRes = await pool.query('SELECT name, email FROM vendors WHERE id = $1', [vid]);
      if (vendorRes.rows[0]) {
        sendOrderEmailToVendor(vendorRes.rows[0].email, vendorRes.rows[0].name, orderNumber, data.items, data.total, address, pMethod);
      }
    }
    
    // Send emails
    sendOrderEmailToAdmin(orderNumber, total, address, items, pMethod);
    // Fetch user email for customer confirmation
    const userRes = await pool.query('SELECT email, referred_by FROM users WHERE id = $1', [req.user.id]);
    const userEmail = userRes.rows[0]?.email || address?.email;
    const referredBy = userRes.rows[0]?.referred_by;
    sendOrderEmailToCustomer(userEmail, orderNumber, total, address, items, pMethod);

    // 1% Referral bonus for the person who referred this user
    if (referredBy && parseFloat(total) > 0) {
      try {
        const referralBonus = parseFloat((parseFloat(total) * 0.01).toFixed(2));
        const vendorCheck = await pool.query('SELECT id FROM vendors WHERE referral_code = $1', [referredBy]);
        if (vendorCheck.rows.length > 0) {
          const vid = vendorCheck.rows[0].id;
          await pool.query('UPDATE vendors SET wallet_balance = COALESCE(wallet_balance, 0) + $1 WHERE id = $2', [referralBonus, vid]);
          await pool.query(
            "INSERT INTO vendor_transactions (vendor_id, type, amount, order_number, description) VALUES ($1, 'credit', $2, $3, $4)",
            [vid, referralBonus, orderNumber, `Referral bonus (1%) from order ${orderNumber}`]
          );
        } else {
          await pool.query('UPDATE users SET wallet_balance = COALESCE(wallet_balance, 0) + $1 WHERE referral_code = $2', [referralBonus, referredBy]);
        }
      } catch (refErr) {
        console.error('Order referral bonus error:', refErr);
      }
    }

    res.json({ success: true, order: result.rows[0] });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to place order' });
  }
});

// DELETE /api/auth/address/:id
router.delete('/address/:id', authMiddleware, async (req, res) => {
  try {
    await pool.query('DELETE FROM addresses WHERE id=$1 AND user_id=$2', [req.params.id, req.user.id]);
    res.json({ message: 'Address deleted' });
  } catch (err) {
    res.status(500).json({ error: 'Server error' });
  }
});

// PUT /api/auth/change-password
router.put('/change-password', authMiddleware, async (req, res) => {
  const { currentPassword, newPassword } = req.body;
  try {
    const result = await pool.query('SELECT password_hash FROM users WHERE id=$1', [req.user.id]);
    const valid = await bcrypt.compare(currentPassword, result.rows[0].password_hash);
    if (!valid) return res.status(400).json({ error: 'Current password is incorrect' });
    const hash = await bcrypt.hash(newPassword, 10);
    await pool.query('UPDATE users SET password_hash=$1 WHERE id=$2', [hash, req.user.id]);
    res.json({ message: 'Password changed' });
  } catch (err) {
    res.status(500).json({ error: 'Server error' });
  }
});

// GET /api/auth/me
router.get('/me', authMiddleware, async (req, res) => {
  try {
    const user = await pool.query(
      'SELECT id, name, email, role FROM users WHERE id=$1',
      [req.user.id]
    );
    if (!user.rows.length) return res.status(404).json({ error: 'User not found' });
    res.json({ user: user.rows[0] });
  } catch (err) {
    res.status(500).json({ error: 'Server error' });
  }
});

module.exports = router;
module.exports.authMiddleware = authMiddleware;
