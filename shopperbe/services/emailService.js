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

/**
 * Sends customer notification email for return and refund lifecycle events
 */
async function sendReturnStatusEmail({ to, customerName, orderNumber, status, refundAmount, utr, remarks, rejectionReason, bankName, bankAccountMasked }) {
  if (!to) return null;
  const statusColors = {
    'Return Requested': '#f59e0b',
    'Return Approved': '#10b981',
    'Return Rejected': '#ef4444',
    'Return Shipped': '#6366f1',
    'Return Received': '#14b8a6',
    'Refund Processing': '#0284c7',
    'Refund Completed': '#059669'
  };
  const color = statusColors[status] || '#036e26';

  let subject = `Return Update: Order #${orderNumber} is now ${status}`;
  let headline = `Return Status: ${status}`;
  let extraHtml = '';

  if (status === 'Return Requested') {
    headline = 'Return Request Received';
    extraHtml = `
      <p style="color:#475569;font-size:14px;line-height:1.6;">We have received your return request for order <strong>#${orderNumber}</strong>. Your bank details for the refund have been safely recorded.</p>
      <div style="background:#f8fafc;border:1px solid #e2e8f0;border-radius:8px;padding:12px;margin:16px 0;">
        <p style="margin:0;font-size:13px;color:#334155;"><strong>Refund Destination:</strong> ${bankName || 'Bank'} (${bankAccountMasked || '••••'})</p>
      </div>
      <p style="color:#64748b;font-size:13px;">Our team will review your request shortly. You can track updates in the "My Orders" section of your app.</p>
    `;
  } else if (status === 'Return Approved') {
    headline = 'Return Request Approved';
    extraHtml = `
      <p style="color:#475569;font-size:14px;line-height:1.6;">Good news! Your return request for order <strong>#${orderNumber}</strong> has been approved.</p>
      <div style="background:#f0fdf4;border:1px solid #bbf7d0;border-radius:8px;padding:12px;margin:16px 0;">
        <p style="margin:0 0 6px;font-size:13px;color:#166534;"><strong>Approved Refund Amount:</strong> ₹${refundAmount ? parseFloat(refundAmount).toFixed(2) : '0.00'}</p>
        <p style="margin:0;font-size:12px;color:#166534;">Please hand over the product in original packaging or update shipping details in the app.</p>
      </div>
    `;
  } else if (status === 'Return Rejected') {
    headline = 'Return Request Update';
    extraHtml = `
      <p style="color:#475569;font-size:14px;line-height:1.6;">Your return request for order <strong>#${orderNumber}</strong> could not be approved at this time.</p>
      <div style="background:#fef2f2;border:1px solid #fecaca;border-radius:8px;padding:12px;margin:16px 0;">
        <p style="margin:0;font-size:13px;color:#991b1b;"><strong>Reason:</strong> ${rejectionReason || 'Item does not meet return eligibility criteria.'}</p>
      </div>
    `;
  } else if (status === 'Refund Processing') {
    headline = 'Refund Processing Initiated';
    extraHtml = `
      <p style="color:#475569;font-size:14px;line-height:1.6;">Your returned item has been verified, and refund processing of <strong>₹${refundAmount ? parseFloat(refundAmount).toFixed(2) : '0.00'}</strong> has begun to your bank account.</p>
      <p style="color:#64748b;font-size:13px;">The amount will be credited via direct bank transfer (NEFT/IMPS/RTGS). You will receive the bank reference (UTR) once completed.</p>
    `;
  } else if (status === 'Refund Completed') {
    subject = `Refund Completed: ₹${refundAmount} credited for Order #${orderNumber}`;
    headline = 'Refund Successfully Completed';
    extraHtml = `
      <p style="color:#475569;font-size:14px;line-height:1.6;">Your refund for order <strong>#${orderNumber}</strong> has been successfully transferred to your bank account.</p>
      <div style="background:#f0fdf4;border:1px solid #bbf7d0;border-radius:8px;padding:16px;margin:16px 0;">
        <p style="margin:0 0 6px;font-size:15px;color:#166534;font-weight:700;">Refund Amount: ₹${refundAmount ? parseFloat(refundAmount).toFixed(2) : '0.00'}</p>
        <p style="margin:0 0 6px;font-size:13px;color:#166534;">Bank: <strong>${bankName || 'Bank'} (${bankAccountMasked || '••••'})</strong></p>
        <p style="margin:0 0 6px;font-size:13px;color:#166534;">Bank Transfer Ref / UTR: <strong style="font-family:monospace;background:#dcfce7;padding:2px 6px;border-radius:4px;">${utr || 'N/A'}</strong></p>
        ${remarks ? `<p style="margin:6px 0 0;font-size:12px;color:#166534;">Remarks: ${remarks}</p>` : ''}
      </div>
      <p style="color:#64748b;font-size:12px;">Please allow up to 2-4 hours for your bank statement to reflect the credit.</p>
    `;
  } else {
    extraHtml = `
      <p style="color:#475569;font-size:14px;line-height:1.6;">Your return for order <strong>#${orderNumber}</strong> has been updated to: <strong>${status}</strong>.</p>
      ${remarks ? `<p style="color:#64748b;font-size:13px;">Note: ${remarks}</p>` : ''}
    `;
  }

  const html = `
    <div style="font-family:Helvetica,Arial,sans-serif;max-width:560px;margin:0 auto;padding:24px;border:1px solid #e2e8f0;border-radius:12px;background:#ffffff;">
      <div style="text-align:center;padding-bottom:16px;border-bottom:1px solid #f1f5f9;margin-bottom:20px;">
        <h2 style="color:#036e26;margin:0 0 4px;font-size:22px;">Swabhivar Shoppers</h2>
        <span style="display:inline-block;padding:4px 12px;border-radius:20px;background:${color}15;color:${color};font-weight:700;font-size:12px;margin-top:6px;">
          ${status}
        </span>
      </div>
      <h3 style="color:#0f172a;margin:0 0 12px;font-size:18px;">${headline}</h3>
      <p style="color:#334155;font-size:14px;margin:0 0 16px;">Dear ${customerName || 'Customer'},</p>
      ${extraHtml}
      <hr style="border:none;border-top:1px solid #f1f5f9;margin:24px 0;" />
      <p style="color:#94a3b8;font-size:11px;text-align:center;margin:0;">Thank you for shopping with Swabhivar Shoppers. If you have any questions, reply directly to this email or visit our Support page.</p>
    </div>
  `;

  try {
    return await sendMail({
      to,
      subject,
      html,
      text: `${headline}\nOrder #${orderNumber}\nStatus: ${status}\n${remarks || ''}`
    });
  } catch (err) {
    console.warn(`[Email] Failed to send return status email to ${to}:`, err.message);
    return null;
  }
}

module.exports = {
  getSmtpCredentials,
  createTransporter,
  verifySmtpConnection,
  sendMail,
  sendTestEmail,
  sendReturnStatusEmail
};

