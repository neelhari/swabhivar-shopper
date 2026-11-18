import { App } from '@capacitor/app';
import { Capacitor } from '@capacitor/core';

// Stack of active modal/drawer close callbacks (LIFO)
const modalStack = [];

// Single active page back handler (e.g., multi-step Checkout)
let activePageHandler = null;

/**
 * Register an open modal, popup, or drawer.
 * Returns an unregister function to call on unmount or close.
 */
export function registerModal(closeFn) {
  modalStack.push(closeFn);
  return () => {
    const idx = modalStack.lastIndexOf(closeFn);
    if (idx !== -1) {
      modalStack.splice(idx, 1);
    }
  };
}

/**
 * Register a page-level back action handler (e.g. for Checkout step transitions).
 * If the handler returns `true`, the back action is considered handled/consumed.
 * Returns an unregister function.
 */
export function registerPageBackHandler(handler) {
  activePageHandler = handler;
  return () => {
    if (activePageHandler === handler) {
      activePageHandler = null;
    }
  };
}

/**
 * Safe back navigation for on-screen Back buttons:
 * 1. Closes topmost modal/drawer if open.
 * 2. Invokes page-level handler if active and consumed.
 * 3. Navigates back in browser history if history exists.
 * 4. Falls back to fallbackPath (default: '/').
 */
export function navigateBackSafe(navigate, fallbackPath = '/') {
  // 1. Close open modal if any
  if (modalStack.length > 0) {
    const closeTopModal = modalStack.pop();
    try {
      closeTopModal();
      return;
    } catch (e) {
      console.warn('Error closing modal on back:', e);
    }
  }

  // 2. Delegate to active page back handler if any
  if (activePageHandler) {
    try {
      const handled = activePageHandler();
      if (handled) return;
    } catch (e) {
      console.warn('Error in active page back handler:', e);
    }
  }

  // 3. Fallback to router history or default path
  if (typeof window !== 'undefined' && window.history.state && window.history.state.idx > 0) {
    navigate(-1);
  } else if (typeof window !== 'undefined' && window.history.length > 1) {
    navigate(-1);
  } else {
    navigate(fallbackPath);
  }
}

/**
 * Centralized Android hardware and gesture back button handler.
 * Executed on Capacitor 'backButton' event.
 */
export function handleBackAction(navigate, currentPathname) {
  // 1. If any modal, drawer, or popup is open, close the topmost one first
  if (modalStack.length > 0) {
    const closeTopModal = modalStack.pop();
    try {
      closeTopModal();
      return true;
    } catch (e) {
      console.warn('Error closing modal on back:', e);
    }
  }

  // 2. If an active page handler exists (e.g. Checkout multi-step), let it handle
  if (activePageHandler) {
    try {
      const handled = activePageHandler();
      if (handled) return true;
    } catch (e) {
      console.warn('Error in page back handler:', e);
    }
  }

  // 3. If on root homepage, allow app to exit/minimize normally
  const normalizedPath = (currentPathname || '').replace(/\/$/, '') || '/';
  if (normalizedPath === '/' || normalizedPath === '/home') {
    if (Capacitor.isNativePlatform()) {
      try {
        App.exitApp();
      } catch (err) {
        console.warn('App.exitApp caught:', err);
      }
    }
    return true;
  }

  // 4. Otherwise navigate back in history with home fallback
  if (typeof window !== 'undefined' && window.history.state && window.history.state.idx > 0) {
    navigate(-1);
  } else if (typeof window !== 'undefined' && window.history.length > 1) {
    navigate(-1);
  } else {
    navigate('/');
  }
  return true;
}
