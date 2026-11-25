const router = require('express').Router();
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const pool = require('../db');
const nodemailer = require('nodemailer');
const Razorpay = require('razorpay');
const emailService = require('../services/emailService');
const smsService = require('../services/smsService');

const transporter = {
  sendMail: (options) => emailService.sendMail(options)
};

function generateOTP() {
  return Math.floor(100000 + Math.random() * 900000).toString();
}

/**
 * Server-side payment verification helper
 */
async function verifyServerSidePayment(paymentId) {
  if (!paymentId || typeof paymentId !== 'string') return false;
  if (!paymentId.startsWith('pay_')) return false;

  // Prevent payment ID reuse across different vendor subscriptions!
  try {
    const dupCheck = await pool.query('SELECT id FROM vendor_subscriptions WHERE payment_id = $1', [paymentId]);
    if (dupCheck.rows.length > 0) {
      console.warn(`[Razorpay Security] Payment ID ${paymentId} has already been recorded in vendor_subscriptions.`);
      return false;
    }
  } catch (dbErr) {
    console.error('Error checking payment ID uniqueness:', dbErr.message);
  }

  if (process.env.RAZORPAY_KEY_ID && process.env.RAZORPAY_KEY_SECRET) {
    try {
      const razorpay = new Razorpay({
        key_id: process.env.RAZORPAY_KEY_ID,
        key_secret: process.env.RAZORPAY_KEY_SECRET,
      });
      const payment = await razorpay.payments.fetch(paymentId);
      if (payment && ['captured', 'authorized'].includes(payment.status)) {
        return true;
      }
      return false;
    } catch (err) {
      console.warn('Razorpay server-side payment fetch warning:', err.message);
      return false;
    }
  }
  return false;
}

async function sendVendorPasswordResetOTPEmail(email, otp, name) {
  const plainText = `Vendor Password Reset Request\n\nHi ${name},\n\nYour OTP to reset your password is: ${otp}\n\nThis OTP is valid for 10 minutes. Do not share it with anyone.`;
  await transporter.sendMail({
    from: `"Swabhivar Shoppers Vendor" <${process.env.EMAIL_USER}>`,
    to: email,
    subject: 'Vendor Password Reset OTP',
    text: plainText,
    html: `
      <div style="font-family:Arial,sans-serif;max-width:480px;margin:auto;padding:24px;border:1px solid #fe6603;border-radius:12px;">
        <h2 style="color:#fe6603;">Vendor Password Reset Request</h2>
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

// Registration - sends SMS OTP after Razorpay payment verification
router.post('/signup', async (req, res) => {
  const {
    name, store_name, store_image, email, phone, password, address,
    plan_id, payment_id, referral_code,
    pickup_contact_name, pickup_phone, pickup_address_line1, pickup_address_line2,
    pickup_landmark, pickup_city, pickup_state, pickup_pincode
  } = req.body;

  if (!email || !password || !store_name) return res.status(400).json({ error: 'Missing required fields' });
  if (!plan_id || !payment_id) return res.status(400).json({ error: 'Subscription payment required' });

  // 1. Strict server-side payment verification before OTP issuance
  const isPaymentValid = await verifyServerSidePayment(payment_id);
  if (!isPaymentValid) {
    return res.status(400).json({ error: 'Invalid, already used or unverified Razorpay payment ID. Please complete payment.' });
  }

  // 2. Validate mandatory Pickup Address
  if (!pickup_contact_name || !pickup_phone || !pickup_address_line1 || !pickup_city || !pickup_state || !pickup_pincode) {
    return res.status(400).json({ error: 'All mandatory pickup address fields must be provided (Contact person, Phone, Address Line 1, City, State, Pincode).' });
  }

  let cleanPrimaryPhone;
  try {
    cleanPrimaryPhone = smsService.formatIndianMobile(phone);
  } catch (err) {
    return res.status(400).json({ error: 'Invalid primary mobile number: ' + err.message });
  }

  let cleanPickupPhone;
  try {
    cleanPickupPhone = smsService.formatIndianMobile(pickup_phone);
  } catch (err) {
    return res.status(400).json({ error: 'Invalid pickup mobile number: ' + err.message });
  }

  const cleanPhone = cleanPrimaryPhone.slice(-10);
  const cleanEmail = email.trim().toLowerCase();

  const cleanPincode = String(pickup_pincode).trim();
  if (!/^\d{6}$/.test(cleanPincode)) {
    return res.status(400).json({ error: 'Invalid pincode. Please enter a valid 6-digit Indian postal code.' });
  }

  try {
    // Verify plan exists
    const planRes = await pool.query('SELECT * FROM subscription_plans WHERE id=$1 AND is_active=TRUE', [plan_id]);
    if (!planRes.rows.length) return res.status(400).json({ error: 'Invalid subscription plan' });

    const check = await pool.query('SELECT id, status FROM vendors WHERE LOWER(email) = $1', [cleanEmail]);
    if (check.rows.length > 0) {
      if (check.rows[0].status !== 'unverified') {
        return res.status(400).json({ error: 'Email already exists and is verified/pending.' });
      }
    }

    const password_hash = await bcrypt.hash(password, 10);
    const otp = generateOTP();
    const otpHash = smsService.hashOTP(otp);
    const expiresAt = new Date(Date.now() + 10 * 60 * 1000);

    // Validate referral code and prevent self-referrals
    let validReferralCode = null;
    if (referral_code && typeof referral_code === 'string') {
      const trimmedCode = referral_code.trim();
      const selfCheck = await pool.query(
        `SELECT id FROM vendors WHERE referral_code = $1 AND (LOWER(email) = $2 OR phone = $3 OR phone = $4)
         UNION
         SELECT id FROM users WHERE referral_code = $1 AND (LOWER(email) = $2 OR phone = $3 OR phone = $4)`,
        [trimmedCode, cleanEmail, cleanPhone, cleanPrimaryPhone]
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
        console.warn(`[Referral] Self-referral attempt blocked for vendor signup: ${cleanEmail}`);
      }
    }

    let vendorId;
    if (check.rows.length > 0) {
      vendorId = check.rows[0].id;
      const srPickupName = `vnd_${vendorId}_${cleanPincode}`;
      await pool.query(
        `UPDATE vendors 
         SET name=$1, store_name=$2, phone=$3, password_hash=$4, address=$5, 
             pending_plan_id=$6, pending_payment_id=$7, referred_by=COALESCE(referred_by, $9), 
             store_image=$10, pickup_contact_name=$11, pickup_phone=$12, pickup_address_line1=$13,
             pickup_address_line2=$14, pickup_landmark=$15, pickup_city=$16, pickup_state=$17,
             pickup_pincode=$18, shiprocket_pickup_name=$19
         WHERE LOWER(email)=$8`,
        [
          name, store_name, cleanPhone, password_hash, address,
          plan_id, payment_id, cleanEmail, validReferralCode, store_image,
          pickup_contact_name.trim(), cleanPickupPhone.slice(-10), pickup_address_line1.trim(),
          (pickup_address_line2 || '').trim(), (pickup_landmark || '').trim(),
          pickup_city.trim(), pickup_state.trim(), cleanPincode, srPickupName
        ]
      );
    } else {
      const insRes = await pool.query(
        `INSERT INTO vendors (
          name, store_name, email, phone, password_hash, address, status, 
          pending_plan_id, pending_payment_id, referral_code, referred_by, store_image,
          pickup_contact_name, pickup_phone, pickup_address_line1, pickup_address_line2,
          pickup_landmark, pickup_city, pickup_state, pickup_pincode
        ) VALUES (
          $1, $2, $3, $4, $5, $6, 'unverified', 
          $7, $8, $9, $10, $11,
          $12, $13, $14, $15, $16, $17, $18, $19
        ) RETURNING id`,
        [
          name, store_name, cleanEmail, cleanPhone, password_hash, address,
          plan_id, payment_id, Math.random().toString(36).substring(2, 8).toLowerCase(), validReferralCode, store_image,
          pickup_contact_name.trim(), cleanPickupPhone.slice(-10), pickup_address_line1.trim(),
          (pickup_address_line2 || '').trim(), (pickup_landmark || '').trim(),
          pickup_city.trim(), pickup_state.trim(), cleanPincode
        ]
      );
      vendorId = insRes.rows[0].id;
      const srPickupName = `vnd_${vendorId}_${cleanPincode}`;
      await pool.query('UPDATE vendors SET shiprocket_pickup_name = $1 WHERE id = $2', [srPickupName, vendorId]);
    }

    await pool.query(
      "DELETE FROM otps WHERE (LOWER(email)=$1 OR phone=$2) AND purpose='vendor_signup'",
      [cleanEmail, cleanPrimaryPhone]
    );
    await pool.query(
      "INSERT INTO otps (phone, email, otp, otp_hash, purpose, expires_at, attempts, last_sent_at) VALUES ($1,$2,$3,$4,'vendor_signup',$5,0,NOW())",
      [cleanPrimaryPhone, cleanEmail, otpHash, otpHash, expiresAt]
    );

    // Send SMS OTP via MSG91 Flow strictly to primary registration phone
    await smsService.sendVendorSignupOTP(cleanPrimaryPhone, otp);

    res.json({ success: true, message: 'OTP sent to your registered mobile number via SMS.' });
  } catch (err) {
    console.error('Vendor signup error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// Check Registration & Paid Status (Paid-Vendor Recovery by Email or Phone)
router.post('/check-registration', async (req, res) => {
  const { email, phone } = req.body;
  if (!email && !phone) return res.status(400).json({ error: 'Email or mobile number is required' });

  try {
    const cleanEmail = email ? email.trim().toLowerCase() : null;
    let cleanPhone = null;
    if (phone) {
      try {
        cleanPhone = smsService.formatIndianMobile(phone).slice(-10);
      } catch {}
    }

    const vRes = await pool.query(
      `SELECT id, name, email, phone, store_name, address, status, 
              pending_plan_id, pending_payment_id,
              pickup_contact_name, pickup_phone, pickup_address_line1, pickup_address_line2,
              pickup_landmark, pickup_city, pickup_state, pickup_pincode
       FROM vendors 
       WHERE ($1::text IS NOT NULL AND LOWER(email) = $1)
          OR ($2::text IS NOT NULL AND (phone = $2 OR pickup_phone = $2))
       ORDER BY id DESC LIMIT 1`,
      [cleanEmail, cleanPhone]
    );

    if (vRes.rows.length === 0) {
      return res.json({ exists: false });
    }

    const v = vRes.rows[0];
    if (v.status !== 'unverified') {
      return res.json({ exists: true, status: v.status, canLogin: true });
    }

    const isPaid = Boolean(v.pending_payment_id && v.pending_plan_id);

    return res.json({
      exists: true,
      status: v.status,
      isPaid,
      planId: v.pending_plan_id,
      paymentId: v.pending_payment_id,
      vendor: {
        name: v.name,
        email: v.email,
        phone: v.phone || v.pickup_phone,
        storeName: v.store_name,
        address: v.address,
        pickupContactName: v.pickup_contact_name,
        pickupPhone: v.pickup_phone,
        pickupAddressLine1: v.pickup_address_line1,
        pickupAddressLine2: v.pickup_address_line2,
        pickupLandmark: v.pickup_landmark,
        pickupCity: v.pickup_city,
        pickupState: v.pickup_state,
        pickupPincode: v.pickup_pincode,
      }
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Resend OTP with 60-second rate-limiting and server-side payment verification
router.post('/resend-otp', async (req, res) => {
  const { email, phone } = req.body;
  if (!email && !phone) {
    return res.status(400).json({ error: 'Email or phone is required' });
  }

  const cleanEmail = email ? email.trim().toLowerCase() : null;
  let cleanPhone = null;
  if (phone) {
    try {
      cleanPhone = smsService.formatIndianMobile(phone).slice(-10);
    } catch {}
  }

  try {
    const vRes = await pool.query(
      `SELECT id, name, phone, pickup_phone, email, status, pending_plan_id, pending_payment_id 
       FROM vendors 
       WHERE ($1::text IS NOT NULL AND LOWER(email) = $1)
          OR ($2::text IS NOT NULL AND (phone = $2 OR pickup_phone = $2))
       ORDER BY id DESC LIMIT 1`,
      [cleanEmail, cleanPhone]
    );

    if (vRes.rows.length === 0) {
      return res.status(404).json({ error: 'No vendor registration found.' });
    }

    const vendor = vRes.rows[0];

    if (vendor.status !== 'unverified') {
      return res.status(400).json({ error: 'This vendor account is already verified or approved. Please log in.' });
    }

    // Server-side payment check before resending OTP
    if (!vendor.pending_payment_id || !vendor.pending_plan_id) {
      return res.status(400).json({ error: 'Subscription payment required before requesting an OTP.' });
    }

    const isPaymentValid = await verifyServerSidePayment(vendor.pending_payment_id);
    if (!isPaymentValid) {
      return res.status(400).json({ error: 'Unverified or missing payment record. Please contact support.' });
    }

    const targetPhone = smsService.formatIndianMobile(vendor.phone || vendor.pickup_phone);

    // Rate limiting: 60-second cooldown check
    const recentOtpRes = await pool.query(
      "SELECT id, created_at, EXTRACT(EPOCH FROM (NOW() - last_sent_at)) as elapsed_sec FROM otps WHERE phone = $1 AND purpose = 'vendor_signup' AND last_sent_at > NOW() - INTERVAL '60 seconds' ORDER BY id DESC LIMIT 1",
      [targetPhone]
    );

    if (recentOtpRes.rows.length > 0) {
      const elapsed = Math.round(Number(recentOtpRes.rows[0].elapsed_sec) || 0);
      const waitTime = Math.max(1, 60 - elapsed);
      return res.status(429).json({
        error: `Please wait ${waitTime} seconds before requesting a new OTP.`,
        retryAfter: waitTime
      });
    }

    // Fresh 6-digit OTP with 10-minute expiry
    const otp = generateOTP();
    const otpHash = smsService.hashOTP(otp);
    const expiresAt = new Date(Date.now() + 10 * 60 * 1000);

    await pool.query(
      "DELETE FROM otps WHERE (LOWER(email) = $1 OR phone = $2) AND purpose = 'vendor_signup'",
      [vendor.email.toLowerCase(), targetPhone]
    );
    await pool.query(
      "INSERT INTO otps (phone, email, otp, otp_hash, purpose, expires_at, attempts, last_sent_at) VALUES ($1, $2, $3, $4, 'vendor_signup', $5, 0, NOW())",
      [targetPhone, vendor.email.toLowerCase(), otpHash, otpHash, expiresAt]
    );

    await smsService.sendVendorSignupOTP(targetPhone, otp);

    res.json({ success: true, message: 'A new OTP has been sent to your mobile number via SMS.' });
  } catch (err) {
    console.error('Resend OTP error:', err);
    res.status(500).json({ error: 'Failed to resend OTP: ' + err.message });
  }
});

// Verify OTP
router.post('/verify-otp', async (req, res) => {
  const { email, phone, otp } = req.body;
  if ((!email && !phone) || !otp) return res.status(400).json({ error: 'Mobile/Email and OTP required' });

  const cleanOtp = String(otp).trim();
  const cleanEmail = email ? email.trim().toLowerCase() : null;
  let cleanPhone = null;
  if (phone) {
    try {
      cleanPhone = smsService.formatIndianMobile(phone);
    } catch {}
  }

  try {
    const result = await pool.query(
      `SELECT * FROM otps 
       WHERE (($1::text IS NOT NULL AND phone = $1) OR ($2::text IS NOT NULL AND LOWER(email) = $2))
         AND purpose = 'vendor_signup' 
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

    // Get vendor with pending subscription info
    const vendorRes = await pool.query(
      `SELECT id, email, pending_plan_id, pending_payment_id 
       FROM vendors 
       WHERE ($1::text IS NOT NULL AND LOWER(email) = $1)
          OR ($2::text IS NOT NULL AND (phone = $2 OR pickup_phone = $2))
       ORDER BY id DESC LIMIT 1`,
      [cleanEmail, cleanPhone ? cleanPhone.slice(-10) : null]
    );

    if (!vendorRes.rows.length) return res.status(404).json({ error: 'Vendor record not found' });
    const vendor = vendorRes.rows[0];

    // Activate subscription if payment was made
    if (vendor && vendor.pending_plan_id && vendor.pending_payment_id) {
      const planRes = await pool.query('SELECT * FROM subscription_plans WHERE id=$1', [vendor.pending_plan_id]);
      if (planRes.rows.length) {
        const plan = planRes.rows[0];
        const expiresAt = new Date();
        expiresAt.setMonth(expiresAt.getMonth() + plan.months);
        await pool.query(
          `INSERT INTO vendor_subscriptions (vendor_id, plan_id, plan_name, months, amount, payment_id, starts_at, expires_at, features)
           VALUES ($1,$2,$3,$4,$5,$6,NOW(),$7,$8)`,
          [vendor.id, plan.id, plan.name, plan.months, plan.price, vendor.pending_payment_id, expiresAt, plan.features || {}]
        );
        await pool.query(
          'UPDATE vendors SET subscription_expires_at=$1, pending_plan_id=NULL, pending_payment_id=NULL WHERE id=$2',
          [expiresAt, vendor.id]
        );
      }
    }

    const vendorStatusRes = await pool.query('SELECT status FROM vendors WHERE id=$1', [vendor.id]);
    const wasUnverified = vendorStatusRes.rows[0]?.status === 'unverified';

    await pool.query("UPDATE vendors SET status='pending' WHERE id=$1", [vendor.id]);
    await pool.query('DELETE FROM otps WHERE id=$1', [record.id]);

    // Referral Reward Logic (calculated dynamically from Admin vendor_referral_percent on subscription amount)
    try {
      if (vendor && vendor.pending_plan_id && vendor.pending_payment_id && wasUnverified) {
        const planRes = await pool.query('SELECT price FROM subscription_plans WHERE id=$1', [vendor.pending_plan_id]);
        const subPrice = planRes.rows[0]?.price;
        if (subPrice && parseFloat(subPrice) > 0) {
          const referralAccountingService = require('../services/referralAccountingService');
          await referralAccountingService.recordVendorSubscriptionReward({
            vendorId: vendor.id,
            paymentId: vendor.pending_payment_id,
            subscriptionAmount: subPrice,
            client: pool
          });
        }
      }
    } catch (refErr) {
      console.error('Vendor subscription referral reward error:', refErr);
    }

    res.json({ success: true, message: 'Application verified. Awaiting admin approval.' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Login - Supports Registered Mobile Number OR Email Address + Password
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
      const phoneCandidates = [tenDigit, '91' + tenDigit, '+91' + tenDigit];
      result = await pool.query(
        'SELECT * FROM vendors WHERE phone = ANY($1::text[]) OR pickup_phone = ANY($1::text[]) ORDER BY id DESC',
        [phoneCandidates]
      );
    } else {
      const cleanEmail = identifier.toLowerCase();
      result = await pool.query('SELECT * FROM vendors WHERE LOWER(email) = $1 ORDER BY id DESC', [cleanEmail]);
    }

    if (result.rows.length === 0) return res.status(400).json({ error: 'Invalid credentials' });

    // Authenticate matching vendor account across candidates (handling potential duplicate phones safely)
    let authenticatedVendor = null;
    let restrictedVendor = null;

    for (const candidate of result.rows) {
      const isMatch = await bcrypt.compare(password, candidate.password_hash);
      if (isMatch) {
        if (candidate.status !== 'approved') {
          restrictedVendor = candidate;
          continue; // check if there is an approved account matching credentials
        }
        authenticatedVendor = candidate;
        break;
      }
    }

    // If an approved vendor matched, authenticate them
    if (authenticatedVendor) {
      const token = jwt.sign({ id: authenticatedVendor.id, role: 'vendor' }, process.env.JWT_SECRET, { expiresIn: '7d' });
      return res.json({
        token,
        vendor: {
          id: authenticatedVendor.id,
          name: authenticatedVendor.name,
          email: authenticatedVendor.email,
          store_name: authenticatedVendor.store_name
        }
      });
    }

    // If a restricted vendor matched their password, enforce appropriate restriction
    if (restrictedVendor) {
      if (restrictedVendor.status === 'pending') {
        return res.status(403).json({ error: 'The application is under review. Once admin approves you can login here.' });
      }
      if (restrictedVendor.status === 'rejected') {
        return res.status(403).json({ error: 'Your vendor application has been rejected by the admin.' });
      }
      if (restrictedVendor.status === 'unverified') {
        return res.status(403).json({ error: 'Please verify your mobile number via the SMS OTP sent during signup before logging in.' });
      }
      if (restrictedVendor.status === 'closed') {
        return res.status(403).json({ error: 'This vendor store has been deactivated and closed. Please contact administration to request reactivation.' });
      }
      return res.status(403).json({ error: `Vendor account status: ${restrictedVendor.status}. Login not allowed.` });
    }

    // No vendor matched password
    return res.status(400).json({ error: 'Invalid credentials' });
  } catch (err) {
    console.error('Vendor login error:', err);
    res.status(500).json({ error: err.message });
  }
});

// POST /api/vendorAuth/forgot-password (Preserved with existing Gmail SMTP)
router.post('/forgot-password', async (req, res) => {
  const { email } = req.body;
  if (!email) return res.status(400).json({ error: 'Email required' });

  const cleanEmail = email.trim().toLowerCase();

  try {
    const vendor = await pool.query('SELECT name FROM vendors WHERE LOWER(email)=$1', [cleanEmail]);
    if (!vendor.rows.length) return res.status(404).json({ error: 'Vendor not found with this email' });

    const otp = generateOTP();
    const otpHash = smsService.hashOTP(otp);
    const expiresAt = new Date(Date.now() + 10 * 60 * 1000);

    await pool.query("DELETE FROM otps WHERE LOWER(email)=$1 AND purpose='vendor_forgot_password'", [cleanEmail]);
    await pool.query(
      "INSERT INTO otps (email, otp, otp_hash, purpose, expires_at, attempts, last_sent_at) VALUES ($1,$2,$3,'vendor_forgot_password',$4, 0, NOW())",
      [cleanEmail, otpHash, otpHash, expiresAt]
    );

    await sendVendorPasswordResetOTPEmail(cleanEmail, otp, vendor.rows[0].name || 'Vendor');
    res.json({ success: true, message: 'OTP sent to your email' });
  } catch (err) {
    console.error('vendor forgot-password error:', err);
    res.status(500).json({ error: 'Server error sending password reset OTP' });
  }
});

// POST /api/vendorAuth/verify-reset-otp (Preserved with existing Gmail SMTP)
router.post('/verify-reset-otp', async (req, res) => {
  const { email, otp } = req.body;
  if (!email || !otp) return res.status(400).json({ error: 'Email and OTP required' });

  const cleanEmail = email.trim().toLowerCase();
  const cleanOtp = String(otp).trim();

  try {
    const otpRes = await pool.query(
      "SELECT * FROM otps WHERE LOWER(email)=$1 AND purpose='vendor_forgot_password' AND expires_at > NOW() ORDER BY id DESC LIMIT 1",
      [cleanEmail]
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
    console.error('vendor verify-reset-otp error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// POST /api/vendorAuth/reset-password (Preserved with existing Gmail SMTP)
router.post('/reset-password', async (req, res) => {
  const { email, otp, newPassword } = req.body;
  if (!email || !otp || !newPassword) return res.status(400).json({ error: 'Missing required fields' });

  if (typeof newPassword !== 'string' || newPassword.length < 6) {
    return res.status(400).json({ error: 'Password must be at least 6 characters' });
  }

  const cleanEmail = email.trim().toLowerCase();
  const cleanOtp = String(otp).trim();

  try {
    const result = await pool.query(
      "SELECT * FROM otps WHERE LOWER(email)=$1 AND purpose='vendor_forgot_password' AND expires_at > NOW() ORDER BY id DESC LIMIT 1",
      [cleanEmail]
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
    await pool.query('UPDATE vendors SET password_hash=$1 WHERE LOWER(email)=$2', [hash, cleanEmail]);
    await pool.query("DELETE FROM otps WHERE LOWER(email)=$1 AND purpose='vendor_forgot_password'", [cleanEmail]);

    res.json({ success: true, message: 'Password reset successfully' });
  } catch (err) {
    console.error('vendor reset-password error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// Auth Middleware for Vendors
const vendorAuthMiddleware = async (req, res, next) => {
  const token = req.headers.authorization?.split(' ')[1];
  if (!token) return res.status(401).json({ error: 'No token provided' });
  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    if (decoded.role !== 'vendor') return res.status(403).json({ error: 'Vendor access only' });

    // Check if vendor account has been closed/deactivated
    const vendorStatus = await pool.query('SELECT status FROM vendors WHERE id=$1', [decoded.id]);
    if (!vendorStatus.rows.length || vendorStatus.rows[0].status === 'closed') {
      return res.status(403).json({ error: 'Vendor account is closed. Access denied.' });
    }

    req.vendorId = decoded.id;
    next();
  } catch (err) {
    res.status(401).json({ error: 'Invalid token' });
  }
};

// Get current vendor
router.get('/me', vendorAuthMiddleware, async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT v.id, v.name, v.store_name, v.email, v.phone, v.address, v.status,
              v.wallet_balance, COALESCE(v.outstanding_debt, 0) as outstanding_debt,
              v.subscription_expires_at, v.created_at, v.referral_code,
              v.bank_account_holder_name, v.bank_account_number, v.bank_ifsc_code, v.bank_name,
              COALESCE(v.bank_verification_status, 'not_provided') as bank_verification_status,
              v.pickup_contact_name, v.pickup_phone, v.pickup_address_line1, v.pickup_address_line2,
              v.pickup_landmark, v.pickup_city, v.pickup_state, v.pickup_pincode, v.shiprocket_pickup_name,
              vs.plan_name, vs.months, vs.amount, vs.expires_at as sub_expires_at, vs.features as sub_features
       FROM vendors v
       LEFT JOIN LATERAL (
         SELECT plan_name, months, amount, expires_at, features
         FROM vendor_subscriptions
         WHERE vendor_id = v.id
         ORDER BY created_at DESC
         LIMIT 1
       ) vs ON true
       WHERE v.id = $1`,
      [req.vendorId]
    );
    if (result.rows.length === 0) return res.status(404).json({ error: 'Vendor not found' });
    res.json({ vendor: result.rows[0] });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = { router, vendorAuthMiddleware };
