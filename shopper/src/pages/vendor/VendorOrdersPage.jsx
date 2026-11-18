import React, { useState, useEffect } from 'react';
import { 
  Search, ShoppingBag, MessageCircle, ChevronDown, Printer, FileText, 
  PackageSearch, Truck, CheckCircle2, ExternalLink, AlertTriangle, RefreshCw 
} from 'lucide-react';
import { toast } from 'react-toastify';
import { useNavigate } from 'react-router-dom';

const BACKEND_URL = import.meta.env.VITE_BACKEND_URL || "http://localhost:5000/api";
const FROM_ADDRESS = {
  name: "Swabhivar Shoppers (Vendor Portal)",
  line1: "1-1-738, Vinayaka temple road",
  city: "Koratla",
  state: "Telangana",
  pincode: "",
  phone: "+91 90326 75205",
};

const STATUS_COLORS = {
  pending: "bg-gray-100 text-gray-700",
  paid: "bg-blue-100 text-blue-700",
  processing: "bg-yellow-100 text-yellow-700",
  shipped: "bg-purple-100 text-purple-700",
  delivered: "bg-green-100 text-green-700",
  cancelled: "bg-red-100 text-red-700",
};

export function VendorOrdersPage() {
  const [orders, setOrders] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [expanded, setExpanded] = useState(null);
  const [dispatchingId, setDispatchingId] = useState(null);
  const navigate = useNavigate();

  const fetchOrders = async () => {
    try {
      const token = localStorage.getItem('vendor_token');
      const res = await fetch(`${BACKEND_URL}/vendor/orders`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      const data = await res.json();
      if (res.ok) setOrders(data.orders || []);
    } catch (error) {
      toast.error('Failed to load orders');
    } finally {
      setLoading(false);
    }
  };

  const updateStatus = async (orderId, status) => {
    try {
      const token = localStorage.getItem('vendor_token');
      const res = await fetch(`${BACKEND_URL}/vendor/orders/${orderId}/status`, {
        method: 'PUT',
        headers: { 
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}` 
        },
        body: JSON.stringify({ status })
      });
      if (res.ok) {
        toast.success('Order status updated');
        fetchOrders();
      } else {
        toast.error('Failed to update status');
      }
    } catch (error) {
      toast.error('Failed to update status');
    }
  };

  const handleDispatchOrder = async (order) => {
    if (dispatchingId) return;

    if (!order.has_pickup_address) {
      toast.warn('Please configure your Store Pickup Address before dispatching orders.');
      navigate('/vendor/profile');
      return;
    }

    setDispatchingId(order.id);
    try {
      const token = localStorage.getItem('vendor_token');
      const res = await fetch(`${BACKEND_URL}/vendor/orders/${order.id}/dispatch`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        }
      });

      const data = await res.json();
      if (res.ok) {
        toast.success(data.message || 'Shipment created successfully with Shiprocket!');
        await fetchOrders();
      } else {
        toast.error(data.error || 'Failed to dispatch order');
      }
    } catch (err) {
      toast.error('Network error creating shipment');
    } finally {
      setDispatchingId(null);
    }
  };

  useEffect(() => {
    fetchOrders();
  }, []);

  const notifyWhatsApp = (order) => {
    let address = {};
    try { address = typeof order.address === 'string' ? JSON.parse(order.address) : (order.address || {}); } catch(e) {}
    const phone = (order.user_phone || address.mobile || "0000000000").replace(/\D/g, "");
    const msg = encodeURIComponent(`Hi ${order.user_name || address.name || "Customer"}! Your order #${order.order_number || order.id} containing our products has been updated to: *${order.status}*.`);
    window.open(`https://wa.me/${phone}?text=${msg}`, "_blank");
  };

  const escapeHtml = (value) =>
    String(value ?? "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#039;");

  const invoiceHtml = (order) => {
    let items = order.items || [];
    let address = {};
    try { address = typeof order.address === 'string' ? JSON.parse(order.address) : (order.address || {}); } catch(e) {}

    const subtotal = items.reduce((sum, item) => sum + ((item.variant?.price || item.product?.price || 0) * item.qty), 0);
    const rows = items.map((item, idx) => `
      <tr class="${idx % 2 === 0 ? '' : 'alt-row'}">
        <td style="text-align: center;">${idx + 1}</td>
        <td><span style="font-weight: bold; color: #222222;">${escapeHtml(item.product?.name)}</span></td>
        <td style="text-align: center;">${escapeHtml((item.variant?.color ? item.variant.color + " / " : "") + (item.variant?.size || "-"))}</td>
        <td style="text-align: center;">${item.qty} </td>
        <td style="text-align: right;">₹${(item.variant?.price || item.product?.price || 0).toFixed(2)}</td>
      </tr>
    `).join("");

    return `<!doctype html>
      <html lang="en">
      <head>
          <meta charset="UTF-8">
          <title>Vendor Invoice #${order.order_number || order.id}</title>
          <style>
              *, *::before, *::after { box-sizing: border-box; }
              @page { size: A4; margin: 15mm 12mm 20mm 12mm; }
              body { font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif; color: #333333; margin: 0; padding: 0; font-size: 10pt; line-height: 1.4; background-color: #ffffff; }
              .invoice-container { width: 100%; max-width: 100%; }
              .invoice-header { border-bottom: 3px solid #E63A12; padding-bottom: 18px; margin-bottom: 20px; }
              .header-table { width: 100%; border-collapse: collapse; }
              .header-table td { vertical-align: top; padding: 0; }
              .invoice-title-block { text-align: right; }
              .invoice-title { font-size: 22pt; font-weight: bold; color: #E63A12; margin: 0; text-transform: uppercase; letter-spacing: 0.5px; }
              .invoice-meta { margin-top: 8px; font-size: 9.5pt; color: #444444; line-height: 1.5; }
              .addresses-table { width: 100%; border-collapse: collapse; margin-bottom: 25px; }
              .addresses-table td { width: 50%; vertical-align: top; padding: 12px; border: 1px solid #FFE4DE; }
              .addresses-table td.from-box { background-color: #FFFDFD; }
              .addresses-table td.ship-box { background-color: #FFFAF9; }
              .section-heading { font-size: 9.5pt; font-weight: bold; color: #E63A12; text-transform: uppercase; border-bottom: 1px solid #FFE4DE; padding-bottom: 5px; margin-bottom: 8px; letter-spacing: 0.5px; }
              .address-box { font-size: 9.5pt; color: #555555; line-height: 1.5; }
              .items-table { width: 100%; border-collapse: collapse; margin-bottom: 20px; margin-top: 10px; }
              .items-table th { background-color: #E63A12; color: #ffffff; font-weight: bold; font-size: 9.5pt; text-align: left; padding: 10px 12px; text-transform: uppercase; }
              .items-table td { padding: 10px 12px; border-bottom: 1px solid #FFE4DE; font-size: 9.5pt; }
              .items-table tr.alt-row td { background-color: #FFFAF9; }
              .totals-table { width: 40%; float: right; border-collapse: collapse; margin-top: 15px; }
              .totals-table td { padding: 8px 12px; font-size: 9.5pt; }
              .totals-table tr.grand-total { background-color: #FFE4DE; font-weight: bold; color: #E63A12; font-size: 11pt; border-top: 2px solid #E63A12; }
              .clearfix::after { content: ""; clear: both; display: table; }
              .footer { margin-top: 40px; padding-top: 15px; border-top: 1px solid #FFE4DE; text-align: center; font-size: 8.5pt; color: #888888; }
              @media print { body { -webkit-print-color-adjust: exact; print-color-adjust: exact; } }
          </style>
      </head>
      <body>
          <div class="invoice-container">
              <div class="invoice-header">
                  <table class="header-table">
                      <tr>
                          <td>
                              <div style="font-size: 18pt; font-weight: 800; color: #012980; letter-spacing: -0.5px;">
                                  Swabhivar <span style="color: #036e26;">Shoppers</span>
                              </div>
                              <div style="font-size: 9pt; color: #E63A12; font-weight: bold; margin-top: 2px; text-transform: uppercase; letter-spacing: 1px;">
                                  Official Vendor Invoice
                              </div>
                          </td>
                          <td class="invoice-title-block">
                              <div class="invoice-title">Tax Invoice</div>
                              <div class="invoice-meta">
                                  <strong>Invoice #:</strong> INV-${order.order_number || order.id}<br>
                                  <strong>Order ID:</strong> #${order.order_number || order.id}<br>
                                  <strong>Order Date:</strong> ${new Date(order.created_at).toLocaleDateString("en-IN", { day: 'numeric', month: 'short', year: 'numeric' })}<br>
                                  <strong>Status:</strong> ${escapeHtml(order.status || 'Paid')}
                              </div>
                          </td>
                      </tr>
                  </table>
              </div>

              <table class="addresses-table">
                  <tr>
                      <td class="from-box">
                          <div class="section-heading">Dispatched From</div>
                          <div class="address-box">
                              <strong>${escapeHtml(FROM_ADDRESS.name)}</strong><br>
                              ${escapeHtml(FROM_ADDRESS.line1)}<br>
                              ${escapeHtml(FROM_ADDRESS.city)}, ${escapeHtml(FROM_ADDRESS.state)} ${escapeHtml(FROM_ADDRESS.pincode)}<br>
                              <strong>Phone:</strong> ${escapeHtml(FROM_ADDRESS.phone)}
                          </div>
                      </td>
                      <td class="ship-box">
                          <div class="section-heading">Shipping To (Customer)</div>
                          <div class="address-box">
                              <strong>${escapeHtml(address.name || order.user_name || "Valued Customer")}</strong><br>
                              ${escapeHtml(address.line1 || address.addressLine1 || "")}${address.line2 || address.addressLine2 ? `, ${escapeHtml(address.line2 || address.addressLine2)}` : ""}<br>
                              ${escapeHtml(address.city || "")}, ${escapeHtml(address.state || "")} — ${escapeHtml(address.pincode || "")}<br>
                              <strong>Mobile:</strong> ${escapeHtml(address.mobile || order.user_phone || "N/A")}
                          </div>
                      </td>
                  </tr>
              </table>

              <table class="items-table">
                  <thead>
                      <tr>
                          <th style="width: 8%; text-align: center;">#</th>
                          <th style="width: 50%;">Product Description</th>
                          <th style="width: 15%; text-align: center;">Variant</th>
                          <th style="width: 12%; text-align: center;">Qty</th>
                          <th style="width: 15%; text-align: right;">Total (₹)</th>
                      </tr>
                  </thead>
                  <tbody>
                      ${rows}
                  </tbody>
              </table>

              <div class="clearfix">
                  <table class="totals-table">
                      <tr>
                          <td>Subtotal:</td>
                          <td style="text-align: right;">₹${subtotal.toFixed(2)}</td>
                      </tr>
                      <tr class="grand-total">
                          <td>Your Total:</td>
                          <td style="text-align: right;">₹${subtotal.toFixed(2)}</td>
                      </tr>
                  </table>
              </div>

              <div class="footer">
                  This is a computer-generated invoice for order fulfillment via Swabhivar Shoppers Vendor Portal.
              </div>
          </div>
      </body>
      </html>`;
  };

  const printInvoice = (order) => {
    const printWindow = window.open('', '_blank');
    if (printWindow) {
      printWindow.document.write(invoiceHtml(order));
      printWindow.document.close();
      printWindow.focus();
      setTimeout(() => {
        printWindow.print();
      }, 500);
    }
  };

  const filteredOrders = orders.filter(o => {
    if (!searchTerm) return true;
    const term = searchTerm.toLowerCase();
    return (
      (o.order_number && String(o.order_number).toLowerCase().includes(term)) ||
      (o.id && String(o.id).toLowerCase().includes(term))
    );
  });

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl sm:text-3xl font-extrabold text-gray-900 tracking-tight">Your Orders</h1>
          <p className="text-gray-500 mt-1 text-xs sm:text-sm font-medium">Manage and dispatch customer orders for your products via Shiprocket.</p>
        </div>
        <button
          onClick={fetchOrders}
          className="self-start sm:self-auto flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold text-gray-700 bg-white border border-gray-200 rounded-xl hover:bg-gray-50 transition-colors shadow-2xs"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
          <span>Refresh</span>
        </button>
      </div>

      {/* Search & Actions Bar */}
      <div className="flex flex-col sm:flex-row gap-3 items-stretch sm:items-center justify-between">
        <div className="relative flex-1 sm:max-w-md">
          <Search className="w-4 h-4 sm:w-5 sm:h-5 absolute left-3.5 sm:left-4 top-1/2 -translate-y-1/2 text-gray-400" />
          <input
            type="text"
            placeholder="Search by Order ID..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full pl-10 sm:pl-12 pr-4 py-2.5 sm:py-3 bg-white border border-gray-200 rounded-xl sm:rounded-2xl text-xs sm:text-sm font-medium focus:outline-none focus:ring-2 focus:ring-[#012980]/20 focus:border-[#012980] transition-all shadow-2xs"
          />
        </div>
        <div className="flex items-center gap-2 self-end sm:self-auto">
          <span className="text-xs font-bold text-gray-500 bg-gray-100/80 px-3 py-1.5 rounded-xl border border-gray-200/50">
            {filteredOrders.length} {filteredOrders.length === 1 ? 'Order' : 'Orders'}
          </span>
        </div>
      </div>

      {/* Orders Container */}
      <div className="bg-white rounded-2xl sm:rounded-[24px] shadow-sm border border-gray-100/80 overflow-hidden">
        
        {loading ? (
          <div className="p-10 text-center text-gray-500 flex flex-col items-center justify-center gap-3">
            <div className="w-8 h-8 border-3 border-gray-200 border-t-[#012980] rounded-full animate-spin" />
            <span className="text-xs font-semibold">Loading orders...</span>
          </div>
        ) : filteredOrders.length === 0 ? (
          <div className="px-6 py-12 text-center text-gray-500">
            <ShoppingBag className="w-12 h-12 text-gray-300 mx-auto mb-3" />
            <p className="font-semibold text-gray-700 text-sm">No orders found</p>
            <p className="text-xs text-gray-400 mt-1">Orders from customers will appear here.</p>
          </div>
        ) : (
          <>
            {/* ======================================================== */}
            {/* 1. MOBILE NATIVE CARDS VIEW (md:hidden)                  */}
            {/* Optimized for Capacitor mobile app viewport              */}
            {/* ======================================================== */}
            <div className="md:hidden divide-y divide-gray-100">
              {filteredOrders.map(order => {
                let address = {};
                try { address = typeof order.address === 'string' ? JSON.parse(order.address) : (order.address || {}); } catch(e){}
                const isDispatched = Boolean(order.shipment);
                const isExpanded = expanded === order.id;
                const items = order.items || [];
                const firstItem = items[0];

                return (
                  <div key={order.id} className="p-4 transition-colors">
                    {/* Top Row: Order ID & Date */}
                    <div className="flex items-center justify-between gap-2 mb-2">
                      <div className="flex items-center gap-2">
                        <span className="font-mono font-bold text-gray-900 text-xs bg-gray-100 px-2.5 py-1 rounded-md">
                          #{order.order_number || order.id}
                        </span>
                        <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider ${STATUS_COLORS[order.status?.toLowerCase() || 'pending']}`}>
                          {order.status || 'Pending'}
                        </span>
                      </div>
                      <span className="text-[11px] font-medium text-gray-400 shrink-0">
                        {new Date(order.created_at).toLocaleDateString('en-IN', { day: '2-digit', month: 'short' })}
                      </span>
                    </div>

                    {/* Shipment Status Pill & Dispatch Method */}
                    <div className="flex items-center justify-between gap-2 mb-3">
                      {isDispatched ? (
                        <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-emerald-50 text-emerald-700 border border-emerald-200">
                          <Truck className="w-3 h-3" /> Dispatched
                          {order.shipment?.dispatched_by === 'admin' ? ' (Admin)' : ''}
                        </span>
                      ) : (
                        <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-amber-50 text-amber-700 border border-amber-200">
                          Ready to Dispatch
                        </span>
                      )}

                      <span className="text-base font-extrabold text-[#012980]">
                        ₹{parseFloat(order.total || 0).toLocaleString()}
                      </span>
                    </div>

                    {/* Customer & Destination Preview */}
                    <div className="bg-gray-50/70 p-3 rounded-xl border border-gray-100 mb-3 text-xs space-y-1">
                      <div className="flex items-center justify-between">
                        <span className="font-bold text-gray-900 truncate">
                          {address.name || order.user_name || 'Customer'}
                        </span>
                        <div className="flex items-center gap-1.5 shrink-0">
                          <button
                            onClick={() => notifyWhatsApp(order)}
                            className="p-1 text-green-600 hover:bg-green-100 rounded-md transition-colors"
                            title="Chat on WhatsApp"
                          >
                            <MessageCircle className="w-3.5 h-3.5" />
                          </button>
                          <button
                            onClick={() => printInvoice(order)}
                            className="p-1 text-gray-600 hover:bg-gray-200 rounded-md transition-colors"
                            title="Print Invoice"
                          >
                            <Printer className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </div>
                      <p className="text-gray-500 text-[11px] line-clamp-1">
                        {[address.city, address.state, address.pincode].filter(Boolean).join(', ') || 'No address details'}
                      </p>
                      <div className="pt-1 flex items-center gap-2 text-[11px] text-gray-500">
                        <span className="font-semibold text-gray-700">{items.length} item{items.length !== 1 ? 's' : ''}</span>
                        {firstItem && (
                          <span className="text-gray-400 truncate">• {firstItem.product?.name || firstItem.name}</span>
                        )}
                      </div>
                    </div>

                    {/* Primary Mobile Action Buttons */}
                    <div className="flex items-center gap-2 pt-1">
                      {order.can_dispatch ? (
                        <button
                          onClick={() => handleDispatchOrder(order)}
                          disabled={dispatchingId === order.id}
                          className="flex-1 py-2.5 px-4 bg-gradient-to-r from-[#fe6603] to-[#e55c02] text-white text-xs font-bold rounded-xl shadow-xs hover:shadow-md transition-all flex items-center justify-center gap-1.5 active:scale-[0.98] disabled:opacity-50"
                        >
                          {dispatchingId === order.id ? (
                            <>
                              <div className="w-3.5 h-3.5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                              <span>Dispatching...</span>
                            </>
                          ) : (
                            <>
                              <Truck className="w-3.5 h-3.5" />
                              <span>Dispatch via Shiprocket</span>
                            </>
                          )}
                        </button>
                      ) : isDispatched && order.shipment?.tracking_url ? (
                        <a
                          href={order.shipment.tracking_url}
                          target="_blank"
                          rel="noreferrer"
                          className="flex-1 py-2.5 px-4 bg-emerald-600 text-white text-xs font-bold rounded-xl shadow-xs hover:bg-emerald-700 transition flex items-center justify-center gap-1.5"
                        >
                          <Truck className="w-3.5 h-3.5" />
                          <span>Track Shipment</span>
                          <ExternalLink className="w-3 h-3" />
                        </a>
                      ) : null}

                      <button
                        onClick={() => setExpanded(isExpanded ? null : order.id)}
                        className={`py-2.5 px-3 rounded-xl border text-xs font-bold flex items-center justify-center gap-1 transition-colors ${
                          isExpanded 
                            ? 'bg-blue-50 border-[#012980]/30 text-[#012980]' 
                            : 'bg-white border-gray-200 text-gray-700 hover:bg-gray-50'
                        }`}
                      >
                        <span>{isExpanded ? 'Hide' : 'Details'}</span>
                        <ChevronDown className={`w-3.5 h-3.5 transition-transform duration-200 ${isExpanded ? 'rotate-180 text-[#012980]' : 'text-gray-400'}`} />
                      </button>
                    </div>

                    {/* Mobile Expandable Details */}
                    {isExpanded && (
                      <div className="mt-3.5 pt-3.5 border-t border-gray-100 space-y-3.5 text-xs animate-in fade-in duration-200">
                        {/* Shipment Info Card (if dispatched) */}
                        {order.shipment && (
                          <div className="bg-emerald-50/70 p-3.5 rounded-xl border border-emerald-200/80 space-y-2">
                            <div className="flex items-center justify-between">
                              <span className="font-bold text-emerald-950 text-xs flex items-center gap-1.5">
                                <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" /> Shipment Live
                              </span>
                              <span className="text-[10px] font-mono font-bold bg-white px-2 py-0.5 rounded border border-emerald-200 text-emerald-800">
                                {order.shipment.awb_code || 'AWB Pending'}
                              </span>
                            </div>
                            <div className="grid grid-cols-2 gap-2 text-[11px] pt-1">
                              <div>
                                <span className="text-gray-400 text-[10px] uppercase block">Courier</span>
                                <span className="font-semibold text-gray-900">{order.shipment.courier_name || 'Shiprocket'}</span>
                              </div>
                              <div>
                                <span className="text-gray-400 text-[10px] uppercase block">Pickup Location</span>
                                <span className="font-semibold text-gray-900 truncate block">{order.shipment.pickup_location}</span>
                              </div>
                            </div>
                          </div>
                        )}

                        {/* Customer Full Address */}
                        <div className="bg-white p-3.5 rounded-xl border border-gray-200/80 space-y-1.5">
                          <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">Full Delivery Address</p>
                          <p className="font-bold text-gray-900 text-xs">{address.name || order.user_name || 'Customer'}</p>
                          <p className="text-gray-600 text-[11px] leading-relaxed">
                            {[address.line1 || address.addressLine1, address.line2 || address.addressLine2, address.landmark, address.city, address.state, address.pincode].filter(Boolean).join(', ')}
                          </p>
                          <p className="text-gray-500 text-[11px] pt-0.5">Phone: <strong className="text-gray-900">{address.mobile || order.user_phone || 'N/A'}</strong></p>
                        </div>

                        {/* Items in Order */}
                        <div className="bg-white p-3.5 rounded-xl border border-gray-200/80 space-y-2.5">
                          <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">Items in Order ({items.length})</p>
                          <div className="divide-y divide-gray-100">
                            {items.map((item, idx) => (
                              <div key={idx} className="py-2 first:pt-0 last:pb-0 flex items-center justify-between gap-2.5">
                                <div className="flex items-center gap-2 min-w-0">
                                  {item.product?.image_url && (
                                    <img src={item.product.image_url} alt="" className="w-8 h-8 rounded-lg object-contain bg-gray-50 border border-gray-100 shrink-0" />
                                  )}
                                  <div className="min-w-0">
                                    <p className="font-semibold text-gray-900 text-xs truncate">{item.product?.name || item.name}</p>
                                    <p className="text-[10px] text-gray-400">
                                      Qty: {item.qty} {item.variant?.size ? `• Size: ${item.variant.size}` : ''}
                                    </p>
                                  </div>
                                </div>
                                <span className="font-bold text-gray-900 text-xs shrink-0">
                                  ₹{((item.variant?.price || item.product?.price || 0) * item.qty).toLocaleString()}
                                </span>
                              </div>
                            ))}
                          </div>
                        </div>

                        {/* Status Update & Invoice Button */}
                        <div className="bg-gray-50 p-3.5 rounded-xl border border-gray-200/80 space-y-2.5">
                          <div className="flex items-center justify-between gap-2">
                            <span className="text-[11px] font-bold text-gray-700">Update Order Status:</span>
                            <select 
                              value={order.status || 'pending'} 
                              onChange={(e) => updateStatus(order.id, e.target.value)}
                              className="px-2.5 py-1.5 rounded-lg bg-white border border-gray-200 text-gray-900 text-xs font-semibold focus:outline-none focus:border-[#012980]"
                            >
                              <option value="pending">Pending</option>
                              <option value="processing">Processing</option>
                              <option value="shipped">Shipped</option>
                              <option value="delivered">Delivered</option>
                              <option value="cancelled">Cancelled</option>
                            </select>
                          </div>
                          <button
                            onClick={() => printInvoice(order)}
                            className="w-full py-2 px-3 bg-gray-900 text-white rounded-lg text-xs font-bold hover:bg-gray-800 transition flex items-center justify-center gap-1.5 shadow-2xs"
                          >
                            <Printer className="w-3.5 h-3.5" />
                            <span>Print Packing Invoice</span>
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>

            {/* ======================================================== */}
            {/* 2. DESKTOP TABLE VIEW (hidden md:block)                  */}
            {/* ======================================================== */}
            <div className="hidden md:block overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead className="bg-gray-50/70 border-b border-gray-100">
                  <tr>
                    <th className="px-6 py-4 font-bold text-xs uppercase tracking-wider text-gray-500">Order ID</th>
                    <th className="px-6 py-4 font-bold text-xs uppercase tracking-wider text-gray-500">Date</th>
                    <th className="px-6 py-4 font-bold text-xs uppercase tracking-wider text-gray-500">Your Items</th>
                    <th className="px-6 py-4 font-bold text-xs uppercase tracking-wider text-gray-500">Revenue</th>
                    <th className="px-6 py-4 font-bold text-xs uppercase tracking-wider text-gray-500">Shipment Status</th>
                    <th className="px-6 py-4 font-bold text-xs uppercase tracking-wider text-gray-500">Order Status</th>
                    <th className="px-6 py-4 font-bold text-xs uppercase tracking-wider text-gray-500 text-right">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {filteredOrders.map(order => {
                    let address = {};
                    try { address = typeof order.address === 'string' ? JSON.parse(order.address) : (order.address || {}); } catch(e){}
                    const isDispatched = Boolean(order.shipment);

                    return (
                      <React.Fragment key={order.id}>
                        <tr 
                          className="hover:bg-gray-50/80 transition-all cursor-pointer group"
                          onClick={() => setExpanded(expanded === order.id ? null : order.id)}
                        >
                          <td className="px-6 py-4">
                            <div className="font-bold text-gray-900 group-hover:text-[#012980] transition-colors">
                              #{order.order_number || order.id}
                            </div>
                          </td>
                          <td className="px-6 py-4 text-xs font-medium text-gray-500">
                            {new Date(order.created_at).toLocaleDateString('en-IN', { day: '2-digit', month: 'short' })}
                          </td>
                          <td className="px-6 py-4">
                            <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-bold bg-[#012980]/10 text-[#012980]">
                              {order.items?.length || 0} items
                            </span>
                          </td>
                          <td className="px-6 py-4">
                            <span className="font-extrabold text-gray-900 text-base">₹{parseFloat(order.total || 0).toLocaleString()}</span>
                          </td>
                          <td className="px-6 py-4">
                            {isDispatched ? (
                              <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-bold bg-emerald-50 text-emerald-700 border border-emerald-200">
                                <Truck className="w-3.5 h-3.5" /> Dispatched
                              </span>
                            ) : (
                              <span className="inline-flex items-center px-2.5 py-1 rounded-full text-xs font-bold bg-amber-50 text-amber-700 border border-amber-200">
                                Ready to Dispatch
                              </span>
                            )}
                          </td>
                          <td className="px-6 py-4">
                            <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-bold uppercase tracking-wider ${STATUS_COLORS[order.status?.toLowerCase() || 'pending']}`}>
                              {order.status || 'Pending'}
                            </span>
                          </td>
                          <td className="px-6 py-4 text-right">
                            <div className="flex items-center justify-end gap-2">
                              {order.can_dispatch && (
                                <button
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    handleDispatchOrder(order);
                                  }}
                                  disabled={dispatchingId === order.id}
                                  className="px-3 py-1.5 bg-[#fe6603] text-white text-xs font-bold rounded-xl hover:bg-orange-600 transition shadow-2xs flex items-center gap-1 disabled:opacity-50"
                                >
                                  <Truck className="w-3.5 h-3.5" />
                                  <span>{dispatchingId === order.id ? 'Dispatching...' : 'Dispatch'}</span>
                                </button>
                              )}
                              <div className="w-7 h-7 rounded-full bg-gray-100 flex items-center justify-center transition-colors">
                                <ChevronDown className={`w-4 h-4 transition-transform duration-200 ${expanded === order.id ? "rotate-180 text-[#012980]" : "text-gray-400"}`} />
                              </div>
                            </div>
                          </td>
                        </tr>
                        
                        {expanded === order.id && (
                          <tr>
                            <td colSpan="7" className="p-0 border-b border-gray-100">
                              <div className="bg-gray-50/60 p-5 sm:p-6 border-y border-gray-100">
                                <div className="flex flex-col lg:flex-row gap-6">
                                  <div className="flex-1 space-y-5">
                                    
                                    {/* Shipment Details if Dispatched */}
                                    {order.shipment ? (
                                      <div className="bg-emerald-50/70 p-5 rounded-2xl border border-emerald-200 shadow-2xs space-y-3">
                                        <div className="flex items-center justify-between border-b border-emerald-200/60 pb-3">
                                          <div className="flex items-center gap-2">
                                            <div className="p-1.5 bg-emerald-600 text-white rounded-lg">
                                              <Truck className="w-4 h-4" />
                                            </div>
                                            <div>
                                              <div className="flex items-center gap-2">
                                                <h4 className="font-bold text-emerald-950 text-sm">
                                                  {order.shipment.dispatched_by === 'admin' ? 'Dispatched by Admin' : 'Dispatched by Vendor'}
                                                </h4>
                                                <span className="text-[10px] px-2 py-0.5 rounded-full font-bold bg-emerald-100 text-emerald-800 border border-emerald-200 uppercase">
                                                  Shiprocket Active
                                                </span>
                                              </div>
                                              <p className="text-xs text-emerald-700">
                                                {order.shipment.dispatched_by === 'admin' 
                                                  ? 'Package was dispatched by Admin using your registered pickup address' 
                                                  : 'Dispatched from your store registered pickup location'}
                                              </p>
                                            </div>
                                          </div>
                                          {order.shipment.tracking_url && (
                                            <a
                                              href={order.shipment.tracking_url}
                                              target="_blank"
                                              rel="noreferrer"
                                              onClick={e => e.stopPropagation()}
                                              className="inline-flex items-center gap-1 px-3 py-1 bg-white text-emerald-800 border border-emerald-300 rounded-lg text-xs font-bold hover:bg-emerald-100 transition"
                                            >
                                              <span>Track Live</span>
                                              <ExternalLink className="w-3.5 h-3.5" />
                                            </a>
                                          )}
                                        </div>

                                        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
                                          <div className="bg-white/80 p-2.5 rounded-xl border border-emerald-100">
                                            <span className="text-[10px] font-bold text-gray-400 uppercase tracking-wider block">AWB Number</span>
                                            <span className="font-mono font-bold text-gray-900 text-sm">{order.shipment.awb_code || 'Assigned'}</span>
                                          </div>
                                          <div className="bg-white/80 p-2.5 rounded-xl border border-emerald-100">
                                            <span className="text-[10px] font-bold text-gray-400 uppercase tracking-wider block">Courier</span>
                                            <span className="font-bold text-gray-900 text-sm">{order.shipment.courier_name || 'Shiprocket'}</span>
                                          </div>
                                          <div className="bg-white/80 p-2.5 rounded-xl border border-emerald-100">
                                            <span className="text-[10px] font-bold text-gray-400 uppercase tracking-wider block">Pickup Location</span>
                                            <span className="font-mono font-bold text-gray-900 text-xs truncate block">{order.shipment.pickup_location}</span>
                                          </div>
                                          <div className="bg-white/80 p-2.5 rounded-xl border border-emerald-100">
                                            <span className="text-[10px] font-bold text-gray-400 uppercase tracking-wider block">Dispatched Date</span>
                                            <span className="font-bold text-gray-900 text-xs">
                                              {new Date(order.shipment.created_at).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })}
                                            </span>
                                          </div>
                                        </div>
                                      </div>
                                    ) : (
                                      <div className="bg-white p-5 rounded-2xl border border-gray-200 shadow-2xs flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                                        <div className="flex items-center gap-3">
                                          <div className="w-10 h-10 rounded-xl bg-orange-50 border border-orange-200 text-[#fe6603] flex items-center justify-center shrink-0">
                                            <Truck className="w-5 h-5" />
                                          </div>
                                          <div>
                                            <h4 className="font-bold text-gray-900 text-sm">Ready to Ship with Shiprocket</h4>
                                            <p className="text-xs text-gray-500">
                                              {order.has_pickup_address 
                                                ? 'Courier will be dispatched to pick up from your saved store address.' 
                                                : 'Setup your pickup address in Store Profile before dispatching.'}
                                            </p>
                                          </div>
                                        </div>

                                        {order.can_dispatch && (
                                          <button
                                            onClick={(e) => {
                                              e.stopPropagation();
                                              handleDispatchOrder(order);
                                            }}
                                            disabled={dispatchingId === order.id}
                                            className="flex items-center justify-center gap-2 px-5 py-2.5 bg-[#fe6603] text-white rounded-xl text-xs sm:text-sm font-bold hover:bg-orange-600 transition shadow-xs disabled:opacity-50"
                                          >
                                            {dispatchingId === order.id ? (
                                              <>
                                                <div className="w-3.5 h-3.5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                                                <span>Creating Shipment...</span>
                                              </>
                                            ) : (
                                              <>
                                                <Truck className="w-4 h-4" />
                                                <span>Dispatch with Shiprocket</span>
                                              </>
                                            )}
                                          </button>
                                        )}
                                      </div>
                                    )}

                                    {/* Customer Info */}
                                    <div className="bg-white p-5 rounded-2xl border border-gray-200 shadow-2xs">
                                      <h4 className="font-bold text-gray-900 mb-3 text-sm flex items-center gap-2 border-b border-gray-100 pb-2">
                                        Customer Delivery Address
                                      </h4>
                                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
                                        <div>
                                          <p className="text-gray-400 text-[10px] uppercase tracking-wider mb-0.5">Customer Name</p>
                                          <p className="font-bold text-gray-900">{address.name || order.user_name || "Valued Customer"}</p>
                                        </div>
                                        <div>
                                          <p className="text-gray-400 text-[10px] uppercase tracking-wider mb-0.5">Phone Number</p>
                                          <div className="flex items-center gap-2">
                                            <p className="font-bold text-gray-900">{address.mobile || order.user_phone || "N/A"}</p>
                                            <button 
                                              onClick={(e) => { e.stopPropagation(); notifyWhatsApp(order); }} 
                                              className="text-green-600 hover:bg-green-50 p-1 rounded-md transition-colors" 
                                              title="Message on WhatsApp"
                                            >
                                              <MessageCircle className="w-4 h-4" />
                                            </button>
                                          </div>
                                        </div>
                                        <div className="sm:col-span-2">
                                          <p className="text-gray-400 text-[10px] uppercase tracking-wider mb-0.5">Delivery Destination</p>
                                          <p className="text-gray-800 font-medium">
                                            {address.line1 || address.addressLine1 || ""} {address.line2 || address.addressLine2 || ""}, {address.city || ""}, {address.state || ""} — {address.pincode || ""}
                                          </p>
                                        </div>
                                      </div>
                                    </div>
                                    
                                    {/* Items */}
                                    <div className="bg-white p-5 rounded-2xl border border-gray-200 shadow-2xs">
                                      <h4 className="font-bold text-gray-900 mb-3 text-sm border-b border-gray-100 pb-2">
                                        Your Products in this Order
                                      </h4>
                                      <div className="space-y-3">
                                        {order.items && order.items.map((item, idx) => (
                                          <div key={idx} className="flex items-center gap-3 p-3 rounded-xl bg-gray-50/70 border border-gray-100">
                                            <div className="w-12 h-12 rounded-xl bg-white border border-gray-200 overflow-hidden shrink-0 flex items-center justify-center">
                                              {item.product?.image_url ? (
                                                <img src={item.product.image_url} alt="" className="w-full h-full object-contain p-1" />
                                              ) : (
                                                <PackageSearch className="w-5 h-5 text-gray-300" />
                                              )}
                                            </div>
                                            <div className="flex-1 min-w-0">
                                              <p className="font-bold text-gray-900 text-xs truncate">{item.product?.name || item.name}</p>
                                              <div className="mt-0.5 flex flex-wrap gap-x-3 text-[11px] text-gray-500">
                                                <span>Qty: <strong className="text-gray-900">{item.qty}</strong></span>
                                                {(item.variant?.size || item.variant?.color) && (
                                                  <span>Variant: <strong className="text-gray-900">{item.variant?.color ? item.variant.color + " / " : ""}{item.variant?.size}</strong></span>
                                                )}
                                              </div>
                                            </div>
                                            <div className="text-right shrink-0">
                                              <p className="font-bold text-[#012980] text-sm">
                                                ₹{((item.variant?.price || item.product?.price || 0) * item.qty).toLocaleString()}
                                              </p>
                                            </div>
                                          </div>
                                        ))}
                                      </div>
                                    </div>
                                  </div>
                                  
                                  <div className="w-full lg:w-72 space-y-4">
                                    {/* Quick Actions */}
                                    <div className="bg-white p-5 rounded-2xl border border-gray-200 shadow-2xs space-y-3">
                                      <h4 className="font-bold text-gray-900 text-sm pb-2 border-b border-gray-100">Actions</h4>
                                      <div>
                                        <p className="text-[10px] text-gray-400 uppercase tracking-wider mb-1.5">Order Status</p>
                                        <select 
                                          value={order.status || 'pending'} 
                                          onChange={(e) => updateStatus(order.id, e.target.value)}
                                          className="w-full px-3 py-2 rounded-xl bg-white border border-gray-200 text-gray-900 text-xs font-semibold focus:outline-none focus:border-[#012980]"
                                        >
                                          <option value="pending">Pending</option>
                                          <option value="processing">Processing</option>
                                          <option value="shipped">Shipped</option>
                                          <option value="delivered">Delivered</option>
                                          <option value="cancelled">Cancelled</option>
                                        </select>
                                      </div>
                                      <button 
                                        onClick={(e) => { e.stopPropagation(); printInvoice(order); }} 
                                        className="w-full flex items-center justify-center gap-2 px-4 py-2.5 bg-gray-900 text-white rounded-xl text-xs font-bold hover:bg-gray-800 transition shadow-2xs"
                                      >
                                        <Printer className="w-4 h-4" /> Print Packing Invoice
                                      </button>
                                    </div>
                                  </div>
                                </div>
                              </div>
                            </td>
                          </tr>
                        )}
                      </React.Fragment>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
