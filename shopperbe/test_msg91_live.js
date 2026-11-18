require('dotenv').config({ path: __dirname + '/.env' });
const smsService = require('./services/smsService');

async function testMsg91() {
  console.log('Testing MSG91 Flow API with configured credentials...');
  console.log('Auth Key configured:', !!process.env.MSG91_AUTH_KEY);
  console.log('Template ID:', process.env.MSG91_TEMPLATE_ID);
  console.log('Sender ID:', process.env.SMS_SENDER_ID);
  
  // Test with standard 10-digit Indian test mobile
  const testPhone = '9999999999';
  const testOtp = '123456';
  
  try {
    const res = await smsService.sendCustomerSignupOTP(testPhone, testOtp);
    console.log('✅ MSG91 Live Test Response:', res);
  } catch (err) {
    console.error('❌ MSG91 Live Test Error:', err.message);
  }
}

testMsg91();
