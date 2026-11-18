import React, { useEffect, useState } from "react";
import { motion } from "framer-motion";
import { 
  MessageCircle, 
  ChevronDown, 
  Printer, 
  FileText, 
  ExternalLink, 
  Truck, 
  Store, 
  Building2, 
  Search, 
  CheckCircle2, 
  AlertCircle,
  Clock,
  Package,
  Layers
} from "lucide-react";
import { toast } from "react-toastify";

const BACKEND_URL = import.meta.env.VITE_BACKEND_URL || "http://localhost:5000/api";

const STATUSES = ["pending", "paid", "processing", "partially_shipped", "shipped", "delivered", "cancelled"];

const STATUS_COLORS = {
  pending: "bg-amber-100 text-amber-800 border-amber-200",
  paid: "bg-blue-100 text-blue-800 border-blue-200",
  processing: "bg-yellow-100 text-yellow-800 border-yellow-200",
  partially_shipped: "bg-purple-100 text-purple-800 border-purple-200",
  shipped: "bg-indigo-100 text-indigo-800 border-indigo-200",
  delivered: "bg-emerald-100 text-emerald-800 border-emerald-200",
  cancelled: "bg-rose-100 text-rose-800 border-rose-200",
};

export function AdminOrdersPage() {
  const [orders, setOrders] = useState([]);
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState(null);
  const [activeTab, setActiveTab] = useState("all"); // 'all' | 'platform' | 'vendor'
  const [statusFilter, setStatusFilter] = useState("all");
  const [searchTerm, setSearchTerm] = useState("");
  const [dispatching, setDispatching] = useState({});

  const fetchOrders = () => {
    const token = localStorage.getItem("token");
    if (!token) {
      setLoading(false);
      return;
    }
    fetch(`${BACKEND_URL}/admin/orders`, { headers: { Authorization: `Bearer ${token}` } })
      .then((r) => r.json())
      .then((d) => {
        if (d.orders) {
          setOrders(d.orders);
        }
      })
      .catch((err) => {
        console.error("Failed to load orders:", err);
      })
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    fetchOrders();
  }, []);

  const updateStatus = async (orderId, status) => {
    const token = localStorage.getItem("token");
    try {
      const res = await fetch(`${BACKEND_URL}/admin/orders/${orderId}/status`, {
        method: "PUT",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ status }),
      });
      if (res.ok) {
        setOrders((prev) => prev.map((o) => (o.id === orderId ? { ...o, status } : o)));
        toast.success(`Order status updated to ${status}`);
      } else {
        toast.error("Failed to update status");
      }
    } catch {
      toast.error("Failed to update status");
    }
  };

  // Dispatch Platform Package from Admin Warehouse
  const handleDispatchPlatform = async (orderId) => {
    const key = `platform_${orderId}`;
    setDispatching((p) => ({ ...p, [key]: true }));
    try {
      const token = localStorage.getItem("token");
      const res = await fetch(`${BACKEND_URL}/admin/orders/${orderId}/dispatch-platform`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` }
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to dispatch platform package");
      
      toast.success(`Platform package dispatched! AWB: ${data.package?.awb || 'Assigned'}`);
      fetchOrders();
    } catch (err) {
      toast.error(err.message || "Dispatch failed");
    } finally {
      setDispatching((p) => ({ ...p, [key]: false }));
    }
  };

  // Dispatch Vendor Package using that vendor's pickup address
  const handleDispatchVendor = async (orderId, vendorId) => {
    const key = `vendor_${orderId}_${vendorId}`;
    setDispatching((p) => ({ ...p, [key]: true }));
    try {
      const token = localStorage.getItem("token");
      const res = await fetch(`${BACKEND_URL}/admin/orders/${orderId}/dispatch-vendor/${vendorId}`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` }
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to dispatch vendor package");

      toast.success(`Vendor package dispatched! AWB: ${data.shipment?.awb_code || 'Assigned'}`);
      fetchOrders();
    } catch (err) {
      toast.error(err.message || "Vendor package dispatch failed");
    } finally {
      setDispatching((p) => ({ ...p, [key]: false }));
    }
  };

  const notifyWhatsApp = (order) => {
    let address = {};
    try { address = typeof order.address === 'string' ? JSON.parse(order.address) : (order.address || {}); } catch(e) {}
    
    const phone = (order.user_phone || address.mobile || "0000000000").replace(/\D/g, "");
    const awb = order.tracking_id || order.platform_package?.awb;
    const trackMsg = awb ? ` Your tracking AWB is ${awb}.${order.tracking_link ? ` Track here: ${order.tracking_link}` : ""}` : "";
    const msg = encodeURIComponent(`Hi ${order.user_name || address.name || "Customer"}! Your order #${order.order_number || order.id} status is now: *${order.status}*.${trackMsg}`);
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
    let items = [];
    try {
      items = typeof order.items === 'string' ? JSON.parse(order.items) : (order.items || []);
    } catch(e) {}
    
    let address = {};
    try {
      address = typeof order.address === 'string' ? JSON.parse(order.address) : (order.address || {});
    } catch(e) {}

    const subtotal = items.reduce((sum, item) => sum + ((item.variant?.price || item.product?.price || 0) * item.qty), 0);
    const rows = items.map((item, idx) => `
      <tr class="${idx % 2 === 0 ? '' : 'alt-row'}">
        <td style="text-align: center;">${idx + 1}</td>
        <td><span style="font-weight: bold; color: #222222;">${escapeHtml(item.product?.name || item.name)}</span></td>
        <td style="text-align: center;">${escapeHtml((item.variant?.color ? item.variant.color + " / " : "") + (item.variant?.size || "-"))}</td>
        <td style="text-align: center;">${item.qty} </td>
        <td style="text-align: right;">₹${(item.variant?.price || item.product?.price || 0).toFixed(2)}</td>
      </tr>
    `).join("");

    return `<!doctype html>
      <html lang="en">
      <head>
          <meta charset="UTF-8">
          <title>Invoice #${order.order_number || order.id}</title>
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
              .items-table td { padding: 11px 12px; border-bottom: 1px solid #F6EFEF; font-size: 9.5pt; vertical-align: middle; }
              .items-table tr:nth-child(even) td { background-color: #FFFAF9; }
              .totals-table { width: 100%; border-collapse: collapse; margin-top: 10px; }
              .totals-table td { padding: 0; vertical-align: top; }
              .terms-cell { width: 55%; padding-right: 25px; }
              .summary-cell { width: 45%; }
              .inner-summary-table { width: 100%; border-collapse: collapse; }
              .inner-summary-table td { padding: 8px 12px; font-size: 10pt; border-bottom: 1px solid #F6EFEF; }
              .inner-summary-table td.label { text-align: right; color: #555555; }
              .inner-summary-table td.value { text-align: right; font-weight: bold; width: 120px; }
              .inner-summary-table tr.grand-total td { background-color: #FFEBE7; border-top: 2px solid #E63A12; border-bottom: 2px double #E63A12; font-weight: bold; color: #E63A12; font-size: 12pt; }
              .print-btn { margin-top: 20px; text-align: center; }
              .print-btn button { padding: 8px 24px; margin: 0 8px; border-radius: 9999px; font-size: 13px; font-weight: 600; cursor: pointer; border: none; }
              .btn-primary { background: #E63A12; color: white; }
              .btn-secondary { background: white; color: #E63A12; border: 1px solid #E63A12; }
              @media print { .print-btn { display: none !important; } * { -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important; } }
          </style>
      </head>
      <body>
      <div class="invoice-container">
          <div class="invoice-header">
              <table class="header-table">
                  <tr>
                      <td>
                          <div style="font-size: 9pt; color: #555555; margin-top: 8px; line-height: 1.5;">
                              <strong style="font-size: 20px;"><span style="color: #012980;">Swabhivar</span> <span style="color: #036e26;">Shoppers</span></strong><br>
                              1-1-738, Vinayaka temple road, Koratla<br>
                              Phone: +91 90326 75205 | Email: swabhivarshoppers@gmail.com<br>
                          </div>
                      </td>
                      <td class="invoice-title-block">
                          <div class="invoice-title">Order Invoice</div>
                          <div class="invoice-meta">
                              <strong>Invoice No:</strong> #${order.order_number || order.id}<br>
                              <strong>Date:</strong> ${new Date(order.created_at).toLocaleDateString("en-IN", { day: 'numeric', month: 'long', year: 'numeric' })}<br>
                              <strong>Status:</strong> ${escapeHtml(order.status)}
                          </div>
                      </td>
                  </tr>
              </table>
          </div>

          <table class="addresses-table">
              <tr>
                  <td class="from-box">
                      <div class="section-heading">From Warehouse</div>
                      <div class="address-box">
                          <strong><span style="color: #012980;">Swabhivar</span> <span style="color: #036e26;">Shoppers</span> Hub</strong><br>
                          1-1-738, Vinayaka temple road,<br>
                          Koratla, Telangana — 505326, India<br>
                          <strong>Phone:</strong> +91 90326 75205
                      </div>
                  </td>
                  <td class="ship-box">
                      <div class="section-heading">Shipping Address</div>
                      <div class="address-box">
                          <strong>${escapeHtml(address.name || "")}</strong><br>
                          ${escapeHtml(address.line1 || "")}${address.line2 ? `, ${escapeHtml(address.line2)}` : ""}<br>
                          ${escapeHtml(address.city || "")}, ${escapeHtml(address.state || "")} — ${escapeHtml(address.pincode || "")}, India<br>
                          ${address.mobile ? `<strong>Mobile:</strong> ${escapeHtml(address.mobile)}` : ""}
                      </div>
                  </td>
              </tr>
          </table>

          <table class="items-table">
              <thead>
                  <tr>
                      <th style="width: 8%; text-align: center;">S.No.</th>
                      <th style="width: 44%;">Item Name</th>
                      <th style="width: 18%; text-align: center;">Pack Size</th>
                      <th style="width: 12%; text-align: center;">Quantity</th>
                      <th style="width: 18%; text-align: right;">Price (₹)</th>
                  </tr>
              </thead>
              <tbody>
                  ${rows}
              </tbody>
          </table>

          <table class="totals-table">
              <tr>
                  <td class="terms-cell"></td>
                  <td class="summary-cell">
                      <table class="inner-summary-table">
                          <tr><td class="label">Subtotal</td><td class="value">₹${subtotal.toFixed(2)}</td></tr>
                          ${Number(order.total) - subtotal > 0 ? `<tr><td class="label">Delivery Charges</td><td class="value">₹${(Number(order.total) - subtotal).toFixed(2)}</td></tr>` : ''}
                          <tr class="grand-total"><td class="label">TOTAL:</td><td class="value">₹${Number(order.total).toFixed(2)}</td></tr>
                          ${order.payment_method === 'cod' ? `<tr><td class="label" style="color: #059669; font-size: 9pt;">Advance Paid (Online)</td><td class="value" style="color: #059669; font-size: 9pt;">-₹${Number(order.advance_paid || 0).toFixed(2)}</td></tr>
                          <tr class="grand-total" style="background-color: #ecfdf5; border-color: #059669; color: #059669;"><td class="label" style="color: #059669;">CASH TO COLLECT:</td><td class="value">₹${(Number(order.total) - Number(order.advance_paid || 0)).toFixed(2)}</td></tr>` : ''}
                      </table>
                  </td>
              </tr>
          </table>

          <div class="print-btn">
              <button class="btn-secondary" onclick="window.print()">🖨️ Print</button>
              <button class="btn-primary" onclick="window.print()">📥 Download PDF</button>
          </div>
      </div>
      </body>
      </html>`;
  };

  const openInvoice = (order) => {
    const invoiceWindow = window.open("", "_blank");
    if (invoiceWindow) {
      invoiceWindow.document.open();
      invoiceWindow.document.write(invoiceHtml(order));
      invoiceWindow.document.close();
    }
  };

  const sendInvoiceWhatsApp = (order) => {
    let items = [];
    try { items = typeof order.items === 'string' ? JSON.parse(order.items) : (order.items || []); } catch(e) {}
    
    let address = {};
    try { address = typeof order.address === 'string' ? JSON.parse(order.address) : (order.address || {}); } catch(e) {}
    
    const phone = (order.user_phone || address.mobile || "0000000000").replace(/\D/g, "");
    const itemsText = items.map((i) => `• ${i.product?.name || i.name} ×${i.qty} — ₹${(i.variant?.price || i.product?.price || 0) * i.qty}`).join("\n");
    const msg = encodeURIComponent(
      `Hi ${order.user_name || address.name || 'Customer'}! 🙏 Please find your *Invoice* for Order *#${order.order_number || order.id}* below:\n\n` +
      `*Items:*\n${itemsText}\n\n` +
      `*Total: ₹${order.total}*\n\n` +
      `Thank you for shopping with Swabhivar Shoppers!`
    );
    window.open(`https://wa.me/${phone}?text=${msg}`, "_blank");
  };

  const printLabel = (order) => {
    let items = [];
    try { items = typeof order.items === 'string' ? JSON.parse(order.items) : (order.items || []); } catch(e) {}
    let address = {};
    try { address = typeof order.address === 'string' ? JSON.parse(order.address) : (order.address || {}); } catch(e) {}

    const itemRows = items.map((item) => {
      const unitStr = item.variant?.size ? ` (${escapeHtml(item.variant?.size)})` : '';
      return `<div style="display:flex;justify-content:space-between;padding:1.5mm 0;border-bottom:1px solid #eee;">
        <div style="font-size:8pt;font-weight:600;flex:1;padding-right:3mm;">${escapeHtml(item.product?.name || item.name)}${unitStr}</div>
        <div style="font-size:8pt;color:#555;white-space:nowrap;">x${item.qty}</div>
      </div>`;
    }).join('');

    const html = `<!doctype html>
<html lang="en">
<head>
<meta charset="UTF-8">
<title>Shipping Label - #${order.order_number || order.id}</title>
<style>
  *{box-sizing:border-box;margin:0;padding:0}
  @page{size:100mm 160mm;margin:0}
  body{font-family:Arial,Helvetica,sans-serif;width:100mm;background:#fff;font-size:9pt}
  .box{border:2.5px solid #111;margin:3mm;border-radius:2mm;overflow:hidden}
  .hdr{background:#012980;color:#fff;padding:3.5mm 4mm;display:flex;justify-content:space-between;align-items:center}
  .brand{font-size:16pt;font-weight:900;letter-spacing:-0.5px}
  .oid{background:#fff;color:#012980;font-size:10pt;font-weight:900;padding:1px 8px;border-radius:999px}
  .sec{padding:2.5mm 4mm;border-bottom:1px dashed #bbb}
  .lbl{font-size:5.5pt;text-transform:uppercase;letter-spacing:1px;color:#888;font-weight:700;margin-bottom:1mm}
  .val{font-size:10.5pt;font-weight:700;color:#111;line-height:1.35}
  .sm{font-size:8pt;color:#444;line-height:1.5}
  .items{padding:2.5mm 4mm}
  .ftr{background:#f0f5ff;padding:3mm 4mm;border-top:1px solid #ddd;display:flex;justify-content:flex-end;align-items:center}
  .dt{font-size:7pt;color:#aaa;text-align:right;line-height:1.6}
  .no-print{text-align:center;padding:10px}
  @media print{.no-print{display:none!important}*{-webkit-print-color-adjust:exact!important;print-color-adjust:exact!important}}
</style>
</head>
<body>
<div class="box">
  <div class="hdr">
    <div class="brand"><span style="color: #ffffff;">Swabhivar</span> <span style="color: #00ff66;">Shoppers</span></div>
    <div class="oid">#${order.order_number || order.id}</div>
  </div>
  <div class="sec">
    <div class="lbl">Ship To</div>
    <div class="val">${escapeHtml(address.name || '')}</div>
    <div class="sm">${escapeHtml(address.line1 || '')}${address.line2 ? ', ' + escapeHtml(address.line2) : ''}</div>
    <div class="sm">${escapeHtml(address.city || '')}, ${escapeHtml(address.state || '')} - ${escapeHtml(address.pincode || '')}, India</div>
    ${address.mobile ? '<div class="sm" style="font-weight:700;margin-top:1mm;">Ph: ' + escapeHtml(address.mobile) + '</div>' : ''}
  </div>
 
  <div class="items">
    <div class="lbl" style="margin-bottom:2mm;">Order Items (${items.length})</div>
    ${itemRows}
  </div>
  <div class="ftr">
    <div class="dt">
      ${new Date(order.created_at).toLocaleDateString('en-IN')}
      ${order.tracking_id ? '<br>AWB: ' + escapeHtml(order.tracking_id) : ''}
    </div>
  </div>
</div>
<div class="no-print">
  <button onclick="window.print()" style="background:#012980;color:#fff;border:none;padding:8px 28px;border-radius:999px;font-size:13px;font-weight:700;cursor:pointer;margin-top:4px;">
    Print Label
  </button>
</div>
</body>
</html>`;

    const w = window.open('', '_blank', 'width=440,height=640');
    if (w) { w.document.open(); w.document.write(html); w.document.close(); }
  };

  // Filter orders by tab (Platform vs Vendor vs All) and search term and status
  const filteredOrders = orders.filter((o) => {
    // 1. Tab filter
    if (activeTab === "platform" && !o.platform_package) return false;
    if (activeTab === "vendor" && (!o.vendor_packages || o.vendor_packages.length === 0)) return false;

    // 2. Status filter
    if (statusFilter !== "all" && o.status !== statusFilter) return false;

    // 3. Search term
    if (searchTerm.trim() !== "") {
      const q = searchTerm.toLowerCase();
      const numMatch = String(o.order_number || o.id || '').toLowerCase().includes(q);
      const userMatch = String(o.user_name || '').toLowerCase().includes(q);
      const phoneMatch = String(o.user_phone || '').includes(q);
      const awbMatch = String(o.tracking_id || o.platform_package?.awb || '').toLowerCase().includes(q);
      const vendorAwbMatch = o.vendor_packages?.some(v => String(v.awb || '').toLowerCase().includes(q));
      if (!numMatch && !userMatch && !phoneMatch && !awbMatch && !vendorAwbMatch) return false;
    }

    return true;
  });

  const platformOrdersCount = orders.filter(o => o.platform_package).length;
  const vendorOrdersCount = orders.filter(o => o.vendor_packages && o.vendor_packages.length > 0).length;

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="w-8 h-8 border-4 border-gray-200 border-t-[#fe6603] rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="w-full max-w-6xl mx-auto space-y-6">
      
      {/* 1. Header with Title & Stats */}
      <div>
        <h1 className="text-2xl sm:text-3xl font-extrabold text-gray-900 tracking-tight">Orders</h1>
        <p className="text-gray-500 text-xs sm:text-sm mt-0.5">
          {orders.length} Total Orders ({platformOrdersCount} Platform / In-House, {vendorOrdersCount} Vendor Orders)
        </p>
      </div>

      {/* 2. Top Navigation Tabs & Search (Matching ULMGH369 Reference) */}
      <div className="bg-white p-3 rounded-2xl border border-gray-100 shadow-xs flex flex-col md:flex-row md:items-center justify-between gap-3">
        
        {/* Toggle Tabs */}
        <div className="flex items-center gap-2 overflow-x-auto pb-1 md:pb-0 scrollbar-hide">
          
          <button
            onClick={() => setActiveTab("all")}
            className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs sm:text-sm font-bold transition-all shadow-xs ${
              activeTab === "all"
                ? "bg-[#012980] text-white shadow-blue-900/20"
                : "bg-gray-50 text-gray-600 hover:bg-gray-100"
            }`}
          >
            <Layers className="w-4 h-4" />
            <span>All Orders</span>
            <span className={`px-1.5 py-0.5 rounded-full text-[10px] ${activeTab === 'all' ? 'bg-white/20 text-white' : 'bg-gray-200 text-gray-700'}`}>
              {orders.length}
            </span>
          </button>

          <button
            onClick={() => setActiveTab("platform")}
            className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs sm:text-sm font-bold transition-all shadow-xs ${
              activeTab === "platform"
                ? "bg-[#fe6603] text-white shadow-orange-600/20"
                : "bg-gray-50 text-gray-600 hover:bg-gray-100"
            }`}
          >
            <Building2 className="w-4 h-4" />
            <span>Admin Orders</span>
            <span className={`px-1.5 py-0.5 rounded-full text-[10px] ${activeTab === 'platform' ? 'bg-white/20 text-white' : 'bg-gray-200 text-gray-700'}`}>
              {platformOrdersCount}
            </span>
          </button>

          <button
            onClick={() => setActiveTab("vendor")}
            className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs sm:text-sm font-bold transition-all shadow-xs ${
              activeTab === "vendor"
                ? "bg-[#fe6603] text-white shadow-orange-600/20"
                : "bg-gray-50 text-gray-600 hover:bg-gray-100"
            }`}
          >
            <Store className="w-4 h-4" />
            <span>Vendor Orders</span>
            <span className={`px-1.5 py-0.5 rounded-full text-[10px] ${activeTab === 'vendor' ? 'bg-white/20 text-white' : 'bg-gray-200 text-gray-700'}`}>
              {vendorOrdersCount}
            </span>
          </button>

        </div>

        {/* Search Bar */}
        <div className="relative w-full md:w-80">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
          <input
            type="text"
            placeholder="Search order, customer, AWB..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full pl-9 pr-3 py-2 bg-gray-50 border border-gray-200 rounded-xl text-xs sm:text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-[#012980]"
          />
        </div>

      </div>

      {/* 3. Status Filter Pills */}
      <div className="flex gap-2 overflow-x-auto pb-1 scrollbar-hide -mx-1 px-1">
        {["all", ...STATUSES].map((s) => {
          const count = orders.filter((o) => {
            if (activeTab === "platform" && !o.platform_package) return false;
            if (activeTab === "vendor" && (!o.vendor_packages || o.vendor_packages.length === 0)) return false;
            return s === "all" || o.status === s;
          }).length;

          return (
            <button
              key={s}
              onClick={() => setStatusFilter(s)}
              className={`flex-shrink-0 px-3 py-1.5 rounded-full text-xs font-bold capitalize transition-colors ${
                statusFilter === s
                  ? "bg-[#012980] text-white shadow-xs"
                  : "bg-white border border-gray-200 text-gray-600 hover:border-gray-400"
              }`}
            >
              {s === "all" ? `All (${count})` : `${s.replace('_', ' ')} (${count})`}
            </button>
          );
        })}
      </div>

      {/* 4. Orders List */}
      {filteredOrders.length === 0 ? (
        <div className="bg-white rounded-2xl border border-gray-100 p-12 text-center shadow-xs">
          <Package className="w-12 h-12 text-gray-300 mx-auto mb-3" />
          <h3 className="font-bold text-gray-700 text-base">No orders found</h3>
          <p className="text-gray-400 text-xs mt-1">Try adjusting your tab, status filter or search query.</p>
        </div>
      ) : (
        <div className="space-y-4">
          {filteredOrders.map((order, i) => {
            let address = {};
            try { address = typeof order.address === 'string' ? JSON.parse(order.address) : (order.address || {}); } catch(e) {}

            const isCod = String(order.payment_method || '').toLowerCase() === 'cod';
            const isExpanded = expanded === order.id;

            return (
              <motion.div
                key={order.id}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: i * 0.03 }}
                className="bg-white rounded-2xl border border-gray-200/80 shadow-xs overflow-hidden transition-all"
              >
                {/* Order Summary Header Bar */}
                <div
                  onClick={() => setExpanded(isExpanded ? null : order.id)}
                  className="p-4 sm:p-5 cursor-pointer hover:bg-gray-50/70 transition-colors flex flex-col md:flex-row md:items-center justify-between gap-3"
                >
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap mb-1">
                      <span className="font-extrabold text-gray-900 text-sm sm:text-base">
                        #{order.order_number || order.id}
                      </span>
                      <span className="text-gray-400 text-xs">
                        {new Date(order.created_at).toLocaleDateString("en-IN", { day: '2-digit', month: 'short', year: 'numeric' })}
                      </span>
                      
                      {/* Overall Status Badge */}
                      <span className={`text-[10px] font-extrabold px-2.5 py-0.5 rounded-full border uppercase tracking-wider ${STATUS_COLORS[order.status] || "bg-gray-100 text-gray-700 border-gray-200"}`}>
                        {order.status?.replace('_', ' ')}
                      </span>

                      {/* Order Type Badge */}
                      {order.order_type === 'mixed' && (
                        <span className="text-[10px] font-bold px-2 py-0.5 rounded-md bg-purple-50 text-purple-700 border border-purple-200">
                          Mixed Order (Admin + Vendor)
                        </span>
                      )}
                      {order.order_type === 'platform' && (
                        <span className="text-[10px] font-bold px-2 py-0.5 rounded-md bg-blue-50 text-blue-700 border border-blue-200">
                          Platform Order (In-House)
                        </span>
                      )}
                      {order.order_type === 'vendor' && (
                        <span className="text-[10px] font-bold px-2 py-0.5 rounded-md bg-orange-50 text-orange-700 border border-orange-200">
                          Vendor Order
                        </span>
                      )}

                      {/* COD Tag */}
                      {isCod && (
                        <span className="text-[10px] font-bold px-2 py-0.5 rounded-md bg-emerald-50 text-emerald-700 border border-emerald-200">
                          COD (₹{order.total - (order.advance_paid || 0)} Pending)
                        </span>
                      )}
                    </div>

                    <p className="text-xs text-gray-500 truncate">
                      Customer: <strong className="text-gray-800">{order.user_name || address.name || "Customer"}</strong> {order.user_email ? `(${order.user_email})` : ""}
                    </p>
                  </div>

                  <div className="flex items-center justify-between md:justify-end gap-4 shrink-0">
                    <div className="text-right">
                      <p className="font-extrabold text-[#fe6603] text-base sm:text-lg">
                        ₹{Number(order.total).toLocaleString()}
                      </p>
                      <p className="text-[10px] text-gray-400 font-semibold">
                        {(order.platform_package ? 1 : 0) + (order.vendor_packages?.length || 0)} Package(s)
                      </p>
                    </div>
                    <div className={`p-1.5 rounded-xl bg-gray-100 text-gray-600 transition-transform ${isExpanded ? 'rotate-180 bg-[#012980] text-white' : ''}`}>
                      <ChevronDown className="w-4 h-4" />
                    </div>
                  </div>
                </div>

                {/* Expanded Details Panel */}
                {isExpanded && (
                  <div className="p-4 sm:p-6 border-t border-gray-100 space-y-6 bg-gray-50/40">
                    
                    {/* Customer & Shipping Details (2-Column Grid) */}
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      
                      {/* Customer Info Box */}
                      <div className="bg-white p-4 rounded-xl border border-gray-200/80 shadow-2xs space-y-2">
                        <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">Customer Details</p>
                        <p className="font-bold text-gray-900 text-sm">{order.user_name || address.name || "Customer"}</p>
                        <p className="text-xs text-gray-500">{order.user_email || "No email"}</p>
                        <p className="text-xs font-semibold text-gray-700">{order.user_phone || address.mobile || "No phone"}</p>
                      </div>

                      {/* Shipping Address Box */}
                      <div className="bg-white p-4 rounded-xl border border-gray-200/80 shadow-2xs space-y-2">
                        <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">Shipping Address</p>
                        <p className="font-bold text-gray-900 text-sm">{address.name || order.user_name || ""}</p>
                        <p className="text-xs text-gray-600 leading-relaxed">
                          {address.line1 || ""}{address.line2 ? `, ${address.line2}` : ""}<br />
                          {address.city || ""}, {address.state || ""} — {address.pincode || ""}, India
                        </p>
                        {address.mobile && (
                          <p className="text-xs font-semibold text-gray-700">Phone: {address.mobile}</p>
                        )}
                      </div>

                    </div>

                    {/* Order Controls Row */}
                    <div className="bg-white p-4 rounded-xl border border-gray-200/80 shadow-2xs flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                      <div className="flex items-center gap-3">
                        <span className="text-xs font-bold text-gray-500 uppercase tracking-wider">Payment:</span>
                        <span className={`text-xs font-bold px-2.5 py-0.5 rounded-full ${isCod ? 'bg-emerald-100 text-emerald-800' : 'bg-blue-100 text-blue-800'}`}>
                          {isCod ? 'Cash on Delivery' : 'Prepaid (Online)'}
                        </span>
                      </div>

                      <div className="flex items-center gap-2">
                        <span className="text-xs font-bold text-gray-500 uppercase tracking-wider shrink-0">Order Status:</span>
                        <select
                          value={order.status}
                          onChange={(e) => updateStatus(order.id, e.target.value)}
                          className="px-3 py-1.5 rounded-xl bg-gray-50 border border-gray-200 text-xs sm:text-sm font-semibold text-gray-900 focus:outline-none focus:ring-2 focus:ring-[#012980]"
                        >
                          {STATUSES.map((s) => (
                            <option key={s} value={s}>
                              {s.replace('_', ' ')}
                            </option>
                          ))}
                        </select>
                      </div>
                    </div>

                    {/* ======================================================== */}
                    {/* SECTION A: PLATFORM PACKAGES (IN-HOUSE)                  */}
                    {/* ======================================================== */}
                    {order.platform_package && (
                      <div className="space-y-3">
                        <div className="flex items-center gap-2">
                          <Building2 className="w-4 h-4 text-[#012980]" />
                          <h3 className="font-extrabold text-sm text-gray-900 uppercase tracking-wider">
                            Platform Packages (1)
                          </h3>
                        </div>

                        <div className="bg-white rounded-2xl border-2 border-blue-100 p-4 sm:p-5 shadow-xs space-y-4">
                          
                          {/* Package Header */}
                          <div className="flex items-center justify-between pb-3 border-b border-gray-100">
                            <div className="flex items-center gap-2">
                              <span className="px-2 py-0.5 bg-blue-50 text-[#012980] border border-blue-200 rounded-md text-xs font-bold uppercase">
                                Platform (In-House)
                              </span>
                              <span className="font-mono text-xs font-bold text-gray-700">
                                {order.platform_package.package_id}
                              </span>
                            </div>

                            <span className={`text-[10px] font-extrabold px-2.5 py-0.5 rounded-full uppercase tracking-wider ${
                              order.platform_package.status === 'shipped' 
                                ? 'bg-emerald-100 text-emerald-800 border border-emerald-200' 
                                : 'bg-amber-100 text-amber-800 border border-amber-200'
                            }`}>
                              {order.platform_package.status}
                            </span>
                          </div>

                          {/* Items in Platform Package */}
                          <div>
                            <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-2">
                              Package Items ({order.platform_package.items.length})
                            </p>
                            <div className="space-y-2">
                              {order.platform_package.items.map((item, idx) => (
                                <div key={idx} className="flex items-center justify-between p-2.5 bg-gray-50 rounded-xl text-xs">
                                  <div className="font-semibold text-gray-900">
                                    {item.product?.name || item.name}
                                    {item.variant?.size && <span className="text-gray-500 font-normal"> ({item.variant.size})</span>}
                                  </div>
                                  <div className="text-right text-gray-600">
                                    x{item.qty} — <strong className="text-gray-900">₹{(item.variant?.price || item.product?.price || 0) * item.qty}</strong>
                                  </div>
                                </div>
                              ))}
                            </div>
                          </div>

                          {/* Warehouse Details */}
                          <div className="p-3 bg-blue-50/60 rounded-xl border border-blue-100 text-xs flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                            <div>
                              <span className="text-[10px] font-bold text-blue-800 uppercase tracking-wider block">Pickup Warehouse</span>
                              <span className="font-semibold text-gray-900">Admin Central Hub (suresh — Koratla 505326)</span>
                            </div>
                            <span className="text-[10px] font-mono text-blue-700 bg-white px-2 py-1 rounded border border-blue-200">
                              Location: {order.platform_package.warehouse}
                            </span>
                          </div>

                          {/* Dispatch Action or Shipment Details */}
                          {order.platform_package.status === 'shipped' || order.platform_package.awb ? (
                            <div className="p-4 bg-emerald-50 rounded-xl border border-emerald-200 space-y-2">
                              <div className="flex items-center justify-between flex-wrap gap-2">
                                <div className="flex items-center gap-2">
                                  <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                                  <span className="font-bold text-emerald-900 text-xs">Dispatched from Admin Warehouse</span>
                                </div>
                                {order.platform_package.tracking_url && (
                                  <a
                                    href={order.platform_package.tracking_url}
                                    target="_blank"
                                    rel="noreferrer"
                                    className="inline-flex items-center gap-1 text-xs font-bold text-emerald-800 hover:text-emerald-950 underline"
                                  >
                                    <span>Track Shipment</span>
                                    <ExternalLink className="w-3.5 h-3.5" />
                                  </a>
                                )}
                              </div>
                              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 text-xs pt-1">
                                <div>
                                  <span className="text-[10px] text-gray-400 uppercase block font-semibold">AWB Code</span>
                                  <span className="font-mono font-bold text-gray-900">{order.platform_package.awb || 'Assigned'}</span>
                                </div>
                                <div>
                                  <span className="text-[10px] text-gray-400 uppercase block font-semibold">Courier</span>
                                  <span className="font-bold text-gray-900">{order.platform_package.courier_name}</span>
                                </div>
                                <div>
                                  <span className="text-[10px] text-gray-400 uppercase block font-semibold">Shipment ID</span>
                                  <span className="font-mono text-gray-800">{order.platform_package.shipment_id || 'N/A'}</span>
                                </div>
                              </div>
                            </div>
                          ) : (
                            <div className="pt-2">
                              <button
                                onClick={() => handleDispatchPlatform(order.id)}
                                disabled={dispatching[`platform_${order.id}`] || !order.platform_package.can_dispatch}
                                className="w-full flex items-center justify-center gap-2 py-3 px-4 rounded-xl font-extrabold text-sm text-white bg-[#012980] hover:bg-blue-900 transition-all shadow-md shadow-blue-900/10 disabled:opacity-50"
                              >
                                {dispatching[`platform_${order.id}`] ? (
                                  <>
                                    <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                                    <span>Creating Shiprocket Order...</span>
                                  </>
                                ) : (
                                  <>
                                    <Truck className="w-4 h-4" />
                                    <span>🚚 Dispatch (Admin Warehouse)</span>
                                  </>
                                )}
                              </button>
                            </div>
                          )}

                        </div>
                      </div>
                    )}

                    {/* ======================================================== */}
                    {/* SECTION B: VENDOR PACKAGES                               */}
                    {/* ======================================================== */}
                    {order.vendor_packages && order.vendor_packages.length > 0 && (
                      <div className="space-y-4">
                        <div className="flex items-center gap-2">
                          <Store className="w-4 h-4 text-[#fe6603]" />
                          <h3 className="font-extrabold text-sm text-gray-900 uppercase tracking-wider">
                            Vendor Packages ({order.vendor_packages.length})
                          </h3>
                        </div>

                        {order.vendor_packages.map((pkg) => {
                          const isDispatched = pkg.status === 'shipped' || Boolean(pkg.awb);
                          const isDispatchingThis = dispatching[`vendor_${order.id}_${pkg.vendor_id}`];

                          return (
                            <div
                              key={pkg.vendor_id}
                              className="bg-white rounded-2xl border-2 border-orange-100 p-4 sm:p-5 shadow-xs space-y-4"
                            >
                              {/* Vendor Package Header */}
                              <div className="flex items-center justify-between pb-3 border-b border-gray-100">
                                <div>
                                  <div className="flex items-center gap-2">
                                    <span className="px-2 py-0.5 bg-orange-50 text-[#fe6603] border border-orange-200 rounded-md text-xs font-bold uppercase">
                                      Vendor #{pkg.vendor_id}
                                    </span>
                                    <span className="font-bold text-gray-900 text-sm">
                                      {pkg.store_name}
                                    </span>
                                  </div>
                                  <p className="font-mono text-[11px] text-gray-400 mt-0.5">
                                    Package ID: {pkg.package_id}
                                  </p>
                                </div>

                                <span className={`text-[10px] font-extrabold px-2.5 py-0.5 rounded-full uppercase tracking-wider ${
                                  isDispatched
                                    ? 'bg-emerald-100 text-emerald-800 border border-emerald-200'
                                    : 'bg-amber-100 text-amber-800 border border-amber-200'
                                }`}>
                                  {isDispatched ? 'Dispatched' : 'Pending'}
                                </span>
                              </div>

                              {/* Vendor Items */}
                              <div>
                                <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-2">
                                  Package Items ({pkg.items.length})
                                </p>
                                <div className="space-y-2">
                                  {pkg.items.map((item, idx) => (
                                    <div key={idx} className="flex items-center justify-between p-2.5 bg-gray-50 rounded-xl text-xs">
                                      <div className="font-semibold text-gray-900">
                                        {item.product?.name || item.name}
                                        {item.variant?.size && <span className="text-gray-500 font-normal"> ({item.variant.size})</span>}
                                      </div>
                                      <div className="text-right text-gray-600">
                                        x{item.qty} — <strong className="text-gray-900">₹{(item.variant?.price || item.product?.price || 0) * item.qty}</strong>
                                      </div>
                                    </div>
                                  ))}
                                </div>
                              </div>

                              {/* Vendor Registered Pickup Address */}
                              <div className="p-3 bg-amber-50/60 rounded-xl border border-amber-200/80 text-xs space-y-1">
                                <div className="flex items-center justify-between">
                                  <span className="text-[10px] font-bold text-amber-900 uppercase tracking-wider">
                                    Vendor's Registered Pickup Address
                                  </span>
                                  {pkg.has_valid_pickup_address ? (
                                    <span className="text-[10px] font-mono text-amber-800 bg-white px-2 py-0.5 rounded border border-amber-200">
                                      Nickname: {pkg.pickup_address.nickname}
                                    </span>
                                  ) : (
                                    <span className="text-[10px] font-bold text-red-600 bg-red-50 px-2 py-0.5 rounded border border-red-200">
                                      ⚠️ Address Incomplete
                                    </span>
                                  )}
                                </div>

                                {pkg.has_valid_pickup_address ? (
                                  <div className="text-gray-800 leading-relaxed pt-1">
                                    <p className="font-bold">{pkg.pickup_address.contact_name} (Ph: {pkg.pickup_address.phone})</p>
                                    <p className="text-gray-600">
                                      {pkg.pickup_address.address_line1}{pkg.pickup_address.address_line2 ? `, ${pkg.pickup_address.address_line2}` : ''}, {pkg.pickup_address.city}, {pkg.pickup_address.state} — {pkg.pickup_address.pincode}
                                    </p>
                                  </div>
                                ) : (
                                  <p className="text-red-600 text-xs pt-1">
                                    This vendor has not set up a complete Pickup Address in their Vendor Profile.
                                  </p>
                                )}
                              </div>

                              {/* Dispatch Action or Active Shipment Details */}
                              {isDispatched ? (
                                <div className="p-4 bg-emerald-50 rounded-xl border border-emerald-200 space-y-2">
                                  <div className="flex items-center justify-between flex-wrap gap-2">
                                    <div className="flex items-center gap-2">
                                      <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                                      <span className="font-bold text-emerald-900 text-xs">
                                        {pkg.dispatched_by === 'admin' ? 'Dispatched by Admin (from Vendor Pickup)' : 'Dispatched by Vendor'}
                                      </span>
                                    </div>
                                    {pkg.tracking_url && (
                                      <a
                                        href={pkg.tracking_url}
                                        target="_blank"
                                        rel="noreferrer"
                                        className="inline-flex items-center gap-1 text-xs font-bold text-emerald-800 hover:text-emerald-950 underline"
                                      >
                                        <span>Track Shipment</span>
                                        <ExternalLink className="w-3.5 h-3.5" />
                                      </a>
                                    )}
                                  </div>

                                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 text-xs pt-1">
                                    <div>
                                      <span className="text-[10px] text-gray-400 uppercase block font-semibold">AWB Code</span>
                                      <span className="font-mono font-bold text-gray-900">{pkg.awb || 'Assigned'}</span>
                                    </div>
                                    <div>
                                      <span className="text-[10px] text-gray-400 uppercase block font-semibold">Courier</span>
                                      <span className="font-bold text-gray-900">{pkg.courier_name || 'Shiprocket'}</span>
                                    </div>
                                    <div>
                                      <span className="text-[10px] text-gray-400 uppercase block font-semibold">Shipment ID</span>
                                      <span className="font-mono text-gray-800">{pkg.shiprocket_shipment_id || 'N/A'}</span>
                                    </div>
                                  </div>
                                </div>
                              ) : (
                                <div className="pt-2">
                                  <button
                                    onClick={() => handleDispatchVendor(order.id, pkg.vendor_id)}
                                    disabled={isDispatchingThis || !pkg.can_dispatch || !pkg.has_valid_pickup_address}
                                    className="w-full flex items-center justify-center gap-2 py-3 px-4 rounded-xl font-extrabold text-sm text-white bg-[#fe6603] hover:bg-orange-600 transition-all shadow-md shadow-orange-600/10 disabled:opacity-50"
                                  >
                                    {isDispatchingThis ? (
                                      <>
                                        <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                                        <span>Creating Vendor Shipment...</span>
                                      </>
                                    ) : (
                                      <>
                                        <Truck className="w-4 h-4" />
                                        <span>🚚 Dispatch Vendor Package (From Vendor Address)</span>
                                      </>
                                    )}
                                  </button>
                                  {!pkg.has_valid_pickup_address && (
                                    <p className="text-[11px] text-center text-red-500 font-semibold mt-1.5">
                                      Cannot dispatch until vendor registers a valid pickup address in their profile.
                                    </p>
                                  )}
                                </div>
                              )}

                            </div>
                          );
                        })}
                      </div>
                    )}

                    {/* Action Buttons Footer */}
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 pt-4 border-t border-gray-200/80">
                      <button
                        onClick={() => printLabel(order)}
                        className="flex items-center justify-center gap-1.5 bg-[#012980] text-white hover:bg-[#e55c02] px-3 py-2.5 rounded-xl text-xs font-semibold transition-colors"
                      >
                        <Printer className="w-3.5 h-3.5 flex-shrink-0" />
                        <span className="truncate">Print Label</span>
                      </button>
                      <button
                        onClick={() => notifyWhatsApp(order)}
                        className="flex items-center justify-center gap-1.5 bg-green-500 hover:bg-green-600 text-white px-3 py-2.5 rounded-xl text-xs font-semibold transition-colors"
                      >
                        <MessageCircle className="w-3.5 h-3.5 flex-shrink-0" />
                        <span className="truncate">Notify WA</span>
                      </button>
                      <button
                        onClick={() => openInvoice(order)}
                        className="flex items-center justify-center gap-1.5 bg-[#D4AF37] hover:bg-amber-500 text-gray-900 px-3 py-2.5 rounded-xl text-xs font-semibold transition-colors"
                      >
                        <FileText className="w-3.5 h-3.5 flex-shrink-0" />
                        <span className="truncate">Invoice</span>
                      </button>
                      <button
                        onClick={() => sendInvoiceWhatsApp(order)}
                        className="flex items-center justify-center gap-1.5 bg-emerald-600 hover:bg-emerald-700 text-white px-3 py-2.5 rounded-xl text-xs font-semibold transition-colors"
                      >
                        <MessageCircle className="w-3.5 h-3.5 flex-shrink-0" />
                        <span className="truncate">Send Invoice</span>
                      </button>
                    </div>

                  </div>
                )}
              </motion.div>
            );
          })}
        </div>
      )}

    </div>
  );
}
