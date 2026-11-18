import React, { useState, useEffect } from 'react';
import { 
  Users, Copy, Gift, Share2, Store, ShoppingBag, 
  ShieldCheck, DollarSign, ArrowRight
} from 'lucide-react';
import { toast } from 'react-toastify';
import { Link } from 'react-router-dom';
import { useAuthStore } from '../../store/useAuthStore';
import api from '../../utils/api';
import { ShareReferralModal } from './ShareReferralModal';

export function ReferralView({ mode = 'auto' }) {
  const customerAuth = useAuthStore();
  const [profile, setProfile] = useState(null);
  const [history, setHistory] = useState([]);
  const [metrics, setMetrics] = useState({
    total_vendor_referrals: 0,
    total_customer_referrals: 0,
    active_referred_vendors: 0,
    total_referral_earnings: 0
  });
  const [loading, setLoading] = useState(true);
  const [shareModalOpen, setShareModalOpen] = useState(false);
  const [activeRole, setActiveRole] = useState('customer');

  useEffect(() => {
    const vendorToken = localStorage.getItem('vendor_token');
    const customerToken = customerAuth.token;

    let targetRole = 'customer';
    if (mode === 'vendor') {
      targetRole = 'vendor';
    } else if (mode === 'customer') {
      targetRole = 'customer';
    } else {
      if (customerToken) {
        targetRole = 'customer';
      } else if (vendorToken) {
        targetRole = 'vendor';
      } else {
        targetRole = 'customer';
      }
    }

    setActiveRole(targetRole);

    if (targetRole === 'customer') {
      if (!customerToken) {
        setLoading(false);
        return;
      }
      fetchCustomerReferralData();
    } else {
      if (!vendorToken) {
        setLoading(false);
        return;
      }
      fetchVendorReferralData();
    }
  }, [mode, customerAuth.token]);

  const fetchCustomerReferralData = async () => {
    setLoading(true);
    try {
      const [meRes, refRes] = await Promise.all([
        api.get('/auth/me').catch(() => null),
        api.get('/auth/referrals').catch(() => null)
      ]);

      if (meRes?.data?.user) {
        setProfile(meRes.data.user);
      } else if (customerAuth.user) {
        setProfile(customerAuth.user);
      }

      if (refRes?.data) {
        if (refRes.data.metrics) setMetrics(refRes.data.metrics);
        if (Array.isArray(refRes.data.history)) {
          setHistory(refRes.data.history);
        } else if (Array.isArray(refRes.data.referrals)) {
          setHistory(refRes.data.referrals);
        }
        if (refRes.data.referral_code && !profile?.referral_code) {
          setProfile(prev => ({ ...(prev || {}), referral_code: refRes.data.referral_code }));
        }
      }
    } catch (err) {
      console.error('Customer referral fetch error:', err);
      toast.error('Failed to load referral data');
    } finally {
      setLoading(false);
    }
  };

  const fetchVendorReferralData = async () => {
    setLoading(true);
    const token = localStorage.getItem('vendor_token');
    const headers = { 'Authorization': `Bearer ${token}` };

    try {
      const [walletRes, refRes] = await Promise.all([
        api.get('/vendorAuth/me', { headers }).catch(() => null),
        api.get('/vendor/referrals', { headers }).catch(() => null)
      ]);

      if (walletRes?.data?.vendor) {
        setProfile(walletRes.data.vendor);
      }

      if (refRes?.data) {
        if (refRes.data.metrics) setMetrics(refRes.data.metrics);
        if (Array.isArray(refRes.data.history)) {
          setHistory(refRes.data.history);
        } else if (Array.isArray(refRes.data.referrals)) {
          setHistory(refRes.data.referrals);
        }
      }
    } catch (err) {
      console.error('Vendor referral fetch error:', err);
      toast.error('Failed to load referral data');
    } finally {
      setLoading(false);
    }
  };

  const referralCode = profile?.referral_code || customerAuth.user?.referral_code || '';

  const copyCodeOnly = () => {
    if (referralCode) {
      navigator.clipboard.writeText(referralCode);
      toast.success('Referral code copied to clipboard!');
    } else {
      toast.error('No referral code available');
    }
  };

  const isCustomerLoggedIn = Boolean(customerAuth.token);
  const isVendorLoggedIn = Boolean(localStorage.getItem('vendor_token'));

  if (!isCustomerLoggedIn && !isVendorLoggedIn && activeRole === 'customer') {
    return (
      <div className="min-h-[70vh] flex items-center justify-center px-4 py-12">
        <div className="max-w-md w-full bg-white rounded-3xl p-8 border border-gray-100 shadow-xl text-center">
          <div className="w-16 h-16 bg-blue-50 text-brand-navy rounded-2xl flex items-center justify-center mx-auto mb-4 border border-blue-100">
            <Gift className="w-8 h-8 text-[#012980]" />
          </div>
          <h2 className="text-2xl font-extrabold text-gray-900 mb-2">Refer & Earn Rewards</h2>
          <p className="text-gray-600 text-sm mb-6 leading-relaxed">
            Invite friends to shop and earn lifetime commissions on their purchases, or invite vendors to sell on Shopper. Sign in to view your unique referral code, track referrals and withdraw your earnings!
          </p>
          <div className="space-y-3">
            <Link
              to="/login?redirect=/refer"
              className="w-full py-3.5 px-6 rounded-xl font-bold text-white bg-gradient-to-r from-[#012980] to-[#0240be] hover:opacity-95 transition shadow-md flex items-center justify-center gap-2"
            >
              <span>Login to Continue</span>
              <ArrowRight className="w-4 h-4" />
            </Link>
            <Link
              to="/signup"
              className="w-full py-3 px-6 rounded-xl font-bold text-gray-700 bg-gray-50 hover:bg-gray-100 transition border border-gray-200 block"
            >
              Create an Account
            </Link>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6 max-w-7xl mx-auto px-4 sm:px-6 py-6 pb-24">
      {/* Header */}
      <div>
        <h1 className="text-2xl sm:text-3xl font-extrabold text-gray-900 tracking-tight">Refer & Earn</h1>
        <p className="text-gray-500 mt-1 font-medium text-sm sm:text-base">
          Invite vendors or customers and earn rewards.
        </p>
      </div>

      {/* Main Referral Code Banner */}
      <div className="bg-gradient-to-br from-[#012980] via-[#012f8f] to-[#036e26] p-6 sm:p-8 rounded-[24px] text-white shadow-xl relative overflow-hidden group">
        <div className="absolute top-0 right-0 w-48 h-48 bg-white opacity-10 rounded-full -translate-y-1/2 translate-x-1/2 blur-2xl group-hover:scale-150 transition-transform duration-500"></div>
        
        <div className="relative z-10 flex flex-col md:flex-row md:items-center justify-between gap-6">
          <div className="max-w-xl">
            <div className="flex items-center gap-3 mb-2.5">
              <div className="p-2.5 bg-white/10 rounded-xl backdrop-blur-sm">
                <Gift className="w-6 h-6 text-white" />
              </div>
              <h2 className="text-xl sm:text-2xl font-bold">Your Referral Code</h2>
            </div>
            <p className="text-white/85 text-xs sm:text-sm leading-relaxed">
              Share this code with your network and earn commission on their successful signups and sales.
            </p>
          </div>
          
          <div className="flex items-center gap-3 bg-white/10 p-3 sm:p-4 rounded-2xl backdrop-blur-md border border-white/20 shrink-0">
            <span className="text-2xl sm:text-3xl font-extrabold tracking-widest px-4 font-mono">
              {loading ? '...' : (referralCode || 'N/A')}
            </span>
            
            <div className="flex items-center gap-2">
              <button 
                onClick={copyCodeOnly} 
                className="p-3 bg-white text-[#012980] rounded-xl hover:bg-gray-100 transition shadow-sm active:scale-95" 
                title="Copy Referral Code"
              >
                <Copy className="w-5 h-5" />
              </button>
              <button 
                onClick={() => setShareModalOpen(true)}
                className="p-3 bg-[#f97316] text-white rounded-xl hover:bg-[#ea580c] transition shadow-md active:scale-95 flex items-center justify-center font-bold" 
                title="Share Referral Links"
              >
                <Share2 className="w-5 h-5" />
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* 4 COMPACT STATISTIC CARDS */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3.5 sm:gap-4">
        {/* 1. Total Vendors */}
        <div className="bg-white p-4 rounded-2xl border border-gray-100 shadow-sm flex items-center gap-3.5">
          <div className="w-11 h-11 bg-orange-50 rounded-xl flex items-center justify-center text-orange-600 shrink-0 border border-orange-100/60">
            <Store className="w-5 h-5" />
          </div>
          <div>
            <p className="text-[11px] font-semibold text-gray-500 uppercase tracking-wider">Total Vendors</p>
            <h4 className="text-xl font-extrabold text-gray-900">{metrics.total_vendor_referrals || 0}</h4>
          </div>
        </div>

        {/* 2. Total Customers */}
        <div className="bg-white p-4 rounded-2xl border border-gray-100 shadow-sm flex items-center gap-3.5">
          <div className="w-11 h-11 bg-blue-50 rounded-xl flex items-center justify-center text-[#012980] shrink-0 border border-blue-100/60">
            <ShoppingBag className="w-5 h-5" />
          </div>
          <div>
            <p className="text-[11px] font-semibold text-gray-500 uppercase tracking-wider">Total Customers</p>
            <h4 className="text-xl font-extrabold text-gray-900">{metrics.total_customer_referrals || 0}</h4>
          </div>
        </div>

        {/* 3. Active Vendors */}
        <div className="bg-white p-4 rounded-2xl border border-gray-100 shadow-sm flex items-center gap-3.5">
          <div className="w-11 h-11 bg-amber-50 rounded-xl flex items-center justify-center text-amber-600 shrink-0 border border-amber-100/60">
            <ShieldCheck className="w-5 h-5" />
          </div>
          <div>
            <p className="text-[11px] font-semibold text-gray-500 uppercase tracking-wider">Active Vendors</p>
            <h4 className="text-xl font-extrabold text-gray-900">{metrics.active_referred_vendors || 0}</h4>
          </div>
        </div>

        {/* 4. Total Earnings */}
        <div className="bg-white p-4 rounded-2xl border border-gray-100 shadow-sm flex items-center gap-3.5">
          <div className="w-11 h-11 bg-emerald-50 rounded-xl flex items-center justify-center text-emerald-600 shrink-0 border border-emerald-100/60">
            <DollarSign className="w-5 h-5" />
          </div>
          <div>
            <p className="text-[11px] font-semibold text-gray-500 uppercase tracking-wider">Total Earnings</p>
            <h4 className="text-xl font-extrabold text-gray-900">₹{(metrics.total_referral_earnings || 0).toLocaleString()}</h4>
          </div>
        </div>
      </div>

      {/* REFERRED USERS LIST */}
      <div className="bg-white rounded-[24px] shadow-sm border border-gray-100 overflow-hidden">
        {/* Header */}
        <div className="px-6 py-4.5 border-b border-gray-100 flex items-center justify-between bg-white">
          <div className="flex items-center gap-2.5">
            <Users className="w-5 h-5 text-gray-700" />
            <h3 className="text-lg font-bold text-gray-900">Referred Users</h3>
          </div>
          <span className="text-xs font-semibold px-2.5 py-0.5 bg-gray-100 text-gray-600 rounded-full">
            {history.length} total
          </span>
        </div>

        {loading ? (
          <div className="p-10 text-center text-gray-400">Loading referrals...</div>
        ) : history.length === 0 ? (
          <div className="p-12 text-center text-gray-400">
            <Users className="w-14 h-14 mx-auto mb-3 text-gray-200" />
            <p className="text-gray-600 font-semibold text-base">No referrals yet</p>
            <p className="text-xs text-gray-400 mt-1 max-w-sm mx-auto">
              Share your referral code to invite vendors and customers to Shopper!
            </p>
          </div>
        ) : (
          <div className="divide-y divide-gray-100">
            {history.map((item, idx) => {
              const isVendor = item.referral_type === 'vendor';
              const displayName = isVendor
                ? (item.store_name ? `${item.store_name} (${item.name || 'Vendor'})` : (item.name || 'Vendor'))
                : (item.name || 'Customer');

              const subtext = [item.email, item.phone].filter(Boolean).join(' • ');
              const dateStr = item.registration_date 
                ? new Date(item.registration_date).toLocaleDateString('en-GB') 
                : (item.created_at ? new Date(item.created_at).toLocaleDateString('en-GB') : '');

              return (
                <div key={item.id || idx} className="p-4 sm:px-6 sm:py-4 flex items-center justify-between hover:bg-gray-50/60 transition-colors">
                  <div className="flex items-center gap-3 min-w-0">
                    <div className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 border ${
                      isVendor 
                        ? 'bg-orange-50 border-orange-100 text-orange-600' 
                        : 'bg-blue-50 border-blue-100 text-[#012980]'
                    }`}>
                      {isVendor ? <Store className="w-5 h-5" /> : <ShoppingBag className="w-5 h-5" />}
                    </div>
                    <div className="min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <h4 className="font-bold text-gray-900 text-sm truncate">{displayName}</h4>
                        <span className={`px-2 py-0.5 rounded-md text-[10px] font-bold uppercase tracking-wider ${
                          isVendor 
                            ? 'bg-orange-100 text-orange-700' 
                            : 'bg-blue-100 text-blue-700'
                        }`}>
                          {isVendor ? 'VENDOR' : 'CUSTOMER'}
                        </span>
                      </div>
                      {subtext && <p className="text-xs text-gray-500 mt-0.5 truncate">{subtext}</p>}
                    </div>
                  </div>

                  <div className="text-right shrink-0 pl-3">
                    <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-amber-50 text-amber-700 border border-amber-200">
                      {item.referral_status || 'Active'}
                    </span>
                    {dateStr && <p className="text-[11px] text-gray-400 mt-1">{dateStr}</p>}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* SHARE REFERRAL MODAL */}
      <ShareReferralModal
        isOpen={shareModalOpen}
        onClose={() => setShareModalOpen(false)}
        referralCode={referralCode}
      />
    </div>
  );
}
