import React, { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { Trash2, Plus, Minus, ShoppingCart, Tag, X, CheckCircle2, AlertCircle, ChevronLeft, MapPin, Truck, RefreshCw } from 'lucide-react';
import { Header } from '../components/Header';
import { useCartStore } from '../store/useCartStore';
import { useAuthStore } from '../store/useAuthStore';
import { useToastStore } from '../store/useToastStore';
import { navigateBackSafe } from '../utils/backNavigation';
import api from '../utils/api';
import gsap from 'gsap';
import { useGSAP } from '@gsap/react';

export function CartPage() {
  const navigate = useNavigate();
  const {
    items, removeFromCart, updateQuantity, getSubtotal, getTotal,
    deliveryCharge, platformFee, platformFeePercent, vendorShipments,
    deliveryPincode, setDeliveryPincode, calculateRates, isCalculatingShipping, shippingError
  } = useCartStore();
  const { user, addresses, token, fetchProfile } = useAuthStore();
  const { showToast } = useToastStore();
  const [couponCode, setCouponCode] = useState('');
  const [coupon, setCoupon] = useState(null);   // applied coupon object
  const [couponError, setCouponError] = useState('');
  const [couponLoading, setCouponLoading] = useState(false);
  const [pincodeInput, setPincodeInput] = useState(deliveryPincode || '');
  const [isEditingPincode, setIsEditingPincode] = useState(!deliveryPincode);
  
  const container = useRef(null);
  
  useGSAP(() => {
    if (items.length > 0) {
      gsap.from('.animate-cart-item', {
        x: -30,
        opacity: 0,
        duration: 0.5,
        stagger: 0.1,
        ease: 'power2.out',
        clearProps: 'all'
      });
      gsap.from('.animate-cart-summary', {
        y: 20,
        opacity: 0,
        duration: 0.6,
        delay: 0.3,
        ease: 'power2.out',
        clearProps: 'all'
      });
    }
  }, { scope: container });

  useEffect(() => {
    if (token && (!addresses || addresses.length === 0)) {
      fetchProfile();
    }
  }, [token]);

  useEffect(() => {
    if (!deliveryPincode && addresses && addresses.length > 0 && addresses[0].pincode) {
      const savedPin = String(addresses[0].pincode).trim();
      setPincodeInput(savedPin);
      setDeliveryPincode(savedPin);
      setIsEditingPincode(false);
      calculateRates(savedPin, false, discount);
    } else if (deliveryPincode && deliveryPincode.length === 6) {
      setPincodeInput(deliveryPincode);
      setIsEditingPincode(false);
      calculateRates(deliveryPincode, false, discount);
    }
  }, [deliveryPincode, addresses?.length, items.length]);

  const handleApplyPincode = async (e) => {
    if (e) e.preventDefault();
    const clean = String(pincodeInput || '').replace(/\D/g, '').slice(0, 6);
    if (clean.length !== 6) {
      showToast('Please enter a valid 6-digit delivery pincode', 'error');
      return;
    }
    setDeliveryPincode(clean);
    const res = await calculateRates(clean, false, discount);
    if (res?.success) {
      setIsEditingPincode(false);
      showToast('Delivery charges calculated successfully!');
    } else {
      showToast(res?.error || 'Unable to calculate courier delivery for this pincode.', 'error');
    }
  };

  const handleCheckout = async () => {
    if (!deliveryPincode || deliveryPincode.length !== 6 || deliveryCharge <= 0) {
      if (pincodeInput && pincodeInput.length === 6) {
        const res = await calculateRates(pincodeInput, false, discount);
        if (!res?.success) {
          showToast(res?.error || 'Please enter a valid delivery pincode to calculate shipping.', 'error');
          setIsEditingPincode(true);
          return;
        }
      } else {
        showToast('Please enter your 6-digit delivery pincode to calculate shipping before proceeding.', 'error');
        setIsEditingPincode(true);
        return;
      }
    }
    navigate('/checkout', { state: { couponCode: coupon?.code || couponCode, discount, deliveryPincode } });
  };

  const subtotal = getSubtotal();
  const mrpTotal = items.reduce((sum, item) => sum + (Number(item.variant?.mrp || item.product?.mrp || item.variant?.price || item.product?.price || 0) * item.qty), 0);
  const productSavings = Math.max(0, Math.round((mrpTotal - subtotal) * 100) / 100);
  const totalQty = items.reduce((s, i) => s + i.qty, 0);

  const discount = (() => {
    if (!coupon) return 0;
    const type = coupon.type || coupon.discount_type;
    const val = Number(coupon.value || coupon.discount_value || coupon.discount_percent || 0);

    let applicableSubtotal = subtotal;

    if (coupon.source === 'vendor' && coupon.vendor_id) {
       applicableSubtotal = items.reduce((acc, item) => {
         if (item.product?.vendor_id === coupon.vendor_id) {
            return acc + (item.variant?.price || item.product.price || 0) * item.qty;
         }
         return acc;
       }, 0);
    }
    
    if (applicableSubtotal === 0) return 0;

    if (type === 'percentage' || type === 'percent') {
      return Math.round((applicableSubtotal * val) / 100);
    }
    return Math.min(val, applicableSubtotal);
  })();

  const baseBeforeFee = Math.max(0, subtotal - discount) + (subtotal > 0 ? deliveryCharge : 0);
  const calculatedPlatformFee = platformFee > 0 ? platformFee : (subtotal > 0 ? Math.round(baseBeforeFee * (platformFeePercent / 100) * 100) / 100 : 0);
  const grandTotal = subtotal > 0 ? (baseBeforeFee + calculatedPlatformFee) : 0;

  const handleApplyCoupon = async () => {
    if (!couponCode.trim()) return;
    setCouponLoading(true);
    setCouponError('');
    setCoupon(null);
    try {
      const payload = {
        code: couponCode.trim().toUpperCase(),
        items: items.map(i => ({
           vendor_id: i.product?.vendor_id,
           price: i.variant?.price || i.product.price || 0,
           quantity: i.qty
        }))
      };
      const res = await api.post('/general/coupon/verify', payload);
      setCoupon(res.data.coupon);
    } catch (e) {
      setCouponError(e.response?.data?.error || e.message || 'Invalid coupon');
    } finally {
      setCouponLoading(false);
    }
  };

  const handleRemoveCoupon = () => { setCoupon(null); setCouponCode(''); setCouponError(''); };

  return (
    <div ref={container} className="min-h-screen bg-transparent pb-36">
      {/* App Bar / Header with Back Button */}
      <div className="sticky top-0 z-30 bg-white border-b border-gray-100 px-4 py-3.5 flex items-center justify-between shadow-xs">
        <div className="flex items-center gap-3">
          <button
            onClick={() => navigateBackSafe(navigate, '/')}
            className="p-2 -ml-2 text-gray-700 hover:text-gray-900 hover:bg-gray-100 rounded-full transition-colors border border-gray-200 bg-white shadow-xs"
            aria-label="Back"
          >
            <ChevronLeft className="w-5 h-5" />
          </button>
          <div>
            <h1 className="font-bold text-lg text-gray-900 leading-tight">My Cart</h1>
            <p className="text-xs text-gray-500">{items.length} {items.length === 1 ? 'item' : 'items'}</p>
          </div>
        </div>
        <button
          onClick={() => navigate('/category/all')}
          className="text-xs font-semibold text-brand-navy hover:underline"
        >
          Continue Shopping
        </button>
      </div>
      
      {items.length === 0 ? (
        <div className="flex flex-col items-center justify-center p-8 mt-20 max-w-md mx-auto bg-white rounded-3xl border border-gray-100 shadow-xl">
          <div className="w-24 h-24 bg-brand-navy/10 rounded-full flex items-center justify-center mb-6 border border-brand-navy/20">
            <ShoppingCart className="w-12 h-12 text-brand-navy" strokeWidth={1.5} />
          </div>
          <h2 className="text-xl font-bold text-[#0b162c] mb-2 tracking-tight font-serif" style={{ fontFamily: 'Georgia, serif' }}>Your cart is empty</h2>
          <p className="text-gray-500 mb-8 text-center text-sm">Looks like you haven't added anything to your cart yet. Discover our latest premium collections.</p>
          <button 
            onClick={() => navigate('/')} 
            className="w-full bg-gradient-to-r from-brand-navy to-blue-500 text-white px-6 py-3.5 rounded-xl font-bold shadow-lg hover:shadow-brand-navy/30 hover:-translate-y-0.5 transition-all"
          >
            Start Shopping
          </button>
        </div>
      ) : (
        <div className="p-4 md:p-8 space-y-6 md:space-y-8 md:max-w-7xl mx-auto">
          {/* Step Indicator */}
          <div className="flex justify-between items-center mb-4 px-2 max-w-lg mx-auto">
            <div className="flex flex-col items-center">
              <div className="w-8 h-8 rounded-full bg-[#0b162c] text-white flex items-center justify-center text-sm font-bold shadow-md">1</div>
              <span className="text-[11px] text-[#0b162c] font-bold mt-2">Cart</span>
            </div>
            <div className="h-[2px] bg-gray-200 flex-1 mx-4 relative overflow-hidden">
               <div className="absolute top-0 left-0 h-full w-1/2 bg-gradient-to-r from-[#0b162c] to-transparent opacity-50"></div>
            </div>
            <div className="flex flex-col items-center opacity-50">
              <div className="w-8 h-8 rounded-full bg-gray-100 border border-gray-200 text-gray-500 flex items-center justify-center text-sm font-bold">2</div>
              <span className="text-[11px] text-gray-500 font-bold mt-2">Address</span>
            </div>
            <div className="h-[2px] bg-gray-200 flex-1 mx-4"></div>
            <div className="flex flex-col items-center opacity-50">
              <div className="w-8 h-8 rounded-full bg-gray-100 border border-gray-200 text-gray-500 flex items-center justify-center text-sm font-bold">3</div>
              <span className="text-[11px] text-gray-500 font-bold mt-2">Payment</span>
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 md:gap-12 items-start">
            {/* Left Column: Cart Items */}
            <div className="lg:col-span-8 space-y-4">
              {items.map(item => (
              <div key={`${item.product?.id || item.product_id}-${item.variant?.size || 'default'}`} className="animate-cart-item bg-white rounded-2xl shadow-sm border border-gray-100 hover:border-gray-200 hover:shadow-md transition-all p-3 sm:p-4 flex gap-3 sm:gap-4 relative overflow-hidden">
                <div className="w-20 h-20 sm:w-24 sm:h-24 bg-gray-50 rounded-xl shrink-0 p-1.5 sm:p-2 border border-gray-100 flex items-center justify-center self-start">
                  <img src={item.product?.images && item.product.images.length > 0 ? item.product.images[0] : item.product?.image_url} alt={item.product?.name || 'Product'} className="w-full h-full object-contain mix-blend-multiply" />
                </div>
                
                <div className="flex flex-col justify-between py-0.5 flex-1 min-w-0">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0 flex-1">
                      <h3 className="text-sm sm:text-base font-bold text-gray-900 leading-snug line-clamp-2">{item.product?.name}</h3>
                      <div className="flex gap-1.5 flex-wrap mt-1">
                        <span className="text-[10px] sm:text-[11px] text-gray-600 font-semibold bg-gray-100 border border-gray-200 px-2 py-0.5 rounded-md">
                          {item.variant?.size || 'Standard'}
                        </span>
                        {item.product?.color && (
                          <span className="text-[10px] sm:text-[11px] text-brand-navy font-semibold bg-brand-navy/10 border border-brand-navy/20 px-2 py-0.5 rounded-md">
                            {item.product.color}
                          </span>
                        )}
                      </div>
                    </div>

                    <button 
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        removeFromCart(item.product?.id || item.product_id, item.variant);
                      }}
                      className="text-gray-400 hover:text-red-500 hover:bg-red-50 p-1.5 rounded-lg transition-colors shrink-0 -mr-1 -mt-1 active:scale-90"
                      aria-label="Remove item"
                      title="Remove item"
                    >
                      <Trash2 className="w-4 h-4 sm:w-5 sm:h-5" />
                    </button>
                  </div>
                  
                  {(() => {
                    const maxStock = item.product?.stock !== null && item.product?.stock !== undefined ? parseInt(item.product.stock, 10) : 999;
                    const isAtMax = item.qty >= maxStock;
                    const iPrice = Number(item.variant?.price ?? item.product?.price ?? 0);
                    const iMrp = Number(item.variant?.mrp ?? item.product?.mrp ?? iPrice);
                    const iDiscount = item.variant?.discount_percent ?? item.product?.discount_percent ?? (iMrp > iPrice ? Math.round(((iMrp - iPrice) / iMrp) * 100) : 0);

                    return (
                      <div className="mt-2.5">
                        {/* Price Row: unconstrained horizontal space so price, MRP, and discount badge never push controls */}
                        <div className="flex flex-wrap items-baseline gap-1.5 sm:gap-2">
                          <span className="font-extrabold text-base sm:text-xl text-[#0b162c] tracking-tight">
                            ₹{iPrice.toLocaleString('en-IN')}
                          </span>
                          {iMrp > iPrice && iDiscount > 0 && (
                            <div className="inline-flex items-center gap-1.5 flex-wrap">
                              <span className="text-xs text-gray-400 line-through">₹{iMrp.toLocaleString('en-IN')}</span>
                              <span className="text-[10px] sm:text-[11px] font-bold text-emerald-600 bg-emerald-50 border border-emerald-100 px-1.5 py-0.5 rounded">
                                {iDiscount}% OFF
                              </span>
                            </div>
                          )}
                        </div>

                        {/* Controls Row: Max stock badge on left (if reached) and Stepper aligned right, guaranteed inside card */}
                        <div className="flex items-center justify-between gap-2 mt-2 pt-1 border-t border-gray-50/80">
                          <div className="min-w-0 flex-1">
                            {isAtMax && (
                              <p className="text-[10px] font-semibold text-amber-700 bg-amber-50 border border-amber-200 px-1.5 py-0.5 rounded inline-block truncate max-w-full">
                                Max stock ({maxStock}) reached
                              </p>
                            )}
                          </div>

                          <div className="flex items-center bg-gray-50 border border-gray-200 rounded-xl p-0.5 sm:p-1 shrink-0 ml-auto shadow-xs">
                            <button 
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                if (item.qty <= 1) {
                                  removeFromCart(item.product?.id || item.product_id, item.variant);
                                } else {
                                  updateQuantity(item.product?.id || item.product_id, item.variant, item.qty - 1);
                                }
                              }}
                              className="w-7 h-7 sm:w-8 sm:h-8 flex items-center justify-center text-gray-600 hover:bg-brand-navy/10 hover:text-brand-navy rounded-lg transition-colors active:scale-90"
                              aria-label={item.qty <= 1 ? "Remove item" : "Decrease quantity"}
                              title={item.qty <= 1 ? "Remove item" : "Decrease quantity"}
                            >
                              {item.qty <= 1 ? <Trash2 className="w-3.5 h-3.5 text-red-500" /> : <Minus className="w-3.5 h-3.5 sm:w-4 sm:h-4" />}
                            </button>
                            <span className="w-7 sm:w-8 text-center text-xs sm:text-[13px] font-extrabold text-[#0b162c] select-none">
                              {item.qty}
                            </span>
                            <button 
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                if (isAtMax) {
                                  showToast(`Maximum available stock is ${maxStock}`, 'error');
                                  return;
                                }
                                updateQuantity(item.product?.id || item.product_id, item.variant, item.qty + 1);
                              }}
                              disabled={isAtMax}
                              className={`w-7 h-7 sm:w-8 sm:h-8 flex items-center justify-center rounded-lg transition-colors ${
                                isAtMax
                                  ? 'text-gray-300 cursor-not-allowed bg-gray-100'
                                  : 'text-gray-600 hover:bg-brand-navy/10 hover:text-brand-navy active:scale-90'
                              }`}
                              aria-label="Increase quantity"
                              title={isAtMax ? `Max stock (${maxStock}) reached` : 'Increase quantity'}
                            >
                              <Plus className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
                            </button>
                          </div>
                        </div>
                      </div>
                    );
                  })()}
                </div>
              </div>
              ))}
            </div>            {/* Right Column: Summary & Checkout */}
            <div className="lg:col-span-4 space-y-6 lg:sticky lg:top-24">
              {/* Coupon */}
              <div className="animate-cart-summary bg-white rounded-2xl border border-gray-100 p-6 shadow-xl">
                <div className="flex items-center gap-2 mb-4">
                  <Tag className="w-5 h-5 text-[#0b162c]" />
                  <span className="text-base font-bold text-[#0b162c] font-serif" style={{ fontFamily: 'Georgia, serif' }}>Apply Coupon</span>
                </div>
                {coupon ? (
                  <div className="flex items-center justify-between bg-green-500/10 border border-green-500/30 rounded-xl px-4 py-3">
                    <div className="flex items-center gap-3">
                      <CheckCircle2 className="w-5 h-5 text-[#0b162c]" />
                      <div>
                        <p className="text-sm font-bold text-[#0b162c]">{coupon.code}</p>
                        <p className="text-xs text-[#0b162c]/80">You save ₹{discount}</p>
                      </div>
                    </div>
                    <button onClick={handleRemoveCoupon} className="text-gray-400 hover:text-red-400 transition-colors">
                      <X className="w-5 h-5" />
                    </button>
                  </div>
                ) : (
                  <>
                    <div className="flex gap-2">
                      <input
                        type="text"
                        value={couponCode}
                        onChange={e => { setCouponCode(e.target.value.toUpperCase()); setCouponError(''); }}
                        onKeyDown={e => e.key === 'Enter' && handleApplyCoupon()}
                        placeholder="Enter coupon code"
                        className="flex-1 min-w-0 bg-gray-50 border border-gray-200 rounded-xl px-4 py-3 text-sm text-[#0b162c] font-medium focus:outline-none focus:border-brand-navy transition-all placeholder-gray-400 focus:bg-white"
                      />
                      <button onClick={handleApplyCoupon} disabled={couponLoading || !couponCode.trim()}
                        className="shrink-0 bg-[#0b162c] text-white font-bold text-sm px-4 sm:px-6 py-3 rounded-xl hover:bg-[#15284b] shadow-md transition-all disabled:opacity-50">
                        {couponLoading ? '...' : 'APPLY'}
                      </button>
                    </div>
                    {couponError && (
                      <div className="flex items-center gap-1.5 mt-3 text-xs text-red-400">
                        <AlertCircle className="w-4 h-4" /> {couponError}
                      </div>
                    )}
                  </>
                )}
              </div>

          {/* Delivery Pincode Card */}
          <div className="animate-cart-summary bg-white p-5 rounded-2xl shadow-sm border border-gray-100">
            {deliveryPincode && !isEditingPincode ? (
              <div className="flex flex-col gap-2.5">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2.5">
                    <div className="w-8 h-8 rounded-full bg-blue-50 border border-blue-100 flex items-center justify-center text-[#0b162c]">
                      <MapPin className="w-4 h-4 text-blue-600" />
                    </div>
                    <div>
                      <div className="text-xs text-gray-500 font-medium">Deliver to</div>
                      <div className="text-sm font-bold text-gray-900 flex items-center gap-1.5">
                        {deliveryPincode}
                        {isCalculatingShipping ? (
                          <span className="text-[11px] text-blue-600 font-normal animate-pulse">Calculating...</span>
                        ) : deliveryCharge > 0 ? (
                          <span className="text-[11px] text-green-700 font-semibold bg-green-50 px-2 py-0.5 rounded-full border border-green-200">
                            Serviceable
                          </span>
                        ) : null}
                      </div>
                    </div>
                  </div>
                  <button
                    onClick={() => setIsEditingPincode(true)}
                    className="text-xs font-bold text-brand-navy hover:underline bg-gray-50 px-3 py-1.5 rounded-lg border border-gray-200 transition-colors"
                  >
                    Change
                  </button>
                </div>

                {vendorShipments && vendorShipments.length > 0 && (
                  <div className="mt-2 pt-2.5 border-t border-gray-100 space-y-1.5 text-xs text-gray-600">
                    <div className="font-semibold text-gray-800 flex items-center justify-between">
                      <span className="flex items-center gap-1">
                        <Truck className="w-3.5 h-3.5 text-brand-navy" />
                        {vendorShipments.length} {vendorShipments.length === 1 ? 'Courier Shipment' : 'Multi-Vendor Shipments'}
                      </span>
                      <span className="text-gray-900 font-bold">₹{deliveryCharge.toFixed(2)} total</span>
                    </div>
                    {vendorShipments.map((s, idx) => (
                      <div key={idx} className="flex justify-between text-[11px] text-gray-500 pl-4">
                        <span>{s.vendorName || `Package ${idx + 1}`} ({s.courierName || 'Courier'})</span>
                        <span className="font-medium text-gray-700">₹{s.shippingCharge.toFixed(2)}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            ) : (
              <div className="space-y-3">
                <div className="flex items-center gap-2 text-xs font-bold text-gray-800 uppercase tracking-wide">
                  <MapPin className="w-4 h-4 text-brand-navy" />
                  <span>Delivery Pincode</span>
                </div>
                <div className="flex gap-2">
                  <input
                    type="text"
                    maxLength={6}
                    inputMode="numeric"
                    value={pincodeInput}
                    onChange={e => setPincodeInput(e.target.value.replace(/\D/g, '').slice(0, 6))}
                    onKeyDown={e => e.key === 'Enter' && handleApplyPincode()}
                    placeholder="Enter 6-digit delivery pincode"
                    className="flex-1 min-w-0 bg-gray-50 border border-gray-200 rounded-xl px-4 py-2.5 text-sm font-bold text-gray-900 outline-none focus:border-brand-navy focus:bg-white transition-all placeholder:font-normal placeholder-gray-400"
                  />
                  <button
                    onClick={handleApplyPincode}
                    disabled={isCalculatingShipping || pincodeInput.length !== 6}
                    className="shrink-0 bg-[#0b162c] text-white font-bold text-xs px-4 py-2.5 rounded-xl hover:bg-[#15284b] shadow-xs transition-all disabled:opacity-50 flex items-center gap-1"
                  >
                    {isCalculatingShipping ? (
                      <>
                        <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                        <span>Checking</span>
                      </>
                    ) : (
                      'CHECK'
                    )}
                  </button>
                </div>
                {shippingError ? (
                  <div className="flex items-center gap-1.5 text-xs text-red-600 font-medium">
                    <AlertCircle className="w-4 h-4 shrink-0" />
                    <span>{shippingError}</span>
                  </div>
                ) : (
                  <p className="text-[11px] text-amber-700 font-medium flex items-center gap-1">
                    <AlertCircle className="w-3.5 h-3.5 shrink-0" />
                    Enter delivery pincode to calculate exact live courier charges
                  </p>
                )}
              </div>
            )}
          </div>

          {/* Bill Details */}
          <div className="animate-cart-summary bg-white p-6 rounded-2xl shadow-xl border border-gray-100">
            <h3 className="font-bold text-[#0b162c] mb-5 pb-4 border-b border-gray-100 text-lg flex items-center gap-2 font-serif" style={{ fontFamily: 'Georgia, serif' }}>
              <span className="w-1.5 h-5 bg-brand-navy rounded-full inline-block"></span>
              Price Details
            </h3>
            <div className="space-y-4">
              {productSavings > 0 ? (
                <>
                  <div className="flex justify-between text-[15px] text-gray-600">
                    <span>Total MRP ({items.length} items)</span>
                    <span className="font-medium text-gray-900">₹{mrpTotal.toFixed(2)}</span>
                  </div>
                  <div className="flex justify-between text-[15px] text-emerald-600 font-semibold">
                    <span>Product Discount</span>
                    <span>- ₹{productSavings.toFixed(2)}</span>
                  </div>
                  <div className="flex justify-between text-[15px] text-gray-600">
                    <span>Item Subtotal</span>
                    <span className="font-medium text-gray-900">₹{subtotal.toFixed(2)}</span>
                  </div>
                </>
              ) : (
                <div className="flex justify-between text-[15px] text-gray-600">
                  <span>Item Total ({items.length} items)</span>
                  <span className="font-medium text-gray-900">₹{subtotal.toFixed(2)}</span>
                </div>
              )}
              <div className="flex justify-between text-[15px] text-gray-600">
                <span>Delivery Charges</span>
                <span className="font-medium text-[#0b162c]">
                  {isCalculatingShipping ? (
                    <span className="text-blue-600 font-semibold animate-pulse text-xs">Calculating...</span>
                  ) : deliveryCharge > 0 ? (
                    `₹${deliveryCharge.toFixed(2)}`
                  ) : (
                    <span className="text-amber-700 font-semibold text-xs">Enter delivery pincode</span>
                  )}
                </span>
              </div>
              <div className="flex justify-between text-[15px] text-gray-600">
                <span className="flex items-center gap-1">
                  Platform Fee ({platformFeePercent}%)
                </span>
                <span className="font-medium text-[#0b162c]">
                  {deliveryCharge > 0 ? (
                    `₹${calculatedPlatformFee.toFixed(2)}`
                  ) : (
                    <span className="text-gray-400 text-xs font-medium">Requires delivery pincode</span>
                  )}
                </span>
              </div>
              {discount > 0 && (
                <div className="flex justify-between text-[15px] text-brand-navy font-semibold">
                  <span>Coupon Discount</span>
                  <span>- ₹{discount.toFixed(2)}</span>
                </div>
              )}
                <div className="flex justify-between font-extrabold text-[#0b162c] text-xl pt-5 mt-4 border-t border-dashed border-gray-200">
                  <span>Grand Total</span>
                  <span className="text-brand-navy">
                    {deliveryCharge > 0 ? (
                      `₹${grandTotal.toFixed(2)}`
                    ) : (
                      <span className="text-gray-900 font-bold text-lg">
                        ₹{(subtotal - discount).toFixed(2)}
                        <span className="text-xs font-normal text-gray-500 ml-1">+ Delivery</span>
                      </span>
                    )}
                  </span>
                </div>
                
                <button 
                  onClick={handleCheckout}
                  className="hidden lg:flex w-full mt-8 bg-gradient-to-r from-brand-navy to-blue-500 hover:shadow-brand-navy/30 text-white font-bold text-base rounded-2xl py-4 shadow-lg hover:shadow-xl hover:-translate-y-1 transition-all items-center justify-center gap-2"
                >
                  Proceed to Checkout
                </button>
              </div>
            </div>
            </div>
          </div>
        </div>
      )}

      {/* Sticky Checkout Bar - Mobile Only */}
      {items.length > 0 && (
        <div className="lg:hidden fixed bottom-0 left-0 right-0 mx-auto w-full bg-white border-t border-gray-100 p-4 pb-safe z-50 shadow-[0_-10px_30px_rgba(0,0,0,0.05)]">
          <div className="max-w-5xl mx-auto flex items-center justify-between gap-4">
            <div className="hidden sm:block">
              <p className="text-[11px] font-bold text-gray-500 uppercase tracking-wider mb-0.5">Total Amount</p>
              <p className="text-xl font-bold text-gray-900 leading-none">₹{grandTotal.toFixed(2)}</p>
            </div>
            <button 
              onClick={handleCheckout}
              className="flex-1 sm:max-w-md bg-gradient-to-r from-brand-navy to-blue-500 hover:shadow-brand-navy/30 text-white font-bold text-[15px] rounded-full py-4 shadow-md hover:-translate-y-0.5 transition-all flex items-center justify-center gap-2"
            >
              Proceed to Checkout
              <span className="w-1 h-1 bg-white/50 rounded-full mx-1" />
              Step 2
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
