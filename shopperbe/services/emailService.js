const nodemailer = require('nodemailer');

function getSmtpCredentials() {
  const user = process.env.SMTP_USER || process.env.EMAIL_USER;
  const rawPass = process.env.SMTP_PASS || process.env.EMAIL_PASS || '';
  // Gmail App Passwords often contain spaces (e.g., 'xxxx xxxx xxxx xxxx')
  const pass = rawPass.replace(/\s+/g, '');
  const host = process.env.SMTP_HOST || 'smtp.gmail.com';
  const port = parseInt(process.env.SMTP_PORT || '587', 10);
  return { user, pass, host, port };
}

function createTransporter() {
  const { user, pass, host, port } = getSmtpCredentials();
  return nodemailer.createTransport({
    host,
    port,
    secure: port === 465, // false for 587 (STARTTLS)
    auth: { user, pass },
    tls: {
      rejectUnauthorized: true,
      minVersion: 'TLSv1.2'
    }
  });
}

/**
 * Verifies the SMTP handshake with the mail server
 * @returns {Promise<{success: boolean, message?: string, error?: string, user?: string}>}
 */
async function verifySmtpConnection() {
  const { user, host, port } = getSmtpCredentials();
  if (!user) {
    return { success: false, error: 'SMTP user / EMAIL_USER is not configured in .env' };
  }
  const transporter = createTransporter();
  try {
    await transporter.verify();
    return {
      success: true,
      message: 'SMTP connection handshake succeeded. Ready to send messages.',
      user,
      host,
      port,
      timestamp: new Date().toISOString()
    };
  } catch (err) {
    return {
      success: false,
      error: err.message || 'SMTP verification failed',
      user,
      host,
      port,
      timestamp: new Date().toISOString()
    };
  }
}

/**
 * Sends an email using configured SMTP transporter
 * @param {import('nodemailer').SendMailOptions} options 
 */
async function sendMail(options) {
  const { user } = getSmtpCredentials();
  const transporter = createTransporter();
  const mailOptions = {
    from: options.from || `"Swabhivar Shoppers" <${user}>`,
    ...options
  };
  return transporter.sendMail(mailOptions);
}

/**
 * Sends a real test email to verify end-to-end delivery
 * @param {string} recipient 
 */
async function sendTestEmail(recipient) {
  const { user, host, port } = getSmtpCredentials();
  const target = recipient || user;
  if (!target) {
    throw new Error('No recipient email specified for test email');
  }

  // First verify SMTP connection
  const verifyResult = await verifySmtpConnection();
  if (!verifyResult.success) {
    throw new Error(`SMTP handshake failed: ${verifyResult.error}`);
  }

  const now = new Date();
  const formattedTime = now.toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' });

  const mailOptions = {
    from: `"Swabhivar Shoppers" <${user}>`,
    to: target,
    subject: `Swabhivar Shoppers - Real SMTP Test (${formattedTime})`,
    html: `
      <div style="font-family:'Segoe UI',Arial,sans-serif;max-width:550px;margin:auto;padding:24px;border:1px solid #e2e8f0;border-radius:12px;background:#ffffff;">
        <div style="text-align:center;margin-bottom:20px;">
          <h2 style="color:#036e26;margin:0 0 6px;">Swabhivar Shoppers</h2>
          <p style="color:#64748b;font-size:13px;margin:0;">SMTP Mail Server Health Check</p>
        </div>
        <div style="background:#f0fdf4;border:1px solid #bbf7d0;border-radius:8px;padding:16px;margin-bottom:20px;">
          <p style="color:#166534;font-size:14px;font-weight:600;margin:0 0 8px;">✅ Gmail SMTP Connection Verified</p>
          <ul style="color:#166534;font-size:13px;margin:0;padding-left:20px;line-height:1.6;">
            <li>Host: <strong>${host}</strong></li>
            <li>Port: <strong>${port} (STARTTLS)</strong></li>
            <li>Sender: <strong>${user}</strong></li>
            <li>Recipient: <strong>${target}</strong></li>
            <li>Timestamp: <strong>${formattedTime} IST</strong></li>
          </ul>
        </div>
        <p style="color:#475569;font-size:13px;line-height:1.5;">This email confirms that the Gmail SMTP service and Google App Password integration are correctly configured and actively delivering emails for Swabhivar Shoppers.</p>
        <hr style="border:none;border-top:1px solid #edf2f7;margin:20px 0;" />
        <p style="color:#94a3b8;font-size:11px;text-align:center;margin:0;">Automated test message generated from Swabhivar Shoppers Admin Portal.</p>
      </div>
    `,
    text: `Swabhivar Shoppers - Gmail SMTP Connection Verified\n\nHost: ${host}:${port}\nSender: ${user}\nRecipient: ${target}\nTimestamp: ${formattedTime} IST\n\nThis confirms the SMTP setup is functioning correctly.`
  };

  const info = await sendMail(mailOptions);
  return {
    success: true,
    messageId: info.messageId,
    recipient: target,
    sender: user,
    timestamp: now.toISOString()
  };
}

module.exports = {
  getSmtpCredentials,
  createTransporter,
  verifySmtpConnection,
  sendMail,
  sendTestEmail
};

