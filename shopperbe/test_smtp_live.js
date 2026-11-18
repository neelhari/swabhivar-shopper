const { verifySmtpConnection, sendMail } = require('/var/www/shoopp/shopperbe/services/emailService');
require('/var/www/shoopp/shopperbe/node_modules/dotenv').config({ path: '/var/www/shoopp/shopperbe/.env' });

async function check() {
  console.log('EMAIL_USER:', process.env.EMAIL_USER);
  console.log('EMAIL_PASS length:', (process.env.EMAIL_PASS || '').length);
  console.log('Testing SMTP connection handshake...');
  const res = await verifySmtpConnection();
  console.log('Verification result:', res);

  if (res.success) {
    console.log('Attempting to send a test email to swabhivarshopper@gmail.com...');
    try {
      const sendRes = await sendMail({
        from: `"Swabhivar Shoppers" <${process.env.EMAIL_USER}>`,
        to: 'swabhivarshopper@gmail.com',
        subject: 'Test SMTP Verification',
        text: 'This is a test to verify Gmail SMTP is working properly.'
      });
      console.log('Send result:', sendRes);
    } catch (sendErr) {
      console.error('Send error:', sendErr);
    }
  }
  process.exit(0);
}

check().catch(err => {
  console.error(err);
  process.exit(1);
});
