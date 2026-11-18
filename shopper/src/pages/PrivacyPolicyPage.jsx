import React, { useEffect } from 'react';
import { Header } from '../components/Header';
import { ShieldCheck } from 'lucide-react';
import { motion } from 'framer-motion';

export function PrivacyPolicyPage() {
  useEffect(() => {
    window.scrollTo(0, 0);
  }, []);

  return (
    <div className="bg-[#f9f9f9] min-h-screen pb-20 md:pb-0 font-sans">
      <Header variant="back" title="Privacy Policy" />

      {/* Hero Section */}
      <div className="bg-[#012980] pt-12 pb-24 relative overflow-hidden">
        <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[600px] h-[300px] bg-brand-navy/20 blur-[100px] rounded-full pointer-events-none" />
        <div className="max-w-4xl mx-auto px-6 relative z-10 text-center">
          <motion.div initial={{ scale: 0 }} animate={{ scale: 1 }} className="w-16 h-16 rounded-full bg-brand-navy/20 flex items-center justify-center mx-auto mb-6 border border-brand-navy/30">
            <ShieldCheck className="w-8 h-8 text-brand-navy" />
          </motion.div>
          <motion.h1 initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }} className="text-3xl md:text-5xl font-extrabold text-white mb-4" style={{ fontFamily: 'Georgia, serif' }}>
            Privacy Policy
          </motion.h1>
          <motion.p initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.2 }} className="text-gray-300 text-lg">
            How we protect your data at SWABHIVAR SHOPPER
          </motion.p>
        </div>
      </div>

      {/* Content Section */}
      <div className="max-w-4xl mx-auto px-4 md:px-8 -mt-12 relative z-20 pb-24">
        <div className="bg-white rounded-3xl shadow-xl border border-gray-100 p-8 md:p-12 text-gray-700 leading-relaxed space-y-8">
          <p className="text-lg">
            At <strong>SWABHIVAR SHOPPER</strong>, we take your privacy seriously. This Privacy Policy explains how we collect, use, disclose, and safeguard your information when you visit our website or make a purchase.
          </p>

          <section>
            <h2 className="text-2xl font-bold text-[#012980] mb-4 font-serif">1. Information We Collect</h2>
            <p className="mb-3">We may collect information about you in a variety of ways. The information we may collect on the Site includes:</p>
            <ul className="list-disc pl-6 space-y-2">
              <li><strong>Personal Data:</strong> Personally identifiable information, such as your name, shipping address, email address, and telephone number.</li>
              <li><strong>Financial Data:</strong> Data related to your payment method (e.g., valid credit card number, card brand, expiration date) that we may collect when you purchase, order, return, exchange, or request information about our services from the Site.</li>
            </ul>
          </section>

          <section>
            <h2 className="text-2xl font-bold text-[#012980] mb-4 font-serif">2. Use of Your Information</h2>
            <p className="mb-3">Having accurate information about you permits us to provide you with a smooth, efficient, and customized experience. Specifically, we may use information collected about you via the Site to:</p>
            <ul className="list-disc pl-6 space-y-2">
              <li>Create and manage your account.</li>
              <li>Process your transactions and send you related information, including purchase confirmations and invoices.</li>
              <li>Fulfill and manage purchases, orders, payments, and other transactions related to the Site.</li>
            </ul>
          </section>

          <section>
            <h2 className="text-2xl font-bold text-[#012980] mb-4 font-serif">3. Third-Party Service Providers</h2>
            <p>We work with trusted third-party providers to deliver essential e-commerce operations. We share only the minimum information necessary for these partners to perform their functions:</p>
            <ul className="list-disc pl-6 space-y-2 mt-3">
              <li><strong>Razorpay:</strong> Processes secure credit/debit card, UPI, and net banking payments. All financial credentials are handled according to PCI-DSS standards. We never store raw credit card numbers or banking passwords on our servers.</li>
              <li><strong>Shiprocket:</strong> Handles automated courier assignment, tracking updates, and shipping delivery to your address. Contact name, mobile number, and destination address are provided for delivery fulfillment.</li>
              <li><strong>Cloud Storage & Hosting:</strong> Product images, user avatars, and media files are securely stored in cloud infrastructure with encrypted transport.</li>
              <li><strong>Legal Compliance:</strong> If required by Indian law, judicial summons, or law enforcement investigations, we may disclose records to protect safety, prevent fraud, and comply with statutory legal mandates.</li>
            </ul>
          </section>

          <section>
            <h2 className="text-2xl font-bold text-[#012980] mb-4 font-serif">4. Data Retention Policy</h2>
            <p className="mb-2">We retain your personal data for as long as your account remains active and as required to fulfill service commitments.</p>
            <p>When an account is deleted upon user request, personal identification details (name, email, phone number, saved delivery addresses, and payment profiles) are erased or irreversibly anonymized. However, completed sales invoices, order numbers, and tax transaction records are retained for the statutory period mandated by applicable commercial and taxation laws.</p>
          </section>

          <section>
            <h2 className="text-2xl font-bold text-[#012980] mb-4 font-serif">5. Account Deletion & Your Rights</h2>
            <p className="mb-3">You have the full right to delete your account and personal data at any time:</p>
            <ul className="list-disc pl-6 space-y-2">
              <li><strong>In-App Deletion:</strong> If logged into the application, navigate to <em>Profile / Account &rarr; Account Settings &rarr; Danger Zone</em> and select <strong>Delete My Account</strong>. You will be prompted to verify your identity before confirmation.</li>
              <li><strong>External Web Deletion (Browser):</strong> You can also submit an account deletion request without logging into the app by visiting our dedicated <a href="/delete-account" className="text-brand-navy font-bold underline">Account Deletion Request Page</a> and verifying via email OTP.</li>
            </ul>
            <p className="mt-3 text-sm text-gray-500">Note: Accounts with active orders currently out for delivery cannot be deleted until those orders have been delivered or cancelled.</p>
          </section>

          <section>
            <h2 className="text-2xl font-bold text-[#012980] mb-4 font-serif">6. Contact Us & Grievance Officer</h2>
            <p>If you have questions or comments about this Privacy Policy, please contact us at:</p>
            <div className="mt-4 p-6 bg-[#f9f9f9] rounded-2xl border border-gray-100">
              <p className="font-bold text-[#012980] mb-1">SWABHIVAR SHOPPER</p>
              <p className="text-gray-600 mb-1">1-1-738, Vinayaka temple road, Koratla, Telangana, India</p>
              <p className="text-gray-600 mb-1">Phone: +91 90326 75205</p>
              <p className="text-brand-navy font-medium">Email: swabhivarshoppers@gmail.com</p>
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}
