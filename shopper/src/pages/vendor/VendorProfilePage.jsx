import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { 
  User, Store, Mail, Phone, MapPin, CreditCard, CheckCircle2, 
  AlertTriangle, RefreshCw, Truck, Edit2, Plus, X, Building,
  Power, ShieldAlert, AlertOctagon
} from 'lucide-react';
import { toast } from 'react-toastify';

const BACKEND_URL = import.meta.env.VITE_BACKEND_URL || "http://localhost:5000/api";

function daysLeft(dateStr) {
  if (!dateStr) return null;
  const diff = new Date(dateStr) - new Date();
  return Math.ceil(diff / (1000 * 60 * 60 * 24));
}

export function VendorProfilePage() {
  const navigate = useNavigate();
  const [vendor, setVendor] = useState(null);
  const [loading, setLoading] = useState(true);
  const [plans, setPlans] = useState([]);
  const [selectedPlan, setSelectedPlan] = useState(null);
  const [renewLoading, setRenewLoading] = useState(false);
  const [showPlans, setShowPlans] = useState(false);

  // Store Closure Modal State
  const [closeModalOpen, setCloseModalOpen] = useState(false);
  const [closePassword, setClosePassword] = useState('');
  const [closingStore, setClosingStore] = useState(false);
  const [closeError, setCloseError] = useState('');

  // Pickup Address Modal State
  const [pickupModalOpen, setPickupModalOpen] = useState(false);
  const [savingPickup, setSavingPickup] = useState(false);
  const [pickupForm, setPickupForm] = useState({
    contact_name: '',
    phone: '',
    address_line1: '',
    address_line2: '',
    landmark: '',
    city: '',
    state: '',
    pincode: ''
  });

  const token = localStorage.getItem('vendor_token');
  const headers = { Authorization: `Bearer ${token}` };

  const fetchProfile = async () => {
    try {
      const res = await fetch(`${BACKEND_URL}/vendorAuth/me`, { headers });
      const data = await res.json();
      if (res.ok && data.vendor) {
        setVendor(data.vendor);
        setPickupForm({
          contact_name: data.vendor.pickup_contact_name || data.vendor.name || '',
          phone: data.vendor.pickup_phone || data.vendor.phone || '',
          address_line1: data.vendor.pickup_address_line1 || data.vendor.address || '',
          address_line2: data.vendor.pickup_address_line2 || '',
          landmark: data.vendor.pickup_landmark || '',
          city: data.vendor.pickup_city || '',
          state: data.vendor.pickup_state || '',
          pincode: data.vendor.pickup_pincode || ''
        });
      }
    } catch { 
      toast.error('Failed to load profile'); 
    } finally { 
      setLoading(false); 
    }
  };

  useEffect(() => {
    fetchProfile();
    fetch(`${BACKEND_URL}/subscriptions/plans`)
      .then(r => r.json()).then(d => setPlans(d.plans || [])).catch(() => {});
  }, []);

  const openPickupModal = () => {
    if (vendor) {
      setPickupForm({
        contact_name: vendor.pickup_contact_name || vendor.name || '',
        phone: vendor.pickup_phone || vendor.phone || '',
        address_line1: vendor.pickup_address_line1 || vendor.address || '',
        address_line2: vendor.pickup_address_line2 || '',
        landmark: vendor.pickup_landmark || '',
        city: vendor.pickup_city || '',
        state: vendor.pickup_state || '',
        pincode: vendor.pickup_pincode || ''
      });
    }
    setPickupModalOpen(true);
  };

  const handleSavePickupAddress = async (e) => {
    e.preventDefault();
    if (!pickupForm.contact_name.trim() || !pickupForm.phone.trim() || !pickupForm.address_line1.trim() || !pickupForm.city.trim() || !pickupForm.state.trim() || !pickupForm.pincode.trim()) {
      return toast.error('Please fill all mandatory fields (Contact Name, Phone, Address Line 1, City, State, Pincode)');
    }

    const cleanPhone = pickupForm.phone.replace(/\D/g, '').slice(-10);
    if (!/^[6-9]\d{9}$/.test(cleanPhone)) {
      return toast.error('Please enter a valid 10-digit Indian phone number');
    }

    const cleanPincode = pickupForm.pincode.trim();
    if (!/^\d{6}$/.test(cleanPincode)) {
      return toast.error('Please enter a valid 6-digit Indian PIN code');
    }

    setSavingPickup(true);
    try {
      const res = await fetch(`${BACKEND_URL}/vendor/pickup-address`, {
        method: 'PUT',
        headers: {
          ...headers,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          contact_name: pickupForm.contact_name.trim(),
          phone: cleanPhone,
          address_line1: pickupForm.address_line1.trim(),
          address_line2: pickupForm.address_line2.trim(),
          landmark: pickupForm.landmark.trim(),
          city: pickupForm.city.trim(),
          state: pickupForm.state.trim(),
          pincode: cleanPincode
        })
      });

      const data = await res.json();
      if (res.ok) {
        toast.success('Pickup address saved & registered for Shiprocket dispatches!');
        if (data.pickupAddress) {
          setVendor(prev => ({
            ...prev,
            ...data.pickupAddress
          }));
        }
        setPickupModalOpen(false);
      } else {
        toast.error(data.error || 'Failed to save pickup address');
      }
    } catch (err) {
      toast.error('Network error saving pickup address');
    } finally {
      setSavingPickup(false);
    }
  };

  const handleCloseStore = async (e) => {
    e.preventDefault();
    setCloseError('');
    if (!closePassword) {
      setCloseError('Please enter your current password to confirm store closure.');
      return;
    }

    setClosingStore(true);
    try {
      const res = await fetch(`${BACKEND_URL}/vendor/close-store`, {
        method: 'POST',
        headers: {
          ...headers,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ password: closePassword })
      });
      const data = await res.json();
      if (res.ok && data.success) {
        toast.success(data.message || 'Store closed successfully.');
        localStorage.removeItem('vendor_token');
        setCloseModalOpen(false);
        navigate('/vendor-login?closed=true');
      } else {
        setCloseError(data.error || 'Failed to close store.');
      }
    } catch (err) {
      setCloseError(err.message || 'Network error while attempting to close store.');
    } finally {
      setClosingStore(false);
    }
  };

  const handleRenew = async () => {
    if (!selectedPlan) return toast.error('Select a plan first');
    setRenewLoading(true);
    try {
      const res = await fetch(`${BACKEND_URL}/subscriptions/create-order`, {
        method: 'POST', headers: { ...headers, 'Content-Type': 'application/json' },
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
          const subRes = await fetch(`${BACKEND_URL}/subscriptions/subscribe`, {
            method: 'POST', headers: { ...headers, 'Content-Type': 'application/json' },
            body: JSON.stringify({ plan_id: selectedPlan.id, payment_id: response.razorpay_payment_id }),
          });
          const subData = await subRes.json();
          if (!subRes.ok) return toast.error(subData.error);
          toast.success('Subscription renewed!');
          setShowPlans(false);
          fetchProfile();
        },
        prefill: { name: vendor?.name, email: vendor?.email, contact: vendor?.phone },
        theme: { color: '#012980' },
      };
      new window.Razorpay(options).open();
    } catch (err) {
      toast.error(err.message);
    } finally {
      setRenewLoading(false);
    }
  };

  if (loading) return <div className="py-12 text-center text-gray-500">Loading profile...</div>;
  if (!vendor) return <div className="py-12 text-center text-gray-500">Profile data not found.</div>;

  const days = daysLeft(vendor.subscription_expires_at);
  const isExpired = days !== null && days <= 0;
  const isExpiringSoon = days !== null && days > 0 && days <= 10;
  const hasPickupAddress = Boolean(vendor.pickup_contact_name && vendor.pickup_phone && vendor.pickup_address_line1 && vendor.pickup_city && vendor.pickup_pincode);

  return (
    <div className="max-w-3xl mx-auto space-y-6">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-2">
        <div>
          <h1 className="text-2xl sm:text-3xl font-extrabold text-gray-900 tracking-tight">Store Profile</h1>
          <p className="text-gray-500 mt-1 text-sm font-medium">Manage store details, pickup address, and subscription.</p>
        </div>
      </div>

      {/* Expiry Banner */}
      {(isExpired || isExpiringSoon) && (
        <div className={`flex items-start gap-3 p-4 rounded-2xl border ${isExpired ? 'bg-red-50 border-red-200' : 'bg-amber-50 border-amber-200'}`}>
          <AlertTriangle className={`w-5 h-5 flex-shrink-0 mt-0.5 ${isExpired ? 'text-red-500' : 'text-amber-500'}`} />
          <div className="flex-1 min-w-0">
            <p className={`font-semibold text-sm ${isExpired ? 'text-red-700' : 'text-amber-700'}`}>
              {isExpired ? 'Subscription Expired' : `Subscription expiring in ${days} day${days !== 1 ? 's' : ''}`}
            </p>
            <p className={`text-xs mt-0.5 ${isExpired ? 'text-red-600' : 'text-amber-600'}`}>
              {isExpired ? 'Renew now to continue selling on Swabhivar Shoppers.' : 'Renew early to avoid interruption.'}
            </p>
          </div>
          <button onClick={() => setShowPlans(true)}
            className={`flex-shrink-0 flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold text-white transition-colors ${isExpired ? 'bg-red-500 hover:bg-red-600' : 'bg-amber-500 hover:bg-amber-600'}`}>
            <RefreshCw className="w-3.5 h-3.5" /> Renew
          </button>
        </div>
      )}

      {/* No subscription at all */}
      {!vendor.plan_name && !vendor.subscription_expires_at && (
        <div className="flex items-start gap-3 p-4 rounded-2xl border bg-red-50 border-red-200">
          <AlertTriangle className="w-5 h-5 flex-shrink-0 mt-0.5 text-red-500" />
          <div className="flex-1 min-w-0">
            <p className="font-semibold text-sm text-red-700">No Active Subscription</p>
            <p className="text-xs mt-0.5 text-red-600">Your products are currently hidden from customers. Subscribe to start selling.</p>
          </div>
          <button onClick={() => setShowPlans(true)}
            className="flex-shrink-0 flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold text-white bg-red-500 hover:bg-red-600 transition-colors">
            <CreditCard className="w-3.5 h-3.5" /> Subscribe
          </button>
        </div>
      )}

      {/* ======================================================== */}
      {/* 1. PICKUP ADDRESS & SHIPROCKET DISPATCH LOCATION         */}
      {/* ======================================================== */}
      <div className="bg-white rounded-2xl sm:rounded-[24px] shadow-sm border border-gray-100 p-6 sm:p-8 relative overflow-hidden">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6 border-b border-gray-100 pb-4">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 rounded-2xl bg-orange-50 border border-orange-200/60 flex items-center justify-center text-[#fe6603] shadow-xs">
              <Truck className="w-6 h-6" />
            </div>
            <div>
              <h2 className="text-lg sm:text-xl font-bold text-gray-900">Shiprocket Pickup Address</h2>
              <p className="text-xs text-gray-500 mt-0.5">Where courier agents pick up customer orders from your store</p>
            </div>
          </div>
          <button
            onClick={openPickupModal}
            className="self-start sm:self-auto flex items-center gap-2 px-4 py-2 bg-gradient-to-r from-[#012980] to-[#fe6603] text-white rounded-xl text-xs sm:text-sm font-bold shadow-xs hover:shadow-md transition-all"
          >
            {hasPickupAddress ? <><Edit2 className="w-4 h-4" /> Edit Pickup Address</> : <><Plus className="w-4 h-4" /> Add Pickup Address</>}
          </button>
        </div>

        {hasPickupAddress ? (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="bg-gray-50/70 p-4 rounded-xl border border-gray-100 space-y-2">
              <span className="text-[10px] font-bold text-gray-400 uppercase tracking-wider block">Pickup Contact</span>
              <p className="font-bold text-gray-900 text-sm">{vendor.pickup_contact_name}</p>
              <p className="text-xs text-gray-600 font-medium flex items-center gap-1.5">
                <Phone className="w-3.5 h-3.5 text-gray-400" />
                {vendor.pickup_phone}
              </p>
            </div>

            <div className="bg-gray-50/70 p-4 rounded-xl border border-gray-100 space-y-1">
              <span className="text-[10px] font-bold text-gray-400 uppercase tracking-wider block">Address Details</span>
              <p className="text-sm font-semibold text-gray-800 leading-snug">
                {vendor.pickup_address_line1}
                {vendor.pickup_address_line2 ? `, ${vendor.pickup_address_line2}` : ''}
              </p>
              {vendor.pickup_landmark && (
                <p className="text-xs text-gray-500">Landmark: {vendor.pickup_landmark}</p>
              )}
              <p className="text-xs font-bold text-[#012980] pt-1">
                {vendor.pickup_city}, {vendor.pickup_state} — {vendor.pickup_pincode}
              </p>
            </div>

            <div className="md:col-span-2 bg-emerald-50/60 border border-emerald-200/80 rounded-xl p-3 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                <span className="text-xs font-bold text-emerald-900">Shiprocket Ready:</span>
                <span className="text-xs font-mono font-semibold text-emerald-700 bg-white px-2 py-0.5 rounded border border-emerald-200">
                  {vendor.shiprocket_pickup_name || `vnd_${vendor.id}_${vendor.pickup_pincode}`}
                </span>
              </div>
              <span className="text-[10px] font-extrabold uppercase px-2 py-0.5 bg-emerald-100 text-emerald-800 rounded-full">
                Active for Dispatch
              </span>
            </div>
          </div>
        ) : (
          <div className="p-6 bg-amber-50/50 border border-amber-200/60 rounded-xl text-center space-y-2">
            <AlertTriangle className="w-8 h-8 text-amber-500 mx-auto" />
            <p className="font-bold text-sm text-amber-900">No Pickup Address Configured</p>
            <p className="text-xs text-amber-700 max-w-md mx-auto">
              You must save a valid pickup address before courier shipments can be generated for your orders.
            </p>
            <button
              onClick={openPickupModal}
              className="mt-2 inline-flex items-center gap-1.5 px-4 py-2 bg-[#fe6603] text-white text-xs font-bold rounded-xl hover:bg-orange-600 transition-colors shadow-xs"
            >
              <Plus className="w-4 h-4" /> Setup Pickup Address Now
            </button>
          </div>
        )}
      </div>

      {/* ======================================================== */}
      {/* 2. SUBSCRIPTION CARD                                     */}
      {/* ======================================================== */}
      <div className="bg-white rounded-2xl sm:rounded-[24px] shadow-sm border border-gray-100 p-6 sm:p-8 relative overflow-hidden">
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-blue-50 flex items-center justify-center text-[#012980] shadow-sm">
              <CreditCard className="w-5 h-5" />
            </div>
            <h2 className="text-lg sm:text-xl font-bold text-gray-900">Subscription</h2>
          </div>
          {!isExpired && (
            <button onClick={() => setShowPlans(!showPlans)}
              className="flex items-center gap-2 px-4 py-2 bg-gradient-to-r from-[#012980] to-[#ff7b23] text-white rounded-xl text-xs sm:text-sm font-bold shadow-xs hover:shadow-md transition-all">
              <RefreshCw className="w-4 h-4" /> Renew / Upgrade
            </button>
          )}
        </div>

        {vendor.plan_name ? (
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 sm:gap-4">
            {[
              { label: 'Current Plan', value: vendor.plan_name },
              { label: 'Duration', value: `${vendor.months} month${vendor.months > 1 ? 's' : ''}` },
              { label: 'Expires On', value: vendor.subscription_expires_at ? new Date(vendor.subscription_expires_at).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' }) : '—' },
              { label: 'Status', value: isExpired ? 'Expired' : days !== null ? `${days} days left` : 'Active' },
            ].map(item => (
              <div key={item.label} className="bg-gray-50/80 border border-gray-100 rounded-xl p-4">
                <p className="text-[10px] font-bold text-gray-400 mb-1 uppercase tracking-wider">{item.label}</p>
                <p className={`text-sm sm:text-base font-extrabold ${item.label === 'Status' && isExpired ? 'text-red-500' : item.label === 'Status' && isExpiringSoon ? 'text-amber-600' : 'text-gray-900'}`}>
                  {item.value}
                </p>
              </div>
            ))}
          </div>
        ) : (
          <div className="text-center py-6">
            <p className="text-gray-400 text-sm mb-3">No active subscription found.</p>
            <button onClick={() => setShowPlans(true)}
              className="px-5 py-2 bg-[#012980] text-white rounded-xl text-sm font-semibold hover:bg-[#e55c02] transition-colors">
              Subscribe Now
            </button>
          </div>
        )}

        {/* Plan Selector */}
        {showPlans && (
          <div className="mt-5 pt-5 border-t border-gray-100">
            <p className="text-sm font-semibold text-gray-700 mb-3">Select a plan to renew</p>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
              {plans.map(plan => {
                const features = plan.features || {};
                const featureList = [
                  { label: 'Products', value: features.product_limit || 'Unlimited' },
                  { label: 'Commission', value: `${features.commission_percent || '0'}%` },
                  features.seo_enabled ? { label: 'Advanced SEO' } : null,
                  features.verification_badge_enabled ? { label: 'Verification Badge' } : null,
                ].filter(Boolean);

                return (
                  <button key={plan.id} type="button" onClick={() => setSelectedPlan(plan)}
                    className={`relative p-5 rounded-2xl border-2 text-left transition-all flex flex-col ${selectedPlan?.id === plan.id ? 'border-[#012980] bg-[#012980]/5' : 'border-gray-200 hover:border-[#012980]/40'}`}>
                    {selectedPlan?.id === plan.id && <CheckCircle2 className="absolute top-4 right-4 w-5 h-5 text-[#012980]" />}
                    <p className="font-bold text-gray-900 text-lg">{plan.name}</p>
                    <p className="text-[#012980] font-extrabold text-2xl mt-1">₹{plan.price}</p>
                    <p className="text-gray-500 text-sm mt-0.5 mb-4">{plan.months} month{plan.months > 1 ? 's' : ''}</p>
                    
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
            <button onClick={handleRenew} disabled={renewLoading || !selectedPlan}
              className="w-full py-3 bg-[#012980] text-white rounded-xl text-sm font-semibold hover:bg-[#e55c02] transition-colors disabled:opacity-50">
              {renewLoading ? 'Opening payment...' : selectedPlan ? `Pay ₹${selectedPlan.price}` : 'Select a plan'}
            </button>
          </div>
        )}
      </div>

      {/* ======================================================== */}
      {/* 3. PROFILE CARD                                          */}
      {/* ======================================================== */}
      <div className="bg-white rounded-2xl sm:rounded-[24px] shadow-sm border border-gray-100 overflow-hidden">
        <div className="h-32 bg-gradient-to-r from-[#012980] to-[#fe6603]" />
        <div className="px-6 sm:px-8 pb-8 relative">
          <div className="relative flex justify-between items-end -mt-14 mb-6">
            <div className="w-24 h-24 sm:w-28 sm:h-28 bg-white rounded-2xl shadow-md border-4 border-white flex items-center justify-center text-[#012980]">
              <Store className="w-12 h-12" />
            </div>
            <span className={`px-3.5 py-1 rounded-full text-xs font-bold uppercase tracking-wider border shadow-xs ${
              vendor.status === 'approved' ? 'bg-green-50 text-green-700 border-green-200' :
              vendor.status === 'pending' ? 'bg-yellow-50 text-yellow-700 border-yellow-200' :
              'bg-red-50 text-red-700 border-red-200'
            }`}>{vendor.status} Status</span>
          </div>

          <div className="space-y-6">
            <div>
              <h2 className="text-2xl sm:text-3xl font-extrabold text-gray-900 tracking-tight">{vendor.store_name}</h2>
              <p className="text-gray-500 text-xs sm:text-sm font-medium mt-1">Joined {new Date(vendor.created_at).toLocaleDateString()}</p>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-6 pt-6 border-t border-gray-100">
              <div className="space-y-4">
                <h3 className="font-extrabold text-gray-900 text-sm uppercase tracking-wider">Owner Information</h3>
                {[
                  { icon: <User className="w-4 h-4 text-gray-500" />, label: 'Full Name', value: vendor.name },
                  { icon: <Mail className="w-4 h-4 text-gray-500" />, label: 'Email Address', value: vendor.email },
                  { icon: <Phone className="w-4 h-4 text-gray-500" />, label: 'Phone Number', value: vendor.phone },
                ].map(item => (
                  <div key={item.label} className="flex items-center gap-3 text-gray-600 bg-gray-50/50 p-3 rounded-xl border border-gray-100">
                    <div className="w-9 h-9 rounded-lg bg-white border border-gray-200 flex items-center justify-center shrink-0 shadow-xs">{item.icon}</div>
                    <div className="min-w-0 flex-1">
                      <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">{item.label}</p>
                      <p className="font-bold text-gray-900 text-sm truncate">{item.value}</p>
                    </div>
                  </div>
                ))}
              </div>

              <div className="space-y-4">
                <h3 className="font-extrabold text-gray-900 text-sm uppercase tracking-wider">Registered Business Address</h3>
                <div className="flex items-start gap-3 text-gray-600 bg-gray-50/50 p-3 rounded-xl border border-gray-100">
                  <div className="w-9 h-9 rounded-lg bg-white border border-gray-200 flex items-center justify-center shrink-0 shadow-xs">
                    <MapPin className="w-4 h-4 text-gray-500" />
                  </div>
                  <div>
                    <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">Official Address</p>
                    <p className="font-bold text-gray-900 text-sm leading-snug mt-0.5">{vendor.address}</p>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Danger Zone: Close Store / Deactivate Account */}
          <div className="bg-white rounded-3xl p-6 sm:p-8 shadow-xs border border-red-100 flex flex-col justify-between">
            <div>
              <div className="flex items-center gap-3 mb-2">
                <div className="w-10 h-10 rounded-2xl bg-red-50 text-red-600 flex items-center justify-center shrink-0">
                  <AlertOctagon className="w-5 h-5" />
                </div>
                <div>
                  <h2 className="text-base font-extrabold text-gray-900">Danger Zone: Store Closure</h2>
                  <p className="text-xs text-gray-500">Close your online store and deactivate vendor account</p>
                </div>
              </div>
              <p className="text-xs text-gray-600 leading-relaxed mt-2 mb-4">
                Deactivating your store will unlist all your products from customer browsing and disable vendor portal access. Closure requires that you have zero active orders, zero open customer return requests, and no outstanding platform debt.
              </p>
            </div>

            <button
              type="button"
              onClick={() => { setCloseModalOpen(true); setCloseError(''); setClosePassword(''); }}
              className="w-full py-3 px-4 bg-red-50 hover:bg-red-100 text-red-600 border border-red-200 text-xs font-bold rounded-xl transition-colors flex items-center justify-center gap-2"
            >
              <Power className="w-4 h-4" /> Close Store / Deactivate Account
            </button>
          </div>
        </div>
      </div>

      {/* ======================================================== */}
      {/* CLOSE STORE / DEACTIVATE MODAL                           */}
      {/* ======================================================== */}
      {closeModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs">
          <div className="bg-white rounded-3xl max-w-md w-full p-6 shadow-2xl relative animate-in zoom-in-95 duration-150">
            <button
              type="button"
              onClick={() => setCloseModalOpen(false)}
              className="absolute right-4 top-4 text-gray-400 hover:text-gray-600 p-1"
            >
              <X className="w-5 h-5" />
            </button>

            <div className="w-12 h-12 rounded-2xl bg-red-100 text-red-600 flex items-center justify-center mb-4">
              <ShieldAlert className="w-6 h-6" />
            </div>

            <h3 className="text-lg font-bold text-gray-900 mb-1">Close Store & Deactivate Account</h3>
            <p className="text-xs text-gray-500 mb-4">
              Store: <strong>{vendor.store_name || vendor.name}</strong>
            </p>

            <div className="bg-amber-50 border border-amber-200 rounded-xl p-3 mb-4 text-[11px] text-amber-900 space-y-1">
              <div className="font-bold flex items-center gap-1.5">
                <AlertTriangle className="w-3.5 h-3.5 text-amber-600 shrink-0" /> Important Consequences:
              </div>
              <ul className="list-disc pl-5 space-y-0.5 text-amber-800">
                <li>Your products will be unlisted immediately from search and customer catalog.</li>
                <li>Vendor portal access will be locked. Reopening requires admin review.</li>
                <li>All historical orders, customer invoices, wallet credits, and payout ledgers are preserved for statutory compliance.</li>
              </ul>
            </div>

            <form onSubmit={handleCloseStore} className="space-y-4">
              <div>
                <label className="text-[11px] font-bold text-gray-700 uppercase tracking-wide block mb-1">
                  Enter Password to Confirm
                </label>
                <input
                  type="password"
                  value={closePassword}
                  onChange={(e) => setClosePassword(e.target.value)}
                  placeholder="Enter current password"
                  required
                  className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-red-400 bg-gray-50"
                />
              </div>

              {closeError && (
                <div className="p-3 rounded-xl bg-red-50 border border-red-200 text-xs text-red-700 font-semibold leading-relaxed">
                  {closeError}
                </div>
              )}

              <div className="flex gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setCloseModalOpen(false)}
                  disabled={closingStore}
                  className="flex-1 py-2.5 rounded-xl border border-gray-200 text-xs font-bold text-gray-700 hover:bg-gray-50 transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={closingStore}
                  className="flex-1 py-2.5 rounded-xl bg-red-600 hover:bg-red-700 text-white text-xs font-bold shadow-md shadow-red-200 transition-colors disabled:opacity-60 flex items-center justify-center gap-1.5"
                >
                  {closingStore ? (
                    <>
                      <div className="w-3.5 h-3.5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                      <span>Verifying & Closing...</span>
                    </>
                  ) : (
                    <span>Confirm Store Closure</span>
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ======================================================== */}
      {/* 4. EDIT PICKUP ADDRESS MODAL                             */}
      {/* ======================================================== */}
      {pickupModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs">
          <div className="bg-white rounded-2xl max-w-lg w-full p-6 shadow-2xl max-h-[90vh] overflow-y-auto animate-in zoom-in-95 duration-150">
            <div className="flex items-center justify-between border-b border-gray-100 pb-3 mb-4">
              <div className="flex items-center gap-2">
                <Truck className="w-5 h-5 text-[#fe6603]" />
                <h3 className="text-base font-bold text-gray-900">Manage Pickup Address</h3>
              </div>
              <button 
                onClick={() => setPickupModalOpen(false)}
                className="p-1 rounded-full text-gray-400 hover:text-gray-700 hover:bg-gray-100"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSavePickupAddress} className="space-y-3.5">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-gray-600 mb-1">Contact Person Name *</label>
                  <input
                    type="text"
                    value={pickupForm.contact_name}
                    onChange={e => setPickupForm(p => ({ ...p, contact_name: e.target.value }))}
                    required
                    placeholder="e.g. Ramesh Kumar"
                    className="block w-full px-3 py-2 bg-gray-50/50 border border-gray-200 rounded-xl text-sm focus:bg-white focus:ring-2 focus:ring-[#012980]/30"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-gray-600 mb-1">Pickup Phone Number *</label>
                  <input
                    type="tel"
                    value={pickupForm.phone}
                    onChange={e => setPickupForm(p => ({ ...p, phone: e.target.value }))}
                    required
                    placeholder="10-digit mobile number"
                    className="block w-full px-3 py-2 bg-gray-50/50 border border-gray-200 rounded-xl text-sm focus:bg-white focus:ring-2 focus:ring-[#012980]/30"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-gray-600 mb-1">Address Line 1 *</label>
                <input
                  type="text"
                  value={pickupForm.address_line1}
                  onChange={e => setPickupForm(p => ({ ...p, address_line1: e.target.value }))}
                  required
                  placeholder="House / Building / Shop No, Street Name"
                  className="block w-full px-3 py-2 bg-gray-50/50 border border-gray-200 rounded-xl text-sm focus:bg-white focus:ring-2 focus:ring-[#012980]/30"
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-gray-600 mb-1">Address Line 2 (Area/Colony)</label>
                  <input
                    type="text"
                    value={pickupForm.address_line2}
                    onChange={e => setPickupForm(p => ({ ...p, address_line2: e.target.value }))}
                    placeholder="Optional"
                    className="block w-full px-3 py-2 bg-gray-50/50 border border-gray-200 rounded-xl text-sm focus:bg-white focus:ring-2 focus:ring-[#012980]/30"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-gray-600 mb-1">Landmark</label>
                  <input
                    type="text"
                    value={pickupForm.landmark}
                    onChange={e => setPickupForm(p => ({ ...p, landmark: e.target.value }))}
                    placeholder="Nearby Landmark (Optional)"
                    className="block w-full px-3 py-2 bg-gray-50/50 border border-gray-200 rounded-xl text-sm focus:bg-white focus:ring-2 focus:ring-[#012980]/30"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-gray-600 mb-1">City *</label>
                  <input
                    type="text"
                    value={pickupForm.city}
                    onChange={e => setPickupForm(p => ({ ...p, city: e.target.value }))}
                    required
                    placeholder="City"
                    className="block w-full px-3 py-2 bg-gray-50/50 border border-gray-200 rounded-xl text-sm focus:bg-white focus:ring-2 focus:ring-[#012980]/30"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-gray-600 mb-1">State *</label>
                  <input
                    type="text"
                    value={pickupForm.state}
                    onChange={e => setPickupForm(p => ({ ...p, state: e.target.value }))}
                    required
                    placeholder="State"
                    className="block w-full px-3 py-2 bg-gray-50/50 border border-gray-200 rounded-xl text-sm focus:bg-white focus:ring-2 focus:ring-[#012980]/30"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-gray-600 mb-1">Pincode *</label>
                  <input
                    type="text"
                    value={pickupForm.pincode}
                    onChange={e => setPickupForm(p => ({ ...p, pincode: e.target.value }))}
                    required
                    maxLength={6}
                    placeholder="6-digit PIN"
                    className="block w-full px-3 py-2 bg-gray-50/50 border border-gray-200 rounded-xl text-sm focus:bg-white focus:ring-2 focus:ring-[#012980]/30"
                  />
                </div>
              </div>

              <p className="text-[11px] text-gray-500 leading-normal pt-1">
                Saving will automatically synchronize this location nickname with your Shiprocket dispatch account.
              </p>

              <div className="flex items-center justify-end gap-3 pt-3 border-t border-gray-100">
                <button
                  type="button"
                  onClick={() => setPickupModalOpen(false)}
                  disabled={savingPickup}
                  className="px-4 py-2 border border-gray-200 text-gray-700 text-xs font-bold rounded-xl hover:bg-gray-50 transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={savingPickup}
                  className="px-5 py-2 bg-[#fe6603] text-white text-xs font-bold rounded-xl hover:bg-orange-600 transition-colors flex items-center gap-2 shadow-xs disabled:opacity-50"
                >
                  {savingPickup ? (
                    <>
                      <div className="w-3.5 h-3.5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                      <span>Saving & Registering...</span>
                    </>
                  ) : (
                    <span>Save Pickup Address</span>
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

    </div>
  );
}
