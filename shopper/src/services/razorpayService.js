import { Capacitor, registerPlugin } from '@capacitor/core';

// Lazy-load the native plugin proxy
const NativeRazorpay = registerPlugin('NativeRazorpay');

/**
 * Loads the Razorpay checkout script if running in web browser
 */
export const loadRazorpayWeb = () => {
  return new Promise((resolve) => {
    if (typeof window !== 'undefined' && window.Razorpay) {
      return resolve(true);
    }
    const script = document.createElement('script');
    script.src = 'https://checkout.razorpay.com/v1/checkout.js';
    script.onload = () => resolve(true);
    script.onerror = () => resolve(false);
    document.body.appendChild(script);
  });
};

/**
 * Unified Razorpay checkout for both Native Android and Web
 * @param {Object} options Standard Razorpay options (key, amount, currency, order_id, handler, prefill, theme, etc.)
 */
export const openRazorpayCheckout = async (options) => {
  const isNative = Capacitor.isNativePlatform();

  if (isNative) {
    try {
      // Build options dictionary suitable for Native Android CheckoutActivity
      const nativeOptions = {
        key: options.key,
        amount: options.amount,
        currency: options.currency || 'INR',
        name: options.name || 'Tradition Store',
        description: options.description || '',
        order_id: options.order_id,
        prefill: {
          name: options.prefill?.name || '',
          email: options.prefill?.email || '',
          contact: options.prefill?.contact || ''
        },
        theme: {
          color: options.theme?.color || '#0b162c'
        }
      };

      if (options.notes) {
        nativeOptions.notes = options.notes;
      }

      // Launch native CheckoutActivity.
      // This allows Android to invoke UPI intent apps (PhonePe, GPay, Paytm, BHIM) directly without WebView blocking.
      const result = await NativeRazorpay.open({ options: nativeOptions });

      if (result && result.razorpay_payment_id) {
        if (typeof options.handler === 'function') {
          await options.handler(result);
        }
        return { success: true, ...result };
      } else {
        throw new Error('Payment was not completed');
      }
    } catch (err) {
      console.warn('Native Razorpay error/dismissal:', err);
      if (typeof options.modal?.ondismiss === 'function') {
        options.modal.ondismiss();
      }
      throw err;
    }
  } else {
    // Web browser fallback
    const loaded = await loadRazorpayWeb();
    if (!loaded) {
      throw new Error('Failed to load Razorpay payment SDK. Please check your internet connection.');
    }
    const rzp = new window.Razorpay(options);
    rzp.open();
    return { success: true };
  }
};
