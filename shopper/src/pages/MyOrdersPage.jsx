import React, { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { 
  Package, ShoppingBag, FileText, RefreshCw, RotateCcw, 
  AlertCircle, CheckCircle2, Clock, Upload, Send, MessageSquare, 
  Truck, ShieldAlert, X, ChevronRight, ChevronLeft,
  Building, ShieldCheck, ExternalLink
} from 'lucide-react';
import { useAuthStore } from '../store/useAuthStore';
import { useCartStore } from '../store/useCartStore';
import { Header } from '../components/Header';
import { registerModal, navigateBackSafe } from '../utils/backNavigation';
import axios from 'axios';

const STATUS_COLORS = {
  pending: 'bg-yellow-100 text-yellow-700 border-yellow-200',
  processing: 'bg-blue-100 text-blue-700 border-blue-200',
  shipped: 'bg-purple-100 text-purple-700 border-purple-200',
  delivered: 'bg-green-100 text-green-700 border-green-200',
  cancelled: 'bg-red-100 text-red-700 border-red-200',
};

const STATUS_STEPS = ['pending', 'processing', 'shipped', 'delivered'];

const RETURN_REASONS = [
  'Defective or damaged product',
  'Wrong item or variant delivered',
  'Item does not match description',
  'Quality issue / poor finishing',
  'Size or fit problem',
  'Missing parts or accessories',
  'Other genuine issue'
];

export function MyOrdersPage() {
  const navigate = useNavigate();
  const { token, orders, fetchProfile, user } = useAuthStore();
  const addToCart = useCartStore(state => state.addToCart);

  // Return & Refund State
  const [returnsMap, setReturnsMap] = useState({}); // keyed by order_id
  const [activeModal, setActiveModal] = useState(null); // 'request' | 'details' | 'appeal' | null
  const [selectedOrder, setSelectedOrder] = useState(null);
  const [selectedReturn, setSelectedReturn] = useState(null);
  
  // Request Form
  const [returnReason, setReturnReason] = useState('');
  const [returnDescription, setReturnDescription] = useState('');
  const [returnImages, setReturnImages] = useState([]);
  const [uploadingImage, setUploadingImage] = useState(false);
  const [submittingReturn, setSubmittingReturn] = useState(false);
  const [formError, setFormError] = useState('');

  // Bank Details Form (Mandatory for Direct Refund)
  const [bankHolderName, setBankHolderName] = useState('');
  const [bankAccountNumber, setBankAccountNumber] = useState('');
  const [confirmBankAccountNumber, setConfirmBankAccountNumber] = useState('');
  const [bankIfsc, setBankIfsc] = useState('');
  const [bankName, setBankName] = useState('');

  // Shipping Form
  const [courierName, setCourierName] = useState('');
  const [trackingNumber, setTrackingNumber] = useState('');
  const [submittingShip, setSubmittingShip] = useState(false);

  // Appeal Form
  const [appealReason, setAppealReason] = useState('');
  const [submittingAppeal, setSubmittingAppeal] = useState(false);

  // Message Form
  const [newMessage, setNewMessage] = useState('');
  const [sendingMessage, setSendingMessage] = useState(false);

  useEffect(() => {
    if (!token) { navigate('/login'); return; }
    fetchProfile();
    fetchCustomerReturns();
  }, [token]);

  // Close return/appeal modal on back action
  useEffect(() => {
    if (!activeModal) return;
    return registerModal(() => setActiveModal(null));
  }, [activeModal]);

  const fetchCustomerReturns = async () => {
    try {
      const res = await axios.get('/api/returns/my-returns', {
        headers: { Authorization: `Bearer ${token}` }
      });
      if (res.data && res.data.returns) {
        const map = {};
        res.data.returns.forEach(r => {
          map[r.order_id] = r;
        });
        setReturnsMap(map);
      }
    } catch (err) {
      console.error('Failed to load return requests:', err);
    }
  };

  const reloadReturnDetails = async (returnId) => {
    try {
      const res = await axios.get(`/api/returns/${returnId}`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      if (res.data && res.data.returnRequest) {
        setSelectedReturn(res.data.returnRequest);
        setReturnsMap(prev => ({ ...prev, [res.data.returnRequest.order_id]: res.data.returnRequest }));
      }
    } catch (err) {
      console.error('Failed to refresh return details:', err);
    }
  };

  // Eligibility check (7-day window from delivered_at or created_at if delivered)
  const isReturnEligible = (order) => {
    if (order.status !== 'delivered') return { eligible: false, reason: 'Only delivered orders can be returned' };
    const deliveredDate = new Date(order.delivered_at || order.created_at);
    const now = new Date();
    const diffDays = (now - deliveredDate) / (1000 * 60 * 60 * 24);
    if (diffDays > 7) {
      return { eligible: false, reason: '7-day return window expired' };
    }
    return { eligible: true, daysLeft: Math.max(0, 7 - Math.floor(diffDays)) };
  };

  const handleOpenRequestModal = async (order) => {
    setSelectedOrder(order);
    setReturnReason(RETURN_REASONS[0]);
    setReturnDescription('');
    setReturnImages([]);
    setFormError('');
    setBankHolderName(order.address?.name || user?.name || '');
    setBankAccountNumber('');
    setConfirmBankAccountNumber('');
    setBankIfsc('');
    setBankName('');
    setActiveModal('request');

    // Auto-prefill saved bank if user has previously submitted bank details
    try {
      const res = await axios.get('/api/returns/saved-bank', {
        headers: { Authorization: `Bearer ${token}` }
      });
      if (res.data?.savedBank) {
        const b = res.data.savedBank;
        if (b.account_name) setBankHolderName(b.account_name);
        if (b.ifsc_code) setBankIfsc(b.ifsc_code);
        if (b.bank_name) setBankName(b.bank_name);
      }
    } catch {
      // non-fatal prefill fallback
    }
  };

  const handleOpenDetailsModal = async (ret) => {
    setSelectedReturn(ret);
    setActiveModal('details');
    // Refresh full details including messages
    reloadReturnDetails(ret.id);
  };

  const handleImageUpload = async (e) => {
    const files = Array.from(e.target.files);
    if (!files.length) return;
    if (returnImages.length + files.length > 5) {
      setFormError('You can upload up to 5 images maximum');
      return;
    }

    setUploadingImage(true);
    setFormError('');
    try {
      for (const file of files) {
        const formData = new FormData();
        formData.append('image', file);
        formData.append('folder', 'returns');
        const res = await axios.post('/api/upload', formData, {
          headers: {
            'Content-Type': 'multipart/form-data',
            Authorization: `Bearer ${token}`
          }
        });
        if (res.data && res.data.url) {
          setReturnImages(prev => [...prev, res.data.url]);
        }
      }
    } catch (err) {
      setFormError(err.response?.data?.message || 'Failed to upload image. Please try again.');
    } finally {
      setUploadingImage(false);
    }
  };

  const handleSubmitReturn = async (e) => {
    e.preventDefault();
    setFormError('');

    if (!returnReason) { setFormError('Please select a return reason'); return; }
    if (!returnDescription.trim()) { setFormError('Please provide a brief description of the issue'); return; }

    const cleanHolder = bankHolderName.trim();
    const cleanAcc = bankAccountNumber.trim();
    const cleanConfirm = confirmBankAccountNumber.trim();
    const cleanIfsc = bankIfsc.trim().toUpperCase();
    const cleanBank = bankName.trim();

    if (!cleanHolder || !cleanAcc || !cleanConfirm || !cleanIfsc || !cleanBank) {
      setFormError('All bank details (Account Holder Name, Bank Name, IFSC Code, Account Number, and Confirm Account Number) are strictly required for your refund.');
      return;
    }

    if (cleanAcc !== cleanConfirm) {
      setFormError('Bank Account Number and Confirm Account Number do not match.');
      return;
    }

    if (!/^\d{9,18}$/.test(cleanAcc)) {
      setFormError('Bank account number must be between 9 and 18 numeric digits.');
      return;
    }

    if (!/^[A-Z]{4}0[A-Z0-9]{6}$/.test(cleanIfsc)) {
      setFormError('Invalid IFSC code format. IFSC must be 11 characters (e.g. SBIN0001234, HDFC0000123).');
      return;
    }

    setSubmittingReturn(true);
    try {
      let items = [];
      try {
        items = typeof selectedOrder.items === 'string' ? JSON.parse(selectedOrder.items) : (selectedOrder.items || []);
      } catch (e) {
        items = [];
      }

      const payload = {
        order_id: selectedOrder.id,
        reason: returnReason,
        description: returnDescription.trim(),
        images: returnImages,
        items: items,
        bank_holder_name: cleanHolder,
        bank_account_number: cleanAcc,
        confirm_bank_account_number: cleanConfirm,
        bank_ifsc: cleanIfsc,
        bank_name: cleanBank
      };

      const res = await axios.post('/api/returns/request', payload, {
        headers: { Authorization: `Bearer ${token}` }
      });

      if (res.data && res.data.returnRequest) {
        setReturnsMap(prev => ({ ...prev, [selectedOrder.id]: res.data.returnRequest }));
        setSelectedReturn(res.data.returnRequest);
        setActiveModal('details');
      }
    } catch (err) {
      setFormError(err.response?.data?.error || err.response?.data?.message || 'Failed to submit return request. Please try again.');
    } finally {
      setSubmittingReturn(false);
    }
  };

  const handleShipReturn = async (e) => {
    e.preventDefault();
    if (!courierName.trim() || !trackingNumber.trim()) return;

    setSubmittingShip(true);
    try {
      const res = await axios.post(`/api/returns/${selectedReturn.id}/ship`, {
        return_courier: courierName.trim(),
        return_tracking_id: trackingNumber.trim()
      }, {
        headers: { Authorization: `Bearer ${token}` }
      });

      if (res.data && res.data.returnRequest) {
        setSelectedReturn(res.data.returnRequest);
        setReturnsMap(prev => ({ ...prev, [selectedReturn.order_id]: res.data.returnRequest }));
        setCourierName('');
        setTrackingNumber('');
      }
    } catch (err) {
      alert(err.response?.data?.message || 'Failed to submit shipping info');
    } finally {
      setSubmittingShip(false);
    }
  };

  const handleAppeal = async (e) => {
    e.preventDefault();
    if (!appealReason.trim()) return;

    setSubmittingAppeal(true);
    try {
      const res = await axios.post(`/api/returns/${selectedReturn.id}/appeal`, {
        appeal_reason: appealReason.trim()
      }, {
        headers: { Authorization: `Bearer ${token}` }
      });

      if (res.data && res.data.returnRequest) {
        setSelectedReturn(res.data.returnRequest);
        setReturnsMap(prev => ({ ...prev, [selectedReturn.order_id]: res.data.returnRequest }));
        setActiveModal('details');
        setAppealReason('');
      }
    } catch (err) {
      alert(err.response?.data?.message || 'Failed to submit appeal');
    } finally {
      setSubmittingAppeal(false);
    }
  };

  const handleSendMessage = async (e) => {
    e.preventDefault();
    if (!newMessage.trim()) return;

    setSendingMessage(true);
    try {
      await axios.post(`/api/returns/${selectedReturn.id}/message`, {
        message: newMessage.trim()
      }, {
        headers: { Authorization: `Bearer ${token}` }
      });
      setNewMessage('');
      reloadReturnDetails(selectedReturn.id);
    } catch (err) {
      alert(err.response?.data?.message || 'Failed to send message');
    } finally {
      setSendingMessage(false);
    }
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
    try { items = typeof order.items === 'string' ? JSON.parse(order.items) : (order.items || []); } catch(e) {}
    
    let address = {};
    try { address = typeof order.address === 'string' ? JSON.parse(order.address) : (order.address || {}); } catch(e) {}

    const subtotal = items.reduce((sum, item) => sum + ((item.variant?.price || item.product?.price || item.price || 0) * item.qty), 0);
    const rows = items.map((item, idx) => `
      <tr class="${idx % 2 === 0 ? '' : 'alt-row'}">
        <td style="text-align: center;">${idx + 1}</td>
        <td><span style="font-weight: bold; color: #222222;">${escapeHtml(item.product?.name || item.name)}</span></td>
        <td style="text-align: center;">${escapeHtml(item.variant?.size || item.size || '-')}</td>
        <td style="text-align: center;">${item.qty} </td>
        <td style="text-align: right;">₹${Number(item.variant?.price || item.product?.price || item.price || 0).toFixed(2)}</td>
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
                              <strong style="font-size: 20px;"><span className="text-[#012980]">Ind</span><span className="text-brand-navy">basket</span></strong><br>
                              1-1-738, Vinayaka temple road<br>
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
                      <div class="section-heading">From Address</div>
                      <div class="address-box">
                          <strong><span className="text-[#012980]">Ind</span><span className="text-brand-navy">basket</span></strong><br>
                          1-1-738, Vinayaka temple road,<br>
                          Koratla, Telangana, India<br>
                          <strong>Phone:</strong> +91 90326 75205
                      </div>
                  </td>
                  <td class="ship-box">
                      <div class="section-heading">Shipping Address</div>
                      <div class="address-box">
                          <strong>${escapeHtml(address.name || user?.name || "")}</strong><br>
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

  const handleReorder = (order) => {
    let items = [];
    try { items = typeof order.items === 'string' ? JSON.parse(order.items) : (order.items || []); } catch(e) {}
    
    items.forEach(item => {
      const productObj = item.product || { id: item.id, name: item.name, price: item.price, image_url: item.image_url };
      const variantObj = item.variant || null;
      addToCart(productObj, variantObj, item.qty);
    });
    
    navigate('/cart');
  };

  return (
    <div className="min-h-screen bg-gray-50 pb-24">
      <Header title="My Orders" />

      <div className="max-w-4xl mx-auto px-4 py-8 space-y-6">
        <div className="flex items-center justify-between mb-2">
          <div className="flex items-center gap-3">
            <button
              onClick={() => navigateBackSafe(navigate, '/profile')}
              className="p-2 -ml-2 text-gray-700 hover:text-gray-900 hover:bg-gray-100 rounded-full transition-colors border border-gray-200 bg-white shadow-xs"
              aria-label="Back"
            >
              <ChevronLeft className="w-5 h-5" />
            </button>
            <div>
              <h2 className="text-2xl font-serif font-bold text-[#012980]">Order History</h2>
              <p className="text-xs text-gray-500 mt-0.5">Track your past purchases, download invoices, or initiate returns</p>
            </div>
          </div>
          <span className="text-sm font-semibold text-[#012980] bg-blue-50/50 px-3 py-1 rounded-full border border-brand-navy/20">{orders.length} Orders</span>
        </div>

        {orders.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-24 gap-4 bg-white rounded-3xl border border-gray-100 shadow-sm">
            <div className="w-24 h-24 bg-blue-50 rounded-full flex items-center justify-center">
              <ShoppingBag className="w-12 h-12 text-brand-navy" />
            </div>
            <p className="text-[#012980] font-bold text-lg font-serif">No orders yet</p>
            <p className="text-sm text-gray-500 text-center max-w-sm">Looks like you haven't made your first order. Explore our catalog today!</p>
            <Link to="/" className="mt-4 bg-gradient-to-r from-brand-navy to-blue-500 text-white text-sm font-bold px-8 py-3 rounded-xl shadow-md hover:shadow-lg transition-all hover:-translate-y-0.5">
              Start Shopping
            </Link>
          </div>
        ) : (
          orders.map((order) => {
            const stepIdx = STATUS_STEPS.indexOf(order.status);
            const activeReturn = returnsMap[order.id];
            const eligibility = isReturnEligible(order);

            return (
              <div key={order.id} className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden hover:shadow-md transition-shadow">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 px-6 py-4 border-b border-[#001d5a] bg-[#012980]">
                  <div>
                    <div className="flex items-center gap-2">
                      <p className="text-sm font-bold text-white font-serif">Order #{order.order_number || order.id}</p>
                      {activeReturn && (
                        <span className={`text-[11px] font-bold px-2.5 py-0.5 rounded-full border ${
                          activeReturn.status === 'Return Approved' || activeReturn.status === 'Refund Completed'
                            ? 'bg-emerald-500/20 text-emerald-200 border-emerald-400'
                            : activeReturn.status === 'Return Rejected'
                            ? 'bg-rose-500/20 text-rose-200 border-rose-400'
                            : 'bg-amber-500/20 text-amber-200 border-amber-400'
                        }`}>
                          Return: {activeReturn.status}
                        </span>
                      )}
                    </div>
                    <p className="text-xs text-blue-200 mt-1">
                      Placed on {new Date(order.created_at).toLocaleDateString('en-IN', { day: 'numeric', month: 'long', year: 'numeric' })}
                      {order.delivered_at && ` • Delivered on ${new Date(order.delivered_at).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}`}
                    </p>
                  </div>
                  <div className="flex items-center gap-3">
                    <span className={`text-xs font-bold px-4 py-1.5 rounded-full border capitalize shadow-sm ${STATUS_COLORS[order.status] || 'bg-gray-100 text-gray-600 border-gray-200'}`}>
                      {order.status}
                    </span>
                    {order.payment_method === 'cod' && (
                      <span className="text-xs font-bold px-3 py-1.5 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200 shadow-sm">
                        COD (₹{order.total - (order.advance_paid || 0)} pending)
                      </span>
                    )}
                    <p className="text-lg font-bold text-[#D4AF37]">₹{Number(order.total).toLocaleString('en-IN')}</p>
                  </div>
                </div>

                {/* Progress Bar */}
                {order.status !== 'cancelled' && (
                  <div className="px-6 py-6 border-b border-gray-100 bg-white">
                    <div className="max-w-2xl mx-auto">
                      <div className="flex items-center justify-between mb-2">
                        {STATUS_STEPS.map((step, i) => (
                          <div key={step} className="flex flex-col items-center flex-1 relative">
                            <div className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold border-2 transition-all z-10 ${
                              i <= stepIdx ? 'bg-[#012980] border-[#012980] text-white shadow-md' : 'bg-white border-gray-200 text-gray-400'
                            }`}>
                              {i < stepIdx ? '✓' : i + 1}
                            </div>
                            {i < STATUS_STEPS.length - 1 && (
                              <div className={`absolute top-4 left-1/2 w-full h-0.5 -z-0 ${i < stepIdx ? 'bg-[#012980]' : 'bg-gray-200'}`} />
                            )}
                          </div>
                        ))}
                      </div>
                      <div className="flex items-center mt-2">
                        {STATUS_STEPS.map((step, i) => (
                          <span key={step} className={`text-[10px] sm:text-xs font-bold capitalize flex-1 text-center ${i <= stepIdx ? 'text-[#012980]' : 'text-gray-400'}`}>
                            {step}
                          </span>
                        ))}
                      </div>
                    </div>
                  </div>
                )}

                {/* Items */}
                <div className="px-6 py-4 bg-white">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {Array.isArray(order.items) && order.items.map((item, i) => (
                      <div key={i} className="flex items-start gap-4 p-3 rounded-xl border border-gray-50 hover:bg-gray-50 transition-colors">
                        <div className="w-16 h-16 bg-gray-50 rounded-xl flex items-center justify-center shrink-0 border border-gray-200 overflow-hidden">
                          {item.image_url || item.product?.image_url ? (
                            <img src={item.image_url || item.product?.image_url} alt={item.name || item.product?.name} className="w-full h-full object-cover" />
                          ) : (
                            <Package className="w-8 h-8 text-gray-300" />
                          )}
                        </div>
                        <div className="flex-1 min-w-0 pt-1">
                          <p className="text-sm font-bold text-[#012980] line-clamp-1 font-serif">{item.name || item.product?.name || 'Product'}</p>
                          <div className="flex items-center gap-3 mt-1.5">
                            <span className="text-xs text-gray-600 bg-white px-2 py-0.5 rounded-md border border-gray-200">Qty: {item.qty || 1}</span>
                            {(item.size || item.variant?.size) && (
                              <span className="text-xs text-gray-600 bg-white px-2 py-0.5 rounded-md border border-gray-200">{item.size || item.variant?.size}</span>
                            )}
                          </div>
                        </div>
                        <p className="text-sm font-bold text-[#012980] pt-1">₹{Number(item.price || item.variant?.price || item.product?.price || 0).toLocaleString('en-IN')}</p>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Shipment Tracking Details */}
                {(order.tracking_id || order.platform_awb || (order.shipments && order.shipments.length > 0)) && (
                  <div className="px-6 py-3.5 bg-blue-50/70 border-t border-blue-100 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
                    <div className="flex items-center gap-2.5">
                      <div className="p-1.5 rounded-lg bg-[#012980] text-white">
                        <Truck className="w-4 h-4" />
                      </div>
                      <div>
                        <p className="text-xs font-bold text-gray-900">Shipment Dispatched & In Transit</p>
                        <p className="text-[11px] text-gray-500">
                          {order.shipments && order.shipments.length > 0
                            ? `${order.shipments.length} package(s) dispatched with Shiprocket`
                            : `Courier: ${order.platform_courier_name || 'Shiprocket Courier'} • AWB: ${order.tracking_id || order.platform_awb}`}
                        </p>
                      </div>
                    </div>

                    <div className="flex items-center gap-2 flex-wrap">
                      {order.tracking_link && (
                        <a
                          href={order.tracking_link}
                          target="_blank"
                          rel="noreferrer"
                          className="inline-flex items-center gap-1 px-3 py-1.5 bg-[#012980] text-white rounded-xl text-xs font-bold hover:bg-blue-900 transition shadow-2xs"
                        >
                          <span>Track Package</span>
                          <ExternalLink className="w-3.5 h-3.5" />
                        </a>
                      )}
                      {order.shipments && order.shipments.map(s => s.tracking_url && (
                        <a
                          key={s.id}
                          href={s.tracking_url}
                          target="_blank"
                          rel="noreferrer"
                          className="inline-flex items-center gap-1 px-3 py-1.5 bg-white text-blue-900 border border-blue-200 rounded-xl text-xs font-bold hover:bg-blue-50 transition shadow-2xs"
                        >
                          <span>Track {s.courier_name || 'Package'} ({s.awb_code})</span>
                          <ExternalLink className="w-3.5 h-3.5" />
                        </a>
                      ))}
                    </div>
                  </div>
                )}

                {/* Return Status Alert / Policy banner if applicable */}
                {activeReturn ? (
                  <div className="px-6 py-3 bg-amber-50/60 border-t border-amber-200/50 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2">
                    <div className="flex items-center gap-2">
                      <Clock className="w-4 h-4 text-amber-600 shrink-0" />
                      <p className="text-xs text-amber-900 font-medium">
                        Return Status: <strong className="font-semibold text-amber-950">{activeReturn.status}</strong>
                        {activeReturn.vendor_response && ` — "${activeReturn.vendor_response}"`}
                      </p>
                    </div>
                    <button
                      onClick={() => handleOpenDetailsModal(activeReturn)}
                      className="text-xs font-bold text-[#012980] hover:underline flex items-center gap-1"
                    >
                      Track Return & Chat <ChevronRight className="w-3.5 h-3.5" />
                    </button>
                  </div>
                ) : eligibility.eligible && (
                  <div className="px-6 py-2.5 bg-blue-50/40 border-t border-blue-100 flex items-center justify-between text-xs text-blue-900">
                    <span className="flex items-center gap-1.5 text-blue-800">
                      <CheckCircle2 className="w-3.5 h-3.5 text-blue-600" />
                      Eligible for return ({eligibility.daysLeft} days remaining of 7-day window)
                    </span>
                  </div>
                )}

                {/* Footer Actions */}
                <div className="flex flex-wrap items-center justify-end gap-3 px-6 py-4 bg-gray-50 border-t border-gray-100">
                  {/* Return Buttons */}
                  {activeReturn ? (
                    <button
                      onClick={() => handleOpenDetailsModal(activeReturn)}
                      className="flex items-center gap-2 bg-amber-600 text-white px-4 py-2 rounded-xl text-xs font-bold hover:bg-amber-700 transition shadow-sm"
                    >
                      <RotateCcw className="w-3.5 h-3.5" /> View Return Details
                    </button>
                  ) : eligibility.eligible ? (
                    <button
                      onClick={() => handleOpenRequestModal(order)}
                      className="flex items-center gap-2 bg-white text-rose-700 border border-rose-200 px-4 py-2 rounded-xl text-xs font-bold hover:bg-rose-50 transition shadow-sm"
                    >
                      <RotateCcw className="w-3.5 h-3.5" /> Return / Refund
                    </button>
                  ) : null}

                  <button onClick={() => openInvoice(order)}
                    className="flex items-center justify-center gap-2 bg-white text-brand-navy border border-brand-navy/30 px-4 py-2 rounded-xl text-xs font-bold hover:bg-blue-50 transition-colors shadow-sm">
                    <FileText className="w-3.5 h-3.5 text-brand-navy" /> Invoice
                  </button>
                  <button onClick={() => handleReorder(order)}
                    className="flex items-center justify-center gap-2 bg-[#012980] text-white px-4 py-2 rounded-xl text-xs font-bold hover:bg-[#001d5a] transition-colors shadow-sm">
                    <RefreshCw className="w-3.5 h-3.5" /> Reorder
                  </button>
                </div>
              </div>
            );
          })
        )}
      </div>

      {/* MODAL 1: REQUEST RETURN */}
      {activeModal === 'request' && selectedOrder && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4 overflow-y-auto">
          <div className="bg-white rounded-3xl max-w-lg w-full p-6 shadow-2xl border border-gray-100 space-y-5 animate-in fade-in zoom-in duration-200 my-8">
            <div className="flex items-center justify-between border-b pb-4">
              <div>
                <h3 className="text-lg font-serif font-bold text-[#012980]">Request Return / Refund</h3>
                <p className="text-xs text-gray-500">Order #{selectedOrder.order_number || selectedOrder.id}</p>
              </div>
              <button onClick={() => setActiveModal(null)} className="p-1 rounded-full text-gray-400 hover:text-gray-700 hover:bg-gray-100">
                <X className="w-5 h-5" />
              </button>
            </div>

            {formError && (
              <div className="p-3 bg-red-50 text-red-700 text-xs rounded-xl flex items-center gap-2">
                <AlertCircle className="w-4 h-4 shrink-0" /> {formError}
              </div>
            )}

            <form onSubmit={handleSubmitReturn} className="space-y-4">
              <div>
                <label className="block text-xs font-bold text-gray-700 mb-1">Reason for Return *</label>
                <select
                  value={returnReason}
                  onChange={(e) => setReturnReason(e.target.value)}
                  className="w-full text-xs p-3 rounded-xl border border-gray-300 focus:outline-none focus:ring-2 focus:ring-[#012980]"
                  required
                >
                  {RETURN_REASONS.map(r => (
                    <option key={r} value={r}>{r}</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-xs font-bold text-gray-700 mb-1">Explain the Issue *</label>
                <textarea
                  value={returnDescription}
                  onChange={(e) => setReturnDescription(e.target.value)}
                  rows={3}
                  placeholder="Please describe what is wrong with the product..."
                  className="w-full text-xs p-3 rounded-xl border border-gray-300 focus:outline-none focus:ring-2 focus:ring-[#012980]"
                  required
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-gray-700 mb-1">Upload Product Photos (Up to 5)</label>
                <div className="flex items-center gap-3">
                  <label className="cursor-pointer flex items-center gap-2 px-3 py-2 bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-xl text-xs font-semibold">
                    <Upload className="w-4 h-4" />
                    <span>{uploadingImage ? 'Uploading...' : 'Choose Photos'}</span>
                    <input type="file" accept="image/*" multiple onChange={handleImageUpload} className="hidden" disabled={uploadingImage} />
                  </label>
                  <span className="text-xs text-gray-400">{returnImages.length} / 5 photos attached</span>
                </div>

                {returnImages.length > 0 && (
                  <div className="flex flex-wrap gap-2 mt-3">
                    {returnImages.map((img, idx) => (
                      <div key={idx} className="relative w-16 h-16 rounded-xl border border-gray-200 overflow-hidden group">
                        <img src={img} alt="Return proof" className="w-full h-full object-cover" />
                        <button
                          type="button"
                          onClick={() => setReturnImages(prev => prev.filter((_, i) => i !== idx))}
                          className="absolute inset-0 bg-black/50 text-white flex items-center justify-center opacity-0 group-hover:opacity-100 transition"
                        >
                          <X className="w-4 h-4" />
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* MANDATORY CUSTOMER BANK DETAILS FOR DIRECT REFUND */}
              <div className="bg-slate-50 border border-slate-200 rounded-2xl p-4 space-y-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Building className="w-4 h-4 text-[#012980]" />
                    <span className="text-xs font-bold text-gray-900">Bank Details for Direct Refund *</span>
                  </div>
                  <span className="text-[10px] font-semibold text-emerald-700 bg-emerald-50 border border-emerald-200 px-2 py-0.5 rounded-full flex items-center gap-1">
                    <ShieldCheck className="w-3 h-3 text-emerald-600" /> 256-bit Encrypted
                  </span>
                </div>
                <p className="text-[11px] text-gray-500 leading-normal">
                  Your approved refund will be credited directly to this bank account via bank transfer. Please verify your details carefully.
                </p>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div className="sm:col-span-2">
                    <label className="block text-[11px] font-bold text-gray-700 mb-1">Account Holder Name *</label>
                    <input
                      type="text"
                      placeholder="Name as printed on bank passbook"
                      value={bankHolderName}
                      onChange={(e) => setBankHolderName(e.target.value)}
                      className="w-full text-xs p-2.5 rounded-xl border border-gray-300 bg-white focus:outline-none focus:ring-2 focus:ring-[#012980]"
                      required
                    />
                  </div>

                  <div>
                    <label className="block text-[11px] font-bold text-gray-700 mb-1">Bank Name *</label>
                    <input
                      type="text"
                      placeholder="e.g. State Bank of India, HDFC"
                      value={bankName}
                      onChange={(e) => setBankName(e.target.value)}
                      className="w-full text-xs p-2.5 rounded-xl border border-gray-300 bg-white focus:outline-none focus:ring-2 focus:ring-[#012980]"
                      required
                    />
                  </div>

                  <div>
                    <label className="block text-[11px] font-bold text-gray-700 mb-1">IFSC Code *</label>
                    <input
                      type="text"
                      placeholder="e.g. SBIN0001234"
                      maxLength={11}
                      value={bankIfsc}
                      onChange={(e) => setBankIfsc(e.target.value.toUpperCase())}
                      className="w-full text-xs p-2.5 rounded-xl border border-gray-300 bg-white font-mono uppercase focus:outline-none focus:ring-2 focus:ring-[#012980]"
                      required
                    />
                  </div>

                  <div>
                    <label className="block text-[11px] font-bold text-gray-700 mb-1">Bank Account Number *</label>
                    <input
                      type="text"
                      placeholder="9 to 18 digits"
                      maxLength={18}
                      value={bankAccountNumber}
                      onChange={(e) => setBankAccountNumber(e.target.value.replace(/\D/g, ''))}
                      className="w-full text-xs p-2.5 rounded-xl border border-gray-300 bg-white font-mono focus:outline-none focus:ring-2 focus:ring-[#012980]"
                      required
                    />
                  </div>

                  <div>
                    <label className="block text-[11px] font-bold text-gray-700 mb-1">Confirm Bank Account Number *</label>
                    <input
                      type="text"
                      placeholder="Re-enter bank account number"
                      maxLength={18}
                      value={confirmBankAccountNumber}
                      onChange={(e) => setConfirmBankAccountNumber(e.target.value.replace(/\D/g, ''))}
                      className="w-full text-xs p-2.5 rounded-xl border border-gray-300 bg-white font-mono focus:outline-none focus:ring-2 focus:ring-[#012980]"
                      required
                    />
                  </div>
                </div>
              </div>

              <div className="p-3 bg-amber-50 rounded-xl text-[11px] text-amber-800 leading-relaxed border border-amber-100">
                <strong>Policy Notice:</strong> Your return request and refund will be reviewed by the store admin and vendor. Refunds are issued via direct bank transfer only after the returned product is approved and received.
              </div>

              <div className="flex justify-end gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setActiveModal(null)}
                  className="px-4 py-2 text-xs font-semibold text-gray-600 hover:bg-gray-100 rounded-xl"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={submittingReturn || uploadingImage}
                  className="px-5 py-2 text-xs font-bold text-white bg-[#012980] hover:bg-[#001d5a] rounded-xl transition shadow-sm disabled:opacity-50"
                >
                  {submittingReturn ? 'Submitting...' : 'Submit Return Request'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL 2: RETURN DETAILS, TIMELINE & MESSAGING */}
      {activeModal === 'details' && selectedReturn && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4 overflow-y-auto">
          <div className="bg-white rounded-3xl max-w-2xl w-full p-6 shadow-2xl border border-gray-100 space-y-6 my-8 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between border-b pb-4">
              <div>
                <div className="flex items-center gap-2">
                  <h3 className="text-lg font-serif font-bold text-[#012980]">Return #{selectedReturn.id}</h3>
                  <span className="text-xs font-bold px-3 py-1 rounded-full bg-blue-100 text-[#012980]">
                    {selectedReturn.status}
                  </span>
                </div>
                <p className="text-xs text-gray-500 mt-0.5">Order #{selectedReturn.order_number} • Vendor: {selectedReturn.store_name || selectedReturn.vendor_name}</p>
              </div>
              <button onClick={() => setActiveModal(null)} className="p-1 rounded-full text-gray-400 hover:text-gray-700 hover:bg-gray-100">
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Status Highlight Banner */}
            {selectedReturn.status === 'Return Approved' && (
              <div className="p-4 bg-emerald-50 border border-emerald-200 rounded-2xl text-xs text-emerald-900 space-y-2">
                <div className="flex items-center gap-2 font-bold text-emerald-950">
                  <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                  Your return request has been approved by the vendor!
                </div>
                <p>Please dispatch the item back to the vendor store and enter the courier name and tracking number below so the vendor can confirm receipt.</p>
                <div className="p-2.5 bg-white/80 rounded-xl border border-emerald-200 text-[11px]">
                  <strong>Return Address:</strong> {selectedReturn.store_name || selectedReturn.vendor_name}, {selectedReturn.vendor_email || ''}
                </div>
              </div>
            )}

            {selectedReturn.status === 'Return Rejected' && (
              <div className="p-4 bg-rose-50 border border-rose-200 rounded-2xl text-xs text-rose-900 space-y-2">
                <div className="flex items-center gap-2 font-bold text-rose-950">
                  <AlertCircle className="w-4 h-4 text-rose-600" />
                  Return request was rejected by vendor
                </div>
                <p><strong>Reason:</strong> {selectedReturn.rejection_reason || 'Item does not meet return conditions.'}</p>
                {selectedReturn.vendor_response && <p><strong>Vendor Message:</strong> {selectedReturn.vendor_response}</p>}
                
                {!selectedReturn.appeal_reason && (
                  <div className="pt-2">
                    <button
                      onClick={() => setActiveModal('appeal')}
                      className="px-4 py-2 bg-rose-600 text-white font-bold rounded-xl text-xs hover:bg-rose-700 transition"
                    >
                      Disagree? Appeal to Admin
                    </button>
                  </div>
                )}
              </div>
            )}

            {/* Refund Processing Banner */}
            {selectedReturn.status === 'Refund Processing' && (
              <div className="p-4 bg-sky-50 border border-sky-200 rounded-2xl text-xs text-sky-950 space-y-1">
                <div className="flex items-center gap-2 font-bold text-sky-900">
                  <Clock className="w-4 h-4 text-sky-600 animate-spin" />
                  Refund Processing Initiated
                </div>
                <p>Your return has been received and verified. Our finance team is currently transferring <strong>₹{Number(selectedReturn.approved_refund_amount || selectedReturn.refund_amount || 0).toLocaleString('en-IN')}</strong> directly to your bank account ({selectedReturn.bank_name || 'Bank'} {selectedReturn.bank_account_masked || (selectedReturn.bank_account_last4 ? `••••••••${selectedReturn.bank_account_last4}` : '')}).</p>
              </div>
            )}

            {/* Refund Completed Banner with UTR */}
            {selectedReturn.status === 'Refund Completed' && (
              <div className="p-4 bg-emerald-50 border border-emerald-200 rounded-2xl text-xs text-emerald-950 space-y-2">
                <div className="flex items-center gap-2 font-bold text-emerald-900">
                  <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                  Refund Successfully Completed
                </div>
                <div className="grid grid-cols-2 gap-2 p-3 bg-white/90 rounded-xl border border-emerald-200 text-[11px]">
                  <div>
                    <span className="text-gray-500 block">Refund Amount</span>
                    <span className="font-bold text-emerald-700 text-sm">₹{Number(selectedReturn.refund_amount || selectedReturn.approved_refund_amount || 0).toLocaleString('en-IN')}</span>
                  </div>
                  <div>
                    <span className="text-gray-500 block">Bank Transfer / UTR</span>
                    <span className="font-mono font-bold text-gray-900 bg-emerald-100/60 px-1.5 py-0.5 rounded text-xs">{selectedReturn.refund_utr || selectedReturn.refund_reference || 'N/A'}</span>
                  </div>
                  <div>
                    <span className="text-gray-500 block">Transfer Date</span>
                    <span className="font-semibold text-gray-900">{selectedReturn.refund_transfer_date ? new Date(selectedReturn.refund_transfer_date).toLocaleDateString('en-IN') : (selectedReturn.refunded_at ? new Date(selectedReturn.refunded_at).toLocaleDateString('en-IN') : 'Completed')}</span>
                  </div>
                  <div>
                    <span className="text-gray-500 block">Destination</span>
                    <span className="font-semibold text-gray-900">{selectedReturn.bank_name || 'Bank'} ({selectedReturn.bank_account_masked || (selectedReturn.bank_account_last4 ? `••••${selectedReturn.bank_account_last4}` : '')})</span>
                  </div>
                </div>
                {selectedReturn.admin_remarks && (
                  <p className="text-[11px] text-emerald-800">
                    <strong>Admin Note:</strong> {selectedReturn.admin_remarks}
                  </p>
                )}
              </div>
            )}

            {selectedReturn.status === 'Appeal Raised' && (
              <div className="p-4 bg-purple-50 border border-purple-200 rounded-2xl text-xs text-purple-900 space-y-1">
                <div className="flex items-center gap-2 font-bold text-purple-950">
                  <ShieldAlert className="w-4 h-4 text-purple-600" />
                  Appeal under Admin Review
                </div>
                <p>Your dispute has been escalated directly to our Admin team. We are auditing both sides and will issue a binding decision.</p>
                <p className="text-[11px] text-purple-700 italic">" {selectedReturn.appeal_reason} "</p>
              </div>
            )}

            {/* Request Summary */}
            <div className="bg-gray-50 rounded-2xl p-4 space-y-2 text-xs">
              <div className="flex justify-between text-gray-600">
                <span>Reason:</span>
                <span className="font-semibold text-gray-900">{selectedReturn.reason}</span>
              </div>
              <div className="flex justify-between text-gray-600">
                <span>Description:</span>
                <span className="font-semibold text-gray-900 max-w-xs text-right">{selectedReturn.description}</span>
              </div>
              {selectedReturn.return_tracking_id && (
                <div className="flex justify-between text-gray-600">
                  <span>Return Shipping:</span>
                  <span className="font-semibold text-gray-900">{selectedReturn.return_courier} — {selectedReturn.return_tracking_id}</span>
                </div>
              )}
            </div>

            {/* Refund Bank Details Card */}
            {(selectedReturn.bank_name || selectedReturn.bank_holder_name) && (
              <div className="bg-slate-50 border border-slate-200 rounded-2xl p-4 space-y-2 text-xs">
                <div className="flex items-center justify-between pb-1.5 border-b border-slate-200">
                  <span className="font-bold text-gray-900 flex items-center gap-1.5">
                    <Building className="w-3.5 h-3.5 text-[#012980]" /> Refund Destination Bank
                  </span>
                  <span className="text-[10px] text-gray-500 font-mono font-semibold bg-gray-100 px-2 py-0.5 rounded">
                    IFSC: {selectedReturn.bank_ifsc || 'N/A'}
                  </span>
                </div>
                <div className="grid grid-cols-2 gap-2 pt-1 text-[11px]">
                  <div>
                    <span className="text-gray-500 block">Account Holder</span>
                    <span className="font-semibold text-gray-900">{selectedReturn.bank_holder_name || 'N/A'}</span>
                  </div>
                  <div>
                    <span className="text-gray-500 block">Bank Name</span>
                    <span className="font-semibold text-gray-900">{selectedReturn.bank_name || 'Bank'}</span>
                  </div>
                  <div className="col-span-2">
                    <span className="text-gray-500 block">Account Number (Masked)</span>
                    <span className="font-mono font-semibold text-gray-900 tracking-wider">
                      {selectedReturn.bank_account_masked || (selectedReturn.bank_account_last4 ? `••••••••${selectedReturn.bank_account_last4}` : '••••••••')}
                    </span>
                  </div>
                </div>
              </div>
            )}

            {/* Supporting Photos */}
            {selectedReturn.images && selectedReturn.images.length > 0 && (
              <div>
                <p className="text-xs font-bold text-gray-700 mb-2">Proof Photos:</p>
                <div className="flex flex-wrap gap-2">
                  {selectedReturn.images.map((img, i) => (
                    <a key={i} href={img} target="_blank" rel="noreferrer" className="w-16 h-16 rounded-xl border border-gray-200 overflow-hidden block">
                      <img src={img} alt="proof" className="w-full h-full object-cover hover:scale-105 transition" />
                    </a>
                  ))}
                </div>
              </div>
            )}

            {/* Enter Shipping info if Approved */}
            {selectedReturn.status === 'Return Approved' && !selectedReturn.return_tracking_id && (
              <form onSubmit={handleShipReturn} className="p-4 bg-blue-50/50 border border-blue-100 rounded-2xl space-y-3">
                <p className="text-xs font-bold text-[#012980] flex items-center gap-1.5">
                  <Truck className="w-4 h-4" /> Enter Return Shipment Tracking
                </p>
                <div className="grid grid-cols-2 gap-2">
                  <input
                    type="text"
                    placeholder="Courier (e.g. BlueDart, DTDC)"
                    value={courierName}
                    onChange={(e) => setCourierName(e.target.value)}
                    className="text-xs p-2.5 rounded-xl border border-gray-300"
                    required
                  />
                  <input
                    type="text"
                    placeholder="Tracking / AWB Number"
                    value={trackingNumber}
                    onChange={(e) => setTrackingNumber(e.target.value)}
                    className="text-xs p-2.5 rounded-xl border border-gray-300"
                    required
                  />
                </div>
                <button
                  type="submit"
                  disabled={submittingShip}
                  className="w-full py-2 bg-[#012980] text-white text-xs font-bold rounded-xl hover:bg-[#001d5a] transition"
                >
                  {submittingShip ? 'Submitting...' : 'Mark as Shipped'}
                </button>
              </form>
            )}

            {/* Direct Message Thread */}
            <div className="border-t pt-4 space-y-3">
              <p className="text-xs font-bold text-gray-800 flex items-center gap-1.5">
                <MessageSquare className="w-4 h-4 text-[#012980]" /> Communication Thread
              </p>
              
              <div className="space-y-2 max-h-48 overflow-y-auto pr-1">
                {selectedReturn.messages && selectedReturn.messages.length > 0 ? (
                  selectedReturn.messages.map((m) => {
                    const isMe = m.sender_role === 'customer';
                    const isAdmin = m.sender_role === 'admin';
                    return (
                      <div key={m.id} className={`flex flex-col ${isMe ? 'items-end' : 'items-start'}`}>
                        <div className={`p-3 rounded-2xl max-w-sm text-xs ${
                          isMe
                            ? 'bg-[#012980] text-white rounded-br-xs'
                            : isAdmin
                            ? 'bg-purple-100 text-purple-900 rounded-bl-xs border border-purple-200'
                            : 'bg-gray-100 text-gray-800 rounded-bl-xs'
                        }`}>
                          <p className="text-[10px] opacity-75 font-semibold mb-1">
                            {isMe ? 'You' : isAdmin ? 'Admin Support' : `Vendor (${selectedReturn.store_name || 'Vendor'})`}
                          </p>
                          <p className="whitespace-pre-wrap">{m.message}</p>
                        </div>
                        <span className="text-[10px] text-gray-400 mt-0.5 px-1">
                          {new Date(m.created_at).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })}
                        </span>
                      </div>
                    );
                  })
                ) : (
                  <p className="text-xs text-gray-400 italic text-center py-4">No messages yet. Send a note directly to the vendor below.</p>
                )}
              </div>

              {/* Message Input */}
              <form onSubmit={handleSendMessage} className="flex gap-2 pt-2">
                <input
                  type="text"
                  placeholder="Type a message to the vendor / admin..."
                  value={newMessage}
                  onChange={(e) => setNewMessage(e.target.value)}
                  className="flex-1 text-xs p-2.5 rounded-xl border border-gray-300 focus:outline-none focus:ring-2 focus:ring-[#012980]"
                />
                <button
                  type="submit"
                  disabled={sendingMessage || !newMessage.trim()}
                  className="px-4 py-2.5 bg-[#012980] text-white rounded-xl text-xs font-bold hover:bg-[#001d5a] transition disabled:opacity-50"
                >
                  <Send className="w-3.5 h-3.5" />
                </button>
              </form>
            </div>
          </div>
        </div>
      )}

      {/* MODAL 3: APPEAL TO ADMIN */}
      {activeModal === 'appeal' && selectedReturn && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl max-w-md w-full p-6 shadow-2xl border border-gray-100 space-y-4">
            <div className="flex items-center justify-between border-b pb-3">
              <h3 className="text-base font-serif font-bold text-rose-700 flex items-center gap-2">
                <ShieldAlert className="w-5 h-5 text-rose-600" /> Appeal to Admin
              </h3>
              <button onClick={() => setActiveModal('details')} className="text-gray-400 hover:text-gray-700">
                <X className="w-5 h-5" />
              </button>
            </div>

            <p className="text-xs text-gray-600 leading-relaxed">
              If the vendor rejected your genuine return request, explain your situation below. Our Admin team will review the original order, communication log, and photos to make a final binding decision.
            </p>

            <form onSubmit={handleAppeal} className="space-y-4">
              <textarea
                value={appealReason}
                onChange={(e) => setAppealReason(e.target.value)}
                rows={4}
                placeholder="Explain why the vendor rejection was unjustified..."
                className="w-full text-xs p-3 rounded-xl border border-gray-300 focus:outline-none focus:ring-2 focus:ring-rose-500"
                required
              />

              <div className="flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setActiveModal('details')}
                  className="px-4 py-2 text-xs font-semibold text-gray-600 hover:bg-gray-100 rounded-xl"
                >
                  Back
                </button>
                <button
                  type="submit"
                  disabled={submittingAppeal}
                  className="px-5 py-2 text-xs font-bold text-white bg-rose-600 hover:bg-rose-700 rounded-xl transition disabled:opacity-50"
                >
                  {submittingAppeal ? 'Submitting...' : 'Submit Appeal to Admin'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
