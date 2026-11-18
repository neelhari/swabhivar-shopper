import React from 'react';
import { X, User, Store, Mail, Phone, MapPin, Truck } from 'lucide-react';

export function VendorDetailsModal({ vendor, isOpen, onClose }) {
  if (!isOpen || !vendor) return null;

  const hasName = Boolean(vendor.name && String(vendor.name).trim());
  const hasStore = Boolean(vendor.store_name && String(vendor.store_name).trim());
  const hasEmail = Boolean((vendor.email || vendor.vendor_email) && String(vendor.email || vendor.vendor_email).trim());
  const hasPhone = Boolean(vendor.phone && String(vendor.phone).trim());
  const hasPickup = Boolean(vendor.pickup_contact_name || vendor.pickup_address_line1 || vendor.pickup_city);

  const emailVal = vendor.email || vendor.vendor_email;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm animate-fade-in">
      <div 
        className="bg-white rounded-2xl shadow-2xl border border-gray-100 w-full max-w-md overflow-hidden animate-scale-up"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100 bg-gray-50/50">
          <div>
            <h3 className="font-bold text-gray-900 text-base">Vendor Details</h3>
            {vendor.id && (
              <p className="text-xs text-gray-500 mt-0.5">Vendor ID #{vendor.id}</p>
            )}
          </div>
          <button
            onClick={onClose}
            className="p-1.5 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-lg transition-colors"
            title="Close"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content */}
        <div className="p-6 space-y-3.5 max-h-[80vh] overflow-y-auto">
          {hasName && (
            <div className="flex items-start gap-3 p-3 rounded-xl bg-gray-50/70 border border-gray-100">
              <div className="w-9 h-9 rounded-lg bg-blue-50 text-blue-600 flex items-center justify-center shrink-0">
                <User className="w-4 h-4" />
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider">Vendor Name</p>
                <p className="text-sm font-semibold text-gray-900 truncate mt-0.5">{vendor.name}</p>
              </div>
            </div>
          )}

          {hasStore && (
            <div className="flex items-start gap-3 p-3 rounded-xl bg-gray-50/70 border border-gray-100">
              <div className="w-9 h-9 rounded-lg bg-amber-50 text-amber-600 flex items-center justify-center shrink-0">
                <Store className="w-4 h-4" />
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider">Store Name</p>
                <p className="text-sm font-semibold text-gray-900 truncate mt-0.5">{vendor.store_name}</p>
              </div>
            </div>
          )}

          {hasEmail && (
            <div className="flex items-start gap-3 p-3 rounded-xl bg-gray-50/70 border border-gray-100">
              <div className="w-9 h-9 rounded-lg bg-emerald-50 text-emerald-600 flex items-center justify-center shrink-0">
                <Mail className="w-4 h-4" />
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider">Email Address</p>
                <a 
                  href={`mailto:${emailVal}`}
                  className="text-sm font-semibold text-emerald-700 hover:underline truncate block mt-0.5"
                >
                  {emailVal}
                </a>
              </div>
            </div>
          )}

          {hasPhone && (
            <div className="flex items-start gap-3 p-3 rounded-xl bg-gray-50/70 border border-gray-100">
              <div className="w-9 h-9 rounded-lg bg-indigo-50 text-indigo-600 flex items-center justify-center shrink-0">
                <Phone className="w-4 h-4" />
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider">Contact Number</p>
                <a 
                  href={`tel:${vendor.phone}`}
                  className="text-sm font-semibold text-indigo-700 hover:underline truncate block mt-0.5"
                >
                  {vendor.phone}
                </a>
              </div>
            </div>
          )}

          {hasPickup && (
            <div className="p-3.5 rounded-xl bg-orange-50/60 border border-orange-200/80 space-y-1.5">
              <div className="flex items-center gap-2">
                <MapPin className="w-4 h-4 text-[#fe6603]" />
                <span className="text-xs font-bold text-orange-950 uppercase tracking-wider">Shiprocket Pickup Address</span>
              </div>
              <div className="text-xs text-gray-800 leading-relaxed pl-6">
                <p className="font-bold">{vendor.pickup_contact_name} (Ph: {vendor.pickup_phone})</p>
                <p className="text-gray-600">
                  {vendor.pickup_address_line1}{vendor.pickup_address_line2 ? `, ${vendor.pickup_address_line2}` : ''}, {vendor.pickup_city}, {vendor.pickup_state} — {vendor.pickup_pincode}
                </p>
                {vendor.shiprocket_pickup_name && (
                  <p className="text-[10px] font-mono text-orange-800 font-semibold mt-1">
                    Location: {vendor.shiprocket_pickup_name}
                  </p>
                )}
              </div>
            </div>
          )}

          {!hasName && !hasStore && !hasEmail && !hasPhone && !hasPickup && (
            <p className="text-sm text-gray-500 text-center py-4">No additional vendor details available.</p>
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-3.5 bg-gray-50/50 border-t border-gray-100 flex justify-end">
          <button
            onClick={onClose}
            className="px-4 py-2 bg-gray-900 text-white rounded-xl text-xs font-semibold hover:bg-gray-800 transition-colors shadow-sm"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
}

