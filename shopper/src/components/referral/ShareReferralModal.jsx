import React, { useState, useEffect } from 'react';
import { Store, ShoppingBag, ChevronRight, ArrowLeft, X, Copy, Check, Share2, MessageCircle } from 'lucide-react';
import { toast } from 'react-toastify';
import { registerModal } from '../../utils/backNavigation';

export function ShareReferralModal({ isOpen, onClose, referralCode }) {
  const [modalStep, setModalStep] = useState('select'); // 'select' | 'details'
  const [selectedTarget, setSelectedTarget] = useState(null); // 'vendor' | 'customer'
  const [copiedLink, setCopiedLink] = useState(false);

  useEffect(() => {
    if (!isOpen) return;
    return registerModal(() => {
      if (modalStep === 'details') {
        setModalStep('select');
        return;
      }
      handleClose();
    });
  }, [isOpen, modalStep]);

  if (!isOpen) return null;

  const handleClose = () => {
    setModalStep('select');
    setSelectedTarget(null);
    setCopiedLink(false);
    onClose();
  };

  const selectShareTarget = (type) => {
    setSelectedTarget(type);
    setCopiedLink(false);
    setModalStep('details');
  };

  // Generate dynamic URLs based on current origin and referral code
  const currentOrigin = typeof window !== 'undefined' ? window.location.origin : '';
  const baseOrigin = (import.meta.env.VITE_APP_URL || currentOrigin).replace(/\/$/, '');
  const code = (referralCode || '').trim();

  const vendorShareUrl = `${baseOrigin}/vendor-signup?ref=${code}`;
  const customerShareUrl = `${baseOrigin}/?ref=${code}`;

  const currentUrl = selectedTarget === 'vendor' ? vendorShareUrl : customerShareUrl;
  const currentTitle = selectedTarget === 'vendor' ? 'Sell on Shopper - Vendor Registration' : 'Shop on Shopper - Amazing Products & Deals';
  const currentMessage = selectedTarget === 'vendor'
    ? `Join Swabhivar Shoppers as a vendor and start growing your business today! Register using my referral link:\n${vendorShareUrl}`
    : `Shop the best deals and quality products on Swabhivar Shoppers! Check it out here:\n${customerShareUrl}`;

  const handleCopyLink = async () => {
    try {
      await navigator.clipboard.writeText(currentUrl);
      setCopiedLink(true);
      toast.success('Referral link copied to clipboard!');
      setTimeout(() => setCopiedLink(false), 2500);
    } catch (e) {
      toast.error('Could not copy link');
    }
  };

  const handleNativeShare = async () => {
    if (navigator.share) {
      try {
        await navigator.share({
          title: currentTitle,
          text: currentMessage,
          url: currentUrl
        });
      } catch (err) {
        if (err.name !== 'AbortError') {
          handleCopyLink();
        }
      }
    } else {
      handleCopyLink();
    }
  };

  const handleWhatsAppShare = () => {
    const waUrl = `https://wa.me/?text=${encodeURIComponent(currentMessage)}`;
    window.open(waUrl, '_blank', 'noopener,noreferrer');
  };

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 animate-fade-in pb-16 sm:pb-4">
      <div className="fixed inset-0" onClick={handleClose} />

      <div className="relative z-10 bg-white w-full max-w-sm sm:max-w-md rounded-[28px] shadow-2xl overflow-hidden border border-gray-100 transition-all max-h-[82vh] flex flex-col my-auto">
        {/* Modal Header */}
        <div className="px-5 py-4 border-b border-gray-100 flex items-center justify-between bg-white shrink-0">
          <div className="flex items-center gap-2.5">
            {modalStep === 'details' && (
              <button 
                onClick={() => setModalStep('select')}
                className="p-1 -ml-1 text-gray-500 hover:text-gray-800 rounded-lg transition"
                title="Back to options"
              >
                <ArrowLeft className="w-5 h-5" />
              </button>
            )}
            <div>
              <h3 className="text-lg font-bold text-gray-900 leading-tight">
                {modalStep === 'select' ? 'Share Referral' : (selectedTarget === 'vendor' ? 'Refer a Vendor' : 'Refer a Customer')}
              </h3>
              <p className="text-xs text-gray-500 mt-0.5">
                {modalStep === 'select' 
                  ? 'Choose who you want to invite to Shopper' 
                  : (selectedTarget === 'vendor' ? 'Invite someone to sell on Shopper' : 'Invite someone to shop on Shopper')}
              </p>
            </div>
          </div>
          <button 
            onClick={handleClose}
            className="p-1.5 text-gray-400 hover:text-gray-700 rounded-full hover:bg-gray-100 transition"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Modal Body */}
        <div className="p-5 overflow-y-auto">
          {modalStep === 'select' ? (
            /* STEP 1: SELECT VENDOR OR CUSTOMER */
            <div className="space-y-3.5">
              {/* OPTION 1: REFER A VENDOR */}
              <button
                onClick={() => selectShareTarget('vendor')}
                className="w-full text-left p-4 rounded-2xl border-2 border-gray-100 hover:border-orange-500/80 bg-white hover:bg-orange-50/20 transition-all duration-200 shadow-sm hover:shadow group flex items-center gap-3.5 active:scale-[0.98]"
              >
                <div className="w-11 h-11 rounded-2xl bg-orange-100 text-orange-600 flex items-center justify-center shrink-0 group-hover:scale-105 transition-transform">
                  <Store className="w-5 h-5" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between">
                    <h4 className="font-extrabold text-gray-900 text-sm tracking-wide">
                      REFER A VENDOR
                    </h4>
                    <ChevronRight className="w-4 h-4 text-gray-400 group-hover:text-orange-500 transition-colors" />
                  </div>
                  <p className="text-xs text-gray-500 mt-1 leading-snug">
                    Invite someone to register as a vendor and sell on Shopper.
                  </p>
                </div>
              </button>

              {/* OPTION 2: REFER A CUSTOMER */}
              <button
                onClick={() => selectShareTarget('customer')}
                className="w-full text-left p-4 rounded-2xl border-2 border-gray-100 hover:border-[#012980]/80 bg-white hover:bg-blue-50/20 transition-all duration-200 shadow-sm hover:shadow group flex items-center gap-3.5 active:scale-[0.98]"
              >
                <div className="w-11 h-11 rounded-2xl bg-blue-100 text-[#012980] flex items-center justify-center shrink-0 group-hover:scale-105 transition-transform">
                  <ShoppingBag className="w-5 h-5" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between">
                    <h4 className="font-extrabold text-gray-900 text-sm tracking-wide">
                      REFER A CUSTOMER
                    </h4>
                    <ChevronRight className="w-4 h-4 text-gray-400 group-hover:text-[#012980] transition-colors" />
                  </div>
                  <p className="text-xs text-gray-500 mt-1 leading-snug">
                    Invite someone to download/open the customer shopping app and shop on Shopper.
                  </p>
                </div>
              </button>
            </div>
          ) : (
            /* STEP 2: SHARE INTERFACE WITH DESTINATION & ACTIONS */
            <div className="space-y-4">
              {/* Destination Info Box */}
              <div className={`p-3.5 rounded-2xl border text-xs ${
                selectedTarget === 'vendor' 
                  ? 'bg-orange-50/70 border-orange-200 text-orange-900' 
                  : 'bg-blue-50/70 border-blue-200 text-blue-900'
              }`}>
                <div className="flex items-center gap-2 font-bold mb-1">
                  {selectedTarget === 'vendor' ? <Store className="w-4 h-4 text-orange-600" /> : <ShoppingBag className="w-4 h-4 text-[#012980]" />}
                  <span>Destination: {selectedTarget === 'vendor' ? 'Vendor Registration Page' : 'Customer Shopping App'}</span>
                </div>
                <p className="opacity-80 text-[11px] leading-snug">
                  {selectedTarget === 'vendor' 
                    ? 'Opens the vendor signup form with your referral code automatically applied.'
                    : 'Opens the shopping app and attributes customer orders to your referral code.'}
                </p>
              </div>

              {/* Destination URL Display Box */}
              <div>
                <label className="block text-xs font-bold text-gray-600 mb-1.5 uppercase tracking-wider">
                  Generated Referral Link
                </label>
                <div className="flex items-center gap-2 p-2.5 bg-gray-50 rounded-xl border border-gray-200">
                  <input 
                    type="text" 
                    readOnly 
                    value={currentUrl} 
                    className="bg-transparent text-xs text-gray-700 font-mono flex-1 outline-none truncate"
                  />
                  <button
                    onClick={handleCopyLink}
                    className={`px-3 py-1.5 rounded-lg text-xs font-bold flex items-center gap-1.5 transition ${
                      copiedLink 
                        ? 'bg-green-600 text-white' 
                        : 'bg-white text-gray-700 border border-gray-300 hover:bg-gray-100'
                    }`}
                  >
                    {copiedLink ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
                    {copiedLink ? 'Copied' : 'Copy'}
                  </button>
                </div>
              </div>

              {/* Share Action Buttons */}
              <div className="space-y-2 pt-1">
                <button
                  onClick={handleNativeShare}
                  className="w-full py-3 px-4 rounded-xl font-bold text-sm bg-gradient-to-r from-[#012980] to-[#0240be] text-white hover:opacity-95 transition shadow-sm flex items-center justify-center gap-2 active:scale-[0.99]"
                >
                  <Share2 className="w-4 h-4" />
                  Share Link
                </button>

                <button
                  onClick={handleWhatsAppShare}
                  className="w-full py-3 px-4 rounded-xl font-bold text-sm bg-[#25D366] hover:bg-[#20bd5a] text-white transition shadow-sm flex items-center justify-center gap-2 active:scale-[0.99]"
                >
                  <MessageCircle className="w-4 h-4 fill-white text-[#25D366]" />
                  Share on WhatsApp
                </button>

                <button
                  onClick={handleCopyLink}
                  className="w-full py-2.5 px-4 rounded-xl font-semibold text-xs border border-gray-200 text-gray-700 hover:bg-gray-50 transition flex items-center justify-center gap-1.5"
                >
                  <Copy className="w-3.5 h-3.5" />
                  Copy Destination URL
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
