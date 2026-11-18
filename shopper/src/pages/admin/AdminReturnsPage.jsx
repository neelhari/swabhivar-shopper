import React, { useState, useEffect } from 'react';
import { 
  RotateCcw, Search, Filter, Clock, CheckCircle2, XCircle, AlertCircle, 
  MessageSquare, Send, Eye, ShieldCheck, ChevronRight, Truck, PackageCheck, 
  CreditCard, ArrowLeft, Image as ImageIcon, ExternalLink, HelpCircle, Store, User
} from 'lucide-react';
import { toast } from 'react-toastify';

const BACKEND_URL = import.meta.env.VITE_BACKEND_URL || "http://localhost:5000/api";

const STATUS_BADGES = {
  'Return Requested': 'bg-amber-50 text-amber-700 border-amber-200',
  'Under Vendor Review': 'bg-blue-50 text-blue-700 border-blue-200',
  'Additional Information Requested': 'bg-purple-50 text-purple-700 border-purple-200',
  'Return Approved': 'bg-emerald-50 text-emerald-700 border-emerald-200',
  'Return Rejected': 'bg-red-50 text-red-700 border-red-200',
  'Return Shipped': 'bg-indigo-50 text-indigo-700 border-indigo-200',
  'Product Received': 'bg-teal-50 text-teal-700 border-teal-200',
  'Refund Initiated': 'bg-sky-50 text-sky-700 border-sky-200',
  'Refund Completed': 'bg-green-100 text-green-800 border-green-300 font-bold',
  'Appeal Raised': 'bg-orange-100 text-orange-800 border-orange-300 animate-pulse font-bold',
  'Closed': 'bg-slate-100 text-slate-600 border-slate-200',
};

export function AdminReturnsPage() {
  const [returns, setReturns] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState('ALL');
  const [vendorFilter, setVendorFilter] = useState('ALL');

  // Detail Modal
  const [selectedReturn, setSelectedReturn] = useState(null);
  const [messages, setMessages] = useState([]);
  const [adminMessage, setAdminMessage] = useState('');
  const [sendingMessage, setSendingMessage] = useState(false);
  const [actionLoading, setActionLoading] = useState(false);

  // Dispute Decision Modal
  const [disputeModalOpen, setDisputeModalOpen] = useState(false);
  const [disputeDecision, setDisputeDecision] = useState('uphold');
  const [adminNotes, setAdminNotes] = useState('');

  const fetchReturns = async () => {
    try {
      setLoading(true);
      const token = localStorage.getItem('token');
      const res = await fetch(`${BACKEND_URL}/returns/admin/list`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (res.ok) {
        const data = await res.json();
        setReturns(data.returns || []);
      } else {
        toast.error('Failed to load return requests');
      }
    } catch (err) {
      toast.error('Communication error with server');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchReturns();
  }, []);

  const openReturnDetails = async (ret) => {
    setSelectedReturn(ret);
    try {
      const token = localStorage.getItem('token');
      const res = await fetch(`${BACKEND_URL}/returns/admin/${ret.id}`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (res.ok) {
        const data = await res.json();
        setSelectedReturn(data.returnRequest);
        setMessages(data.messages || []);
      }
    } catch (err) {
      console.warn('Failed to load messages', err);
    }
  };

  const handleSendAdminMessage = async (e) => {
    e.preventDefault();
    if (!adminMessage.trim() || !selectedReturn) return;

    setSendingMessage(true);
    try {
      const token = localStorage.getItem('token');
      const res = await fetch(`${BACKEND_URL}/returns/admin/${selectedReturn.id}/message`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ message: adminMessage.trim() })
      });

      if (res.ok) {
        const data = await res.json();
        setMessages(prev => [...prev, data.message]);
        setAdminMessage('');
        toast.success('Admin message posted to thread');
      } else {
        toast.error('Failed to post message');
      }
    } catch (err) {
      toast.error('Failed to post message');
    } finally {
      setSendingMessage(false);
    }
  };

  const handleDisputeResolution = async (e) => {
    e.preventDefault();
    if (!selectedReturn || !adminNotes.trim()) return;

    setActionLoading(true);
    try {
      const token = localStorage.getItem('token');
      const res = await fetch(`${BACKEND_URL}/returns/admin/${selectedReturn.id}/dispute-decision`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          decision: disputeDecision,
          admin_notes: adminNotes.trim()
        })
      });

      const data = await res.json();
      if (res.ok) {
        toast.success(`Dispute decision recorded: ${disputeDecision.toUpperCase()}`);
        setSelectedReturn(data.returnRequest);
        setDisputeModalOpen(false);
        setAdminNotes('');
        await fetchReturns();
        // Refresh messages
        const msgRes = await fetch(`${BACKEND_URL}/returns/admin/${selectedReturn.id}`, {
          headers: { 'Authorization': `Bearer ${token}` }
        });
        if (msgRes.ok) {
          const msgData = await msgRes.json();
          setMessages(msgData.messages || []);
        }
      } else {
        toast.error(data.error || 'Failed to record dispute decision');
      }
    } catch (err) {
      toast.error('Failed to communicate with server');
    } finally {
      setActionLoading(false);
    }
  };

  // Unique vendors for filter dropdown
  const uniqueVendors = Array.from(new Set(returns.map(r => r.store_name))).filter(Boolean);

  // Filtered returns
  const filteredReturns = returns.filter(r => {
    const matchesStatus = statusFilter === 'ALL' || r.status === statusFilter;
    const matchesVendor = vendorFilter === 'ALL' || r.store_name === vendorFilter;
    const term = (searchTerm || '').trim().toLowerCase();
    const matchesSearch = !term ||
      (r.order_number && String(r.order_number).toLowerCase().includes(term)) ||
      (r.store_name && String(r.store_name).toLowerCase().includes(term)) ||
      (r.customer_name && String(r.customer_name).toLowerCase().includes(term)) ||
      (r.reason && String(r.reason).toLowerCase().includes(term));
    return matchesStatus && matchesVendor && matchesSearch;
  });

  return (
    <div className="p-4 sm:p-6 lg:p-8 space-y-6 max-w-7xl mx-auto font-sans text-slate-800">
      {/* Page Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-200 pb-5">
        <div>
          <h1 className="text-2xl sm:text-3xl font-extrabold text-[#036e26] flex items-center gap-2.5">
            <RotateCcw className="w-7 h-7 text-[#036e26]" />
            <span>Returns & Refund Monitoring</span>
          </h1>
          <p className="text-xs sm:text-sm text-slate-500 mt-1">
            Global oversight of customer return claims, vendor operational decisions, refund settlements, and customer appeals.
          </p>
        </div>
        <button
          onClick={fetchReturns}
          disabled={loading}
          className="self-start sm:self-auto px-4 py-2 text-xs font-semibold text-[#036e26] bg-green-50/60 border border-[#036e26]/20 rounded-xl hover:bg-green-100 transition-colors shadow-2xs"
        >
          {loading ? 'Refreshing...' : 'Refresh All'}
        </button>
      </div>

      {/* KPI Metrics */}
      <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
        <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-2xs">
          <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">Total Claims</span>
          <span className="text-2xl font-black text-slate-900 block mt-1">{returns.length}</span>
        </div>
        <div className="bg-white p-4 rounded-xl border border-blue-200 shadow-2xs bg-blue-50/20">
          <span className="text-[10px] font-bold text-blue-700 uppercase tracking-wider block">Under Vendor Review</span>
          <span className="text-2xl font-black text-blue-700 block mt-1">
            {returns.filter(r => ['Return Requested', 'Under Vendor Review', 'Additional Information Requested'].includes(r.status)).length}
          </span>
        </div>
        <div className="bg-white p-4 rounded-xl border border-emerald-200 shadow-2xs bg-emerald-50/20">
          <span className="text-[10px] font-bold text-emerald-700 uppercase tracking-wider block">Vendor Approved</span>
          <span className="text-2xl font-black text-emerald-700 block mt-1">
            {returns.filter(r => ['Return Approved', 'Return Shipped', 'Product Received'].includes(r.status)).length}
          </span>
        </div>
        <div className="bg-white p-4 rounded-xl border border-orange-200 shadow-2xs bg-orange-50/30">
          <span className="text-[10px] font-bold text-orange-700 uppercase tracking-wider block flex items-center gap-1">
            <AlertCircle className="w-3 h-3 text-orange-600" /> Appeals Raised
          </span>
          <span className="text-2xl font-black text-orange-700 block mt-1">
            {returns.filter(r => r.status === 'Appeal Raised').length}
          </span>
        </div>
        <div className="bg-white p-4 rounded-xl border border-green-200 shadow-2xs bg-green-50/20 col-span-2 sm:col-span-1">
          <span className="text-[10px] font-bold text-green-700 uppercase tracking-wider block">Refunds Settled</span>
          <span className="text-2xl font-black text-green-700 block mt-1">
            {returns.filter(r => r.status === 'Refund Completed').length}
          </span>
        </div>
      </div>

      {/* Filters & Search */}
      <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-2xs flex flex-col md:flex-row gap-3 items-center justify-between">
        <div className="relative w-full md:w-80">
          <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            placeholder="Search by order ID, vendor, customer..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full pl-9 pr-4 py-2 text-xs bg-slate-50 border border-slate-200 rounded-xl focus:outline-hidden focus:ring-2 focus:ring-[#036e26]/20"
          />
        </div>
        <div className="flex flex-wrap items-center gap-2 w-full md:w-auto">
          <div className="flex items-center gap-1.5">
            <Store className="w-3.5 h-3.5 text-slate-400" />
            <select
              value={vendorFilter}
              onChange={(e) => setVendorFilter(e.target.value)}
              className="px-3 py-2 text-xs bg-slate-50 border border-slate-200 rounded-xl"
            >
              <option value="ALL">All Stores ({uniqueVendors.length})</option>
              {uniqueVendors.map(v => (
                <option key={v} value={v}>{v}</option>
              ))}
            </select>
          </div>

          <div className="flex items-center gap-1.5">
            <Filter className="w-3.5 h-3.5 text-slate-400" />
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="px-3 py-2 text-xs bg-slate-50 border border-slate-200 rounded-xl"
            >
              <option value="ALL">All Statuses ({returns.length})</option>
              <option value="Return Requested">Return Requested</option>
              <option value="Under Vendor Review">Under Vendor Review</option>
              <option value="Additional Information Requested">Additional Info Requested</option>
              <option value="Return Approved">Return Approved</option>
              <option value="Return Rejected">Return Rejected</option>
              <option value="Return Shipped">Return Shipped</option>
              <option value="Product Received">Product Received</option>
              <option value="Refund Completed">Refund Completed</option>
              <option value="Appeal Raised">Appeal Raised (Dispute)</option>
              <option value="Closed">Closed</option>
            </select>
          </div>
        </div>
      </div>

      {/* Returns Table */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-2xs overflow-hidden">
        {loading ? (
          <div className="p-12 text-center text-slate-400 text-xs">Loading all return claims...</div>
        ) : filteredReturns.length === 0 ? (
          <div className="p-12 text-center text-slate-400 text-xs space-y-2">
            <RotateCcw className="w-8 h-8 mx-auto text-slate-300 stroke-[1.5]" />
            <p className="font-semibold text-slate-600">No returns match the selected filter</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-50/80 border-b border-slate-200 text-slate-500 font-bold uppercase tracking-wider text-[10px]">
                <tr>
                  <th className="py-3 px-4">Claim / Order</th>
                  <th className="py-3 px-4">Vendor Store</th>
                  <th className="py-3 px-4">Customer</th>
                  <th className="py-3 px-4">Reason</th>
                  <th className="py-3 px-4">Claim Amount</th>
                  <th className="py-3 px-4">Status</th>
                  <th className="py-3 px-4 text-right">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 font-medium text-slate-700">
                {filteredReturns.map(ret => (
                  <tr key={ret.id} className="hover:bg-slate-50/80 transition-colors">
                    <td className="py-3.5 px-4">
                      <span className="font-mono font-bold text-slate-900 block">{ret.order_number}</span>
                      <span className="text-[10px] text-slate-400">Claim #{ret.id} • {new Date(ret.created_at).toLocaleDateString()}</span>
                    </td>
                    <td className="py-3.5 px-4">
                      <span className="font-semibold text-slate-900 block">{ret.store_name}</span>
                      <span className="text-[10px] text-slate-400">{ret.vendor_email}</span>
                    </td>
                    <td className="py-3.5 px-4">
                      <span className="font-semibold text-slate-900 block">{ret.customer_name}</span>
                      <span className="text-[10px] text-slate-400">{ret.customer_phone || ret.customer_email}</span>
                    </td>
                    <td className="py-3.5 px-4">
                      <span className="font-semibold text-slate-800 block">{ret.reason}</span>
                      <span className="text-[10px] text-slate-400 line-clamp-1 max-w-[160px]">{ret.description}</span>
                    </td>
                    <td className="py-3.5 px-4 font-bold text-slate-900">
                      ₹{parseFloat(ret.refund_amount || 0).toLocaleString()}
                    </td>
                    <td className="py-3.5 px-4">
                      <span className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-bold border ${STATUS_BADGES[ret.status] || 'bg-slate-100 text-slate-600 border-slate-200'}`}>
                        {ret.status}
                      </span>
                    </td>
                    <td className="py-3.5 px-4 text-right">
                      <button
                        onClick={() => openReturnDetails(ret)}
                        className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold text-[#036e26] bg-green-50 hover:bg-green-100 border border-[#036e26]/20 rounded-lg transition-colors"
                      >
                        <Eye className="w-3.5 h-3.5" />
                        <span>Inspect</span>
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* DETAIL MODAL FOR ADMIN */}
      {selectedReturn && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-3 sm:p-4">
          <div className="bg-white rounded-2xl max-w-4xl w-full max-h-[92vh] shadow-2xl border border-slate-200 overflow-hidden flex flex-col text-xs">
            {/* Header */}
            <div className="px-6 py-4 border-b border-slate-200 flex items-center justify-between bg-slate-50">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-[#036e26]/10 flex items-center justify-center text-[#036e26]">
                  <RotateCcw className="w-5 h-5" />
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <h3 className="font-extrabold text-slate-900 text-base">Claim #{selectedReturn.id} Oversight</h3>
                    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold border ${STATUS_BADGES[selectedReturn.status] || 'bg-slate-100'}`}>
                      {selectedReturn.status}
                    </span>
                  </div>
                  <p className="text-[11px] text-slate-500">Store: <span className="font-bold text-slate-700">{selectedReturn.store_name}</span> • Customer: <span className="font-bold text-slate-700">{selectedReturn.customer_name}</span></p>
                </div>
              </div>
              <button
                onClick={() => setSelectedReturn(null)}
                className="text-slate-400 hover:text-slate-600 p-2 rounded-lg hover:bg-slate-200 text-base font-bold"
              >
                ✕
              </button>
            </div>

            {/* Modal Body */}
            <div className="flex-1 overflow-y-auto p-6 space-y-6">
              {/* Exceptional Dispute Banner if Appeal Raised */}
              {selectedReturn.status === 'Appeal Raised' && (
                <div className="p-4 bg-orange-50 border border-orange-200 rounded-xl text-orange-950 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
                  <div className="space-y-1">
                    <div className="flex items-center gap-2 font-bold text-sm text-orange-800">
                      <AlertCircle className="w-4 h-4 text-orange-600" />
                      <span>Customer Appeal Dispute Requires Admin Ruling</span>
                    </div>
                    <p className="text-[11px] text-orange-900">
                      <span className="font-semibold">Customer Appeal Argument:</span> {selectedReturn.appeal_reason}
                    </p>
                    <p className="text-[10px] text-orange-700 italic">
                      Vendor Rejection Reason: {selectedReturn.rejection_reason || 'N/A'}
                    </p>
                  </div>
                  <button
                    onClick={() => setDisputeModalOpen(true)}
                    className="px-4 py-2 bg-orange-600 hover:bg-orange-700 text-white font-bold rounded-xl shadow-2xs whitespace-nowrap"
                  >
                    Adjudicate Dispute
                  </button>
                </div>
              )}

              {/* General Admin Intervention Bar */}
              <div className="p-3 bg-slate-50 rounded-xl border border-slate-200 flex items-center justify-between">
                <div>
                  <span className="font-bold text-slate-700 block">Exceptional Admin Dispute Ruling</span>
                  <span className="text-[10px] text-slate-500">Overrule or uphold decisions in exceptional customer disagreements.</span>
                </div>
                <button
                  onClick={() => setDisputeModalOpen(true)}
                  className="px-3 py-1.5 bg-slate-800 hover:bg-slate-900 text-white font-bold rounded-lg transition-colors text-[11px]"
                >
                  Admin Ruling Options
                </button>
              </div>

              {/* Status Specific Highlights */}
              {selectedReturn.status === 'Return Rejected' && (
                <div className="p-3 bg-red-50 border border-red-200 rounded-xl text-red-900 text-[11px]">
                  <span className="font-bold block">Vendor Rejection Justification:</span>
                  <p className="mt-0.5">{selectedReturn.rejection_reason}</p>
                </div>
              )}
              {selectedReturn.status === 'Refund Completed' && (
                <div className="p-3 bg-green-50 border border-green-200 rounded-xl text-green-900 text-[11px]">
                  <span className="font-bold block flex items-center gap-1.5">
                    <CheckCircle2 className="w-4 h-4 text-green-600" /> Refund Settlement Confirmed
                  </span>
                  <p className="mt-0.5">
                    Settled ₹{selectedReturn.refund_amount} via {selectedReturn.refund_method} (Ref: {selectedReturn.refund_reference}) on {new Date(selectedReturn.refunded_at).toLocaleString()}
                  </p>
                </div>
              )}

              {/* Info Cards Grid */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {/* Store & Customer Details */}
                <div className="bg-white p-4 rounded-xl border border-slate-200 space-y-2 text-[11px]">
                  <span className="font-bold text-slate-900 uppercase tracking-wider text-xs block border-b border-slate-100 pb-2">
                    Parties Involved
                  </span>
                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <span className="text-slate-400 block text-[10px]">Vendor Store</span>
                      <span className="font-bold text-slate-800">{selectedReturn.store_name}</span>
                      <span className="text-slate-500 text-[10px] block">{selectedReturn.vendor_email}</span>
                    </div>
                    <div>
                      <span className="text-slate-400 block text-[10px]">Customer</span>
                      <span className="font-bold text-slate-800">{selectedReturn.customer_name}</span>
                      <span className="text-slate-500 text-[10px] block">{selectedReturn.customer_phone || selectedReturn.customer_email}</span>
                    </div>
                    <div>
                      <span className="text-slate-400 block text-[10px]">Order Number</span>
                      <span className="font-mono font-bold text-slate-800">{selectedReturn.order_number}</span>
                    </div>
                    <div>
                      <span className="text-slate-400 block text-[10px]">Claim Amount</span>
                      <span className="font-bold text-emerald-700 font-mono text-sm">₹{parseFloat(selectedReturn.refund_amount || 0).toLocaleString()}</span>
                    </div>
                  </div>
                </div>

                {/* Items & Shipping */}
                <div className="bg-white p-4 rounded-xl border border-slate-200 space-y-2 text-[11px]">
                  <span className="font-bold text-slate-900 uppercase tracking-wider text-xs block border-b border-slate-100 pb-2">
                    Claimed Items & Logistics
                  </span>
                  <div className="space-y-1.5 max-h-36 overflow-y-auto">
                    {(() => {
                      let items = [];
                      try {
                        items = Array.isArray(selectedReturn.items) ? selectedReturn.items : JSON.parse(selectedReturn.items || '[]');
                      } catch (e) {}
                      return items.map((it, idx) => (
                        <div key={idx} className="flex items-center justify-between p-1.5 bg-slate-50 rounded border border-slate-100">
                          <span className="font-bold text-slate-800">{it.product?.name || it.name} (x{it.qty || 1})</span>
                          <span className="font-mono text-slate-900">₹{(parseFloat(it.price || it.variant?.price || it.product?.price || 0) * (it.qty || 1)).toLocaleString()}</span>
                        </div>
                      ));
                    })()}
                  </div>
                  {selectedReturn.return_tracking_id && (
                    <div className="p-2 bg-indigo-50/60 rounded border border-indigo-200 text-indigo-900 text-[10px]">
                      Courier: <span className="font-bold">{selectedReturn.return_courier || 'Courier'}</span> • Tracking: <span className="font-mono font-bold">{selectedReturn.return_tracking_id}</span>
                    </div>
                  )}
                </div>
              </div>

              {/* Photos Gallery */}
              {(() => {
                let imgs = [];
                try {
                  imgs = Array.isArray(selectedReturn.images) ? selectedReturn.images : JSON.parse(selectedReturn.images || '[]');
                } catch (e) {}
                if (!imgs.length) return null;
                return (
                  <div className="bg-white p-4 rounded-xl border border-slate-200 space-y-2">
                    <span className="font-bold text-slate-900 text-xs flex items-center gap-1.5">
                      <ImageIcon className="w-4 h-4 text-slate-500" /> Buyer Proof Images ({imgs.length})
                    </span>
                    <div className="flex flex-wrap gap-2 pt-1">
                      {imgs.map((url, i) => (
                        <a key={i} href={url} target="_blank" rel="noopener noreferrer">
                          <img src={url} alt="Proof" className="w-16 h-16 object-cover rounded-lg border border-slate-200 hover:opacity-90" />
                        </a>
                      ))}
                    </div>
                  </div>
                );
              })()}

              {/* Communication Thread (Audit Trail) */}
              <div className="bg-white p-4 rounded-xl border border-slate-200 space-y-3">
                <span className="font-bold text-slate-900 text-xs flex items-center gap-1.5 border-b border-slate-100 pb-2">
                  <MessageSquare className="w-4 h-4 text-[#036e26]" /> Complete Communication Audit Log ({messages.length})
                </span>

                <div className="space-y-3 max-h-60 overflow-y-auto p-3 bg-slate-50 rounded-xl border border-slate-200">
                  {messages.length === 0 ? (
                    <p className="text-slate-400 text-center py-4 text-[11px] italic">No messages in thread.</p>
                  ) : (
                    messages.map((m, idx) => {
                      const isVendor = m.sender_type === 'vendor';
                      const isAdmin = m.sender_type === 'admin';
                      return (
                        <div key={idx} className={`flex flex-col ${isAdmin ? 'items-center' : isVendor ? 'items-end' : 'items-start'}`}>
                          <div className={`max-w-[85%] rounded-xl p-3 text-[11px] space-y-1 ${
                            isAdmin 
                              ? 'bg-amber-100 text-amber-900 border border-amber-300 shadow-2xs' 
                              : isVendor 
                              ? 'bg-[#012980] text-white' 
                              : 'bg-white text-slate-800 border border-slate-200'
                          }`}>
                            <div className="flex items-center justify-between gap-3 text-[9px] opacity-75">
                              <span className="font-bold">{m.sender_name || String(m.sender_type || 'USER').toUpperCase()}</span>
                              <span>{new Date(m.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                            </div>
                            <p className="leading-relaxed whitespace-pre-wrap">{m.message}</p>
                          </div>
                        </div>
                      );
                    })
                  )}
                </div>

                {/* Admin Message Posting */}
                <form onSubmit={handleSendAdminMessage} className="flex gap-2 pt-1">
                  <input
                    type="text"
                    placeholder="Post official Admin guidance or notice to this thread..."
                    value={adminMessage}
                    onChange={(e) => setAdminMessage(e.target.value)}
                    className="flex-1 px-3.5 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs focus:ring-2 focus:ring-[#036e26]/20"
                  />
                  <button
                    type="submit"
                    disabled={sendingMessage || !adminMessage.trim()}
                    className="px-4 py-2 bg-[#036e26] hover:bg-[#02541d] text-white font-bold rounded-xl flex items-center gap-1.5 transition-colors disabled:opacity-50"
                  >
                    <Send className="w-3.5 h-3.5" />
                    <span>Post</span>
                  </button>
                </form>
              </div>
            </div>

            {/* Footer */}
            <div className="px-6 py-3 border-t border-slate-200 bg-slate-50 flex justify-end">
              <button
                onClick={() => setSelectedReturn(null)}
                className="px-5 py-2 bg-white border border-slate-200 text-slate-700 font-semibold rounded-xl hover:bg-slate-100"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {/* DISPUTE DECISION MODAL */}
      {disputeModalOpen && selectedReturn && (
        <div className="fixed inset-0 z-60 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
          <form onSubmit={handleDisputeResolution} className="bg-white rounded-2xl max-w-md w-full p-6 space-y-4 shadow-2xl border border-slate-200 text-xs">
            <div className="flex items-center gap-2 text-slate-900 font-bold text-sm">
              <ShieldCheck className="w-5 h-5 text-[#036e26]" />
              <span>Admin Exceptional Dispute Ruling</span>
            </div>
            <p className="text-slate-600 text-[11px]">
              Resolve exceptional customer disagreement. Upholding will close the case and release vendor order funds. Overruling will approve the return and require a refund.
            </p>

            <div className="space-y-2">
              <label className="font-bold text-slate-700 block">Select Ruling:</label>
              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => setDisputeDecision('uphold')}
                  className={`p-3 rounded-xl border text-center font-bold transition-colors ${
                    disputeDecision === 'uphold' 
                      ? 'bg-slate-900 text-white border-slate-900 shadow-2xs' 
                      : 'bg-slate-50 text-slate-700 border-slate-200'
                  }`}
                >
                  Uphold Rejection (Close Case)
                </button>
                <button
                  type="button"
                  onClick={() => setDisputeDecision('overrule')}
                  className={`p-3 rounded-xl border text-center font-bold transition-colors ${
                    disputeDecision === 'overrule' 
                      ? 'bg-emerald-700 text-white border-emerald-700 shadow-2xs' 
                      : 'bg-slate-50 text-slate-700 border-slate-200'
                  }`}
                >
                  Overrule & Approve Return
                </button>
              </div>
            </div>

            <div>
              <label className="font-bold text-slate-700 block mb-1">Mandatory Resolution Findings & Notes *</label>
              <textarea
                rows={3}
                placeholder="Explain the admin investigation findings and final ruling rationale..."
                value={adminNotes}
                onChange={(e) => setAdminNotes(e.target.value)}
                className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs focus:ring-2 focus:ring-[#036e26]"
              />
            </div>

            <div className="flex justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setDisputeModalOpen(false)}
                className="px-4 py-2 bg-slate-100 text-slate-700 font-semibold rounded-xl"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={actionLoading || !adminNotes.trim()}
                className="px-4 py-2 bg-[#036e26] hover:bg-[#02541d] text-white font-bold rounded-xl shadow-2xs disabled:opacity-50"
              >
                {actionLoading ? 'Recording...' : 'Execute Ruling'}
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}

