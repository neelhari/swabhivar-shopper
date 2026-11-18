import React, { useState, useEffect } from 'react';
import { Search, ShoppingBag, Eye, User, Truck, ExternalLink, CheckCircle2, AlertCircle } from 'lucide-react';
import { toast } from 'react-toastify';
import { Link } from 'react-router-dom';
import { VendorDetailsModal } from '../../components/admin/VendorDetailsModal';

const BACKEND_URL = import.meta.env.VITE_BACKEND_URL || "http://localhost:5000/api";

export function AdminVendorOrdersPage() {
  const [orders, setOrders] = useState([]);
  const [vendorsMap, setVendorsMap] = useState({});
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedVendor, setSelectedVendor] = useState(null);
  const [modalOpen, setModalOpen] = useState(false);
  const [dispatching, setDispatching] = useState({});

  const fetchVendors = async () => {
    try {
      const token = localStorage.getItem('token');
      const res = await fetch(`${BACKEND_URL}/admin/vendors`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (res.ok) {
        const data = await res.json();
        const map = {};
        (data.vendors || []).forEach(v => { map[v.id] = v; });
        setVendorsMap(map);
      }
    } catch {}
  };

  const fetchOrders = async () => {
    try {
      const token = localStorage.getItem('token');
      const res = await fetch(`${BACKEND_URL}/admin/vendor-orders`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      const data = await res.json();
      if (res.ok) {
        setOrders(data.orders || []);
      }
    } catch (error) {
      toast.error('Failed to load vendor orders');
    } finally {
      setLoading(false);
    }
  };

  const handleOpenVendor = (vendorId) => {
    const v = vendorsMap[vendorId] || {};
    setSelectedVendor({
      id: vendorId,
      name: v.name || '',
      store_name: v.store_name || '',
      email: v.email || '',
      phone: v.phone || '',
      pickup_contact_name: v.pickup_contact_name || '',
      pickup_phone: v.pickup_phone || '',
      pickup_address_line1: v.pickup_address_line1 || '',
      pickup_city: v.pickup_city || '',
      pickup_state: v.pickup_state || '',
      pickup_pincode: v.pickup_pincode || '',
      shiprocket_pickup_name: v.shiprocket_pickup_name || ''
    });
    setModalOpen(true);
  };

  const handleDispatchVendor = async (orderId, vendorId) => {
    const key = `vnd_${orderId}_${vendorId}`;
    setDispatching(prev => ({ ...prev, [key]: true }));
    try {
      const token = localStorage.getItem('token');
      const res = await fetch(`${BACKEND_URL}/admin/orders/${orderId}/dispatch-vendor/${vendorId}`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${token}` }
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to dispatch package');

      toast.success(`Vendor #${vendorId} package dispatched! AWB: ${data.shipment?.awb_code || 'Assigned'}`);
      fetchOrders();
    } catch (err) {
      toast.error(err.message || 'Dispatch failed');
    } finally {
      setDispatching(prev => ({ ...prev, [key]: false }));
    }
  };

  const executePayVendor = async (payoutId) => {
    try {
      const token = localStorage.getItem('token');
      const res = await fetch(`${BACKEND_URL}/admin/vendor-order-payout/${payoutId}`, {
        method: 'PUT',
        headers: { 'Authorization': `Bearer ${token}` }
      });
      const data = await res.json();
      if (res.ok) {
        toast.success('Vendor marked as paid successfully');
        fetchOrders();
      } else {
        toast.error(data.error || 'Failed to pay vendor');
      }
    } catch (error) {
      toast.error('Failed to pay vendor');
    }
  };

  const handlePayVendor = (payoutId) => {
    toast(
      ({ closeToast }) => (
        <div>
          <p className="text-sm font-medium text-gray-800 mb-3">Confirm payout to vendor?</p>
          <div className="flex justify-end gap-2">
            <button className="px-3 py-1.5 bg-gray-100 text-gray-700 rounded-lg text-xs font-medium hover:bg-gray-200" onClick={closeToast}>Cancel</button>
            <button className="px-3 py-1.5 bg-[#012980] text-white rounded-lg text-xs font-medium hover:bg-blue-900" onClick={() => { executePayVendor(payoutId); closeToast(); }}>Confirm</button>
          </div>
        </div>
      ),
      { autoClose: false, closeOnClick: false }
    );
  };

  useEffect(() => {
    fetchOrders();
    fetchVendors();
  }, []);

  const filteredOrders = orders.filter(o => {
    if (!searchTerm) return true;
    const term = searchTerm.toLowerCase();
    return (
      String(o.order_number || o.id || '').toLowerCase().includes(term) ||
      String(o.user_name || '').toLowerCase().includes(term)
    );
  });

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Vendor Orders</h1>
          <p className="text-gray-500 mt-1">Monitor orders containing vendor products and manage dispatches.</p>
        </div>
        <Link
          to="/admin/orders"
          className="inline-flex items-center gap-2 px-4 py-2 bg-[#012980] text-white rounded-xl text-xs font-bold hover:bg-blue-900 transition-colors shadow-xs w-fit"
        >
          <span>Open Unified Orders View</span>
          <ExternalLink className="w-3.5 h-3.5" />
        </Link>
      </div>

      <div className="bg-white p-4 rounded-xl shadow-sm border border-gray-100 flex items-center gap-4">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
          <input
            type="text"
            placeholder="Search by Order ID or Customer Name..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full pl-10 pr-4 py-2 bg-gray-50 border border-gray-200 rounded-lg text-gray-900 focus:outline-none focus:ring-2 focus:ring-[#012980]"
          />
        </div>
      </div>

      <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left">
            <thead className="bg-gray-50 border-b border-gray-200">
              <tr>
                <th className="px-6 py-4 font-semibold text-sm text-gray-900">Order ID</th>
                <th className="px-6 py-4 font-semibold text-sm text-gray-900">Date</th>
                <th className="px-6 py-4 font-semibold text-sm text-gray-900">Vendor Packages</th>
                <th className="px-6 py-4 font-semibold text-sm text-gray-900">Dispatch Status</th>
                <th className="px-6 py-4 font-semibold text-sm text-gray-900">Order Status</th>
                <th className="px-6 py-4 font-semibold text-sm text-gray-900">Payouts</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {loading ? (
                <tr>
                  <td colSpan="6" className="px-6 py-12 text-center text-gray-500">Loading orders...</td>
                </tr>
              ) : filteredOrders.length === 0 ? (
                <tr>
                  <td colSpan="6" className="px-6 py-12 text-center text-gray-500">
                    <ShoppingBag className="w-12 h-12 text-gray-300 mx-auto mb-3" />
                    No vendor orders found.
                  </td>
                </tr>
              ) : (
                filteredOrders.map(order => (
                  <tr key={order.id} className="hover:bg-gray-50 transition-colors">
                    
                    {/* Order Number & Customer */}
                    <td className="px-6 py-4 font-medium text-[#012980]">
                      <div className="font-bold text-sm">{order.order_number}</div>
                      <div className="text-xs text-gray-500">{order.user_name || "Customer"}</div>
                    </td>

                    {/* Date */}
                    <td className="px-6 py-4 text-gray-500 text-xs">
                      {new Date(order.created_at).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })}
                    </td>

                    {/* Vendor Packages Breakdown */}
                    <td className="px-6 py-4">
                      {order.vendor_packages && order.vendor_packages.map(pkg => (
                        <div key={pkg.vendor_id} className="mb-2 last:mb-0 text-xs">
                          <div className="flex items-center gap-1.5 font-bold text-gray-900">
                            <span>{pkg.store_name}</span>
                            <span className="text-gray-400 font-normal">({pkg.items.length} items)</span>
                          </div>
                          <div className="text-[11px] text-gray-500">
                            Subtotal: <strong className="text-gray-800">₹{pkg.subtotal.toLocaleString()}</strong>
                          </div>
                          <button
                            onClick={() => handleOpenVendor(pkg.vendor_id)}
                            className="inline-flex items-center gap-1 text-[11px] text-[#012980] hover:underline mt-0.5"
                          >
                            <Eye className="w-3 h-3" />
                            <span>View Pickup Details</span>
                          </button>
                        </div>
                      ))}
                    </td>

                    {/* Dispatch Action & Status */}
                    <td className="px-6 py-4">
                      {order.vendor_packages && order.vendor_packages.map(pkg => {
                        const isDispatched = pkg.status === 'shipped' || Boolean(pkg.awb);
                        const isDispatching = dispatching[`vnd_${order.id}_${pkg.vendor_id}`];

                        return (
                          <div key={pkg.vendor_id} className="mb-2 last:mb-0">
                            {isDispatched ? (
                              <div className="p-2 bg-emerald-50 rounded-lg border border-emerald-200 text-xs space-y-0.5">
                                <div className="flex items-center gap-1.5">
                                  <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
                                  <span className="font-bold text-emerald-900">
                                    {pkg.dispatched_by === 'admin' ? 'Dispatched (Admin)' : 'Dispatched (Vendor)'}
                                  </span>
                                </div>
                                <div className="text-[11px] text-gray-700 font-mono">
                                  AWB: <strong>{pkg.awb || 'Assigned'}</strong>
                                </div>
                                {pkg.tracking_url && (
                                  <a
                                    href={pkg.tracking_url}
                                    target="_blank"
                                    rel="noreferrer"
                                    className="text-[11px] font-bold text-emerald-800 hover:underline inline-flex items-center gap-1"
                                  >
                                    Track Live <ExternalLink className="w-3 h-3" />
                                  </a>
                                )}
                              </div>
                            ) : (
                              <button
                                onClick={() => handleDispatchVendor(order.id, pkg.vendor_id)}
                                disabled={isDispatching || !pkg.can_dispatch || !pkg.has_valid_pickup_address}
                                className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-[#fe6603] hover:bg-orange-600 text-white rounded-lg text-xs font-bold transition shadow-2xs disabled:opacity-50"
                              >
                                {isDispatching ? (
                                  <div className="w-3 h-3 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                                ) : (
                                  <Truck className="w-3.5 h-3.5" />
                                )}
                                <span>Dispatch Package</span>
                              </button>
                            )}
                          </div>
                        );
                      })}
                    </td>

                    {/* Order Status */}
                    <td className="px-6 py-4">
                      <span className={`inline-flex px-2.5 py-1 rounded-full text-xs font-bold capitalize 
                        ${order.status === 'delivered' ? 'bg-green-100 text-green-800' : 
                          order.status === 'shipped' ? 'bg-blue-100 text-blue-800' : 
                          order.status === 'partially_shipped' ? 'bg-purple-100 text-purple-800' :
                          order.status === 'cancelled' ? 'bg-red-100 text-red-800' : 
                          'bg-yellow-100 text-yellow-800'}`}>
                        {order.status?.replace('_', ' ')}
                      </span>
                    </td>

                    {/* Payouts */}
                    <td className="px-6 py-4">
                      {order.vendor_payouts && order.vendor_payouts.map(payout => (
                        <div key={payout.id} className="flex flex-col gap-1 mb-2.5 pb-2 border-b border-gray-100 last:border-0 last:mb-0 last:pb-0">
                          <div className="flex items-center gap-2">
                            <span className="text-xs font-medium text-gray-700">Vendor #{payout.vendor_id}:</span>
                            <span className="text-xs font-bold text-gray-900">₹{payout.amount}</span>
                            {payout.status === 'paid' ? (
                              <span className="text-[10px] bg-green-100 text-green-800 px-2 py-0.5 rounded-full font-bold">Paid</span>
                            ) : (
                              <button
                                onClick={() => handlePayVendor(payout.id)}
                                className="text-[10px] bg-[#012980] hover:bg-blue-900 text-white px-2 py-0.5 rounded font-bold transition-colors shadow-2xs"
                              >
                                Pay
                              </button>
                            )}
                          </div>
                        </div>
                      ))}
                    </td>

                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      <VendorDetailsModal
        isOpen={modalOpen}
        vendor={selectedVendor}
        onClose={() => setModalOpen(false)}
      />
    </div>
  );
}
