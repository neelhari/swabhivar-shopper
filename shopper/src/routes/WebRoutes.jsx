import React from 'react';
import { Routes, Route } from 'react-router-dom';
import { AppLayout } from '../components/AppLayout';
import { LoginPage, SignupPage, AnimatedAppRoutes } from './CustomerRoutes';
import { VendorLoginPage, VendorSignupPage, VendorSection } from './VendorRoutes';
import { AdminLoginPage, SupportLoginPage, AdminSection, SupportSection } from './AdminRoutes';

export function WebRoutes() {
  return (
    <Routes>
      {/* Auth routes without shell */}
      <Route path="/login" element={<LoginPage />} />
      <Route path="/signup" element={<SignupPage />} />
      <Route path="/vendor-login" element={<VendorLoginPage />} />
      <Route path="/vendor-signup" element={<VendorSignupPage />} />
      <Route path="/admin-login" element={<AdminLoginPage />} />
      <Route path="/support-login" element={<SupportLoginPage />} />

      {/* Portals */}
      <Route path="/vendor/*" element={<VendorSection />} />
      <Route path="/admin/*" element={<AdminSection />} />
      <Route path="/support/*" element={<SupportSection />} />

      {/* Customer store and pages with AppLayout */}
      <Route path="/*" element={
        <AppLayout>
          <AnimatedAppRoutes />
        </AppLayout>
      } />
    </Routes>
  );
}
