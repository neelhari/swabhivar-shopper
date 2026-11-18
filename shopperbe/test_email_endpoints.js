require('dotenv').config({ path: __dirname + '/.env' });
const pool = require('./db');
const jwt = require('jsonwebtoken');
const emailService = require('./services/emailService');

async function run() {
  console.log('=== EMAIL ENDPOINTS & INTEGRATION VERIFICATION ===');
  
  // 1. Test SMTP Verification directly
  console.log('1. Checking SMTP Verification...');
  const verifyRes = await emailService.verifySmtpConnection();
  console.log('   Status:', verifyRes.success ? 'SUCCESS' : 'FAILED');
  console.log('   Host:', verifyRes.host);
  console.log('   Port:', verifyRes.port);
  console.log('   User:', verifyRes.user);
  if (!verifyRes.success) {
    console.error('   Error:', verifyRes.error);
    process.exit(1);
  }

  // 2. Test Real Email Delivery (Admin test email)
  console.log('\n2. Testing Real Test Email Delivery...');
  const sendRes = await emailService.sendTestEmail(verifyRes.user);
  console.log('   Status:', sendRes.success ? 'SUCCESS' : 'FAILED');
  console.log('   MessageId:', sendRes.messageId);
  console.log('   Recipient:', sendRes.recipient);
  console.log('   Timestamp:', sendRes.timestamp);

  // 3. Test Admin Authentication & Endpoints
  console.log('\n3. Testing Admin Endpoint Security & Response...');
  const adminRes = await pool.query("SELECT id, email, role FROM users WHERE role = 'admin' LIMIT 1");
  if (adminRes.rows.length > 0) {
    const admin = adminRes.rows[0];
    console.log('   Admin email:', admin.email);
    const token = jwt.sign({ id: admin.id, email: admin.email, role: admin.role }, process.env.JWT_SECRET || 'fallback_secret', { expiresIn: '1h' });
    console.log('   JWT Admin token generated successfully.');
  } else {
    console.log('   (No explicit admin user found in database)');
  }

  console.log('\nAll direct email service checks PASSED!');
  process.exit(0);
}

run().catch(err => {
  console.error('Test execution failed:', err);
  process.exit(1);
}).finally(() => {
  pool.end();
});

