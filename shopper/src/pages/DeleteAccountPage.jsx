import React, { useState } from 'react';
import { ShieldAlert, CheckCircle, AlertTriangle, ArrowRight, RefreshCw, Mail, KeyRound } from 'lucide-react';
import api from '../utils/api';
import { Header } from '../components/Header';

export function DeleteAccountPage() {
  const [step, setStep] = useState(1); // 1 = enter email, 2 = enter otp, 3 = success
  const [email, setEmail] = useState('');
  const [otp, setOtp] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [msg, setMsg] = useState('');

  const handleRequestOtp = async (e) => {
    e.preventDefault();
    setError('');
    setMsg('');
    if (!email || !email.includes('@')) {
      setError('Please enter a valid email address.');
      return;
    }
    setLoading(true);
    try {
      const res = await api.post('/general/delete-account-request', { email });
      setMsg(res.data.message || 'Verification code sent to your email.');
      setStep(2);
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to send verification code. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const handleConfirmDeletion = async (e) => {
    e.preventDefault();
    setError('');
    setMsg('');
    if (!otp || otp.trim().length !== 6) {
      setError('Please enter the 6-digit verification code.');
      return;
    }
    setLoading(true);
    try {
      const res = await api.post('/general/delete-account-confirm', { email, otp });
      setMsg(res.data.message || 'Your account has been permanently deleted.');
      setStep(3);
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to delete account. Please verify the code.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col justify-between">
      <Header title="Account Deletion" />

      <main className="flex-1 max-w-xl w-full mx-auto px-4 py-8 md:py-12">
        <div className="bg-white rounded-3xl shadow-sm border border-gray-100 p-6 md:p-8">
          {/* Header */}
          <div className="text-center mb-6">
            <div className="w-14 h-14 rounded-2xl bg-red-50 text-red-600 flex items-center justify-center mx-auto mb-3 shadow-inner">
              <ShieldAlert className="w-7 h-7" />
            </div>
            <h1 className="text-xl md:text-2xl font-bold text-gray-900">Request Account Deletion</h1>
            <p className="text-xs md:text-sm text-gray-500 mt-1">
              Permanent removal of your Swabhivar Shoppers account and personal data
            </p>
          </div>

          {/* Policy Notice */}
          <div className="bg-amber-50 border border-amber-200 rounded-2xl p-4 mb-6 text-xs text-amber-900 space-y-2">
            <div className="flex items-start gap-2 font-semibold">
              <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
              <span>What happens when you delete your account:</span>
            </div>
            <ul className="list-disc pl-6 space-y-1 text-amber-800">
              <li>Your personal profile details, phone number, and saved delivery addresses will be permanently deleted.</li>
              <li>Your saved payment details and shopping cart will be wiped out.</li>
              <li>Active orders must be completed or cancelled before deletion can proceed.</li>
              <li>Legally mandated financial records (invoices and completed transaction history) are retained for statutory accounting and tax compliance.</li>
            </ul>
          </div>

          {error && (
            <div className="mb-5 p-3 rounded-xl bg-red-50 border border-red-200 text-xs text-red-700 font-medium">
              {error}
            </div>
          )}

          {msg && step !== 3 && (
            <div className="mb-5 p-3 rounded-xl bg-blue-50 border border-blue-200 text-xs text-blue-700 font-medium">
              {msg}
            </div>
          )}

          {/* Step 1: Enter Email */}
          {step === 1 && (
            <form onSubmit={handleRequestOtp} className="space-y-4">
              <div>
                <label className="text-xs font-bold text-gray-700 block mb-1.5 uppercase tracking-wide">
                  Registered Account Email
                </label>
                <div className="relative">
                  <Mail className="w-4 h-4 text-gray-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
                  <input
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="name@example.com"
                    required
                    className="w-full pl-10 pr-4 py-3 bg-gray-50 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-red-400 focus:bg-white transition-all"
                  />
                </div>
              </div>

              <button
                type="submit"
                disabled={loading}
                className="w-full bg-red-600 text-white font-bold py-3.5 rounded-xl text-sm hover:bg-red-700 transition-colors flex items-center justify-center gap-2 disabled:opacity-60 shadow-md shadow-red-200"
              >
                {loading ? (
                  <>
                    <RefreshCw className="w-4 h-4 animate-spin" /> Sending Verification Code...
                  </>
                ) : (
                  <>
                    Send Verification Code <ArrowRight className="w-4 h-4" />
                  </>
                )}
              </button>
            </form>
          )}

          {/* Step 2: Enter Verification Code */}
          {step === 2 && (
            <form onSubmit={handleConfirmDeletion} className="space-y-4">
              <div>
                <div className="flex justify-between items-center mb-1.5">
                  <label className="text-xs font-bold text-gray-700 uppercase tracking-wide">
                    6-Digit Verification Code
                  </label>
                  <button
                    type="button"
                    onClick={() => { setStep(1); setOtp(''); }}
                    className="text-xs text-brand-navy hover:underline"
                  >
                    Change Email
                  </button>
                </div>
                <div className="relative">
                  <KeyRound className="w-4 h-4 text-gray-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
                  <input
                    type="text"
                    maxLength={6}
                    value={otp}
                    onChange={(e) => setOtp(e.target.value.replace(/\D/g, ''))}
                    placeholder="Enter 6-digit code"
                    required
                    className="w-full pl-10 pr-4 py-3 bg-gray-50 border border-gray-200 rounded-xl text-sm tracking-widest font-mono text-center focus:outline-none focus:ring-2 focus:ring-red-400 focus:bg-white transition-all"
                  />
                </div>
                <p className="text-[11px] text-gray-500 mt-1.5">
                  Code sent to <strong>{email}</strong> (valid for 10 minutes)
                </p>
              </div>

              <button
                type="submit"
                disabled={loading}
                className="w-full bg-red-600 text-white font-bold py-3.5 rounded-xl text-sm hover:bg-red-700 transition-colors flex items-center justify-center gap-2 disabled:opacity-60 shadow-md shadow-red-200"
              >
                {loading ? (
                  <>
                    <RefreshCw className="w-4 h-4 animate-spin" /> Verifying & Deleting...
                  </>
                ) : (
                  'Permanently Delete Account'
                )}
              </button>

              <button
                type="button"
                onClick={handleRequestOtp}
                disabled={loading}
                className="w-full text-center text-xs text-gray-500 hover:text-gray-800 py-2"
              >
                Didn't receive the code? Resend
              </button>
            </form>
          )}

          {/* Step 3: Success Screen */}
          {step === 3 && (
            <div className="text-center py-6 space-y-4">
              <div className="w-16 h-16 rounded-full bg-green-50 text-green-600 flex items-center justify-center mx-auto">
                <CheckCircle className="w-8 h-8" />
              </div>
              <h2 className="text-xl font-bold text-gray-900">Account Deletion Complete</h2>
              <p className="text-xs md:text-sm text-gray-600 leading-relaxed">
                Your account and all associated personal data have been permanently removed. If you wish to shop with us again in the future, you may register a new account at any time.
              </p>
              <div className="pt-4">
                <a
                  href="/"
                  className="inline-block bg-brand-navy text-white text-xs font-bold px-6 py-3 rounded-xl hover:bg-blue-700 transition-colors"
                >
                  Return to Homepage
                </a>
              </div>
            </div>
          )}
        </div>

        <div className="mt-8 text-center text-xs text-gray-400">
          Swabhivar Shoppers &middot; <a href="/privacy-policy" className="hover:underline">Privacy Policy</a> &middot; <a href="/terms" className="hover:underline">Terms of Service</a>
        </div>
      </main>
    </div>
  );
}

