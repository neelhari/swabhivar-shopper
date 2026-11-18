import React, { useState, useEffect } from 'react';
import { 
  RotateCcw, Search, Filter, Clock, CheckCircle2, XCircle, AlertCircle, 
  MessageSquare, Send, Eye, ShieldCheck, ChevronRight, Truck, PackageCheck, 
  CreditCard, ArrowLeft, Image as ImageIcon, ExternalLink, HelpCircle
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

export function VendorReturnsPage() {
  const [returns, setReturns] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState('ALL');

  // Drawer / Modal state
  const [selectedReturn, setSelectedReturn] = useState(null);
  const [messages, setMessages] = useState([]);
  const [newMessage, setNewMessage] = useState('');
  const [sendingMessage, setSendingMessage] = useState(false);
  const [actionLoading, setActionLoading] = useState(false);

  // Rejection Modal
  const [rejectModalOpen, setRejectModalOpen] = useState(false);
  const [rejectionReason, setRejectionReason] = useState('');

  // Info Request Modal
  const [infoModalOpen, setInfoModalOpen] = useState(false);
  const [infoRequestText, setInfoRequestText] = useState('');

  // Refund Modal
  const [refundModalOpen, setRefundModalOpen] = useState(false);
  const [refundMethod, setRefundMethod] = useState('bank_transfer');
  const [refundReference, setRefundReference] = useState('');
  const [refundNotes, setRefundNotes] = useState('');

  const fetchReturns = async () => {
    try {
      setLoading(true);
      const token = localStorage.getItem('vendor_token');
      const res = await fetch(`${BACKEND_URL}/returns/vendor/list`, {
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
      const token = localStorage.getItem('vendor_token');
      const res = await fetch(`${BACKEND_URL}/returns/vendor/${ret.id}`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (res.ok) {
        const data = await res.json();
        setSelectedReturn(data.returnRequest);
        setMessages(data.messages || []);
      }
    } catch (err) {
      console.warn('Failed to load fresh messages', err);
    }
  };

  const handleSendMessage = async (e) => {
    e.preventDefault();
    if (!newMessage.trim() || !selectedReturn) return;

    setSendingMessage(true);
    try {
      const token = localStorage.getItem('vendor_token');
      const res = await fetch(`${BACKEND_URL}/returns/vendor/${selectedReturn.id}/message`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ message: newMessage.trim() })
      });

      if (res.ok) {
        const data = await res.json();
        setMessages(prev => [...prev, data.message]);
        setNewMessage('');
        toast.success('Message sent to customer');
      } else {
        toast.error('Failed to send message');
      }
    } catch (err) {
      toast.error('Failed to send message');
    } finally {
      setSendingMessage(false);
    }
  };

  const updateStatus = async (status, rejection = '', responseNote = '') => {
    if (!selectedReturn) return;
    setActionLoading(true);
    try {
      const token = localStorage.getItem('vendor_token');
      const res = await fetch(`${BACKEND_URL}/returns/vendor/${selectedReturn.id}/status`, {
        method: 'PUT',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          status,
          rejection_reason: rejection || undefined,
          vendor_response: responseNote || undefined
        })
      });

      const data = await res.json();
      if (res.ok) {
        toast.success(`Status updated to: ${status}`);
        setSelectedReturn(data.returnRequest);
        setRejectModalOpen(false);
        setInfoModalOpen(false);
        setRejectionReason('');
        setInfoRequestText('');
        await fetchReturns();
        // Refresh message thread
        const msgRes = await fetch(`${BACKEND_URL}/returns/vendor/${selectedReturn.id}`, {
          headers: { 'Authorization': `Bearer ${token}` }
        });
        if (msgRes.ok) {
          const msgData = await msgRes.json();
          setMessages(msgData.messages || []);
        }
      } else {
        toast.error(data.error || 'Failed to update status');
      }
    } catch (err) {
      toast.error('Failed to update status');
    } finally {
      setActionLoading(false);
    }
  };

  const handleProcessRefund = async (e) => {
    e.preventDefault();
    if (!selectedReturn) return;

    setActionLoading(true);
    try {
      const token = localStorage.getItem('vendor_token');
      const res = await fetch(`${BACKEND_URL}/returns/vendor/${selectedReturn.id}/refund`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          refund_method: refundMethod,
          refund_reference: refundReference.trim() || undefined,
          notes: refundNotes.trim() || undefined
        })
      });

      const data = await res.json();
      if (res.ok) {
        toast.success(`Refund of ₹${selectedReturn.refund_amount} successfully completed and recorded!`);
        setSelectedReturn(data.returnRequest);
        setRefundModalOpen(false);
        await fetchReturns();
        // Refresh thread
        const msgRes = await fetch(`${BACKEND_URL}/returns/vendor/${selectedReturn.id}`, {
          headers: { 'Authorization': `Bearer ${token}` }
        });
        if (msgRes.ok) {
          const msgData = await msgRes.json();
          setMessages(msgData.messages || []);
        }
      } else {
        toast.error(data.error || 'Failed to complete refund');
      }
    } catch (err) {
      toast.error('Failed to communicate with server');
    } finally {
      setActionLoading(false);
    }
  };

  // Filtered returns
  const filteredReturns = returns.filter(r => {
    const matchesStatus = statusFilter === 'ALL' || r.status === statusFilter;
    const term = (searchTerm || '').trim().toLowerCase();
    const matchesSearch = !term ||
      (r.order_number && String(r.order_number).toLowerCase().includes(term)) ||
      (r.customer_name && String(r.customer_name).toLowerCase().includes(term)) ||
      (r.reason && String(r.reason).toLowerCase().includes(term));
    return matchesStatus && matchesSearch;
  });

  return (
    <div className="p-4 sm:p-6 lg:p-8 space-y-6 max-w-7xl mx-auto font-sans text-slate-800">
      {/* Page Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-200 pb-5">
        <div>
          <h1 className="text-2xl sm:text-3xl font-extrabold text-[#012980] flex items-center gap-2.5">
            <RotateCcw className="w-7 h-7 text-[#012980]" />
            <span>Returns & Refund Management</span>
          </h1>
          <p className="text-xs sm:text-sm text-slate-500 mt-1">
            Review customer return requests, communicate directly with buyers, approve/reject claims, and process authorized refunds.
          </p>
        </div>
        <button
          onClick={fetchReturns}
          disabled={loading}
          className="self-start sm:self-auto px-4 py-2 text-xs font-semibold text-[#012980] bg-blue-50/60 border border-[#012980]/20 rounded-xl hover:bg-blue-100 transition-colors shadow-2xs"
        >
          {loading ? 'Refreshing...' : 'Refresh Requests'}
        </button>
      </div>

      {/* Summary KPI Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 sm:gap-4">
        <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-2xs">
          <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider block">Total Claims</span>
          <span className="text-2xl font-black text-slate-900 block mt-1">{returns.length}</span>
        </div>
        <div className="bg-white p-4 rounded-xl border border-amber-200 shadow-2xs bg-amber-50/20">
          <span className="text-[11px] font-bold text-amber-700 uppercase tracking-wider block">Needs Action</span>
          <span className="text-2xl font-black text-amber-700 block mt-1">
            {returns.filter(r => ['Return Requested', 'Under Vendor Review', 'Appeal Raised'].includes(r.status)).length}
          </span>
        </div>
        <div className="bg-white p-4 rounded-xl border border-emerald-200 shadow-2xs bg-emerald-50/20">
          <span className="text-[11px] font-bold text-emerald-700 uppercase tracking-wider block">Approved / In Transit</span>
          <span className="text-2xl font-black text-emerald-700 block mt-1">
            {returns.filter(r => ['Return Approved', 'Return Shipped', 'Product Received'].includes(r.status)).length}
          </span>
        </div>
        <div className="bg-white p-4 rounded-xl border border-green-200 shadow-2xs bg-green-50/20">
          <span className="text-[11px] font-bold text-green-700 uppercase tracking-wider block">Refunds Settled</span>
          <span className="text-2xl font-black text-green-700 block mt-1">
            {returns.filter(r => r.status === 'Refund Completed').length}
          </span>
        </div>
      </div>

      {/* Filters & Search */}
      <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-2xs flex flex-col md:flex-row gap-3 items-center justify-between">
        <div className="relative w-full md:w-96">
          <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            placeholder="Search by order ID, customer, or reason..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full pl-9 pr-4 py-2 text-xs bg-slate-50 border border-slate-200 rounded-xl focus:outline-hidden focus:ring-2 focus:ring-[#012980]/20 focus:border-[#012980]"
          />
        </div>
        <div className="flex items-center gap-2 w-full md:w-auto">
          <Filter className="w-4 h-4 text-slate-400 shrink-0" />
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="w-full md:w-auto px-3 py-2 text-xs bg-slate-50 border border-slate-200 rounded-xl focus:outline-hidden focus:ring-2 focus:ring-[#012980]/20"
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
            <option value="Appeal Raised">Appeal Raised (Urgent)</option>
            <option value="Closed">Closed</option>
          </select>
        </div>
      </div>

      {/* Returns Table */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-2xs overflow-hidden">
        {loading ? (
          <div className="p-12 text-center text-slate-400 text-xs">Loading return claims...</div>
        ) : filteredReturns.length === 0 ? (
          <div className="p-12 text-center text-slate-400 text-xs space-y-2">
            <RotateCcw className="w-8 h-8 mx-auto text-slate-300 stroke-[1.5]" />
            <p className="font-semibold text-slate-600">No return requests found</p>
            <p className="text-[11px]">When customers request a return or refund for your products, they will appear here.</p>
          </div>
        ) : (
          <>
            {/* Mobile Cards View (md:hidden) */}
            <div className="md:hidden divide-y divide-slate-100">
              {filteredReturns.map(ret => {
                let itemsList = [];
                try {
                  itemsList = Array.isArray(ret.items) ? ret.items : JSON.parse(ret.items || '[]');
                } catch (e) {}

                return (
                  <div key={ret.id} className="p-4 space-y-3">
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex items-center gap-2">
                        <span className="font-mono font-bold text-slate-900 text-xs bg-slate-100 px-2 py-0.5 rounded">
                          {ret.order_number}
                        </span>
                        <span className="text-[10px] text-slate-400 font-semibold">
                          Claim #{ret.id}
                        </span>
                      </div>
                      <span className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-bold border ${STATUS_BADGES[ret.status] || 'bg-slate-100 text-slate-600 border-slate-200'}`}>
                        {ret.status}
                      </span>
                    </div>

                    <div className="bg-slate-50 p-3 rounded-xl border border-slate-100 space-y-1.5 text-xs">
                      <div className="flex items-center justify-between">
                        <span className="font-bold text-slate-900">{ret.customer_name || 'Customer'}</span>
                        <span className="font-extrabold text-[#012980] text-sm">
                          ₹{parseFloat(ret.refund_amount || 0).toLocaleString()}
                        </span>
                      </div>
                      <p className="text-[11px] text-slate-600 font-medium">
                        Reason: <strong className="text-slate-800">{ret.reason}</strong>
                      </p>
                      {ret.description && (
                        <p className="text-[11px] text-slate-500 line-clamp-2 italic">
                          "{ret.description}"
                        </p>
                      )}
                      <div className="pt-1 text-[11px] text-slate-400">
                        {itemsList.map(i => `${i.product?.name || i.name} (x${i.qty || 1})`).join(', ') || 'Return Item'}
                      </div>
                    </div>

                    <div className="flex items-center justify-between gap-2 pt-0.5">
                      <span className="text-[11px] text-slate-400">
                        {new Date(ret.created_at).toLocaleDateString('en-IN', { day: '2-digit', month: 'short' })}
                      </span>
                      <button
                        onClick={() => openReturnDetails(ret)}
                        className="py-2 px-4 text-xs font-bold text-white bg-[#012980] hover:bg-[#001d5a] rounded-xl transition-colors shadow-2xs flex items-center gap-1.5 active:scale-95"
                      >
                        <Eye className="w-3.5 h-3.5" />
                        <span>Manage Claim</span>
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Desktop Table View (hidden md:block) */}
            <div className="overflow-x-auto hidden md:block">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-50/80 border-b border-slate-200 text-slate-500 font-bold uppercase tracking-wider text-[10px]">
                <tr>
                  <th className="py-3 px-4">Order & Claim</th>
                  <th className="py-3 px-4">Customer</th>
                  <th className="py-3 px-4">Returned Item(s)</th>
                  <th className="py-3 px-4">Reason</th>
                  <th className="py-3 px-4">Claim Amount</th>
                  <th className="py-3 px-4">Status</th>
                  <th className="py-3 px-4 text-right">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 font-medium text-slate-700">
                {filteredReturns.map(ret => {
                  let itemsList = [];
                  try {
                    itemsList = Array.isArray(ret.items) ? ret.items : JSON.parse(ret.items || '[]');
                  } catch (e) {}

                  return (
                    <tr key={ret.id} className="hover:bg-slate-50/80 transition-colors">
                      <td className="py-3.5 px-4">
                        <span className="font-mono font-bold text-slate-900 block">{ret.order_number}</span>
                        <span className="text-[10px] text-slate-400">Claim #{ret.id} • {new Date(ret.created_at).toLocaleDateString()}</span>
                      </td>
                      <td className="py-3.5 px-4">
                        <span className="font-semibold text-slate-900 block">{ret.customer_name}</span>
                        <span className="text-[10px] text-slate-400">{ret.customer_email}</span>
                      </td>
                      <td className="py-3.5 px-4">
                        <span className="line-clamp-1 max-w-[200px] text-slate-800">
                          {itemsList.map(i => `${i.product?.name || i.name} (x${i.qty || 1})`).join(', ') || 'Item'}
                        </span>
                        <span className="text-[10px] text-slate-400">{itemsList.length} item variant(s)</span>
                      </td>
                      <td className="py-3.5 px-4">
                        <span className="font-semibold text-slate-800 block">{ret.reason}</span>
                        <span className="text-[10px] text-slate-400 line-clamp-1 max-w-[180px]">{ret.description}</span>
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
                          className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold text-white bg-[#012980] hover:bg-[#001d5a] rounded-lg transition-colors shadow-2xs"
                        >
                          <Eye className="w-3.5 h-3.5" />
                          <span>Manage</span>
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            </div>
          </>
        )}
      </div>

      {/* DETAIL MODAL / SLIDE-OVER */}
      {selectedReturn && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-3 sm:p-4">
          <div className="bg-white rounded-2xl max-w-4xl w-full max-h-[92vh] shadow-2xl border border-slate-200 overflow-hidden flex flex-col animate-in fade-in zoom-in-95 duration-150 text-xs">
            {/* Header */}
            <div className="px-6 py-4 border-b border-slate-200 flex items-center justify-between bg-slate-50">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-[#012980]/10 flex items-center justify-center text-[#012980]">
                  <RotateCcw className="w-5 h-5" />
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <h3 className="font-extrabold text-slate-900 text-base">Claim #{selectedReturn.id}</h3>
                    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold border ${STATUS_BADGES[selectedReturn.status] || 'bg-slate-100'}`}>
                      {selectedReturn.status}
                    </span>
                  </div>
                  <p className="text-[11px] text-slate-500">Order: {selectedReturn.order_number} • Customer: {selectedReturn.customer_name}</p>
                </div>
              </div>
              <button
                onClick={() => setSelectedReturn(null)}
                className="text-slate-400 hover:text-slate-600 p-2 rounded-lg hover:bg-slate-200 transition-colors text-base font-bold"
              >
                ✕
              </button>
            </div>

            {/* Modal Body */}
            <div className="flex-1 overflow-y-auto p-6 space-y-6">
              {/* Action Toolbar Based on Status */}
              <div className="p-4 bg-slate-50 rounded-xl border border-slate-200 flex flex-wrap items-center justify-between gap-3">
                <div>
                  <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 block">Available Vendor Actions</span>
                  <p className="text-[11px] text-slate-600">Take operational decision or update shipment/refund progress.</p>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  {selectedReturn.status === 'Return Requested' && (
                    <button
                      onClick={() => updateStatus('Under Vendor Review')}
                      disabled={actionLoading}
                      className="px-3 py-1.5 bg-blue-600 hover:bg-blue-700 text-white font-bold rounded-lg transition-colors shadow-2xs"
                    >
                      Start Review
                    </button>
                  )}
                  {['Return Requested', 'Under Vendor Review'].includes(selectedReturn.status) && (
                    <>
                      <button
                        onClick={() => setInfoModalOpen(true)}
                        disabled={actionLoading}
                        className="px-3 py-1.5 bg-purple-600 hover:bg-purple-700 text-white font-bold rounded-lg transition-colors shadow-2xs"
                      >
                        Request More Info
                      </button>
                      <button
                        onClick={() => updateStatus('Return Approved', '', 'Return claim approved. Please ship the product back in original packaging.')}
                        disabled={actionLoading}
                        className="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white font-bold rounded-lg transition-colors shadow-2xs"
                      >
                        Approve Return
                      </button>
                      <button
                        onClick={() => setRejectModalOpen(true)}
                        disabled={actionLoading}
                        className="px-3 py-1.5 bg-red-600 hover:bg-red-700 text-white font-bold rounded-lg transition-colors shadow-2xs"
                      >
                        Reject Request
                      </button>
                    </>
                  )}
                  {selectedReturn.status === 'Return Shipped' && (
                    <button
                      onClick={() => updateStatus('Product Received', '', 'Vendor confirmed returned product received in good condition.')}
                      disabled={actionLoading}
                      className="px-3 py-1.5 bg-teal-600 hover:bg-teal-700 text-white font-bold rounded-lg transition-colors shadow-2xs"
                    >
                      Mark Product Received
                    </button>
                  )}
                  {['Return Approved', 'Product Received'].includes(selectedReturn.status) && selectedReturn.refund_status !== 'completed' && (
                    <button
                      onClick={() => setRefundModalOpen(true)}
                      disabled={actionLoading}
                      className="px-3 py-1.5 bg-green-600 hover:bg-green-700 text-white font-bold rounded-lg transition-colors shadow-2xs flex items-center gap-1.5"
                    >
                      <CreditCard className="w-3.5 h-3.5" />
                      <span>Issue / Record Refund (₹{selectedReturn.refund_amount})</span>
                    </button>
                  )}
                </div>
              </div>

              {/* Status Specific Alerts */}
              {selectedReturn.status === 'Return Rejected' && (
                <div className="p-4 bg-red-50 border border-red-200 rounded-xl text-red-900 space-y-1">
                  <div className="flex items-center gap-2 font-bold text-xs">
                    <XCircle className="w-4 h-4 text-red-600" />
                    <span>Return Rejected by Vendor</span>
                  </div>
                  <p className="text-[11px]"><span className="font-semibold">Rejection Reason:</span> {selectedReturn.rejection_reason}</p>
                </div>
              )}
              {selectedReturn.status === 'Appeal Raised' && (
                <div className="p-4 bg-orange-50 border border-orange-200 rounded-xl text-orange-900 space-y-1">
                  <div className="flex items-center gap-2 font-bold text-xs">
                    <AlertCircle className="w-4 h-4 text-orange-600" />
                    <span>Customer Dispute Appeal Pending Admin Review</span>
                  </div>
                  <p className="text-[11px]"><span className="font-semibold">Customer Appeal Argument:</span> {selectedReturn.appeal_reason}</p>
                  <p className="text-[10px] text-orange-700 italic">Order earnings remain on hold pending admin intervention.</p>
                </div>
              )}
              {selectedReturn.status === 'Refund Completed' && (
                <div className="p-4 bg-green-50 border border-green-200 rounded-xl text-green-900 space-y-1">
                  <div className="flex items-center gap-2 font-bold text-xs">
                    <CheckCircle2 className="w-4 h-4 text-green-600" />
                    <span>Refund Successfully Completed</span>
                  </div>
                  <p className="text-[11px]">
                    Settled ₹{selectedReturn.refund_amount} via <span className="font-bold">{selectedReturn.refund_method}</span> • Ref: <span className="font-mono font-bold">{selectedReturn.refund_reference}</span> on {new Date(selectedReturn.refunded_at).toLocaleString()}
                  </p>
                </div>
              )}

              {/* Grid: Claim Info & Items */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {/* Left Card: Customer & Reason */}
                <div className="bg-white p-4 rounded-xl border border-slate-200 space-y-3">
                  <span className="font-bold text-slate-900 text-xs uppercase tracking-wider block border-b border-slate-100 pb-2">
                    Claim Reason & Buyer Details
                  </span>
                  <div className="grid grid-cols-2 gap-2 text-[11px]">
                    <div>
                      <span className="text-slate-400 block text-[10px]">Reason</span>
                      <span className="font-bold text-slate-800">{selectedReturn.reason}</span>
                    </div>
                    <div>
                      <span className="text-slate-400 block text-[10px]">Claim Amount</span>
                      <span className="font-bold text-emerald-700 font-mono text-sm">₹{parseFloat(selectedReturn.refund_amount || 0).toLocaleString()}</span>
                    </div>
                    <div>
                      <span className="text-slate-400 block text-[10px]">Customer Name</span>
                      <span className="font-semibold text-slate-800">{selectedReturn.customer_name}</span>
                    </div>
                    <div>
                      <span className="text-slate-400 block text-[10px]">Contact Phone</span>
                      <span className="font-semibold text-slate-800">{selectedReturn.customer_phone || 'N/A'}</span>
                    </div>
                  </div>
                  <div>
                    <span className="text-slate-400 block text-[10px]">Customer Description</span>
                    <p className="bg-slate-50 p-2.5 rounded-lg text-slate-700 text-[11px] mt-1 border border-slate-200">
                      {selectedReturn.description}
                    </p>
                  </div>
                </div>

                {/* Right Card: Returned Items */}
                <div className="bg-white p-4 rounded-xl border border-slate-200 space-y-3">
                  <span className="font-bold text-slate-900 text-xs uppercase tracking-wider block border-b border-slate-100 pb-2">
                    Returned Product(s)
                  </span>
                  <div className="space-y-2 max-h-48 overflow-y-auto">
                    {(() => {
                      let items = [];
                      try {
                        items = Array.isArray(selectedReturn.items) ? selectedReturn.items : JSON.parse(selectedReturn.items || '[]');
                      } catch (e) {}
                      return items.map((it, idx) => (
                        <div key={idx} className="flex items-center justify-between p-2 rounded-lg bg-slate-50 border border-slate-100">
                          <div>
                            <span className="font-bold text-slate-900 block">{it.product?.name || it.name}</span>
                            <span className="text-[10px] text-slate-500">Qty: {it.qty || 1} • Unit Price: ₹{parseFloat(it.price || it.variant?.price || it.product?.price || 0).toLocaleString()}</span>
                          </div>
                          <span className="font-bold text-slate-900">
                            ₹{(parseFloat(it.price || it.variant?.price || it.product?.price || 0) * (it.qty || 1)).toLocaleString()}
                          </span>
                        </div>
                      ));
                    })()}
                  </div>

                  {/* Tracking info if shipped */}
                  {selectedReturn.return_tracking_id && (
                    <div className="p-3 bg-indigo-50/50 rounded-lg border border-indigo-200 text-[11px] text-indigo-900">
                      <span className="font-bold block flex items-center gap-1.5">
                        <Truck className="w-3.5 h-3.5" /> Return Shipment Details
                      </span>
                      <p className="mt-1">Courier: <span className="font-semibold">{selectedReturn.return_courier || 'Standard Courier'}</span> • Tracking ID: <span className="font-mono font-bold">{selectedReturn.return_tracking_id}</span></p>
                    </div>
                  )}
                </div>
              </div>

              {/* Customer Uploaded Proof Images */}
              {(() => {
                let imgs = [];
                try {
                  imgs = Array.isArray(selectedReturn.images) ? selectedReturn.images : JSON.parse(selectedReturn.images || '[]');
                } catch (e) {}
                if (!imgs.length) return null;
                return (
                  <div className="bg-white p-4 rounded-xl border border-slate-200 space-y-2">
                    <span className="font-bold text-slate-900 text-xs flex items-center gap-1.5">
                      <ImageIcon className="w-4 h-4 text-slate-500" /> Customer Proof Images ({imgs.length})
                    </span>
                    <div className="flex flex-wrap gap-3 pt-1">
                      {imgs.map((url, i) => (
                        <a key={i} href={url} target="_blank" rel="noopener noreferrer" className="relative group block">
                          <img src={url} alt="Proof" className="w-20 h-20 object-cover rounded-xl border border-slate-200 group-hover:opacity-90 transition-opacity" />
                          <div className="absolute inset-0 bg-black/40 rounded-xl opacity-0 group-hover:opacity-100 flex items-center justify-center text-white transition-opacity">
                            <ExternalLink className="w-4 h-4" />
                          </div>
                        </a>
                      ))}
                    </div>
                  </div>
                );
              })()}

              {/* Direct Communication Thread */}
              <div className="bg-white p-4 rounded-xl border border-slate-200 space-y-3">
                <span className="font-bold text-slate-900 text-xs flex items-center gap-1.5 border-b border-slate-100 pb-2">
                  <MessageSquare className="w-4 h-4 text-[#012980]" /> Communication History ({messages.length})
                </span>

                <div className="space-y-3 max-h-64 overflow-y-auto p-2 bg-slate-50 rounded-xl border border-slate-200">
                  {messages.length === 0 ? (
                    <p className="text-slate-400 text-center py-4 text-[11px] italic">No messages exchanged yet.</p>
                  ) : (
                    messages.map((m, idx) => {
                      const isVendor = m.sender_type === 'vendor';
                      const isAdmin = m.sender_type === 'admin';
                      return (
                        <div key={idx} className={`flex flex-col ${isVendor ? 'items-end' : 'items-start'}`}>
                          <div className={`max-w-[80%] rounded-xl p-3 text-[11px] space-y-1 ${
                            isAdmin 
                              ? 'bg-amber-100 text-amber-900 border border-amber-300' 
                              : isVendor 
                              ? 'bg-[#012980] text-white shadow-2xs' 
                              : 'bg-white text-slate-800 border border-slate-200 shadow-2xs'
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

                {/* Send Reply Input */}
                <form onSubmit={handleSendMessage} className="flex gap-2 pt-1">
                  <input
                    type="text"
                    placeholder="Type a message or response to the customer..."
                    value={newMessage}
                    onChange={(e) => setNewMessage(e.target.value)}
                    className="flex-1 px-3.5 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs focus:outline-hidden focus:ring-2 focus:ring-[#012980]/20"
                  />
                  <button
                    type="submit"
                    disabled={sendingMessage || !newMessage.trim()}
                    className="px-4 py-2 bg-[#012980] hover:bg-[#001d5a] text-white font-bold rounded-xl flex items-center gap-1.5 transition-colors disabled:opacity-50"
                  >
                    <Send className="w-3.5 h-3.5" />
                    <span>Send</span>
                  </button>
                </form>
              </div>
            </div>

            {/* Footer */}
            <div className="px-6 py-3 border-t border-slate-200 bg-slate-50 flex justify-end">
              <button
                onClick={() => setSelectedReturn(null)}
                className="px-5 py-2 bg-white border border-slate-200 text-slate-700 font-semibold rounded-xl hover:bg-slate-100 transition-colors"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {/* REJECT MODAL (Mandatory Reason) */}
      {rejectModalOpen && (
        <div className="fixed inset-0 z-60 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-md w-full p-6 space-y-4 shadow-2xl border border-slate-200 text-xs">
            <div className="flex items-center gap-2 text-red-600 font-bold text-sm">
              <XCircle className="w-5 h-5" />
              <span>Reject Return Request</span>
            </div>
            <p className="text-slate-600 text-[11px]">
              You must provide a clear and valid reason for rejecting this customer return claim. This will be visible to the customer and admin.
            </p>
            <div>
              <label className="font-bold text-slate-700 block mb-1">Mandatory Rejection Reason *</label>
              <textarea
                rows={3}
                placeholder="e.g. Item was delivered more than 7 days ago, product used or tags removed..."
                value={rejectionReason}
                onChange={(e) => setRejectionReason(e.target.value)}
                className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs focus:ring-2 focus:ring-red-400"
              />
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setRejectModalOpen(false)}
                className="px-4 py-2 bg-slate-100 text-slate-700 font-semibold rounded-xl"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={actionLoading || !rejectionReason.trim()}
                onClick={() => updateStatus('Return Rejected', rejectionReason)}
                className="px-4 py-2 bg-red-600 hover:bg-red-700 text-white font-bold rounded-xl disabled:opacity-50"
              >
                {actionLoading ? 'Rejecting...' : 'Confirm Rejection'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* REQUEST MORE INFO MODAL */}
      {infoModalOpen && (
        <div className="fixed inset-0 z-60 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-md w-full p-6 space-y-4 shadow-2xl border border-slate-200 text-xs">
            <div className="flex items-center gap-2 text-purple-700 font-bold text-sm">
              <HelpCircle className="w-5 h-5" />
              <span>Request Additional Information</span>
            </div>
            <p className="text-slate-600 text-[11px]">
              Ask the customer for additional photos, unboxing video, or specific details before making a decision.
            </p>
            <div>
              <label className="font-bold text-slate-700 block mb-1">Information Required *</label>
              <textarea
                rows={3}
                placeholder="e.g. Please share a clear photo of the garment tag and the defect area..."
                value={infoRequestText}
                onChange={(e) => setInfoRequestText(e.target.value)}
                className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs focus:ring-2 focus:ring-purple-400"
              />
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setInfoModalOpen(false)}
                className="px-4 py-2 bg-slate-100 text-slate-700 font-semibold rounded-xl"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={actionLoading || !infoRequestText.trim()}
                onClick={() => updateStatus('Additional Information Requested', '', infoRequestText)}
                className="px-4 py-2 bg-purple-600 hover:bg-purple-700 text-white font-bold rounded-xl disabled:opacity-50"
              >
                {actionLoading ? 'Sending...' : 'Send Request'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* REFUND MODAL */}
      {refundModalOpen && selectedReturn && (
        <div className="fixed inset-0 z-60 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
          <form onSubmit={handleProcessRefund} className="bg-white rounded-2xl max-w-md w-full p-6 space-y-4 shadow-2xl border border-slate-200 text-xs">
            <div className="flex items-center gap-2 text-green-700 font-bold text-sm">
              <CreditCard className="w-5 h-5" />
              <span>Issue / Record Refund</span>
            </div>
            <p className="text-slate-600 text-[11px]">
              Executing this will mark the refund as completed and reverse the vendor earnings for this order in your virtual wallet.
            </p>

            <div className="p-3 bg-slate-50 rounded-xl border border-slate-200">
              <span className="text-[10px] text-slate-400 uppercase font-bold block">Refund Amount</span>
              <span className="text-xl font-extrabold text-slate-900">₹{parseFloat(selectedReturn.refund_amount || 0).toLocaleString()}</span>
            </div>

            <div>
              <label className="font-bold text-slate-700 block mb-1">Refund Method</label>
              <select
                value={refundMethod}
                onChange={(e) => setRefundMethod(e.target.value)}
                className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs"
              >
                <option value="bank_transfer">Bank Transfer (NEFT/IMPS/RTGS)</option>
                <option value="upi">UPI Transfer</option>
                <option value="original_payment">Original Payment Gateway (Razorpay)</option>
                <option value="cash">Cash on Hand (COD Return)</option>
              </select>
            </div>

            <div>
              <label className="font-bold text-slate-700 block mb-1">Transaction Reference / UTR Number</label>
              <input
                type="text"
                placeholder="e.g. UTR123456789012 or Razorpay Refund ID"
                value={refundReference}
                onChange={(e) => setRefundReference(e.target.value)}
                className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-mono"
              />
            </div>

            <div>
              <label className="font-bold text-slate-700 block mb-1">Settlement Notes (Optional)</label>
              <input
                type="text"
                placeholder="Optional notes regarding refund settlement..."
                value={refundNotes}
                onChange={(e) => setRefundNotes(e.target.value)}
                className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs"
              />
            </div>

            <div className="flex justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setRefundModalOpen(false)}
                className="px-4 py-2 bg-slate-100 text-slate-700 font-semibold rounded-xl"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={actionLoading}
                className="px-4 py-2 bg-green-600 hover:bg-green-700 text-white font-bold rounded-xl shadow-2xs disabled:opacity-50"
              >
                {actionLoading ? 'Recording...' : 'Confirm & Complete Refund'}
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}

