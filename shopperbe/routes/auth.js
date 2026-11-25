const axios = require('axios');
const router = require('express').Router();
const pool = require('../db');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const nodemailer = require('nodemailer');
const vendorAccountingService = require('../services/vendorAccountingService');
const emailService = require('../services/emailService');
const pricingService = require('../services/pricingService');
const smsService = require('../services/smsService');

const JWT_SECRET = process.env.JWT_SECRET || 'fallback_secret';

const transporter = {
  sendMail: (options) => emailService.sendMail(options)
};

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
    subject: 'Password Reset OTP - Swabhivar Shoppers',
    html: `
      <div style="font-family:'Georgia',serif;max-width:500px;margin:auto;padding:32px;border:1px solid #e2e8f0;border-radius:16px;background-color:#ffffff;box-shadow:0 10px 25px rgba(0,0,0,0.05);">
        <div style="text-align:center;margin-bottom:24px;">
          <h1 style="color:#0b162c;margin:0;font-size:26px;letter-spacing:2px;text-transform:uppercase;">SWABHIVAR</h1>
          <p style="color:#fe6603;font-size:11px;font-weight:bold;letter-spacing:3px;text-transform:uppercase;margin:4px 0 0;">Shoppers</p>
        </div>
        <h2 style="color:#0b162c;font-size:20px;margin-bottom:16px;">Password Reset Request 🔒</h2>
        <p style="color:#4a5568;font-family:Arial,sans-serif;font-size:15px;line-height:1.5;">Hi <strong>${name}</strong>,</p>
        <p style="color:#4a5568;font-family:Arial,sans-serif;font-size:15px;line-height:1.5;">We received a request to reset your password for your Swabhivar Shoppers account. Please use the following One-Time Password (OTP) to proceed:</p>
        <div style="font-family:monospace;font-size:40px;font-weight:bold;color:#fe6603;letter-spacing:12px;text-align:center;padding:24px;background:#fff8f1;border:2px dashed #fed7aa;border-radius:12px;margin:24px 0;">
          ${otp}
        </div>
        <p style="color:#718096;font-family:Arial,sans-serif;font-size:13px;text-align:center;">This OTP is valid for 10 minutes. If you did not request a password reset, please ignore this email or contact support.</p>
        <hr style="border:none;border-top:1px solid #edf2f7;margin:24px 0;" />
        <p style="color:#a0aec0;font-family:Arial,sans-serif;font-size:11px;text-align:center;margin:0;">&copy; ${new Date().getFullYear()} Swabhivar Shoppers. All rights reserved.</p>
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

// POST /api/auth/signup - send SMS OTP
router.post('/signup', async (req, res) => {
  const { name, email, phone, password, referral_code } = req.body;
  if (!name || !email || !phone || !password)
    return res.status(400).json({ error: 'All fields are required' });

  let cleanPhone;
  try {
    cleanPhone = smsService.formatIndianMobile(phone);
  } catch (fmtErr) {
    return res.status(400).json({ error: fmtErr.message });
  }

  const cleanEmail = email.trim().toLowerCase();

  try {
    const existing = await pool.query(
      'SELECT id, is_verified FROM users WHERE LOWER(email)=$1 OR phone=$2',
      [cleanEmail, cleanPhone]
    );
    if (existing.rows.length && existing.rows[0].is_verified)
      return res.status(409).json({ error: 'An account with this email or mobile number is already registered' });

    // Rate limiting: 60-second cooldown check
    const recentOtp = await pool.query(
      "SELECT id, created_at, EXTRACT(EPOCH FROM (NOW() - last_sent_at)) as elapsed_sec FROM otps WHERE phone=$1 AND purpose='customer_signup' AND last_sent_at > NOW() - INTERVAL '60 seconds' ORDER BY id DESC LIMIT 1",
      [cleanPhone]
    );
    if (recentOtp.rows.length > 0) {
      const elapsed = Math.round(Number(recentOtp.rows[0].elapsed_sec) || 0);
      const waitTime = Math.max(1, 60 - elapsed);
      return res.status(429).json({
        error: `Please wait ${waitTime} seconds before requesting a new OTP.`,
        retryAfter: waitTime
      });
    }

    const hash = await bcrypt.hash(password, 10);
    const otp = generateOTP();
    const otpHash = smsService.hashOTP(otp);
    const expiresAt = new Date(Date.now() + 10 * 60 * 1000);

    // Validate referral code and prevent self-referrals
    let validReferralCode = null;
    if (referral_code && typeof referral_code === 'string') {
      const trimmedCode = referral_code.trim();
      const selfCheck = await pool.query(
        `SELECT id FROM users WHERE referral_code = $1 AND (LOWER(email) = $2 OR phone = $3)
         UNION
         SELECT id FROM vendors WHERE referral_code = $1 AND (LOWER(email) = $2 OR phone = $3)`,
        [trimmedCode, cleanEmail, cleanPhone]
      );
      if (selfCheck.rows.length === 0) {
        const codeCheck = await pool.query(
          `SELECT id FROM vendors WHERE referral_code = $1
           UNION
           SELECT id FROM users WHERE referral_code = $1`,
          [trimmedCode]
        );
        if (codeCheck.rows.length > 0) {
          validReferralCode = trimmedCode;
        }
      } else {
        console.warn(`[Referral] Self-referral attempt blocked for customer signup: ${cleanEmail}`);
      }
    }

    if (existing.rows.length) {
      await pool.query(
        'UPDATE users SET name=$1, phone=$2, password_hash=$3, referred_by=COALESCE(referred_by, $5) WHERE LOWER(email)=$4',
        [name, cleanPhone, hash, cleanEmail, validReferralCode]
      );
    } else {
      await pool.query(
        'INSERT INTO users (name, email, phone, password_hash, referred_by, referral_code) VALUES ($1,$2,$3,$4,$5,$6)',
        [name, cleanEmail, cleanPhone, hash, validReferralCode, Math.random().toString(36).substring(2,8).toLowerCase()]
      );
    }

    await pool.query(
      "DELETE FROM otps WHERE (phone=$1 OR LOWER(email)=$2) AND purpose='customer_signup'",
      [cleanPhone, cleanEmail]
    );
    await pool.query(
      "INSERT INTO otps (phone, email, otp, otp_hash, purpose, expires_at, attempts, last_sent_at) VALUES ($1,$2,$3,$4,'customer_signup',$5,0,NOW())",
      [cleanPhone, cleanEmail, otpHash, otpHash, expiresAt]
    );

    // Dispatch SMS OTP via MSG91 Flow
    await smsService.sendCustomerSignupOTP(cleanPhone, otp);

    res.json({ success: true, message: 'OTP sent to your mobile number via SMS' });
  } catch (err) {
    console.error('Customer signup error:', err.message);
    res.status(500).json({ error: err.message || 'Server error during signup' });
  }
});

// POST /api/auth/resend-otp - resend customer registration SMS OTP
router.post('/resend-otp', async (req, res) => {
  const { phone, email } = req.body;
  if (!phone && !email) {
    return res.status(400).json({ error: 'Mobile number or email is required' });
  }

  try {
    let cleanPhone = null;
    let cleanEmail = email ? email.trim().toLowerCase() : null;

    if (phone) {
      try {
        cleanPhone = smsService.formatIndianMobile(phone);
      } catch (e) {
        return res.status(400).json({ error: e.message });
      }
    }

    const uRes = await pool.query(
      'SELECT id, phone, email, is_verified FROM users WHERE ($1::text IS NOT NULL AND phone=$1) OR ($2::text IS NOT NULL AND LOWER(email)=$2) ORDER BY id DESC LIMIT 1',
      [cleanPhone, cleanEmail]
    );

    if (uRes.rows.length === 0) {
      return res.status(404).json({ error: 'Registration record not found. Please sign up.' });
    }

    const user = uRes.rows[0];
    if (user.is_verified) {
      return res.status(400).json({ error: 'Account is already verified. Please log in.' });
    }

    cleanPhone = user.phone;
    cleanEmail = user.email;

    // Rate limiting: 60-second cooldown check
    const recentOtp = await pool.query(
      "SELECT id, created_at, EXTRACT(EPOCH FROM (NOW() - last_sent_at)) as elapsed_sec FROM otps WHERE phone=$1 AND purpose='customer_signup' AND last_sent_at > NOW() - INTERVAL '60 seconds' ORDER BY id DESC LIMIT 1",
      [cleanPhone]
    );
    if (recentOtp.rows.length > 0) {
      const elapsed = Math.round(Number(recentOtp.rows[0].elapsed_sec) || 0);
      const waitTime = Math.max(1, 60 - elapsed);
      return res.status(429).json({
        error: `Please wait ${waitTime} seconds before requesting a new OTP.`,
        retryAfter: waitTime
      });
    }

    const otp = generateOTP();
    const otpHash = smsService.hashOTP(otp);
    const expiresAt = new Date(Date.now() + 10 * 60 * 1000);

    await pool.query(
      "DELETE FROM otps WHERE (phone=$1 OR LOWER(email)=$2) AND purpose='customer_signup'",
      [cleanPhone, cleanEmail]
    );
    await pool.query(
      "INSERT INTO otps (phone, email, otp, otp_hash, purpose, expires_at, attempts, last_sent_at) VALUES ($1,$2,$3,$4,'customer_signup',$5,0,NOW())",
      [cleanPhone, cleanEmail, otpHash, otpHash, expiresAt]
    );

    await smsService.sendCustomerSignupOTP(cleanPhone, otp);

    res.json({ success: true, message: 'A fresh OTP has been sent to your mobile number.' });
  } catch (err) {
    console.error('Customer resend-otp error:', err.message);
    res.status(500).json({ error: err.message || 'Failed to resend OTP' });
  }
});

// POST /api/auth/verify-otp - verify SMS OTP
router.post('/verify-otp', async (req, res) => {
  const { email, phone, otp } = req.body;
  if ((!email && !phone) || !otp) return res.status(400).json({ error: 'Mobile/Email and OTP required' });

  const cleanOtp = String(otp).trim();
  let cleanPhone = null;
  if (phone) {
    try {
      cleanPhone = smsService.formatIndianMobile(phone);
    } catch {}
  }
  const cleanEmail = email ? email.trim().toLowerCase() : null;

  try {
    const result = await pool.query(
      `SELECT * FROM otps 
       WHERE (($1::text IS NOT NULL AND phone=$1) OR ($2::text IS NOT NULL AND LOWER(email)=$2)) 
         AND purpose='customer_signup' 
         AND expires_at > NOW() 
       ORDER BY id DESC LIMIT 1`,
      [cleanPhone, cleanEmail]
    );

    if (!result.rows.length) return res.status(400).json({ error: 'Invalid or expired OTP' });

    const record = result.rows[0];
    if (record.attempts >= 5) {
      return res.status(429).json({ error: 'Too many incorrect attempts. Please request a new OTP.' });
    }

    const isValid = smsService.verifyOTPHash(cleanOtp, record.otp_hash) || (record.otp === cleanOtp);
    if (!isValid) {
      await pool.query('UPDATE otps SET attempts = attempts + 1 WHERE id = $1', [record.id]);
      const remaining = Math.max(0, 5 - (record.attempts + 1));
      return res.status(400).json({ error: `Invalid OTP. (${remaining} attempts remaining)` });
    }

    const userRes = await pool.query(
      'SELECT id, email, phone, referred_by, is_verified FROM users WHERE ($1::text IS NOT NULL AND phone=$1) OR ($2::text IS NOT NULL AND LOWER(email)=$2) ORDER BY id DESC LIMIT 1',
      [cleanPhone, cleanEmail]
    );

    if (!userRes.rows.length) return res.status(404).json({ error: 'User record not found' });

    const userRecord = userRes.rows[0];
    const targetEmail = userRecord.email;
    const referredBy = userRecord.referred_by;
    const newUserId = userRecord.id;
    const wasVerified = userRecord.is_verified;
    
    await pool.query('UPDATE users SET is_verified=TRUE WHERE id=$1', [newUserId]);
    
    // Referral Reward Logic
    try {
      if (referredBy && !wasVerified) {
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
        
        await pool.query('UPDATE users SET wallet_balance = COALESCE(wallet_balance, 0) + $1 WHERE id=$2', [rewardAmount, newUserId]);
      }
    } catch (refErr) {
      console.error("Referral reward error:", refErr);
    }

    await pool.query('DELETE FROM otps WHERE id=$1', [record.id]);

    const user = await pool.query('SELECT id, name, email, phone, role, wallet_balance FROM users WHERE id=$1', [newUserId]);
    const u = user.rows[0];
    const token = jwt.sign({ id: u.id, email: u.email, role: u.role }, JWT_SECRET, { expiresIn: '7d' });
    res.json({ token, user: { id: u.id, name: u.name, email: u.email, phone: u.phone, role: u.role, wallet_balance: Number(u.wallet_balance || 0) } });
  } catch (err) {
    console.error('verify-otp error:', err);
    res.status(500).json({ error: 'Server error during OTP verification' });
  }
});

// POST /api/auth/forgot-password (Purely SMTP Email - No DLT/SMS to save credits)
router.post('/forgot-password', async (req, res) => {
  const { email, identifier: rawId } = req.body;
  const input = String(rawId || email || '').trim();
  if (!input) return res.status(400).json({ error: 'Email address required' });

  const cleanEmail = input.toLowerCase();

  try {
    const user = await pool.query('SELECT id, name, email FROM users WHERE LOWER(email)=$1 ORDER BY id DESC LIMIT 1', [cleanEmail]);

    if (!user.rows.length) {
      return res.status(404).json({ error: 'User not found with this email address' });
    }

    const userData = user.rows[0];
    const otp = generateOTP();
    const otpHash = smsService.hashOTP(otp);
    const expiresAt = new Date(Date.now() + 10 * 60 * 1000);

    await pool.query("DELETE FROM otps WHERE LOWER(email)=$1 AND purpose='customer_forgot_password'", [cleanEmail]);
    await pool.query(
      "INSERT INTO otps (email, otp, otp_hash, purpose, expires_at, attempts, last_sent_at) VALUES ($1,$2,$3,'customer_forgot_password',$4, 0, NOW())",
      [cleanEmail, otpHash, otpHash, expiresAt]
    );

    await sendPasswordResetOTPEmail(cleanEmail, otp, userData.name || 'User');
    return res.json({ success: true, message: 'Password reset OTP sent to your email' });
  } catch (err) {
    console.error('forgot-password error:', err);
    const isSmtpAuthErr = (err.message || '').includes('535') || (err.message || '').includes('BadCredentials');
    if (isSmtpAuthErr) {
      return res.status(500).json({
        error: 'Gmail SMTP authentication failed: Invalid App Password. Please update EMAIL_PASS in server .env with a fresh Google App Password.'
      });
    }
    res.status(500).json({ error: 'Failed to send password reset email: ' + (err.message || 'SMTP error') });
  }
});

// POST /api/auth/verify-reset-otp (Supports Mobile Number OR Email)
router.post('/verify-reset-otp', async (req, res) => {
  const { email, identifier: rawId, otp } = req.body;
  const input = String(rawId || email || '').trim();
  if (!input || !otp) return res.status(400).json({ error: 'Mobile/email and OTP required' });

  const rawDigits = input.replace(/\D/g, '');
  const isPhone = !input.includes('@') && rawDigits.length >= 10;
  const identifier = isPhone ? rawDigits.slice(-10) : input.toLowerCase();
  const cleanOtp = String(otp).trim();

  try {
    const otpRes = await pool.query(
      "SELECT * FROM otps WHERE LOWER(email)=$1 AND purpose='customer_forgot_password' AND expires_at > NOW() ORDER BY id DESC LIMIT 1",
      [identifier]
    );
    if (!otpRes.rows.length) {
      return res.status(400).json({ error: 'Invalid or expired OTP' });
    }

    const record = otpRes.rows[0];
    if (record.attempts >= 5) {
      return res.status(429).json({ error: 'Too many failed attempts. Please request a new OTP.' });
    }

    const isValid = smsService.verifyOTPHash(cleanOtp, record.otp_hash) || (record.otp === cleanOtp);
    if (!isValid) {
      await pool.query('UPDATE otps SET attempts = attempts + 1 WHERE id = $1', [record.id]);
      const remaining = Math.max(0, 5 - (record.attempts + 1));
      return res.status(400).json({ error: `Invalid OTP. (${remaining} attempts remaining)` });
    }

    res.json({ success: true, message: 'OTP verified' });
  } catch (err) {
    console.error('verify-reset-otp error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// POST /api/auth/reset-password (Supports Mobile Number OR Email)
router.post('/reset-password', async (req, res) => {
  const { email, identifier: rawId, otp, newPassword } = req.body;
  const input = String(rawId || email || '').trim();
  if (!input || !otp || !newPassword) return res.status(400).json({ error: 'Missing required fields' });

  if (typeof newPassword !== 'string' || newPassword.length < 6) {
    return res.status(400).json({ error: 'Password must be at least 6 characters' });
  }

  const rawDigits = input.replace(/\D/g, '');
  const isPhone = !input.includes('@') && rawDigits.length >= 10;
  const identifier = isPhone ? rawDigits.slice(-10) : input.toLowerCase();
  const cleanOtp = String(otp).trim();

  try {
    const result = await pool.query(
      "SELECT * FROM otps WHERE LOWER(email)=$1 AND purpose='customer_forgot_password' AND expires_at > NOW() ORDER BY id DESC LIMIT 1",
      [identifier]
    );
    if (!result.rows.length) {
      return res.status(400).json({ error: 'Invalid or expired OTP' });
    }

    const record = result.rows[0];
    if (record.attempts >= 5) {
      return res.status(429).json({ error: 'Too many failed attempts. Please request a new OTP.' });
    }

    const isValid = smsService.verifyOTPHash(cleanOtp, record.otp_hash) || (record.otp === cleanOtp);
    if (!isValid) {
      await pool.query('UPDATE otps SET attempts = attempts + 1 WHERE id = $1', [record.id]);
      return res.status(400).json({ error: 'Invalid OTP' });
    }

    const hash = await bcrypt.hash(newPassword, 10);
    if (isPhone) {
      await pool.query('UPDATE users SET password_hash=$1 WHERE phone = $2 OR phone = $3 OR phone = $4', [hash, identifier, '91' + identifier, '+91' + identifier]);
    } else {
      await pool.query('UPDATE users SET password_hash=$1 WHERE LOWER(email)=$2', [hash, identifier]);
    }
    await pool.query("DELETE FROM otps WHERE LOWER(email)=$1 AND purpose='customer_forgot_password'", [identifier]);

    res.json({ success: true, message: 'Password reset successfully' });
  } catch (err) {
    console.error('reset-password error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// POST /api/auth/login - Supports Registered Mobile Number OR Email Address + Password
router.post('/login', async (req, res) => {
  const { email, password, loginId } = req.body || {};
  const identifier = (loginId || email || '').trim();
  if (!identifier || !password) return res.status(400).json({ error: 'Mobile number or email address and password required' });

  try {
    const rawDigits = identifier.replace(/\D/g, '');
    const isPotentialPhone = rawDigits.length >= 10 && !identifier.includes('@');
    let result;

    if (isPotentialPhone) {
      const tenDigit = rawDigits.slice(-10);
      result = await pool.query(
        'SELECT * FROM users WHERE phone = $1 OR phone = $2 OR phone = $3 ORDER BY id DESC',
        [tenDigit, '91' + tenDigit, '+91' + tenDigit]
      );
    } else {
      const cleanEmail = identifier.toLowerCase();
      result = await pool.query('SELECT * FROM users WHERE LOWER(email) = $1 ORDER BY id DESC', [cleanEmail]);
    }

    if (!result.rows.length) return res.status(401).json({ error: 'Invalid credentials' });

    // Safely authenticate matching account across candidates (handling potential duplicate historical phones safely)
    let authenticatedUser = null;
    let hasUnverifiedMatch = false;

    for (const candidate of result.rows) {
      const isMatch = await bcrypt.compare(password, candidate.password_hash);
      if (isMatch) {
        if (!candidate.is_verified) {
          hasUnverifiedMatch = true;
          continue; // check if there is an active verified account matching credentials
        }
        authenticatedUser = candidate;
        break;
      }
    }

    if (!authenticatedUser && hasUnverifiedMatch) {
      return res.status(403).json({ error: 'Please verify your mobile number with the SMS OTP sent to your phone before logging in.' });
    }

    if (!authenticatedUser) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    const token = jwt.sign(
      { id: authenticatedUser.id, email: authenticatedUser.email, role: authenticatedUser.role },
      JWT_SECRET,
      { expiresIn: '7d' }
    );

    res.json({
      token,
      user: {
        id: authenticatedUser.id,
        name: authenticatedUser.name,
        email: authenticatedUser.email,
        phone: authenticatedUser.phone,
        role: authenticatedUser.role,
        referral_code: authenticatedUser.referral_code,
        wallet_balance: authenticatedUser.wallet_balance
      }
    });
  } catch (err) {
    console.error('Customer login error:', err);
    res.status(500).json({ error: 'Server error during login' });
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
    const ordersRes = await pool.query('SELECT * FROM orders WHERE user_id=$1 ORDER BY created_at DESC', [req.user.id]);
    const orderIds = ordersRes.rows.map(o => o.id);
    let shipments = [];
    if (orderIds.length > 0) {
      const shipmentsRes = await pool.query('SELECT * FROM vendor_shipments WHERE order_id = ANY($1)', [orderIds]);
      shipments = shipmentsRes.rows;
    }

    const orders = ordersRes.rows.map(order => {
      order.shipments = shipments.filter(s => s.order_id === order.id);
      return order;
    });

    res.json({ user: user.rows[0], addresses: addresses.rows, orders });
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
  const { 
    items, 
    address, 
    total, 
    subtotal = 0, 
    delivery_charge = 0, 
    platform_fee = 0, 
    discount_amount = 0, 
    cod_collectible_amount = 0, 
    coupon_code, 
    payment_method, 
    advance_paid,
    razorpay_payment_id,
    razorpay_order_id,
    razorpay_signature
  } = req.body;
  
  if (!items || items.length === 0) {
    return res.status(400).json({ error: 'Cart is empty' });
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // Duplicate order prevention: if this Razorpay payment ID already generated an order, return it safely
    if (razorpay_payment_id && typeof razorpay_payment_id === 'string' && razorpay_payment_id.trim().startsWith('pay_')) {
      const existing = await client.query('SELECT * FROM orders WHERE payment_id = $1', [razorpay_payment_id.trim()]);
      if (existing.rows.length > 0) {
        await client.query('COMMIT');
        return res.json({ success: true, order: existing.rows[0], duplicatePrevented: true });
      }
    }

    // Independently recalculate all order financials against the database
    const verified = await pricingService.verifyAndCalculateOrder({
      items,
      deliveryCharge: delivery_charge,
      couponCode: coupon_code,
      paymentMethod: payment_method || 'prepaid',
      client
    });

    const orderNumber = `ORD-${Date.now()}`;
    const itemsJson = JSON.stringify(verified.verifiedItems);
    const addressJson = JSON.stringify(address);
    const pMethod = verified.isCod ? 'cod' : 'prepaid';
    const paymentStatus = pMethod === 'cod' ? 'advance_paid' : 'completed';
    
    const result = await client.query(
      `INSERT INTO orders 
        (user_id, order_number, total, subtotal, delivery_charge, platform_fee, discount_amount, cod_collectible_amount, items, address, status, payment_method, advance_paid, payment_id, razorpay_order_id, razorpay_signature, payment_status)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17) RETURNING *`,
      [
        req.user.id, 
        orderNumber, 
        verified.grandTotal, 
        verified.productSubtotal, 
        verified.deliveryCharge, 
        verified.platformFee, 
        verified.discountAmount, 
        verified.collectibleAmount, 
        itemsJson, 
        addressJson, 
        'pending', 
        pMethod, 
        verified.advanceAmount,
        razorpay_payment_id || null,
        razorpay_order_id || null,
        razorpay_signature || null,
        paymentStatus
      ]
    );

    // Call reusable vendor accounting service for subscription commission, debt recovery & credit
    const vendorAccounting = await vendorAccountingService.processOrderVendorAccounting({
      orderNumber,
      verifiedItems: verified.verifiedItems,
      orderId: result.rows[0].id,
      paymentMethod: pMethod,
      client
    });

    // Fetch user email for customer confirmation
    const userRes = await client.query('SELECT email, referred_by FROM users WHERE id = $1', [req.user.id]);
    const userEmail = userRes.rows[0]?.email || address?.email;
    const referredBy = userRes.rows[0]?.referred_by;

    // Referral reward for the person who referred this customer (calculated from Admin customer_referral_percent)
    try {
      const referralAccountingService = require('../services/referralAccountingService');
      await referralAccountingService.recordCustomerOrderReward({
        orderNumber,
        customerId: req.user.id,
        orderTotal: total,
        client
      });
    } catch (refErr) {
      console.error('Order referral reward calculation error:', refErr);
    }

    await client.query('COMMIT');

    // Send emails asynchronously after transaction commit
    try {
      for (const [vid, vData] of Object.entries(vendorAccounting)) {
        const vendorRes = await pool.query('SELECT name, email FROM vendors WHERE id = $1', [vid]);
        if (vendorRes.rows[0]) {
          sendOrderEmailToVendor(vendorRes.rows[0].email, vendorRes.rows[0].name, orderNumber, vData.items, vData.grossAmount, address, pMethod);
        }
      }
      sendOrderEmailToAdmin(orderNumber, total, address, items, pMethod);
      sendOrderEmailToCustomer(userEmail, orderNumber, total, address, items, pMethod);
    } catch (emailErr) {
      console.warn('Non-blocking order email delivery error:', emailErr.message);
    }

    // Trigger push notifications asynchronously
    try {
      const pushNotificationService = require('../services/pushNotificationService');
      pushNotificationService.notifyOrderPlaced({
        orderNumber,
        customerId: req.user.id,
        vendorAccounting
      });
    } catch (pushErr) {
      console.warn('Non-blocking order push notification error:', pushErr.message);
    }

    res.json({ success: true, order: result.rows[0] });
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('Order placement error:', err);
    res.status(500).json({ error: 'Failed to place order' });
  } finally {
    client.release();
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

// POST /api/auth/delete-account
// Secure customer in-app account deletion compliant with Google Play & App Store policies
router.post('/delete-account', authMiddleware, async (req, res) => {
  const { password, reason } = req.body;
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // Fetch user details
    const userRes = await client.query('SELECT id, email, password_hash, role FROM users WHERE id=$1', [req.user.id]);
    if (!userRes.rows.length) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: 'User not found' });
    }
    const user = userRes.rows[0];

    // Admin accounts cannot be self-deleted via customer route
    if (user.role === 'admin') {
      await client.query('ROLLBACK');
      return res.status(403).json({ error: 'Admin accounts cannot be deleted here.' });
    }

    // Verify password if account has a password
    if (user.password_hash) {
      if (!password) {
        await client.query('ROLLBACK');
        return res.status(400).json({ error: 'Please enter your current password to confirm deletion.' });
      }
      const valid = await bcrypt.compare(password, user.password_hash);
      if (!valid) {
        await client.query('ROLLBACK');
        return res.status(400).json({ error: 'Incorrect password. Account deletion cancelled.' });
      }
    }

    // Check for active orders in progress
    const activeOrdersRes = await client.query(
      `SELECT order_number, status FROM orders 
       WHERE user_id = $1 AND status IN ('pending', 'processing', 'partially_shipped', 'shipped')`,
      [req.user.id]
    );
    if (activeOrdersRes.rows.length > 0) {
      const orderList = activeOrdersRes.rows.map(o => `${o.order_number} (${o.status})`).join(', ');
      await client.query('ROLLBACK');
      return res.status(400).json({
        error: `Cannot delete account while you have active orders in transit: ${orderList}. Please wait until delivery or cancel them before deleting your account.`
      });
    }

    // Check for open return requests
    const openReturnsRes = await client.query(
      `SELECT id, status FROM order_returns 
       WHERE customer_id = $1 AND status IN ('requested', 'approved', 'pickup_scheduled')`,
      [req.user.id]
    );
    if (openReturnsRes.rows.length > 0) {
      await client.query('ROLLBACK');
      return res.status(400).json({
        error: 'Cannot delete account while you have open return/refund requests. Please wait until they are completed.'
      });
    }

    // Delete personal non-financial data
    await client.query('DELETE FROM addresses WHERE user_id=$1', [req.user.id]);
    await client.query('DELETE FROM cart_items WHERE user_id=$1', [req.user.id]);
    await client.query('DELETE FROM user_saved_banks WHERE user_id=$1', [req.user.id]);
    await client.query('DELETE FROM otps WHERE email=$1', [user.email]);

    // Check if user has past order history or wallet transactions
    const pastOrdersRes = await client.query('SELECT COUNT(*) FROM orders WHERE user_id=$1', [req.user.id]);
    const hasOrderHistory = parseInt(pastOrdersRes.rows[0].count) > 0;

    if (hasOrderHistory) {
      // Anonymize user to satisfy privacy laws (right to be forgotten) while preserving statutory tax and financial ledger integrity
      const anonEmail = `deleted_usr_${req.user.id}_${Date.now()}@deleted.invalid`;
      await client.query(
        `UPDATE users 
         SET name = 'Deleted Customer',
             email = $1,
             phone = NULL,
             password_hash = NULL,
             avatar_url = NULL,
             referral_code = NULL,
             referred_by = NULL,
             wallet_balance = 0,
             is_verified = FALSE
         WHERE id = $2`,
        [anonEmail, req.user.id]
      );
    } else {
      // Safe to hard delete if no historical orders exist
      await client.query('DELETE FROM users WHERE id=$1', [req.user.id]);
    }

    await client.query('COMMIT');
    res.json({ success: true, message: 'Your account and personal data have been permanently deleted.' });
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('Account deletion error:', err);
    res.status(500).json({ error: 'Failed to process account deletion request.' });
  } finally {
    client.release();
  }
});

// GET /api/auth/me
router.get('/me', authMiddleware, async (req, res) => {
  try {
    const user = await pool.query(
      'SELECT id, name, email, phone, role, referral_code, wallet_balance FROM users WHERE id=$1',
      [req.user.id]
    );
    if (!user.rows.length) return res.status(404).json({ error: 'User not found' });
    res.json({ user: user.rows[0] });
  } catch (err) {
    res.status(500).json({ error: 'Server error' });
  }
});

// GET /api/auth/referrals - Customer Referral Data & History
router.get('/referrals', authMiddleware, async (req, res) => {
  try {
    const referralAccountingService = require('../services/referralAccountingService');
    const data = await referralAccountingService.getCustomerReferralData(req.user.id, pool);
    res.json({
      ...data,
      referrals: data.history,
      stats: {
        total: (data.metrics.total_vendor_referrals || 0) + (data.metrics.total_customer_referrals || 0),
        customers: data.metrics.total_customer_referrals || 0,
        vendors: data.metrics.total_vendor_referrals || 0,
        active: (data.metrics.active_referred_vendors || 0) + (data.metrics.active_referred_customers || 0)
      }
    });
  } catch (err) {
    console.error('Customer referrals endpoint error:', err);
    res.status(500).json({ error: err.message });
  }
});

// POST /api/auth/device-token - Register FCM Push Token for Customer
router.post('/device-token', authMiddleware, async (req, res) => {
  try {
    const { token, platform } = req.body;
    if (!token) return res.status(400).json({ error: 'Device token is required' });

    const pushNotificationService = require('../services/pushNotificationService');
    const saved = await pushNotificationService.saveDeviceToken({
      userId: req.user.id,
      token,
      platform: platform || 'android',
      appType: 'customer'
    });
    res.json({ success: true, token: saved });
  } catch (err) {
    console.error('Save customer device token error:', err);
    res.status(500).json({ error: 'Failed to save device token' });
  }
});

// DELETE /api/auth/device-token - Remove FCM Push Token for Customer
router.delete('/device-token', authMiddleware, async (req, res) => {
  try {
    const { token } = req.body;
    if (!token) return res.status(400).json({ error: 'Device token is required' });

    const pushNotificationService = require('../services/pushNotificationService');
    const result = await pushNotificationService.removeDeviceToken({
      userId: req.user.id,
      token,
      appType: 'customer'
    });
    res.json({ success: true, removed: result.removed });
  } catch (err) {
    console.error('Delete customer device token error:', err);
    res.status(500).json({ error: 'Failed to delete device token' });
  }
});

// ==========================================
// GOOGLE OAUTH 2.0 IMPLEMENTATION
// ==========================================

// Helper to determine redirect URI based on environment
function getGoogleRedirectUri(req) {
  const host = req.get('host') || '';
  if (host.includes('localhost') || host.includes('127.0.0.1')) {
    return 'http://localhost:5000/api/auth/google/callback';
  }
  return process.env.GOOGLE_REDIRECT_URI || 'https://api.swabhivar.com/api/auth/google/callback';
}

// 1. GET /api/auth/google - Initiate Google Login
router.get('/google', (req, res) => {
  const clientId = process.env.GOOGLE_CLIENT_ID;
  if (!clientId) {
    return res.status(500).json({ error: 'Google OAuth Client ID is not configured on server' });
  }

  const redirectUri = getGoogleRedirectUri(req);
  const host = req.get('host') || '';
  const defaultOrigin = (host.includes('localhost') || host.includes('127.0.0.1'))
    ? 'http://localhost:5173'
    : 'https://swabhivar.com';

  const origin = req.query.origin || defaultOrigin;
  const state = Buffer.from(JSON.stringify({ origin })).toString('base64');
  const scope = encodeURIComponent('openid profile email');

  const authUrl = `https://accounts.google.com/o/oauth2/v2/auth?client_id=${clientId}&redirect_uri=${encodeURIComponent(redirectUri)}&response_type=code&scope=${scope}&state=${encodeURIComponent(state)}&access_type=offline&prompt=select_account`;

  res.redirect(authUrl);
});

// 2. GET /api/auth/google/callback - Handle Google OAuth redirect
router.get('/google/callback', async (req, res) => {
  const { code, state, error } = req.query;

  let frontendOrigin = 'https://swabhivar.com';
  if (state) {
    try {
      const decoded = JSON.parse(Buffer.from(decodeURIComponent(state), 'base64').toString('utf8'));
      if (decoded.origin) frontendOrigin = decoded.origin;
    } catch (e) {
      console.warn('Could not decode state origin in Google OAuth:', e.message);
    }
  }

  if (error || !code) {
    console.error('Google OAuth cancelled or error:', error);
    return res.redirect(`${frontendOrigin}/login?error=${encodeURIComponent(error || 'Google login was cancelled')}`);
  }

  try {
    const clientId = process.env.GOOGLE_CLIENT_ID;
    const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
    const redirectUri = getGoogleRedirectUri(req);

    // Exchange auth code for tokens
    const tokenResponse = await axios.post('https://oauth2.googleapis.com/token', {
      code,
      client_id: clientId,
      client_secret: clientSecret,
      redirect_uri: redirectUri,
      grant_type: 'authorization_code'
    }, {
      headers: { 'Content-Type': 'application/json' }
    });

    const { access_token } = tokenResponse.data;

    // Fetch user profile from Google
    const profileResponse = await axios.get('https://www.googleapis.com/oauth2/v3/userinfo', {
      headers: { Authorization: `Bearer ${access_token}` }
    });

    const { email, name, picture } = profileResponse.data;
    if (!email) {
      return res.redirect(`${frontendOrigin}/login?error=${encodeURIComponent('No email associated with Google account')}`);
    }

    const cleanEmail = email.toLowerCase().trim();

    // Find or create customer user in database
    let userRow;
    const existing = await pool.query(
      'SELECT id, name, email, phone, role, is_verified, wallet_balance, avatar_url FROM users WHERE LOWER(email)=$1',
      [cleanEmail]
    );

    if (existing.rows.length > 0) {
      userRow = existing.rows[0];
      // Ensure verified is true and update avatar if missing
      if (!userRow.is_verified || (!userRow.avatar_url && picture)) {
        await pool.query(
          'UPDATE users SET is_verified=TRUE, avatar_url=COALESCE(avatar_url, $1) WHERE id=$2',
          [picture || null, userRow.id]
        );
      }
    } else {
      const randomPassword = await bcrypt.hash(Math.random().toString(36) + Date.now().toString(), 10);
      const referralCode = Math.random().toString(36).substring(2, 8).toLowerCase();
      const insertResult = await pool.query(
        `INSERT INTO users (name, email, phone, password_hash, is_verified, role, avatar_url, referral_code)
         VALUES ($1, $2, $3, $4, TRUE, 'user', $5, $6)
         RETURNING id, name, email, phone, role, is_verified, wallet_balance, avatar_url`,
        [name || 'Customer', cleanEmail, '', randomPassword, picture || null, referralCode]
      );
      userRow = insertResult.rows[0];
    }

    // Sign JWT token valid for 30 days
    const token = jwt.sign(
      { id: userRow.id, email: userRow.email, role: userRow.role || 'user' },
      JWT_SECRET,
      { expiresIn: '30d' }
    );

    const safeUser = {
      id: userRow.id,
      name: userRow.name || name || 'Customer',
      email: userRow.email,
      phone: userRow.phone || '',
      role: userRow.role || 'user',
      avatar_url: userRow.avatar_url || picture || null,
      wallet_balance: Number(userRow.wallet_balance || 0)
    };

    res.redirect(`${frontendOrigin}/login?token=${token}&user=${encodeURIComponent(JSON.stringify(safeUser))}`);
  } catch (err) {
    console.error('Google OAuth callback handler error:', err?.response?.data || err.message);
    res.redirect(`${frontendOrigin}/login?error=${encodeURIComponent('Failed to sign in with Google. Please try again.')}`);
  }
});

// 3. POST /api/auth/google/verify - Verify native Android ID Token (Direct)
router.post('/google/verify', async (req, res) => {
  try {
    const { idToken } = req.body;
    if (!idToken) return res.status(400).json({ error: 'idToken is required' });

    // Validate ID token directly via Google API
    const tokenInfoRes = await axios.get(`https://oauth2.googleapis.com/tokeninfo?id_token=${idToken}`);
    const { email, name, picture, aud } = tokenInfoRes.data;

    // Verify audience matches either Web or Android Client ID
    const validAudiences = [
      process.env.GOOGLE_CLIENT_ID,
      process.env.GOOGLE_ANDROID_CLIENT_ID
    ].filter(Boolean);

    if (validAudiences.length > 0 && !validAudiences.includes(aud)) {
      console.warn('Google token audience mismatch:', aud);
    }

    if (!email) {
      return res.status(400).json({ error: 'No email found in Google token' });
    }

    const cleanEmail = email.toLowerCase().trim();
    let userRow;
    const existing = await pool.query(
      'SELECT id, name, email, phone, role, is_verified, wallet_balance, avatar_url FROM users WHERE LOWER(email)=$1',
      [cleanEmail]
    );

    if (existing.rows.length > 0) {
      userRow = existing.rows[0];
      if (!userRow.is_verified) {
        await pool.query('UPDATE users SET is_verified=TRUE WHERE id=$1', [userRow.id]);
      }
    } else {
      const randomPassword = await bcrypt.hash(Math.random().toString(36) + Date.now().toString(), 10);
      const referralCode = Math.random().toString(36).substring(2, 8).toLowerCase();
      const insertResult = await pool.query(
        `INSERT INTO users (name, email, phone, password_hash, is_verified, role, avatar_url, referral_code)
         VALUES ($1, $2, $3, $4, TRUE, 'user', $5, $6)
         RETURNING id, name, email, phone, role, is_verified, wallet_balance, avatar_url`,
        [name || 'Customer', cleanEmail, '', randomPassword, picture || null, referralCode]
      );
      userRow = insertResult.rows[0];
    }

    const token = jwt.sign(
      { id: userRow.id, email: userRow.email, role: userRow.role || 'user' },
      JWT_SECRET,
      { expiresIn: '30d' }
    );

    res.json({
      success: true,
      token,
      user: {
        id: userRow.id,
        name: userRow.name || name,
        email: userRow.email,
        phone: userRow.phone || '',
        role: userRow.role || 'user',
        avatar_url: userRow.avatar_url || picture || null,
        wallet_balance: Number(userRow.wallet_balance || 0)
      }
    });
  } catch (err) {
    console.error('Google ID token verification error:', err?.response?.data || err.message);
    res.status(500).json({ error: 'Invalid Google authentication token' });
  }
});

module.exports = router;
module.exports.authMiddleware = authMiddleware;
