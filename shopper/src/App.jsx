import React, { useState, useEffect } from 'react';
import { BrowserRouter } from 'react-router-dom';
import { SplashScreen } from './components/SplashScreen';
import { useStoreData } from './store/useStoreData';
import { ToastContainer } from 'react-toastify';
import 'react-toastify/dist/ReactToastify.css';
import { useAuthStore } from './store/useAuthStore';
import { useCartStore } from './store/useCartStore';
import { GlobalBackButtonListener } from './components/GlobalBackButtonListener';

import { CustomerRoutes } from './routes/CustomerRoutes';
import { VendorRoutes } from './routes/VendorRoutes';
import { AdminRoutes } from './routes/AdminRoutes';

function App() {
  const target = import.meta.env.VITE_APP_TARGET || 'customer';

  const isSpecialRoute = typeof window !== 'undefined' && (
    window.location.pathname.startsWith('/admin') ||
    window.location.pathname.startsWith('/admin-login') ||
    window.location.pathname.startsWith('/vendor') ||
    window.location.pathname.startsWith('/support') ||
    window.location.pathname.startsWith('/login') ||
    window.location.pathname.startsWith('/vendor-login') ||
    window.location.pathname.startsWith('/support-login')
  );

  const [showSplash, setShowSplash] = useState(() => {
    if (isSpecialRoute) return false;
    try {
      return !sessionStorage.getItem('splash_shown');
    } catch {
      return false;
    }
  });

  const { fetchData } = useStoreData();
  const { token } = useAuthStore();
  const { fetchCart, clearLocalCart } = useCartStore();

  useEffect(() => {
    if (showSplash) {
      try { sessionStorage.setItem('splash_shown', 'true'); } catch {}
      const timer = setTimeout(() => {
        setShowSplash(false);
      }, 1200);
      return () => clearTimeout(timer);
    }
  }, [showSplash]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  // Capture incoming referral parameters globally (?ref=... or ?referral=...)
  useEffect(() => {
    try {
      const params = new URLSearchParams(window.location.search);
      const ref = params.get('ref') || params.get('referral');
      if (ref) {
        localStorage.setItem('pending_referral_code', ref.trim());
      }
    } catch (e) {
      // Ignore in non-browser/restricted environments
    }
  }, []);

  useEffect(() => {
    if (target === 'customer') {
      if (token) {
        fetchCart();
      } else {
        clearLocalCart();
      }
    }
  }, [target, token, fetchCart, clearLocalCart]);

  return (
    <>
      {showSplash && <SplashScreen onComplete={() => setShowSplash(false)} />}
      <div style={{ opacity: showSplash ? 0 : 1 }} className="transition-opacity duration-300">
        <BrowserRouter>
          <GlobalBackButtonListener />
          {target === 'vendor' ? (
            <VendorRoutes />
          ) : target === 'admin' ? (
            <AdminRoutes />
          ) : (
            <CustomerRoutes />
          )}
        </BrowserRouter>
      </div>
      <ToastContainer position="bottom-right" />
    </>
  );
}

export default App;
