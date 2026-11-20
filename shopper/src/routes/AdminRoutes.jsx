import React from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';

import { AdminLayout } from '../components/admin/AdminLayout';
import { AdminLoginPage } from '../pages/admin/AdminLoginPage';
import { AdminDashboardPage } from '../pages/admin/AdminDashboardPage';
import { AdminProductsPage } from '../pages/admin/AdminProductsPage';
import { AdminProductFormPage } from '../pages/admin/AdminProductFormPage';
import { AdminOrdersPage } from '../pages/admin/AdminOrdersPage';
import { AdminCustomersPage } from '../pages/admin/AdminCustomersPage';
import { AdminBannersPage } from '../pages/admin/AdminBannersPage';
import { AdminCouponsPage } from '../pages/admin/AdminCouponsPage';
import { AdminReportsPage } from '../pages/admin/AdminReportsPage';
import { AdminCategoriesPage } from '../pages/admin/AdminCategoriesPage';
import { AdminVendorRequestsPage } from '../pages/admin/AdminVendorRequestsPage';
import { AdminVendorProfilesPage } from '../pages/admin/AdminVendorProfilesPage';
import { AdminVendorProductsPage } from '../pages/admin/AdminVendorProductsPage';
import { AdminVendorWalletsPage } from '../pages/admin/AdminVendorWalletsPage';
import { AdminVendorOrdersPage } from '../pages/admin/AdminVendorOrdersPage';
import { AdminSupportPage } from '../pages/admin/AdminSupportPage';
import { AdminSubscriptionsPage } from '../pages/admin/AdminSubscriptionsPage';
import { AdminOffersPage } from '../pages/admin/AdminOffersPage';
import { AdminAdvertisementsPage } from '../pages/admin/AdminAdvertisementsPage';
import { AdminProductRequestsPage } from '../pages/admin/AdminProductRequestsPage';
import { AdminReferralPayoutsPage } from '../pages/admin/AdminReferralPayoutsPage';
import { AdminReturnsPage } from '../pages/admin/AdminReturnsPage';
import { AdminSettingsPage } from '../pages/admin/AdminSettingsPage';

import { SupportLayout } from '../components/support/SupportLayout';
import { SupportLoginPage } from '../pages/support/SupportLoginPage';
import { SupportDashboardPage } from '../pages/support/SupportDashboardPage';
import { SupportOrdersPage } from '../pages/support/SupportOrdersPage';
import { SupportProductsPage } from '../pages/support/SupportProductsPage';
import { SupportCategoriesPage } from '../pages/support/SupportCategoriesPage';

import { VendorWalletPage } from '../pages/vendor/VendorWalletPage';
import { VendorProfilePage } from '../pages/vendor/VendorProfilePage';

export function AdminRoutes() {
  return (
    <Routes>
      <Route path="/" element={<Navigate to="/admin-login" replace />} />
      <Route path="/admin-login" element={<AdminLoginPage />} />
      <Route path="/support-login" element={<SupportLoginPage />} />

      {/* Admin — using AdminLayout */}
      <Route path="/admin/*" element={
        <AdminLayout>
          <Routes>
            <Route path="/" element={<AdminDashboardPage />} />
            <Route path="/orders" element={<AdminOrdersPage />} />
            <Route path="customers" element={<AdminCustomersPage />} />
            <Route path="products" element={<AdminProductsPage />} />
            <Route path="products/new" element={<AdminProductFormPage />} />
            <Route path="products/:id/edit" element={<AdminProductFormPage />} />
            <Route path="categories" element={<AdminCategoriesPage />} />
            <Route path="banners" element={<AdminBannersPage />} />
            <Route path="/coupons" element={<AdminCouponsPage />} />
            <Route path="/reports" element={<AdminReportsPage />} />
            <Route path="vendor-requests" element={<AdminVendorRequestsPage />} />
            <Route path="vendor-profiles" element={<AdminVendorProfilesPage />} />
            <Route path="vendor-products" element={<AdminVendorProductsPage />} />
            <Route path="vendor-wallets" element={<AdminVendorWalletsPage />} />
            <Route path="vendor-orders" element={<AdminVendorOrdersPage />} />
            <Route path="support" element={<AdminSupportPage />} />
            <Route path="subscriptions" element={<AdminSubscriptionsPage />} />
            <Route path="offers" element={<AdminOffersPage />} />
            <Route path="advertisements" element={<AdminAdvertisementsPage />} />
            <Route path="product-requests" element={<AdminProductRequestsPage />} />
            <Route path="payouts" element={<AdminReferralPayoutsPage />} />
            <Route path="returns" element={<AdminReturnsPage />} />
            <Route path="settings" element={<AdminSettingsPage />} />
          </Routes>
        </AdminLayout>
      } />

      {/* Support — using SupportLayout */}
      <Route path="/support/*" element={
        <SupportLayout>
          <Routes>
            <Route path="/" element={<SupportDashboardPage />} />
            <Route path="dashboard" element={<SupportDashboardPage />} />
            <Route path="orders" element={<SupportOrdersPage />} />
            <Route path="products" element={<SupportProductsPage />} />
            <Route path="categories" element={<SupportCategoriesPage />} />
            {/* Admin-scope support pages */}
            <Route path="customers" element={<AdminCustomersPage />} />
            <Route path="banners" element={<AdminBannersPage />} />
            <Route path="coupons" element={<AdminCouponsPage />} />
            <Route path="reports" element={<AdminReportsPage />} />
            <Route path="vendor-requests" element={<AdminVendorRequestsPage />} />
            <Route path="vendor-profiles" element={<AdminVendorProfilesPage />} />
            <Route path="vendor-products" element={<AdminVendorProductsPage />} />
            <Route path="vendor-wallets" element={<AdminVendorWalletsPage />} />
            <Route path="vendor-orders" element={<AdminVendorOrdersPage />} />
            <Route path="subscriptions" element={<AdminSubscriptionsPage />} />
            <Route path="offers" element={<AdminOffersPage />} />
            <Route path="advertisements" element={<AdminAdvertisementsPage />} />
            {/* Vendor-scope support pages */}
            <Route path="wallet" element={<VendorWalletPage />} />
            <Route path="profile" element={<VendorProfilePage />} />
          </Routes>
        </SupportLayout>
      } />

      {/* Fallback */}
      <Route path="*" element={<Navigate to="/admin-login" replace />} />
    </Routes>
  );
}
