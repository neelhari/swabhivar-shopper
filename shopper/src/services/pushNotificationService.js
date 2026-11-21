import { Capacitor } from '@capacitor/core';
import { PushNotifications } from '@capacitor/push-notifications';
import api, { BACKEND_URL } from '../utils/api';

const TOKEN_STORAGE_KEY = 'fcm_device_token';

/**
 * Initialize and register push notifications
 * @param {'customer' | 'vendor'} appType
 * @param {Function} [onNotificationTap] - Callback when notification is tapped
 */
export async function registerPushNotifications(appType = 'customer', onNotificationTap) {
  if (!Capacitor.isNativePlatform()) {
    return;
  }

  try {
    // 1. Check and request permission (Required on Android 13+)
    let permStatus = await PushNotifications.checkPermissions();

    if (permStatus.receive === 'prompt') {
      permStatus = await PushNotifications.requestPermissions();
    }

    if (permStatus.receive !== 'granted') {
      console.warn('[Push] Notification permission not granted:', permStatus.receive);
      return;
    }

    // 2. Remove any previous listeners to avoid duplicates
    await PushNotifications.removeAllListeners();

    // 3. Listen for token registration
    await PushNotifications.addListener('registration', async (token) => {
      const fcmToken = token.value;
      if (!fcmToken) return;

      localStorage.setItem(TOKEN_STORAGE_KEY, fcmToken);

      try {
        if (appType === 'customer') {
          const customerToken = localStorage.getItem('token');
          if (customerToken) {
            await api.post('/auth/device-token', {
              token: fcmToken,
              platform: 'android'
            });
            console.log('✅ [Push] Customer device token registered with backend.');
          }
        } else if (appType === 'vendor') {
          const vendorToken = localStorage.getItem('vendor_token');
          if (vendorToken) {
            await fetch(`${BACKEND_URL}/vendor/device-token`, {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
                Authorization: `Bearer ${vendorToken}`
              },
              body: JSON.stringify({
                token: fcmToken,
                platform: 'android'
              })
            });
            console.log('✅ [Push] Vendor device token registered with backend.');
          }
        }
      } catch (err) {
        console.warn('[Push] Failed to register device token on backend:', err.message);
      }
    });

    // 4. Handle registration errors
    await PushNotifications.addListener('registrationError', (err) => {
      console.error('[Push] FCM Registration Error:', err.error);
    });

    // 5. Handle foreground notifications
    await PushNotifications.addListener('pushNotificationReceived', (notification) => {
      console.log('[Push] Notification received in foreground:', notification);
    });

    // 6. Handle notification tap / action
    await PushNotifications.addListener('pushNotificationActionPerformed', (notification) => {
      console.log('[Push] Notification action performed:', notification);
      if (typeof onNotificationTap === 'function') {
        onNotificationTap(notification);
      }
    });

    // 7. Register with FCM
    await PushNotifications.register();
  } catch (err) {
    console.error('[Push] Error in registerPushNotifications:', err);
  }
}

/**
 * Remove device push token on logout
 * @param {'customer' | 'vendor'} appType
 */
export async function unregisterPushNotifications(appType = 'customer') {
  if (!Capacitor.isNativePlatform()) {
    return;
  }

  const fcmToken = localStorage.getItem(TOKEN_STORAGE_KEY);

  if (fcmToken) {
    try {
      if (appType === 'customer') {
        const customerToken = localStorage.getItem('token');
        if (customerToken) {
          await api.delete('/auth/device-token', { data: { token: fcmToken } });
        }
      } else if (appType === 'vendor') {
        const vendorToken = localStorage.getItem('vendor_token');
        if (vendorToken) {
          await fetch(`${BACKEND_URL}/vendor/device-token`, {
            method: 'DELETE',
            headers: {
              'Content-Type': 'application/json',
              Authorization: `Bearer ${vendorToken}`
            },
            body: JSON.stringify({ token: fcmToken })
          });
        }
      }
      console.log('✅ [Push] Device token unregistered from backend.');
    } catch (err) {
      console.warn('[Push] Error deleting device token from backend:', err.message);
    } finally {
      localStorage.removeItem(TOKEN_STORAGE_KEY);
    }
  }

  try {
    await PushNotifications.removeAllListeners();
  } catch (e) {
    // Ignore listener removal errors
  }
}
