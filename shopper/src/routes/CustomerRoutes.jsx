import React from 'react';
import { Routes, Route, useLocation } from 'react-router-dom';
import { AnimatePresence, motion } from 'framer-motion';
import { AppLayout } from '../components/AppLayout';

import { HomePage } from '../pages/HomePage';
import { CategoryListingPage } from '../pages/CategoryListingPage';
import { ProductDetailPage } from '../pages/ProductDetailPage';
import { CartPage } from '../pages/CartPage';
import { CheckoutPage } from '../pages/CheckoutPage';
import { OrderTrackingPage } from '../pages/OrderTrackingPage';
import { WishlistPage } from '../pages/WishlistPage';
import { ProfilePage } from '../pages/ProfilePage';
import { LoginPage } from '../pages/LoginPage';
import { SignupPage } from '../pages/SignupPage';
import { DashboardPage } from '../pages/DashboardPage';
import { AboutPage } from '../pages/AboutPage';
import { ContactPage } from '../pages/ContactPage';
import { MyOrdersPage } from '../pages/MyOrdersPage';
import { MyAddressesPage } from '../pages/MyAddressesPage';
import { AccountSettingsPage } from '../pages/AccountSettingsPage';
import { ShippingPolicyPage } from '../pages/ShippingPolicyPage';
import { ReturnsPolicyPage } from '../pages/ReturnsPolicyPage';
import { FAQPage } from '../pages/FAQPage';
import { CollectionPage } from '../pages/CollectionPage';
import { SearchPage } from '../pages/SearchPage';
import { OffersPage } from '../pages/OffersPage';
import { CouponsPage } from '../pages/CouponsPage';
import { PrivacyPolicyPage } from '../pages/PrivacyPolicyPage';
import { TermsPage } from '../pages/TermsPage';
import { DeleteAccountPage } from '../pages/DeleteAccountPage';
import { ReferPage } from '../pages/ReferPage';
import { WalletPage } from '../pages/WalletPage';
import { StorePage } from '../pages/StorePage';

function PageTransition({ children }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.15, ease: 'easeOut' }}
      className="w-full"
    >
      {children}
    </motion.div>
  );
}

function AnimatedAppRoutes() {
  const location = useLocation();
  return (
    <AnimatePresence mode="popLayout">
      <Routes location={location} key={location.pathname}>
        <Route path="/" element={<PageTransition><HomePage /></PageTransition>} />
        <Route path="/about" element={<PageTransition><AboutPage /></PageTransition>} />
        <Route path="/contact" element={<PageTransition><ContactPage /></PageTransition>} />
        <Route path="/shipping-policy" element={<PageTransition><ShippingPolicyPage /></PageTransition>} />
        <Route path="/returns-policy" element={<PageTransition><ReturnsPolicyPage /></PageTransition>} />
        <Route path="/privacy-policy" element={<PageTransition><PrivacyPolicyPage /></PageTransition>} />
        <Route path="/terms" element={<PageTransition><TermsPage /></PageTransition>} />
        <Route path="/faqs" element={<PageTransition><FAQPage /></PageTransition>} />
        <Route path="/search" element={<PageTransition><SearchPage /></PageTransition>} />
        <Route path="/offers" element={<PageTransition><OffersPage /></PageTransition>} />
        <Route path="/all-coupons" element={<PageTransition><CouponsPage /></PageTransition>} />
        <Route path="/refer" element={<PageTransition><ReferPage /></PageTransition>} />
        <Route path="/wallet" element={<PageTransition><WalletPage /></PageTransition>} />
        <Route path="/store/:storeId" element={<PageTransition><StorePage /></PageTransition>} />
        <Route path="/collection/:type" element={<PageTransition><CollectionPage /></PageTransition>} />
        <Route path="/category/:categoryId" element={<PageTransition><CategoryListingPage /></PageTransition>} />
        <Route path="/product/:id" element={<PageTransition><ProductDetailPage /></PageTransition>} />
        <Route path="/cart" element={<PageTransition><CartPage /></PageTransition>} />
        <Route path="/checkout" element={<PageTransition><CheckoutPage /></PageTransition>} />
        <Route path="/order-tracking/:orderId" element={<PageTransition><OrderTrackingPage /></PageTransition>} />
        <Route path="/wishlist" element={<PageTransition><WishlistPage /></PageTransition>} />
        <Route path="/profile" element={<PageTransition><ProfilePage /></PageTransition>} />
        <Route path="/dashboard" element={<PageTransition><DashboardPage /></PageTransition>} />
        <Route path="/my-orders" element={<PageTransition><MyOrdersPage /></PageTransition>} />
        <Route path="/my-addresses" element={<PageTransition><MyAddressesPage /></PageTransition>} />
        <Route path="/account-settings" element={<PageTransition><AccountSettingsPage /></PageTransition>} />
        <Route path="/delete-account" element={<PageTransition><DeleteAccountPage /></PageTransition>} />
      </Routes>
    </AnimatePresence>
  );
}

export function CustomerRoutes() {
  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route path="/signup" element={<SignupPage />} />
      <Route path="/*" element={
        <AppLayout>
          <AnimatedAppRoutes />
        </AppLayout>
      } />
    </Routes>
  );
}
