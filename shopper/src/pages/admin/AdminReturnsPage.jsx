import React, { useState, useEffect } from 'react';
import { 
  RotateCcw, Search, Filter, Clock, CheckCircle2,
  MessageSquare, Send, Eye, ShieldCheck,
  Store, Building, Lock, Unlock, Copy, Check, FileCheck
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
  'Return Received': 'bg-teal-50 text-teal-700 border-teal-200',
  'Product Received': 'bg-teal-50 text-teal-700 border-teal-200',
  'Refund Processing': 'bg-sky-50 text-sky-700 border-sky-200 animate-pulse font-bold',
  'Refund Initiated': 'bg-sky-50 text-sky-700 border-sky-200',
  'Refund Completed': 'bg-green-100 text-green-800 border-green-300 font-bold',
  'Appeal Raised': 'bg-orange-100 text-orange-800 border-orange-300 animate-pulse font-bold',
  'Closed': 'bg-slate-100 text-slate-600 border-slate-200',
};

const WORKFLOW_STATUSES = [
  'Return Requested',
  'Return Approved',
  'Return Rejected',
  'Return Shipped',
  'Return Received',
  'Refund Processing',
  'Refund Completed',
  'Closed'
];

export function AdminReturnsPage() {
  const [returns, setReturns] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState('ALL');
  const [vendorFilter, setVendorFilter] = useState('ALL');

  // Detail Modal
  const [selectedReturn, setSelectedReturn] = useState(null);
  const [messages, setMessages] = useState([]);
  const [statusHistory, setStatusHistory] = useState([]);
  const [adminMessage, setAdminMessage] = useState('');
  const [sendingMessage, setSendingMessage] = useState(false);
  const [actionLoading, setActionLoading] = useState(false);

  // Unmask Bank Details
  const [revealedBankDetails, setRevealedBankDetails] = useState(null);
  const [revealingBank, setRevealingBank] = useState(false);
  const [copiedAccount, setCopiedAccount] = useState(false);

  // Status & Refund Management Modal
  const [statusModalOpen, setStatusModalOpen] = useState(false);
  const [newStatus, setNewStatus] = useState('Return Approved');
  const [approvedRefundAmount, setApprovedRefundAmount] = useState('');
  const [refundAmount, setRefundAmount] = useState('');
  const [refundUtr, setRefundUtr] = useState('');
  const [refundDate, setRefundDate] = useState(new Date().toISOString().split('T')[0]);
  const [rejectionReason, setRejectionReason] = useState('');
  const [adminNotes, setAdminNotes] = useState('');
  const [adminRemarks, setAdminRemarks] = useState('');
  const [updatingStatus, setUpdatingStatus] = useState(false);

  // Dispute Decision Modal
  const [disputeModalOpen, setDisputeModalOpen] = useState(false);
  const [disputeDecision, setDisputeDecision] = useState('uphold');

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
    } catch {
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
    setRevealedBankDetails(null);
    setCopiedAccount(false);
    try {
      const token = localStorage.getItem('token');
      const res = await fetch(`${BACKEND_URL}/returns/admin/${ret.id}`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (res.ok) {
        const data = await res.json();
        setSelectedReturn(data.returnRequest);
        setMessages(data.messages || []);
        setStatusHistory(data.history || []);
      }
    } catch (err) {
      console.warn('Failed to load return details', err);
    }
  };

  const handleRevealBankDetails = async () => {
    if (!selectedReturn) return;
    setRevealingBank(true);
    try {
      const token = localStorage.getItem('token');
      const res = await fetch(`${BACKEND_URL}/returns/admin/${selectedReturn.id}/reveal-bank-details`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ reason: 'Admin processing return refund' })
      });
      const data = await res.json();
      if (res.ok && data.bankDetails) {
        setRevealedBankDetails(data.bankDetails);
        toast.success('Bank details unmasked and logged for audit.');
      } else {
        toast.error(data.error || 'Failed to reveal bank details');
      }
    } catch {
      toast.error('Failed to communicate with server');
    } finally {
      setRevealingBank(false);
    }
  };

  const copyToClipboard = (text) => {
    if (!text) return;
    navigator.clipboard.writeText(text);
    setCopiedAccount(true);
    toast.success('Account number copied to clipboard');
    setTimeout(() => setCopiedAccount(false), 2000);
  };

  const openStatusModal = (prefillStatus = null) => {
    if (!selectedReturn) return;
    const initialStatus = prefillStatus || selectedReturn.status;
    setNewStatus(initialStatus);
    setApprovedRefundAmount(selectedReturn.approved_refund_amount || selectedReturn.refund_amount || '');
    setRefundAmount(selectedReturn.refund_amount || selectedReturn.approved_refund_amount || '');
    setRefundUtr(selectedReturn.refund_utr || '');
    setRefundDate(selectedReturn.refund_transfer_date ? new Date(selectedReturn.refund_transfer_date).toISOString().split('T')[0] : new Date().toISOString().split('T')[0]);
    setRejectionReason(selectedReturn.rejection_reason || '');
    setAdminNotes(selectedReturn.admin_notes || '');
    setAdminRemarks(selectedReturn.admin_remarks || '');
    setStatusModalOpen(true);
  };

  const handleUpdateStatus = async (e) => {
    e.preventDefault();
    if (!selectedReturn) return;

    if (newStatus === 'Return Rejected' && !rejectionReason.trim()) {
      return toast.error('A mandatory rejection reason is required to reject a return.');
    }
    if (newStatus === 'Refund Completed' && !refundUtr.trim()) {
      return toast.error('Bank transfer reference / UTR number is mandatory to record a completed refund.');
    }

    setUpdatingStatus(true);
    try {
      const token = localStorage.getItem('token');
      const payload = {
        status: newStatus,
        rejection_reason: rejectionReason.trim(),
        admin_notes: adminNotes.trim(),
        admin_remarks: adminRemarks.trim(),
        approved_refund_amount: approvedRefundAmount ? parseFloat(approvedRefundAmount) : undefined,
        refund_amount: refundAmount ? parseFloat(refundAmount) : undefined,
        refund_utr: refundUtr.trim(),
        refund_transfer_date: refundDate
      };

      const res = await fetch(`${BACKEND_URL}/returns/admin/${selectedReturn.id}/status`, {
        method: 'PUT',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(payload)
      });

      const data = await res.json();
      if (res.ok && data.returnRequest) {
        toast.success(`Status updated to: ${newStatus}`);
        setSelectedReturn(data.returnRequest);
        setStatusModalOpen(false);
        await fetchReturns();
        // Refresh details
        openReturnDetails(data.returnRequest);
      } else {
        toast.error(data.error || 'Failed to update status');
      }
    } catch {
      toast.error('Failed to communicate with server');
    } finally {
      setUpdatingStatus(false);
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
    } catch {
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
        openReturnDetails(data.returnRequest);
      } else {
        toast.error(data.error || 'Failed to record dispute decision');
      }
    } catch {
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
      (r.reason && String(r.reason).toLowerCase().includes(term)) ||
      (r.refund_utr && String(r.refund_utr).toLowerCase().includes(term));
    return matchesStatus && matchesVendor && matchesSearch;
  });

  return (
    <div className="p-4 sm:p-6 lg:p-8 space-y-6 max-w-7xl mx-auto font-sans text-slate-800">
      {/* Page Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-200 pb-5">
        <div>
          <h1 className="text-2xl sm:text-3xl font-extrabold text-[#036e26] flex items-center gap-2.5">
            <RotateCcw className="w-7 h-7 text-[#036e26]" />
            <span>Returns & Refund Management</span>
          </h1>
          <p className="text-xs sm:text-sm text-slate-500 mt-1">
            Review customer return requests, inspect securely encrypted bank details, record approved refund amounts, and confirm bank transfer references (UTR).
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
        <div className="bg-white p-4 rounded-xl border border-amber-200 shadow-2xs bg-amber-50/20">
          <span className="text-[10px] font-bold text-amber-700 uppercase tracking-wider block">Pending Review</span>
          <span className="text-2xl font-black text-amber-700 block mt-1">
            {returns.filter(r => ['Return Requested', 'Under Vendor Review'].includes(r.status)).length}
          </span>
        </div>
        <div className="bg-white p-4 rounded-xl border border-emerald-200 shadow-2xs bg-emerald-50/20">
          <span className="text-[10px] font-bold text-emerald-700 uppercase tracking-wider block">Approved / Transit</span>
          <span className="text-2xl font-black text-emerald-700 block mt-1">
            {returns.filter(r => ['Return Approved', 'Return Shipped', 'Return Received', 'Product Received'].includes(r.status)).length}
          </span>
        </div>
        <div className="bg-white p-4 rounded-xl border border-sky-200 shadow-2xs bg-sky-50/30">
          <span className="text-[10px] font-bold text-sky-700 uppercase tracking-wider block flex items-center gap-1">
            <Clock className="w-3 h-3 text-sky-600" /> Refund Processing
          </span>
          <span className="text-2xl font-black text-sky-700 block mt-1">
            {returns.filter(r => r.status === 'Refund Processing').length}
          </span>
        </div>
        <div className="bg-white p-4 rounded-xl border border-green-200 shadow-2xs bg-green-50/20 col-span-2 sm:col-span-1">
          <span className="text-[10px] font-bold text-green-700 uppercase tracking-wider block">Refunds Completed</span>
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
            placeholder="Search by order ID, vendor, customer, UTR..."
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
              <option value="ALL">All Stores</option>
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
              <option value="ALL">All Statuses</option>
              {WORKFLOW_STATUSES.map(s => (
                <option key={s} value={s}>{s}</option>
              ))}
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
                  <th className="py-3 px-4">Customer & Bank</th>
                  <th className="py-3 px-4">Vendor Store</th>
                  <th className="py-3 px-4">Reason</th>
                  <th className="py-3 px-4">Approved Refund</th>
                  <th className="py-3 px-4">Status / UTR</th>
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
                      <span className="font-semibold text-slate-900 block">{ret.customer_name}</span>
                      <span className="text-[10px] text-slate-500 flex items-center gap-1 font-mono">
                        <Building className="w-3 h-3 text-slate-400" />
                        {ret.bank_name || 'Bank'}: {ret.bank_account_masked || (ret.bank_account_last4 ? `••••${ret.bank_account_last4}` : 'None')}
                      </span>
                    </td>
                    <td className="py-3.5 px-4">
                      <span className="font-semibold text-slate-900 block">{ret.store_name}</span>
                      <span className="text-[10px] text-slate-400">{ret.vendor_email}</span>
                    </td>
                    <td className="py-3.5 px-4">
                      <span className="font-semibold text-slate-800 block">{ret.reason}</span>
                      <span className="text-[10px] text-slate-400 line-clamp-1 max-w-[150px]">{ret.description}</span>
                    </td>
                    <td className="py-3.5 px-4 font-bold text-slate-900 font-mono">
                      ₹{parseFloat(ret.approved_refund_amount || ret.refund_amount || 0).toLocaleString()}
                    </td>
                    <td className="py-3.5 px-4">
                      <span className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-bold border ${STATUS_BADGES[ret.status] || 'bg-slate-100 text-slate-600 border-slate-200'}`}>
                        {ret.status}
                      </span>
                      {ret.refund_utr && (
                        <span className="block text-[10px] font-mono text-emerald-700 mt-0.5">
                          UTR: {ret.refund_utr}
                        </span>
                      )}
                    </td>
                    <td className="py-3.5 px-4 text-right">
                      <button
                        onClick={() => openReturnDetails(ret)}
                        className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold text-[#036e26] bg-green-50 hover:bg-green-100 border border-[#036e26]/20 rounded-lg transition-colors"
                      >
                        <Eye className="w-3.5 h-3.5" />
                        <span>Inspect & Manage</span>
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
                  <p className="text-[11px] text-slate-500">Order: <span className="font-mono font-bold text-slate-700">{selectedReturn.order_number}</span> • Customer: <span className="font-bold text-slate-700">{selectedReturn.customer_name}</span></p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => openStatusModal()}
                  className="px-3.5 py-1.5 bg-[#036e26] hover:bg-[#02541d] text-white font-bold rounded-xl flex items-center gap-1.5 shadow-2xs transition"
                >
                  <FileCheck className="w-3.5 h-3.5" />
                  <span>Update Status / Refund</span>
                </button>
                <button
                  onClick={() => setSelectedReturn(null)}
                  className="text-slate-400 hover:text-slate-600 p-2 rounded-lg hover:bg-slate-200 text-base font-bold"
                >
                  ✕
                </button>
              </div>
            </div>

            {/* Modal Body */}
            <div className="flex-1 overflow-y-auto p-6 space-y-6">
              {/* STATUS ACTION BANNER */}
              <div className="p-4 bg-slate-50 border border-slate-200 rounded-xl flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
                <div>
                  <span className="font-bold text-slate-900 block text-xs">Current Return & Refund Status: {selectedReturn.status}</span>
                  <span className="text-[11px] text-slate-500">
                    Eligible Refund Amount: <strong className="text-slate-800 font-mono">₹{parseFloat(selectedReturn.max_refundable_amount || selectedReturn.refund_amount || 0).toLocaleString()}</strong>
                    {selectedReturn.approved_refund_amount && (
                      <span> • Approved Refund: <strong className="text-emerald-700 font-mono">₹{parseFloat(selectedReturn.approved_refund_amount).toLocaleString()}</strong></span>
                    )}
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => openStatusModal('Return Approved')}
                    className="px-3 py-1.5 bg-emerald-700 hover:bg-emerald-800 text-white font-bold rounded-lg text-[11px] shadow-2xs"
                  >
                    Approve
                  </button>
                  <button
                    onClick={() => openStatusModal('Return Rejected')}
                    className="px-3 py-1.5 bg-rose-700 hover:bg-rose-800 text-white font-bold rounded-lg text-[11px] shadow-2xs"
                  >
                    Reject
                  </button>
                  <button
                    onClick={() => openStatusModal('Refund Completed')}
                    className="px-3 py-1.5 bg-[#012980] hover:bg-[#001d5a] text-white font-bold rounded-lg text-[11px] shadow-2xs"
                  >
                    Record Bank Payout
                  </button>
                </div>
              </div>

              {/* Bank Details Card (Encrypted & Masked with Unmask Access) */}
              <div className="bg-slate-50 border border-slate-200 rounded-xl p-4 space-y-3">
                <div className="flex items-center justify-between pb-2 border-b border-slate-200">
                  <div className="flex items-center gap-2">
                    <Building className="w-4 h-4 text-[#036e26]" />
                    <span className="font-bold text-slate-900 text-xs">Customer Bank Account for Refund</span>
                    <span className="text-[10px] font-semibold text-emerald-800 bg-emerald-50 border border-emerald-200 px-2 py-0.5 rounded-full flex items-center gap-1">
                      <ShieldCheck className="w-3 h-3 text-emerald-600" /> AES-256-GCM Encrypted
                    </span>
                  </div>
                  {!revealedBankDetails ? (
                    <button
                      onClick={handleRevealBankDetails}
                      disabled={revealingBank}
                      className="px-3 py-1 bg-white hover:bg-slate-100 border border-slate-300 text-slate-700 font-bold rounded-lg text-[11px] flex items-center gap-1.5 transition shadow-2xs"
                    >
                      <Lock className="w-3 h-3 text-slate-500" />
                      <span>{revealingBank ? 'Decrypting...' : 'Reveal Full Account'}</span>
                    </button>
                  ) : (
                    <span className="text-[10px] font-bold text-emerald-700 bg-emerald-50 border border-emerald-200 px-2 py-0.5 rounded-full flex items-center gap-1">
                      <Unlock className="w-3 h-3 text-emerald-600" /> Access Logged
                    </span>
                  )}
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-4 gap-3 text-[11px]">
                  <div>
                    <span className="text-slate-400 block text-[10px]">Account Holder</span>
                    <span className="font-bold text-slate-800">{selectedReturn.bank_holder_name || 'N/A'}</span>
                  </div>
                  <div>
                    <span className="text-slate-400 block text-[10px]">Bank Name</span>
                    <span className="font-bold text-slate-800">{selectedReturn.bank_name || 'Bank'}</span>
                  </div>
                  <div>
                    <span className="text-slate-400 block text-[10px]">IFSC Code</span>
                    <span className="font-mono font-bold text-slate-900 uppercase">{selectedReturn.bank_ifsc || 'N/A'}</span>
                  </div>
                  <div>
                    <span className="text-slate-400 block text-[10px]">Account Number</span>
                    {revealedBankDetails ? (
                      <div className="flex items-center gap-1.5">
                        <span className="font-mono font-bold text-emerald-800 bg-emerald-100/60 px-2 py-0.5 rounded text-xs select-all">
                          {revealedBankDetails.account_number}
                        </span>
                        <button
                          onClick={() => copyToClipboard(revealedBankDetails.account_number)}
                          className="p-1 hover:bg-slate-200 rounded text-slate-600"
                          title="Copy account number"
                        >
                          {copiedAccount ? <Check className="w-3 h-3 text-emerald-600" /> : <Copy className="w-3 h-3" />}
                        </button>
                      </div>
                    ) : (
                      <span className="font-mono font-bold text-slate-700 tracking-wider">
                        {selectedReturn.bank_account_masked || (selectedReturn.bank_account_last4 ? `••••••••${selectedReturn.bank_account_last4}` : '••••••••')}
                      </span>
                    )}
                  </div>
                </div>

                {revealedBankDetails && (
                  <p className="text-[10px] text-slate-400 italic pt-1">
                    Decrypted at {new Date(revealedBankDetails.accessed_at).toLocaleTimeString()}. This unmask action has been logged into the compliance security audit trail.
                  </p>
                )}
              </div>

              {/* Refund Summary if Completed */}
              {selectedReturn.status === 'Refund Completed' && (
                <div className="p-4 bg-green-50 border border-green-200 rounded-xl text-green-950 space-y-2">
                  <div className="flex items-center gap-2 font-bold text-xs text-green-900">
                    <CheckCircle2 className="w-4 h-4 text-green-600" />
                    <span>Refund Payment Successfully Recorded & Settled</span>
                  </div>
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 p-3 bg-white/90 rounded-lg border border-green-200 text-[11px]">
                    <div>
                      <span className="text-slate-400 block text-[10px]">Settled Amount</span>
                      <span className="font-bold text-green-700 text-sm font-mono">₹{parseFloat(selectedReturn.refund_amount || 0).toLocaleString()}</span>
                    </div>
                    <div>
                      <span className="text-slate-400 block text-[10px]">Bank Reference / UTR</span>
                      <span className="font-mono font-bold text-slate-900 bg-green-100 px-1.5 py-0.5 rounded">{selectedReturn.refund_utr || selectedReturn.refund_reference || 'N/A'}</span>
                    </div>
                    <div>
                      <span className="text-slate-400 block text-[10px]">Payment Method</span>
                      <span className="font-semibold text-slate-800">{selectedReturn.refund_method || 'Bank Transfer (Manual)'}</span>
                    </div>
                    <div>
                      <span className="text-slate-400 block text-[10px]">Transfer Date</span>
                      <span className="font-semibold text-slate-800">{selectedReturn.refund_transfer_date ? new Date(selectedReturn.refund_transfer_date).toLocaleDateString() : (selectedReturn.refunded_at ? new Date(selectedReturn.refunded_at).toLocaleDateString() : 'N/A')}</span>
                    </div>
                  </div>
                  {selectedReturn.admin_remarks && (
                    <p className="text-[11px] text-green-800">
                      <strong>Remarks:</strong> {selectedReturn.admin_remarks}
                    </p>
                  )}
                </div>
              )}

              {/* Status Specific Highlights */}
              {selectedReturn.status === 'Return Rejected' && (
                <div className="p-3 bg-red-50 border border-red-200 rounded-xl text-red-900 text-[11px]">
                  <span className="font-bold block">Rejection Justification:</span>
                  <p className="mt-0.5">{selectedReturn.rejection_reason}</p>
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
                      <span className="text-slate-400 block text-[10px]">Max Refundable</span>
                      <span className="font-bold text-emerald-700 font-mono text-sm">₹{parseFloat(selectedReturn.max_refundable_amount || selectedReturn.refund_amount || 0).toLocaleString()}</span>
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
                      } catch {}
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
                } catch {}
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

              {/* Audit History Timeline */}
              {statusHistory && statusHistory.length > 0 && (
                <div className="bg-white p-4 rounded-xl border border-slate-200 space-y-2">
                  <span className="font-bold text-slate-900 text-xs flex items-center gap-1.5 border-b border-slate-100 pb-2">
                    <Clock className="w-4 h-4 text-slate-500" /> Status Audit History Trail ({statusHistory.length})
                  </span>
                  <div className="space-y-2 pt-1 max-h-48 overflow-y-auto">
                    {statusHistory.map((h, i) => (
                      <div key={i} className="flex items-start gap-2.5 text-[11px] p-2 bg-slate-50 rounded-lg border border-slate-100">
                        <div className="w-2 h-2 rounded-full bg-[#036e26] mt-1.5 shrink-0" />
                        <div className="flex-1">
                          <div className="flex items-center justify-between">
                            <span className="font-bold text-slate-900">
                              {h.from_status ? `${h.from_status} → ${h.to_status}` : h.to_status}
                            </span>
                            <span className="text-[10px] text-slate-400">
                              {new Date(h.created_at).toLocaleString()}
                            </span>
                          </div>
                          <p className="text-slate-600 text-[10px] mt-0.5">
                            By <strong className="capitalize">{h.changed_by_name || h.changed_by_type}</strong>: {h.notes || 'Status updated'}
                          </p>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

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
            <div className="px-6 py-3 border-t border-slate-200 bg-slate-50 flex items-center justify-between">
              <button
                onClick={() => openStatusModal()}
                className="px-4 py-2 bg-[#036e26] hover:bg-[#02541d] text-white font-bold rounded-xl flex items-center gap-1.5 shadow-2xs text-xs"
              >
                <FileCheck className="w-3.5 h-3.5" />
                <span>Update Return Status / Refund</span>
              </button>
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

      {/* STATUS & REFUND MANAGEMENT MODAL */}
      {statusModalOpen && selectedReturn && (
        <div className="fixed inset-0 z-60 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
          <form onSubmit={handleUpdateStatus} className="bg-white rounded-2xl max-w-lg w-full p-6 space-y-4 shadow-2xl border border-slate-200 text-xs max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between border-b border-slate-200 pb-3">
              <div className="flex items-center gap-2 text-slate-900 font-bold text-sm">
                <FileCheck className="w-5 h-5 text-[#036e26]" />
                <span>Admin Return & Refund Management</span>
              </div>
              <button type="button" onClick={() => setStatusModalOpen(false)} className="text-slate-400 hover:text-slate-600 text-base font-bold">✕</button>
            </div>

            <div>
              <label className="font-bold text-slate-700 block mb-1">Target Workflow Status *</label>
              <select
                value={newStatus}
                onChange={(e) => setNewStatus(e.target.value)}
                className="w-full p-2.5 bg-slate-50 border border-slate-300 rounded-xl font-bold text-slate-800"
              >
                {WORKFLOW_STATUSES.map(st => (
                  <option key={st} value={st}>{st}</option>
                ))}
              </select>
            </div>

            {/* Approved Refund Amount (when Approving) */}
            {['Return Approved', 'Refund Processing', 'Refund Completed'].includes(newStatus) && (
              <div>
                <label className="font-bold text-slate-700 block mb-1">Approved Refund Amount (₹) *</label>
                <input
                  type="number"
                  step="0.01"
                  placeholder="Approved amount"
                  value={approvedRefundAmount}
                  onChange={(e) => setApprovedRefundAmount(e.target.value)}
                  className="w-full p-2.5 bg-slate-50 border border-slate-300 rounded-xl font-mono font-bold"
                  required
                />
                <span className="text-[10px] text-slate-500 mt-1 block">
                  Eligible refundable limit: ₹{parseFloat(selectedReturn.max_refundable_amount || selectedReturn.refund_amount || 0).toFixed(2)}
                </span>
              </div>
            )}

            {/* Mandatory Rejection Reason */}
            {newStatus === 'Return Rejected' && (
              <div>
                <label className="font-bold text-rose-700 block mb-1">Mandatory Rejection Reason *</label>
                <textarea
                  rows={3}
                  placeholder="Explain why this return request is being rejected..."
                  value={rejectionReason}
                  onChange={(e) => setRejectionReason(e.target.value)}
                  className="w-full p-2.5 bg-rose-50/50 border border-rose-300 rounded-xl text-xs"
                  required
                />
              </div>
            )}

            {/* Refund Settlement Fields (when Refund Completed) */}
            {newStatus === 'Refund Completed' && (
              <div className="p-3 bg-emerald-50/60 border border-emerald-200 rounded-xl space-y-3">
                <span className="font-bold text-emerald-900 block text-xs">Record Manual Bank Transfer (NEFT / IMPS / RTGS)</span>

                <div>
                  <label className="font-bold text-slate-700 block mb-1">Settled Refund Amount (₹) *</label>
                  <input
                    type="number"
                    step="0.01"
                    placeholder="Amount credited to customer"
                    value={refundAmount}
                    onChange={(e) => setRefundAmount(e.target.value)}
                    className="w-full p-2.5 bg-white border border-slate-300 rounded-xl font-mono font-bold"
                    required
                  />
                </div>

                <div>
                  <label className="font-bold text-slate-700 block mb-1">Bank Transfer Reference / UTR Number *</label>
                  <input
                    type="text"
                    placeholder="e.g. UTR123456789012 or IMPS Reference"
                    value={refundUtr}
                    onChange={(e) => setRefundUtr(e.target.value)}
                    className="w-full p-2.5 bg-white border border-slate-300 rounded-xl font-mono uppercase"
                    required
                  />
                  <span className="text-[10px] text-slate-500 mt-1 block">
                    This reference will be visible to the customer in their order history and refund confirmation email.
                  </span>
                </div>

                <div>
                  <label className="font-bold text-slate-700 block mb-1">Bank Transfer Date *</label>
                  <input
                    type="date"
                    value={refundDate}
                    onChange={(e) => setRefundDate(e.target.value)}
                    className="w-full p-2.5 bg-white border border-slate-300 rounded-xl"
                    required
                  />
                </div>

                <div>
                  <label className="font-bold text-slate-700 block mb-1">Customer Remarks (Optional)</label>
                  <input
                    type="text"
                    placeholder="e.g. Credited via NEFT to SBI account"
                    value={adminRemarks}
                    onChange={(e) => setAdminRemarks(e.target.value)}
                    className="w-full p-2.5 bg-white border border-slate-300 rounded-xl"
                  />
                </div>
              </div>
            )}

            {/* Internal Admin Notes */}
            <div>
              <label className="font-bold text-slate-700 block mb-1">Internal Admin Notes</label>
              <textarea
                rows={2}
                placeholder="Internal audit observations, inspection details, or instructions..."
                value={adminNotes}
                onChange={(e) => setAdminNotes(e.target.value)}
                className="w-full p-2.5 bg-slate-50 border border-slate-300 rounded-xl"
              />
            </div>

            <div className="flex justify-end gap-2 pt-2 border-t border-slate-100">
              <button
                type="button"
                onClick={() => setStatusModalOpen(false)}
                className="px-4 py-2 bg-slate-100 text-slate-700 font-semibold rounded-xl"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={updatingStatus}
                className="px-5 py-2 bg-[#036e26] hover:bg-[#02541d] text-white font-bold rounded-xl shadow-2xs disabled:opacity-50"
              >
                {updatingStatus ? 'Updating...' : 'Save & Update Status'}
              </button>
            </div>
          </form>
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
