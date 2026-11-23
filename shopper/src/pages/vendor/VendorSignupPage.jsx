import React, { useState, useEffect, useRef } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Mail, Lock, User, Phone, Store, ArrowRight, ShieldCheck, CheckCircle2, CreditCard, Tag, MapPin, Truck, XCircle } from 'lucide-react';
import { toast } from 'react-toastify';
import logo from '../../assets/logo.png';
import { useAuthStore } from '../../store/useAuthStore';
import { openRazorpayCheckout } from '../../services/razorpayService';

const BACKEND_URL = import.meta.env.VITE_BACKEND_URL || "http://localhost:5000/api";

const STEP_LABELS = ['Personal', 'Store', 'Plan', 'Verify'];

export function VendorSignupPage() {
  const navigate = useNavigate();
  const [step, setStep] = useState(1);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [plans, setPlans] = useState([]);
  const [loadingPlans, setLoadingPlans] = useState(true);
  const [selectedPlan, setSelectedPlan] = useState(null);
  const [paymentDone, setPaymentDone] = useState(false);
  const [paymentId, setPaymentId] = useState('');
  const [resendTimer, setResendTimer] = useState(60);
  const [resendingOtp, setResendingOtp] = useState(false);
  const [recoveredPaid, setRecoveredPaid] = useState(false);
  const isSubmittingRef = useRef(false);

  // 60-second countdown for Resend OTP on Step 4
  useEffect(() => {
    let interval = null;
    if (step === 4 && resendTimer > 0) {
      interval = setInterval(() => {
        setResendTimer(prev => (prev > 0 ? prev - 1 : 0));
      }, 1000);
    }
    return () => clearInterval(interval);
  }, [step, resendTimer]);

  const [storeImage, setStoreImage] = useState('');
  const [uploadingImage, setUploadingImage] = useState(false);
  const [formData, setFormData] = useState({
    firstName: '', lastName: '', email: '', phone: '',
    password: '', storeName: '', storeAddress: '', otp: '', referralCode: '',
    pickupContactName: '', pickupPhone: '', pickupAddressLine1: '', pickupAddressLine2: '',
    pickupLandmark: '', pickupCity: '', pickupState: '', pickupPincode: ''
  });

  // Auto-populate referral code from URL query parameter (e.g. /vendor-signup?ref=8w4q98)
  useEffect(() => {
    try {
      const params = new URLSearchParams(window.location.search);
      const ref = params.get('ref') || params.get('referral') || localStorage.getItem('pending_referral_code');
      if (ref) {
        setFormData(prev => ({ ...prev, referralCode: ref.trim() }));
      }
    } catch (e) {
      console.warn('Could not read referral code from URL:', e);
    }
  }, []);

  const [referrer, setReferrer] = useState({ status: 'idle', name: '' });

  useEffect(() => {
    const code = formData.referralCode;
    if (!code) {
      setReferrer({ status: 'idle', name: '' });
      return;
    }
    if (code.length < 3) return;

    setReferrer({ status: 'checking', name: '' });
    const timer = setTimeout(async () => {
      const res = await useAuthStore.getState().checkReferralCode(code);
      if (res.valid) {
        setReferrer({ status: 'valid', name: res.name });
      } else {
        setReferrer({ status: 'invalid', name: '' });
      }
    }, 500);
    return () => clearTimeout(timer);
  }, [formData.referralCode]);

  useEffect(() => {
    fetch(`${BACKEND_URL}/subscriptions/plans`)
      .then(r => r.json())
      .then(d => setPlans(d.plans || []))
      .catch(() => {})
      .finally(() => setLoadingPlans(false));
  }, []);

  const handleChange = (e) => setFormData(prev => ({ ...prev, [e.target.name]: e.target.value }));

  const handleImageUpload = async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    setUploadingImage(true);
    try {
      const fd = new FormData();
      fd.append('image', file);
      fd.append('folder', 'vendors');
      const res = await fetch(`${BACKEND_URL}/upload`, { method: 'POST', body: fd });
      const data = await res.json();
      if (data.url) {
        setStoreImage(data.url);
        toast.success('Store cover image uploaded successfully!');
      } else {
        toast.error(data.error || 'Failed to upload image');
      }
    } catch (err) {
      toast.error('Error uploading image');
    } finally {
      setUploadingImage(false);
    }
  };

  const handlePayment = async () => {
    if (!selectedPlan) return setError('Please select a plan');
    setError('');
    setLoading(true);
    try {
      const res = await fetch(`${BACKEND_URL}/subscriptions/create-order`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ plan_id: selectedPlan.id }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);

      const options = {
        key: data.key,
        amount: data.order.amount,
        currency: 'INR',
        name: 'Swabhivar Shoppers',
        description: `${selectedPlan.name} Vendor Subscription`,
        order_id: data.order.id,
        handler: async (response) => {
          const paidId = response.razorpay_payment_id;
          setPaymentId(paidId);
          setPaymentDone(true);
          toast.success('Payment verified! Sending verification OTP to your mobile number via SMS...');
          await submitVendorSignup(paidId);
        },
        prefill: { name: `${formData.firstName} ${formData.lastName}`, email: formData.email, contact: formData.phone },
        theme: { color: '#012980' },
      };
      await openRazorpayCheckout(options);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const submitVendorSignup = async (activePaymentId) => {
    if (isSubmittingRef.current) return;
    const finalPaymentId = activePaymentId || paymentId;
    if (!finalPaymentId) {
      setError('Please complete payment to continue');
      return;
    }
    if (!selectedPlan) {
      setError('Please select a subscription plan');
      return;
    }

    isSubmittingRef.current = true;
    setLoading(true);
    setError('');

    try {
      const payload = {
        name: `${formData.firstName} ${formData.lastName}`.trim(),
        email: formData.email.trim(),
        phone: formData.phone.trim(),
        password: formData.password,
        store_name: formData.storeName.trim(),
        address: formData.storeAddress.trim(),
        plan_id: selectedPlan.id,
        payment_id: finalPaymentId,
        referral_code: formData.referralCode,
        store_image: storeImage,
        pickup_contact_name: formData.pickupContactName.trim(),
        pickup_phone: formData.pickupPhone.trim(),
        pickup_address_line1: formData.pickupAddressLine1.trim(),
        pickup_address_line2: (formData.pickupAddressLine2 || '').trim(),
        pickup_landmark: (formData.pickupLandmark || '').trim(),
        pickup_city: formData.pickupCity.trim(),
        pickup_state: formData.pickupState.trim(),
        pickup_pincode: formData.pickupPincode.trim(),
      };

      const res = await fetch(`${BACKEND_URL}/vendorAuth/signup`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to sign up');

      toast.success(data.message || 'OTP sent to your registered mobile number via SMS!');
      setResendTimer(60);
      setStep(4);
    } catch (err) {
      setError(err.message);
      toast.error(err.message);
    } finally {
      setLoading(false);
      isSubmittingRef.current = false;
    }
  };

  const handleResendOtp = async () => {
    if (resendTimer > 0 || resendingOtp || loading) return;
    setResendingOtp(true);
    setError('');
    try {
      const res = await fetch(`${BACKEND_URL}/vendorAuth/resend-otp`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: formData.email.trim(), phone: formData.phone || formData.pickupPhone }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to resend OTP');
      toast.success(data.message || 'A fresh OTP has been sent to your mobile number via SMS.');
      setResendTimer(60);
    } catch (err) {
      setError(err.message);
      toast.error(err.message);
    } finally {
      setResendingOtp(false);
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');

    if (step === 1) {
      if (!formData.email || !formData.email.trim()) {
        return setError('Please enter your email address.');
      }
      // Check for existing paid application (Paid Vendor Recovery)
      try {
        const checkRes = await fetch(`${BACKEND_URL}/vendorAuth/check-registration`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ email: formData.email.trim(), phone: formData.phone }),
        });
        const checkData = await checkRes.json();
        if (checkData.exists && checkData.isPaid) {
          setPaymentId(checkData.paymentId);
          setPaymentDone(true);
          setRecoveredPaid(true);
          if (checkData.planId && plans.length > 0) {
            const foundPlan = plans.find(p => p.id === checkData.planId) || { id: checkData.planId, name: 'Selected Plan', price: 0 };
            setSelectedPlan(foundPlan);
          }
          if (checkData.vendor) {
            setFormData(prev => ({
              ...prev,
              storeName: prev.storeName || checkData.vendor.storeName || '',
              storeAddress: prev.storeAddress || checkData.vendor.address || '',
              pickupContactName: prev.pickupContactName || checkData.vendor.pickupContactName || '',
              pickupPhone: prev.pickupPhone || checkData.vendor.pickupPhone || '',
              pickupAddressLine1: prev.pickupAddressLine1 || checkData.vendor.pickupAddressLine1 || '',
              pickupAddressLine2: prev.pickupAddressLine2 || checkData.vendor.pickupAddressLine2 || '',
              pickupLandmark: prev.pickupLandmark || checkData.vendor.pickupLandmark || '',
              pickupCity: prev.pickupCity || checkData.vendor.pickupCity || '',
              pickupState: prev.pickupState || checkData.vendor.pickupState || '',
              pickupPincode: prev.pickupPincode || checkData.vendor.pickupPincode || '',
            }));
          }
          toast.info('Existing paid application detected. Payment restored without extra charge!');
        }
      } catch (checkErr) {
        console.warn('Could not check vendor paid status:', checkErr.message);
      }
      return setStep(2);
    }

    if (step === 2) {
      // Validate mandatory pickup address fields
      if (
        !formData.pickupContactName.trim() ||
        !formData.pickupPhone.trim() ||
        !formData.pickupAddressLine1.trim() ||
        !formData.pickupCity.trim() ||
        !formData.pickupState.trim() ||
        !formData.pickupPincode.trim()
      ) {
        return setError('Please fill all required Pickup Address fields (Contact Name, Phone, Address Line 1, City, State, Pincode).');
      }

      const cleanPhone = formData.pickupPhone.replace(/\D/g, '').slice(-10);
      if (!/^[6-9]\d{9}$/.test(cleanPhone)) {
        return setError('Please enter a valid 10-digit Indian mobile number for pickup contact.');
      }

      const cleanPincode = formData.pickupPincode.trim();
      if (!/^\d{6}$/.test(cleanPincode)) {
        return setError('Please enter a valid 6-digit Indian postal code (PIN code).');
      }

      return setStep(3);
    }

    if (step === 3) {
      if (!paymentDone) return setError('Please complete payment to continue');
      await submitVendorSignup(paymentId);
    }

    if (step === 4) {
      setLoading(true);
      try {
        const res = await fetch(`${BACKEND_URL}/vendorAuth/verify-otp`, {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ email: formData.email, phone: formData.phone || formData.pickupPhone, otp: formData.otp }),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || 'Failed to verify OTP');
        toast.success('Application verified! We will review and notify you once approved.');
        navigate('/vendor-login');
      } catch (err) {
        setError(err.message);
      } finally {
        setLoading(false);
      }
    }
  };

  return (
    <div className="min-h-screen bg-[#FDFBF7] flex items-center justify-center p-4 py-12">
      <div className="w-full max-w-xl">
        <div className="text-center mb-8">
          <Link to="/" className="inline-block mb-6">
            <img src={logo} alt="Swabhivar Shoppers" className="h-12 mx-auto mix-blend-multiply" />
          </Link>
          <div className="flex items-center justify-center gap-2 mb-2">
            <Store className="w-6 h-6 text-[#012980]" />
            <h1 className="text-3xl font-bold text-gray-900">Become a Vendor</h1>
          </div>
          <p className="text-gray-500">Apply to sell your products on Swabhivar Shoppers</p>
        </div>

        <div className="bg-white rounded-[32px] p-8 sm:p-10 shadow-[0_8px_30px_rgb(0,0,0,0.04)] border border-gray-100 relative overflow-hidden">
          <div className="absolute top-0 right-0 w-64 h-64 bg-gradient-to-br from-[#012980]/5 to-transparent rounded-full -translate-y-1/2 translate-x-1/2 blur-3xl pointer-events-none"></div>
          <div className="relative z-10">
          {/* Progress */}
          <div className="flex items-center justify-center mb-8 gap-1">
            {STEP_LABELS.map((label, i) => {
              const n = i + 1;
              const active = step >= n;
              return (
                <React.Fragment key={n}>
                  <div className="flex flex-col items-center gap-1">
                    <div className={`w-8 h-8 rounded-full flex items-center justify-center font-bold text-sm transition-colors ${active ? 'bg-[#012980] text-white' : 'bg-gray-100 text-gray-400'}`}>{n}</div>
                    <span className={`text-[10px] font-medium ${active ? 'text-[#012980]' : 'text-gray-400'}`}>{label}</span>
                  </div>
                  {i < STEP_LABELS.length - 1 && <div className={`w-8 sm:w-12 h-1 rounded-full mb-4 transition-colors ${step > n ? 'bg-[#012980]' : 'bg-gray-100'}`} />}
                </React.Fragment>
              );
            })}
          </div>

          {error && <div className="mb-5 p-4 bg-red-50 border border-red-200 text-red-600 rounded-xl text-sm">{error}</div>}

          <form onSubmit={handleSubmit} className="space-y-5">
            {/* Step 1 — Personal */}
            {step === 1 && (
              <div className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  {['firstName', 'lastName'].map(f => (
                    <div key={f}>
                      <label className="block text-sm font-medium text-gray-700 mb-1.5 capitalize">{f === 'firstName' ? 'First Name' : 'Last Name'}</label>
                      <div className="relative">
                        <User className="absolute left-4 top-1/2 -translate-y-1/2 h-5 w-5 text-gray-400" />
                        <input type="text" name={f} value={formData[f]} onChange={handleChange} required
                          className="block w-full pl-12 pr-4 py-3.5 bg-gray-50/50 border border-gray-200 rounded-[16px] text-gray-900 focus:bg-white focus:ring-2 focus:ring-[#012980]/30 focus:border-[#012980] transition-all shadow-inner"
                          placeholder={f === 'firstName' ? 'John' : 'Doe'} />
                      </div>
                    </div>
                  ))}
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1.5">Email Address</label>
                  <div className="relative">
                    <Mail className="absolute left-4 top-1/2 -translate-y-1/2 h-5 w-5 text-gray-400" />
                    <input type="email" name="email" value={formData.email} onChange={handleChange} required
                      className="block w-full pl-12 pr-4 py-3.5 bg-gray-50/50 border border-gray-200 rounded-[16px] text-gray-900 focus:bg-white focus:ring-2 focus:ring-[#012980]/30 focus:border-[#012980] transition-all shadow-inner"
                      placeholder="vendor@example.com" />
                  </div>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1.5">Phone Number</label>
                  <div className="relative">
                    <Phone className="absolute left-4 top-1/2 -translate-y-1/2 h-5 w-5 text-gray-400" />
                    <input type="tel" name="phone" value={formData.phone} onChange={handleChange} required
                      className="block w-full pl-12 pr-4 py-3.5 bg-gray-50/50 border border-gray-200 rounded-[16px] text-gray-900 focus:bg-white focus:ring-2 focus:ring-[#012980]/30 focus:border-[#012980] transition-all shadow-inner"
                      placeholder="+91 98765 43210" />
                  </div>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1.5">Password</label>
                  <div className="relative">
                    <Lock className="absolute left-4 top-1/2 -translate-y-1/2 h-5 w-5 text-gray-400" />
                    <input type="password" name="password" value={formData.password} onChange={handleChange} required
                      className="block w-full pl-12 pr-4 py-3.5 bg-gray-50/50 border border-gray-200 rounded-[16px] text-gray-900 focus:bg-white focus:ring-2 focus:ring-[#012980]/30 focus:border-[#012980] transition-all shadow-inner"
                      placeholder="••••••••" />
                  </div>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1.5">Referral Code (Optional)</label>
                  <div className="relative">
                    <Tag className="absolute left-4 top-1/2 -translate-y-1/2 h-5 w-5 text-gray-400" />
                    <input type="text" name="referralCode" value={formData.referralCode} onChange={handleChange}
                      className={`block w-full pl-12 pr-4 py-3.5 bg-gray-50/50 border ${referrer.status === 'invalid' ? 'border-red-300 focus:border-red-500 focus:ring-red-500/20' : referrer.status === 'valid' ? 'border-green-300 focus:border-green-500 focus:ring-green-500/20' : 'border-gray-200 focus:border-[#012980] focus:ring-[#012980]/30'} rounded-[16px] text-gray-900 focus:bg-white focus:ring-2 transition-all shadow-inner`}
                      placeholder="Enter referral code" />
                    {referrer.status === 'checking' && (
                      <div className="absolute right-4 top-1/2 -translate-y-1/2 w-4 h-4 border-2 border-[#012980]/30 border-t-[#012980] rounded-full animate-spin" />
                    )}
                    {referrer.status === 'valid' && (
                      <CheckCircle2 className="absolute right-4 top-1/2 -translate-y-1/2 w-5 h-5 text-green-500" />
                    )}
                  </div>
                  {referrer.status === 'valid' && (
                    <p className="mt-1.5 text-xs font-medium text-green-600 flex items-center gap-1">
                      Referred by {referrer.name}
                    </p>
                  )}
                  {referrer.status === 'invalid' && (
                    <p className="mt-1.5 text-xs font-medium text-red-500">
                      Invalid referral code
                    </p>
                  )}
                </div>
              </div>
            )}

            {/* Step 2 — Store */}
            {step === 2 && (
              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1.5">Store / Business Name</label>
                  <div className="relative">
                    <Store className="absolute left-4 top-1/2 -translate-y-1/2 h-5 w-5 text-gray-400" />
                    <input type="text" name="storeName" value={formData.storeName} onChange={handleChange} required
                      className="block w-full pl-12 pr-4 py-3.5 bg-gray-50/50 border border-gray-200 rounded-[16px] text-gray-900 focus:bg-white focus:ring-2 focus:ring-[#012980]/30 focus:border-[#012980] transition-all shadow-inner"
                      placeholder="My Awesome Store" />
                  </div>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1.5">Store Image Cover</label>
                  <div className="relative">
                    {storeImage ? (
                      <div className="relative w-full h-40 rounded-2xl overflow-hidden border border-gray-200 shadow-sm group">
                        <img src={storeImage} alt="Store Cover" className="w-full h-full object-cover" />
                        <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-3">
                          <label className="bg-white text-gray-800 text-xs font-bold px-3 py-1.5 rounded-xl shadow cursor-pointer hover:bg-gray-50 flex items-center gap-1.5">
                            <Store className="w-3.5 h-3.5 text-[#012980]" />
                            Change Cover
                            <input type="file" accept="image/*" onChange={handleImageUpload} disabled={uploadingImage} className="hidden" />
                          </label>
                          <button
                            type="button"
                            onClick={() => setStoreImage('')}
                            className="bg-red-500 text-white text-xs font-bold px-3 py-1.5 rounded-xl shadow hover:bg-red-600 flex items-center gap-1.5"
                          >
                            <XCircle className="w-3.5 h-3.5" />
                            Remove
                          </button>
                        </div>
                        <div className="absolute top-2.5 left-2.5 bg-emerald-600/90 backdrop-blur-sm text-white text-[11px] font-bold px-2.5 py-1 rounded-lg shadow-sm flex items-center gap-1">
                          <CheckCircle2 className="w-3.5 h-3.5" />
                          Cover Uploaded
                        </div>
                        <button
                          type="button"
                          onClick={() => setStoreImage('')}
                          className="md:hidden absolute top-2 right-2 bg-white/90 rounded-full p-1 shadow text-red-500"
                        >
                          <XCircle className="w-5 h-5" />
                        </button>
                      </div>
                    ) : (
                      <div className="w-full h-36 rounded-2xl border-2 border-dashed border-gray-300 bg-gray-50/70 hover:bg-gray-100/70 flex flex-col items-center justify-center transition-colors relative cursor-pointer group">
                        <input type="file" accept="image/*" onChange={handleImageUpload} disabled={uploadingImage} className="absolute inset-0 w-full h-full opacity-0 cursor-pointer" />
                        {uploadingImage ? (
                          <div className="flex flex-col items-center gap-2">
                            <div className="w-7 h-7 border-2 border-[#012980]/30 border-t-[#012980] rounded-full animate-spin"></div>
                            <span className="text-xs font-semibold text-gray-600">Uploading store image to cloud...</span>
                          </div>
                        ) : (
                          <>
                            <div className="w-12 h-12 rounded-2xl bg-[#012980]/5 group-hover:bg-[#012980]/10 flex items-center justify-center mb-2 transition-colors">
                              <Store className="w-6 h-6 text-[#012980]" />
                            </div>
                            <span className="text-sm font-semibold text-gray-700">Click to upload store cover</span>
                            <span className="text-xs text-gray-400 mt-0.5">Supports PNG, JPG, WebP up to 50MB</span>
                          </>
                        )}
                      </div>
                    )}
                  </div>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1.5">Store Address</label>
                  <textarea name="storeAddress" value={formData.storeAddress} onChange={handleChange} required rows={2}
                    className="block w-full p-3.5 bg-gray-50/50 border border-gray-200 rounded-[16px] text-gray-900 focus:bg-white focus:ring-2 focus:ring-[#012980]/30 focus:border-[#012980] transition-all shadow-inner resize-none"
                    placeholder="Enter complete business/store address" />
                </div>

                {/* Mandatory Pickup Address Section */}
                <div className="pt-4 border-t border-gray-100">
                  <div className="flex items-center gap-2 mb-3">
                    <Truck className="w-5 h-5 text-[#fe6603]" />
                    <div>
                      <h3 className="text-sm font-bold text-gray-900">Shiprocket Pickup Address</h3>
                      <p className="text-xs text-gray-500">Required for courier pickup & order dispatches</p>
                    </div>
                  </div>

                  <div className="space-y-3">
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      <div>
                        <label className="block text-xs font-semibold text-gray-600 mb-1">Contact Person Name *</label>
                        <input
                          type="text"
                          name="pickupContactName"
                          value={formData.pickupContactName}
                          onChange={handleChange}
                          required
                          placeholder="e.g. Ramesh Kumar"
                          className="block w-full px-3.5 py-2.5 bg-gray-50/50 border border-gray-200 rounded-xl text-sm text-gray-900 focus:bg-white focus:ring-2 focus:ring-[#012980]/30"
                        />
                      </div>
                      <div>
                        <label className="block text-xs font-semibold text-gray-600 mb-1">Pickup Phone Number *</label>
                        <input
                          type="tel"
                          name="pickupPhone"
                          value={formData.pickupPhone}
                          onChange={handleChange}
                          required
                          placeholder="10-digit mobile number"
                          className="block w-full px-3.5 py-2.5 bg-gray-50/50 border border-gray-200 rounded-xl text-sm text-gray-900 focus:bg-white focus:ring-2 focus:ring-[#012980]/30"
                        />
                      </div>
                    </div>

                    <div>
                      <label className="block text-xs font-semibold text-gray-600 mb-1">Address Line 1 (Shop/Building/Street) *</label>
                      <input
                        type="text"
                        name="pickupAddressLine1"
                        value={formData.pickupAddressLine1}
                        onChange={handleChange}
                        required
                        placeholder="House / Shop No, Street Name"
                        className="block w-full px-3.5 py-2.5 bg-gray-50/50 border border-gray-200 rounded-xl text-sm text-gray-900 focus:bg-white focus:ring-2 focus:ring-[#012980]/30"
                      />
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      <div>
                        <label className="block text-xs font-semibold text-gray-600 mb-1">Address Line 2 (Area/Colony)</label>
                        <input
                          type="text"
                          name="pickupAddressLine2"
                          value={formData.pickupAddressLine2}
                          onChange={handleChange}
                          placeholder="Optional"
                          className="block w-full px-3.5 py-2.5 bg-gray-50/50 border border-gray-200 rounded-xl text-sm text-gray-900 focus:bg-white focus:ring-2 focus:ring-[#012980]/30"
                        />
                      </div>
                      <div>
                        <label className="block text-xs font-semibold text-gray-600 mb-1">Landmark</label>
                        <input
                          type="text"
                          name="pickupLandmark"
                          value={formData.pickupLandmark}
                          onChange={handleChange}
                          placeholder="Nearby landmark (Optional)"
                          className="block w-full px-3.5 py-2.5 bg-gray-50/50 border border-gray-200 rounded-xl text-sm text-gray-900 focus:bg-white focus:ring-2 focus:ring-[#012980]/30"
                        />
                      </div>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                      <div>
                        <label className="block text-xs font-semibold text-gray-600 mb-1">City *</label>
                        <input
                          type="text"
                          name="pickupCity"
                          value={formData.pickupCity}
                          onChange={handleChange}
                          required
                          placeholder="City"
                          className="block w-full px-3.5 py-2.5 bg-gray-50/50 border border-gray-200 rounded-xl text-sm text-gray-900 focus:bg-white focus:ring-2 focus:ring-[#012980]/30"
                        />
                      </div>
                      <div>
                        <label className="block text-xs font-semibold text-gray-600 mb-1">State *</label>
                        <input
                          type="text"
                          name="pickupState"
                          value={formData.pickupState}
                          onChange={handleChange}
                          required
                          placeholder="State"
                          className="block w-full px-3.5 py-2.5 bg-gray-50/50 border border-gray-200 rounded-xl text-sm text-gray-900 focus:bg-white focus:ring-2 focus:ring-[#012980]/30"
                        />
                      </div>
                      <div>
                        <label className="block text-xs font-semibold text-gray-600 mb-1">Pincode *</label>
                        <input
                          type="text"
                          name="pickupPincode"
                          value={formData.pickupPincode}
                          onChange={handleChange}
                          required
                          maxLength={6}
                          placeholder="6-digit PIN"
                          className="block w-full px-3.5 py-2.5 bg-gray-50/50 border border-gray-200 rounded-xl text-sm text-gray-900 focus:bg-white focus:ring-2 focus:ring-[#012980]/30"
                        />
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* Step 3 — Subscription Plan */}
            {step === 3 && (
              <div className="space-y-4">
                <div className="text-center mb-2">
                  <CreditCard className="w-10 h-10 text-[#012980] mx-auto mb-2" />
                  <h2 className="text-lg font-bold text-gray-900">Choose a Subscription Plan</h2>
                  <p className="text-gray-500 text-sm">Select a plan to activate your vendor account</p>
                </div>

                {loadingPlans ? (
                  <p className="text-center text-gray-400 py-4">Loading plans...</p>
                ) : plans.length === 0 ? (
                  <p className="text-center text-gray-400 py-4">No plans available.</p>
                ) : (
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {plans.map(plan => {
                      const features = plan.features || {};
                      const featureList = [
                        { label: 'Products', value: features.product_limit || 'Unlimited' },
                        { label: 'Commission', value: `${features.commission_percent || '0'}%` },
                        { label: 'Images/Product', value: features.images_per_product || '—' },
                        features.seo_enabled ? { label: 'Advanced SEO' } : null,
                        features.analytics_enabled ? { label: 'Store Analytics' } : null,
                        features.verification_badge_enabled ? { label: 'Verification Badge' } : null,
                      ].filter(Boolean);

                      return (
                        <button key={plan.id} type="button"
                          onClick={() => { setSelectedPlan(plan); setPaymentDone(false); setPaymentId(''); }}
                          className={`relative p-5 rounded-[20px] border-2 text-left transition-all flex flex-col group ${
                            selectedPlan?.id === plan.id
                              ? 'border-[#012980] bg-gradient-to-br from-[#012980]/5 to-transparent shadow-[0_8px_20px_rgba(254,102,3,0.1)]'
                              : 'border-gray-100 hover:border-[#012980]/30 bg-white hover:shadow-[0_8px_30px_rgb(0,0,0,0.04)] hover:-translate-y-1'
                          }`}>
                          {selectedPlan?.id === plan.id && (
                            <CheckCircle2 className="absolute top-4 right-4 w-5 h-5 text-[#012980]" />
                          )}
                          <p className="font-bold text-gray-900 text-lg">{plan.name}</p>
                          <p className="text-[#012980] font-extrabold text-2xl mt-1">₹{plan.price}</p>
                          <p className="text-gray-500 text-sm mt-0.5 mb-4">{plan.months} month{plan.months > 1 ? 's' : ''} access</p>
                          
                          <ul className="space-y-2 mt-auto">
                            {featureList.map((f, i) => (
                              <li key={i} className="flex items-start gap-2 text-sm text-gray-600">
                                <CheckCircle2 className="w-4 h-4 text-[#012980] mt-0.5 flex-shrink-0" />
                                <span>{f.label}{f.value ? `: ${f.value}` : ''}</span>
                              </li>
                            ))}
                          </ul>
                        </button>
                      );
                    })}
                  </div>
                )}

                {selectedPlan && !paymentDone && (
                  <button type="button" onClick={handlePayment} disabled={loading}
                    className="w-full flex items-center justify-center gap-2 bg-[#036e26] text-white py-3 rounded-xl font-semibold text-sm hover:bg-[#025a1f] transition-colors disabled:opacity-50">
                    {loading ? 'Opening payment...' : `Pay ₹${selectedPlan.price} & Continue`}
                  </button>
                )}

                {paymentDone && (
                  <div className="flex items-center gap-3 p-4 bg-green-50 border border-green-200 rounded-xl">
                    <CheckCircle2 className="w-5 h-5 text-green-600 flex-shrink-0" />
                    <div>
                      <p className="text-green-700 font-semibold text-sm">
                        {recoveredPaid ? 'Subscription Payment Already Verified' : 'Payment Successful!'}
                      </p>
                      <p className="text-green-600 text-xs">Payment ID: {paymentId}</p>
                      {recoveredPaid && (
                        <p className="text-green-700 text-xs mt-0.5">Your prior subscription payment was restored. Click "Send OTP" below to receive your verification code.</p>
                      )}
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* Step 4 — SMS OTP */}
            {step === 4 && (
              <div className="space-y-4 text-center">
                <ShieldCheck className="w-16 h-16 text-[#012980] mx-auto mb-4" />
                <h2 className="text-xl font-bold text-gray-900">Verify Mobile Number</h2>
                <p className="text-gray-500 text-sm">We've sent a 6-digit SMS OTP to</p>
                <p className="text-[#012980] font-bold text-base mt-0.5 tracking-wide">
                  {formData.phone || formData.pickupPhone}
                </p>
                <p className="text-gray-400 text-xs">{formData.email}</p>
                <div className="pt-4 max-w-xs mx-auto">
                  <input type="text" name="otp" value={formData.otp} onChange={handleChange} required maxLength={6}
                    className="block w-full text-center tracking-[0.5em] font-bold text-2xl py-3.5 bg-gray-50/50 border border-gray-200 rounded-[16px] text-gray-900 focus:bg-white focus:ring-2 focus:ring-[#012980]/30 focus:border-[#012980] transition-all shadow-inner"
                    placeholder="------" />
                </div>
                <div className="pt-2 text-center">
                  <button
                    type="button"
                    disabled={resendTimer > 0 || resendingOtp || loading}
                    onClick={handleResendOtp}
                    className="text-sm font-semibold text-[#012980] hover:text-[#ff7b23] disabled:text-gray-400 transition-colors"
                  >
                    {resendingOtp ? 'Sending SMS OTP...' : resendTimer > 0 ? `Resend SMS OTP in ${resendTimer}s` : 'Resend SMS OTP'}
                  </button>
                </div>
              </div>
            )}

            <div className="flex gap-4 pt-4">
              {step > 1 && step < 4 && (
                <button type="button" disabled={loading} onClick={() => setStep(s => s - 1)}
                  className="px-6 py-4 border border-gray-200 rounded-[16px] font-bold text-gray-700 hover:bg-gray-50 transition-all disabled:opacity-50">
                  Back
                </button>
              )}
              {step === 4 && (
                <button type="button" disabled={loading} onClick={() => setStep(3)}
                  className="px-6 py-4 border border-gray-200 rounded-[16px] font-bold text-gray-700 hover:bg-gray-50 transition-all disabled:opacity-50">
                  Back
                </button>
              )}
              <button type="submit" disabled={loading || (step === 3 && !paymentDone)}
                className="flex-1 flex items-center justify-center gap-2 bg-gradient-to-r from-[#012980] to-[#ff7b23] text-white py-4 rounded-[16px] font-bold text-lg hover:shadow-[0_8px_20px_rgba(254,102,3,0.3)] hover:-translate-y-0.5 transition-all disabled:opacity-50 disabled:hover:transform-none disabled:hover:shadow-none">
                {loading ? <div className="w-5 h-5 border-2 border-white/20 border-t-white rounded-full animate-spin" /> : null}
                {loading ? 'Processing...' : step === 1 ? 'Continue' : step === 2 ? 'Continue' : step === 3 ? 'Send OTP' : 'Verify & Submit'}
                {!loading && <ArrowRight className="w-5 h-5" />}
              </button>
            </div>

            <p className="text-[11px] text-gray-500 text-center leading-relaxed px-2 pt-2">
              By submitting your vendor application, you agree to the{' '}
              <Link to="/terms" target="_blank" className="text-[#012980] font-semibold underline">Vendor Terms of Service</Link>{' '}
              and{' '}
              <Link to="/privacy-policy" target="_blank" className="text-[#012980] font-semibold underline">Privacy Policy</Link>.
            </p>
          </form>

          {step < 4 && (
            <p className="mt-8 text-center text-gray-600">
              Already have a vendor account?{' '}
              <Link to="/vendor-login" className="text-[#012980] font-medium hover:underline">Sign In</Link>
            </p>
          )}
          </div>
        </div>
      </div>
    </div>
  );
}
