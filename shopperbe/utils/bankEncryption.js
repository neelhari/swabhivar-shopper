const crypto = require('crypto');

// Derive 32-byte key using PBKDF2 / scrypt
function getEncryptionKey() {
  const secret = process.env.BANK_ENCRYPTION_KEY || process.env.JWT_SECRET || 'swabhivar-secure-bank-encryption-salt-2026';
  return crypto.scryptSync(secret, 'swabhivar_salt_bank_v1', 32);
}

/**
 * Encrypts a bank account number using AES-256-GCM
 * @param {string} text - Raw account number
 * @returns {string} iv:authTag:encryptedHex
 */
function encryptAccountNumber(text) {
  if (!text || typeof text !== 'string') {
    throw new Error('Valid account number string required for encryption');
  }
  const clean = text.trim();
  const iv = crypto.randomBytes(16);
  const cipher = crypto.createCipheriv('aes-256-gcm', getEncryptionKey(), iv);

  let encrypted = cipher.update(clean, 'utf8', 'hex');
  encrypted += cipher.final('hex');
  const authTag = cipher.getAuthTag().toString('hex');

  return `${iv.toString('hex')}:${authTag}:${encrypted}`;
}

/**
 * Decrypts an encrypted bank account number
 * @param {string} payload - iv:authTag:encryptedHex
 * @returns {string} plaintext account number
 */
function decryptAccountNumber(payload) {
  if (!payload || typeof payload !== 'string' || !payload.includes(':')) {
    throw new Error('Invalid encrypted bank account payload');
  }
  const parts = payload.split(':');
  if (parts.length !== 3) {
    throw new Error('Malformed encrypted payload format');
  }

  const [ivHex, authTagHex, encryptedHex] = parts;
  const iv = Buffer.from(ivHex, 'hex');
  const authTag = Buffer.from(authTagHex, 'hex');
  const decipher = crypto.createDecipheriv('aes-256-gcm', getEncryptionKey(), iv);
  decipher.setAuthTag(authTag);

  let decrypted = decipher.update(encryptedHex, 'hex', 'utf8');
  decrypted += decipher.final('utf8');

  return decrypted;
}

/**
 * Returns a masked representation of the bank account number
 * e.g. 123456789012 -> ••••••••9012
 * @param {string} account - Full account number or last 4 digits
 */
function maskAccountNumber(account) {
  if (!account) return '••••';
  const clean = String(account).trim();
  if (clean.length <= 4) return clean;
  const last4 = clean.slice(-4);
  return '••••••••' + last4;
}

/**
 * Validates Indian IFSC Code format (4 letters, 0, 6 letters/digits)
 * e.g. SBIN0001234, HDFC0000456
 */
function validateIFSC(ifsc) {
  if (!ifsc || typeof ifsc !== 'string') return false;
  return /^[A-Z]{4}0[A-Z0-9]{6}$/.test(ifsc.trim().toUpperCase());
}

/**
 * Validates Indian Bank Account Number format (9 to 18 digits)
 */
function validateAccountNumber(acc) {
  if (!acc || typeof acc !== 'string') return false;
  return /^\d{9,18}$/.test(acc.trim());
}

module.exports = {
  encryptAccountNumber,
  decryptAccountNumber,
  maskAccountNumber,
  validateIFSC,
  validateAccountNumber
};
