const fs = require('fs');
const path = require('path');
const pool = require('../db');

let messagingInstance = null;
let messagingInitialized = false;

function getMessagingService() {
  if (messagingInitialized) return messagingInstance;

  try {
    const { initializeApp, getApps, cert } = require('firebase-admin/app');
    const { getMessaging } = require('firebase-admin/messaging');

    const saPath = process.env.FIREBASE_SERVICE_ACCOUNT_PATH;
    if (!saPath) {
      console.warn('⚠️ [Push] FIREBASE_SERVICE_ACCOUNT_PATH not configured in .env. Push notifications disabled.');
      messagingInitialized = true;
      return null;
    }

    const resolvedPath = path.isAbsolute(saPath) ? saPath : path.resolve(process.cwd(), saPath);
    if (!fs.existsSync(resolvedPath)) {
      console.warn(`⚠️ [Push] Firebase service account file not found at: ${resolvedPath}. Push notifications disabled.`);
      messagingInitialized = true;
      return null;
    }

    const serviceAccount = JSON.parse(fs.readFileSync(resolvedPath, 'utf8'));

    const existingApps = getApps();
    const app = existingApps.length > 0 ? existingApps[0] : initializeApp({
      credential: cert(serviceAccount)
    });

    console.log('✅ [Push] Firebase Admin initialized successfully for project:', serviceAccount.project_id);
    messagingInstance = getMessaging(app);
    messagingInitialized = true;
    return messagingInstance;
  } catch (err) {
    console.error('❌ [Push] Failed to initialize Firebase Admin Messaging:', err.message);
    messagingInitialized = true;
    return null;
  }
}

/**
 * Save or update a device push token
 */
async function saveDeviceToken({ userId = null, vendorId = null, token, platform = 'android', appType }) {
  if (!token || !appType) {
    throw new Error('Device token and appType are required');
  }

  const query = `
    INSERT INTO device_tokens (user_id, vendor_id, token, platform, app_type, updated_at)
    VALUES ($1, $2, $3, $4, $5, NOW())
    ON CONFLICT (token) DO UPDATE SET
      user_id = EXCLUDED.user_id,
      vendor_id = EXCLUDED.vendor_id,
      platform = EXCLUDED.platform,
      app_type = EXCLUDED.app_type,
      updated_at = NOW()
    RETURNING id, token, app_type, platform;
  `;

  const res = await pool.query(query, [userId, vendorId, token.trim(), platform, appType]);
  return res.rows[0];
}

/**
 * Remove a device push token
 */
async function removeDeviceToken({ userId = null, vendorId = null, token, appType }) {
  if (!token) return { removed: false };

  const query = `
    DELETE FROM device_tokens 
    WHERE token = $1 
      AND ($2::int IS NULL OR user_id = $2)
      AND ($3::int IS NULL OR vendor_id = $3)
      AND ($4::varchar IS NULL OR app_type = $4)
    RETURNING id;
  `;

  const res = await pool.query(query, [token.trim(), userId, vendorId, appType || null]);
  return { removed: res.rowCount > 0 };
}

/**
 * Send push notification to multiple FCM registration tokens
 * Automatically cleans up invalid / unregistered tokens from the database.
 */
async function sendMulticastPush(tokens, { title, body, data = {} }) {
  if (!Array.isArray(tokens) || tokens.length === 0) return { successCount: 0, failureCount: 0 };

  const messaging = getMessagingService();
  if (!messaging) {
    console.log(`ℹ️ [Push] Simulated push notification to ${tokens.length} token(s): "${title}" - "${body}"`);
    return { successCount: 0, failureCount: 0, simulated: true };
  }

  // FCM data payload requires all string values
  const stringifiedData = {};
  for (const [key, val] of Object.entries(data)) {
    stringifiedData[key] = typeof val === 'object' ? JSON.stringify(val) : String(val);
  }

  const message = {
    tokens,
    notification: {
      title: String(title || ''),
      body: String(body || '')
    },
    data: stringifiedData,
    android: {
      priority: 'high',
      notification: {
        channelId: 'default',
        icon: 'ic_stat_notification',
        color: '#012980',
        sound: 'default'
      }
    }
  };

  try {
    const response = await messaging.sendEachForMulticast(message);
    console.log(`📢 [Push] Sent: ${response.successCount} succeeded, ${response.failureCount} failed out of ${tokens.length}`);

    // Clean up stale or invalid tokens
    const invalidTokens = [];
    if (response.failureCount > 0) {
      response.responses.forEach((resp, idx) => {
        if (!resp.success) {
          const errCode = resp.error?.code;
          const errMsg = String(resp.error?.message || '').toLowerCase();
          if (
            errCode === 'messaging/invalid-registration-token' ||
            errCode === 'messaging/registration-token-not-registered' ||
            errCode === 'messaging/mismatched-credential' ||
            (errCode === 'messaging/invalid-argument' && errMsg.includes('registration token'))
          ) {
            invalidTokens.push(tokens[idx]);
          }
        }
      });
    }

    if (invalidTokens.length > 0) {
      console.log(`🧹 [Push] Removing ${invalidTokens.length} obsolete device token(s) from database.`);
      await pool.query('DELETE FROM device_tokens WHERE token = ANY($1)', [invalidTokens]).catch(err => {
        console.error('Failed to clean up invalid tokens:', err.message);
      });
    }

    return response;
  } catch (err) {
    console.error('❌ [Push] sendEachForMulticast error:', err.message);
    return { successCount: 0, failureCount: tokens.length, error: err.message };
  }
}

/**
 * Send notification to a specific customer by user_id
 */
async function notifyCustomer(userId, { title, body, data = {} }) {
  if (!userId) return;
  try {
    const res = await pool.query(
      "SELECT token FROM device_tokens WHERE user_id = $1 AND app_type = 'customer'",
      [userId]
    );
    const tokens = res.rows.map(r => r.token).filter(Boolean);
    if (tokens.length === 0) return;
    return await sendMulticastPush(tokens, { title, body, data: { ...data, type: 'customer' } });
  } catch (err) {
    console.warn(`[Push] Failed to notify customer ${userId}:`, err.message);
  }
}

/**
 * Send notification to a specific vendor by vendor_id
 */
async function notifyVendor(vendorId, { title, body, data = {} }) {
  if (!vendorId) return;
  try {
    const res = await pool.query(
      "SELECT token FROM device_tokens WHERE vendor_id = $1 AND app_type = 'vendor'",
      [vendorId]
    );
    const tokens = res.rows.map(r => r.token).filter(Boolean);
    if (tokens.length === 0) return;
    return await sendMulticastPush(tokens, { title, body, data: { ...data, type: 'vendor' } });
  } catch (err) {
    console.warn(`[Push] Failed to notify vendor ${vendorId}:`, err.message);
  }
}

/**
 * Event: Order Placed
 * Notifies customer and all involved vendors
 */
async function notifyOrderPlaced({ orderNumber, customerId, vendorAccounting = {} }) {
  try {
    // 1. Notify Customer
    if (customerId) {
      notifyCustomer(customerId, {
        title: 'Order Confirmed! 🎉',
        body: `Your order #${orderNumber} has been placed successfully. Thank you for shopping with us!`,
        data: { orderNumber, screen: 'OrderDetails' }
      }).catch(e => console.warn('[Push] Order placed customer notify error:', e.message));
    }

    // 2. Notify Each Vendor involved in this order
    for (const [vendorId, vData] of Object.entries(vendorAccounting)) {
      const itemsCount = Array.isArray(vData?.items) ? vData.items.length : 1;
      notifyVendor(vendorId, {
        title: 'New Order Received! 📦',
        body: `You received an order #${orderNumber} with ${itemsCount} item(s). Please prepare for dispatch.`,
        data: { orderNumber, screen: 'VendorOrders' }
      }).catch(e => console.warn(`[Push] Order placed vendor ${vendorId} notify error:`, e.message));
    }
  } catch (err) {
    console.warn('[Push] notifyOrderPlaced non-blocking error:', err.message);
  }
}

/**
 * Event: Order Dispatched / Shipped
 */
async function notifyOrderDispatched({ orderNumber, customerId, trackingId = null, courier = null }) {
  try {
    if (!customerId) return;
    const trackingMsg = trackingId ? ` Tracking ID: ${trackingId}` : '';
    notifyCustomer(customerId, {
      title: 'Order Dispatched! 🚚',
      body: `Great news! Your order #${orderNumber} has been dispatched.${trackingMsg}`,
      data: { orderNumber, trackingId: trackingId || '', courier: courier || '', screen: 'OrderDetails' }
    }).catch(e => console.warn('[Push] Order dispatched notify error:', e.message));
  } catch (err) {
    console.warn('[Push] notifyOrderDispatched non-blocking error:', err.message);
  }
}

/**
 * Event: Order Delivered
 */
async function notifyOrderDelivered({ orderNumber, customerId }) {
  try {
    if (!customerId) return;
    notifyCustomer(customerId, {
      title: 'Order Delivered! 🎁',
      body: `Your order #${orderNumber} has been delivered. We hope you love your purchase!`,
      data: { orderNumber, screen: 'OrderDetails' }
    }).catch(e => console.warn('[Push] Order delivered notify error:', e.message));
  } catch (err) {
    console.warn('[Push] notifyOrderDelivered non-blocking error:', err.message);
  }
}

module.exports = {
  getMessagingService,
  saveDeviceToken,
  removeDeviceToken,
  sendMulticastPush,
  notifyCustomer,
  notifyVendor,
  notifyOrderPlaced,
  notifyOrderDispatched,
  notifyOrderDelivered
};

// Eagerly initialize Firebase Admin on module load if env configured
if (process.env.FIREBASE_SERVICE_ACCOUNT_PATH) {
  try {
    getMessagingService();
  } catch (e) {
    // Handled gracefully inside getMessagingService
  }
}

