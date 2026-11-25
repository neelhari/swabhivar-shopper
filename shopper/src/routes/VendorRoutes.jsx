import React from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import { VendorLayout } from '../components/vendor/VendorLayout';
import { VendorLoginPage } from '../pages/vendor/VendorLoginPage';
import { VendorSignupPage } from '../pages/vendor/VendorSignupPage';
import { VendorDashboardPage } from '../pages/vendor/VendorDashboardPage';
import { VendorProductsPage } from '../pages/vendor/VendorProductsPage';
import { VendorOrdersPage } from '../pages/vendor/VendorOrdersPage';
import { VendorCategoriesPage } from '../pages/vendor/VendorCategoriesPage';
import { VendorWalletPage } from '../pages/vendor/VendorWalletPage';
import { VendorProfilePage } from '../pages/vendor/VendorProfilePage';
import { VendorSupportPage } from '../pages/vendor/VendorSupportPage';
import { VendorOffersPage } from '../pages/vendor/VendorOffersPage';
import { VendorProductFormPage } from '../pages/vendor/VendorProductFormPage';
import { VendorReferralPage } from '../pages/vendor/VendorReferralPage';
import { VendorRevenuePage } from '../pages/vendor/VendorRevenuePage';
import { VendorReturnsPage } from '../pages/vendor/VendorReturnsPage';

export { VendorLoginPage, VendorSignupPage };

export function VendorSection() {
  return (
    <VendorLayout>
      <Routes>
        <Route path="/" element={<VendorDashboardPage />} />
        <Route path="products" element={<VendorProductsPage />} />
        <Route path="products/new" element={<VendorProductFormPage />} />
        <Route path="products/:id/edit" element={<VendorProductFormPage />} />
        <Route path="orders" element={<VendorOrdersPage />} />
        <Route path="returns" element={<VendorReturnsPage />} />
        <Route path="categories" element={<VendorCategoriesPage />} />
        <Route path="wallet" element={<VendorWalletPage />} />
        <Route path="profile" element={<VendorProfilePage />} />
        <Route path="support" element={<VendorSupportPage />} />
        <Route path="offers" element={<VendorOffersPage />} />
        <Route path="referrals" element={<VendorReferralPage />} />
        <Route path="revenue" element={<VendorRevenuePage />} />
      </Routes>
    </VendorLayout>
  );
}

export function VendorRoutes() {
  return (
    <Routes>
      <Route path="/" element={<Navigate to="/vendor-login" replace />} />
      <Route path="/vendor-login" element={<VendorLoginPage />} />
      <Route path="/vendor-signup" element={<VendorSignupPage />} />

      {/* Vendor — using VendorLayout */}
      <Route path="/vendor/*" element={<VendorSection />} />

      {/* Fallback */}
      <Route path="*" element={<Navigate to="/vendor-login" replace />} />
    </Routes>
  );
}
