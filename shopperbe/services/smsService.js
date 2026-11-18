const axios = require('axios');
const crypto = require('crypto');

/**
 * Clean and format Indian mobile number to 91XXXXXXXXXX format required by MSG91
 * @param {string} phone 
 * @returns {string} 12-digit number starting with 91
 */
function formatIndianMobile(phone) {
  if (!phone || typeof phone !== 'string') {
    throw new Error('Mobile number is required');
  }
  let clean = phone.replace(/\D/g, '');
  // If user entered 11 digits starting with 0 (e.g. 09876543210)
  if (clean.length === 11 && clean.startsWith('0')) {
    clean = clean.substring(1);
  }
  // If user entered 10 digits (e.g. 9876543210)
  if (clean.length === 10) {
    clean = '91' + clean;
  }
  // Validate standard Indian mobile format: 91 followed by 6, 7, 8, or 9 and 9 digits
  if (!/^91[6-9]\d{9}$/.test(clean)) {
    throw new Error('Invalid mobile number. Please provide a valid 10-digit Indian mobile number.');
  }
  return clean;
}

/**
 * Mask mobile number for secure logging (e.g. +91 ******3210)
 * @param {string} formattedPhone 
 * @returns {string}
 */
function maskPhone(formattedPhone) {
  if (!formattedPhone || formattedPhone.length < 10) return '******';
  const last4 = formattedPhone.slice(-4);
  return `+91 ******${last4}`;
}

/**
 * Compute SHA-256 hash of an OTP for secure storage
 * @param {string|number} otp 
 * @returns {string} 64-char hex string
 */
function hashOTP(otp) {
  return crypto.createHash('sha256').update(String(otp).trim()).digest('hex');
}

/**
 * Verify a plain OTP against its stored SHA-256 hash
 * @param {string|number} plainOtp 
 * @param {string} storedHash 
 * @returns {boolean}
 */
function verifyOTPHash(plainOtp, storedHash) {
  if (!plainOtp || !storedHash) return false;
  const computed = hashOTP(plainOtp);
  // Constant-time comparison to prevent timing attacks
  try {
    return crypto.timingSafeEqual(Buffer.from(computed, 'hex'), Buffer.from(storedHash, 'hex'));
  } catch {
    return computed === storedHash;
  }
}

/**
 * Send an OTP SMS via MSG91 Flow API
 * @param {string} phone 
 * @param {string} otp 
 * @param {object} [customVars={}] 
 * @returns {Promise<{success: boolean, messageId?: string, raw?: any}>}
 */
async function sendMsg91FlowSMS(phone, otp, customVars = {}) {
  const authKey = process.env.MSG91_AUTH_KEY;
  const flowUrl = process.env.MSG91_FLOW_URL || 'https://control.msg91.com/api/v5/flow/';
  const templateId = process.env.MSG91_TEMPLATE_ID;

  if (!authKey || !templateId) {
    throw new Error('MSG91_AUTH_KEY or MSG91_TEMPLATE_ID is not configured in environment.');
  }

  const formattedPhone = formatIndianMobile(phone);
  const safePhoneLog = maskPhone(formattedPhone);

  // In MSG91 Flow API, variables defined in the DLT template (e.g. ##otp##, ##var##, ##code##)
  // are substituted from the recipient object keys.
  const recipientData = {
    mobiles: formattedPhone,
    otp: String(otp),
    var: String(otp),
    var1: String(otp),
    OTP: String(otp),
    code: String(otp),
    company: 'SWABHIVAR',
    ...customVars
  };

  const payload = {
    template_id: templateId,
    short_url: '0',
    recipients: [recipientData]
  };

  if (process.env.SMS_SENDER_ID) {
    payload.sender = process.env.SMS_SENDER_ID;
  }

  try {
    const response = await axios.post(flowUrl, payload, {
      headers: {
        authkey: authKey,
        'Content-Type': 'application/json',
        accept: 'application/json'
      },
      timeout: 15000
    });

    const data = response.data;

    // Check MSG91 response status
    if (data && (data.type === 'error' || data.hasError)) {
      console.error(`[SMS Service] MSG91 rejected dispatch to ${safePhoneLog}:`, data.message || data);
      throw new Error(data.message || 'MSG91 failed to send SMS OTP');
    }

    console.log(`[SMS Service] Successfully dispatched OTP to ${safePhoneLog} via MSG91 Flow.`);
    return {
      success: true,
      messageId: data.message || 'dispatched',
      raw: data
    };
  } catch (err) {
    const errorMsg = err.response?.data?.message || err.response?.data?.error || err.message;
    console.error(`[SMS Service] Dispatch error to ${safePhoneLog}:`, errorMsg);
    throw new Error(`Failed to send SMS OTP: ${errorMsg}`);
  }
}

/**
 * Send customer registration SMS OTP
 * @param {string} phone 
 * @param {string} otp 
 */
async function sendCustomerSignupOTP(phone, otp) {
  return sendMsg91FlowSMS(phone, otp, { flow_type: 'customer_signup' });
}

/**
 * Send vendor registration SMS OTP
 * @param {string} phone 
 * @param {string} otp 
 */
async function sendVendorSignupOTP(phone, otp) {
  return sendMsg91FlowSMS(phone, otp, { flow_type: 'vendor_signup' });
}

module.exports = {
  formatIndianMobile,
  maskPhone,
  hashOTP,
  verifyOTPHash,
  sendMsg91FlowSMS,
  sendCustomerSignupOTP,
  sendVendorSignupOTP
};
