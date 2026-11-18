import React, { useState } from 'react';
import { X, User, Phone, Mail, Hash, Calendar, ShoppingBag, Store, ArrowDownLeft, ArrowUpRight, CheckCircle2, Clock } from 'lucide-react';

export function ReferralDetailsDrawer({ isOpen, onClose, data, loading }) {
  const [activeTab, setActiveTab] = useState('customers'); // 'customers' | 'vendors' | 'transactions' | 'payouts'

  if (!isOpen) return null;

  const profile = data?.profile || {};
  const summary = data?.summary || {};
  const customers = data?.customers || [];
  const vendors = data?.vendors || [];
  const transactions = data?.transactions || [];
  const payouts = data?.payouts || [];

  return (
    <div className="fixed inset-0 z-50 overflow-hidden bg-black/40 backdrop-blur-sm flex justify-end animate-fade-in" onClick={onClose}>
      <div 
        className="w-full max-w-2xl bg-white h-full shadow-2xl flex flex-col overflow-hidden animate-slide-left"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="px-6 py-5 border-b border-gray-100 flex items-center justify-between bg-gradient-to-r from-gray-50 to-white">
          <div>
            <div className="flex items-center gap-2.5">
              <h2 className="text-lg font-bold text-gray-900">Referral Details</h2>
              {profile.referral_code && (
                <span className="px-2.5 py-0.5 rounded-full text-xs font-bold bg-blue-100 text-blue-800">
                  {profile.referral_code}
                </span>
              )}
            </div>
            <p className="text-xs text-gray-500 mt-0.5">Comprehensive real-time referral ledger & relationships</p>
          </div>
          <button 
            onClick={onClose} 
            className="p-2 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-xl transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Scrollable Body */}
        <div className="flex-1 overflow-y-auto p-6 space-y-6">
          {loading ? (
            <div className="py-20 text-center text-gray-400">Loading referral records...</div>
          ) : (
            <>
              {/* Profile Card */}
              <div className="p-5 rounded-2xl bg-gradient-to-br from-gray-50 via-white to-gray-50 border border-gray-100 shadow-sm">
                <div className="flex items-start justify-between gap-4">
                  <div className="flex items-center gap-3.5">
                    <div className="w-12 h-12 rounded-xl bg-[#012980]/10 text-[#012980] flex items-center justify-center font-bold text-lg shrink-0">
                      {(profile.name || 'U')[0].toUpperCase()}
                    </div>
                    <div>
                      <h3 className="font-bold text-gray-900 text-base">{profile.name || 'Unnamed Referrer'}</h3>
                      {profile.store_name && (
                        <p className="text-xs text-amber-700 font-semibold flex items-center gap-1 mt-0.5">
                          <Store className="w-3.5 h-3.5" /> {profile.store_name}
                        </p>
                      )}
                      <div className="flex flex-wrap items-center gap-3 mt-1.5 text-xs text-gray-500">
                        {profile.phone && (
                          <span className="flex items-center gap-1"><Phone className="w-3 h-3 text-gray-400" /> {profile.phone}</span>
                        )}
                        {profile.email && (
                          <span className="flex items-center gap-1"><Mail className="w-3 h-3 text-gray-400" /> {profile.email}</span>
                        )}
                      </div>
                    </div>
                  </div>
                  <span className={`px-2.5 py-1 rounded-full text-xs font-bold uppercase tracking-wider ${
                    profile.status === 'Active' || profile.status === 'approved' ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-600'
                  }`}>
                    {profile.status || 'Active'}
                  </span>
                </div>

                <div className="mt-4 pt-4 border-t border-gray-100/80 flex items-center justify-between text-xs text-gray-500">
                  <span>Joined: {profile.joining_date ? new Date(profile.joining_date).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' }) : '—'}</span>
                  <span className="capitalize font-semibold text-gray-700">{profile.account_type || 'Customer'} Account</span>
                </div>
              </div>

              {/* Stat Pills */}
              <div className="grid grid-cols-3 gap-3">
                <div className="p-3.5 rounded-xl bg-purple-50/70 border border-purple-100/60">
                  <p className="text-xs font-semibold text-purple-600 uppercase tracking-wider">Total Earned</p>
                  <p className="text-lg font-bold text-purple-950 mt-1">₹{summary.total_earned?.toLocaleString() || '0'}</p>
                </div>
                <div className="p-3.5 rounded-xl bg-emerald-50/70 border border-emerald-100/60">
                  <p className="text-xs font-semibold text-emerald-600 uppercase tracking-wider">Credited to Bank</p>
                  <p className="text-lg font-bold text-emerald-950 mt-1">₹{summary.total_credited?.toLocaleString() || '0'}</p>
                </div>
                <div className="p-3.5 rounded-xl bg-amber-50/70 border border-amber-100/60">
                  <p className="text-xs font-semibold text-amber-600 uppercase tracking-wider">Current Balance</p>
                  <p className="text-lg font-bold text-amber-950 mt-1">₹{summary.available_balance?.toLocaleString() || '0'}</p>
                </div>
              </div>

              {/* Sub-tabs */}
              <div className="border-b border-gray-100 flex gap-4 text-xs font-semibold">
                <button
                  onClick={() => setActiveTab('customers')}
                  className={`pb-2.5 transition-colors relative ${activeTab === 'customers' ? 'text-[#012980] border-b-2 border-[#012980]' : 'text-gray-400 hover:text-gray-600'}`}
                >
                  Customers ({customers.length})
                </button>
                <button
                  onClick={() => setActiveTab('vendors')}
                  className={`pb-2.5 transition-colors relative ${activeTab === 'vendors' ? 'text-[#012980] border-b-2 border-[#012980]' : 'text-gray-400 hover:text-gray-600'}`}
                >
                  Vendors ({vendors.length})
                </button>
                <button
                  onClick={() => setActiveTab('transactions')}
                  className={`pb-2.5 transition-colors relative ${activeTab === 'transactions' ? 'text-[#012980] border-b-2 border-[#012980]' : 'text-gray-400 hover:text-gray-600'}`}
                >
                  Transactions ({transactions.length})
                </button>
                <button
                  onClick={() => setActiveTab('payouts')}
                  className={`pb-2.5 transition-colors relative ${activeTab === 'payouts' ? 'text-[#012980] border-b-2 border-[#012980]' : 'text-gray-400 hover:text-gray-600'}`}
                >
                  Payout History ({payouts.length})
                </button>
              </div>

              {/* Sub-tab Content */}
              <div>
                {/* 1. Customers List */}
                {activeTab === 'customers' && (
                  <div>
                    {customers.length === 0 ? (
                      <p className="py-8 text-center text-xs text-gray-400">No customers have joined using this referral code yet.</p>
                    ) : (
                      <div className="divide-y divide-gray-100 border border-gray-100 rounded-xl overflow-hidden">
                        {customers.map((c, i) => (
                          <div key={c.id || i} className="p-3.5 hover:bg-gray-50 flex items-center justify-between text-xs">
                            <div>
                              <p className="font-bold text-gray-900">{c.name || 'Unnamed User'}</p>
                              <p className="text-gray-500 mt-0.5">{c.phone || c.email || '—'}</p>
                            </div>
                            <div className="text-right">
                              <span className="px-2 py-0.5 bg-blue-50 text-blue-700 font-semibold rounded-md">
                                {c.total_orders || 0} Orders
                              </span>
                              <p className="text-[11px] text-gray-400 mt-1">
                                {c.join_date ? new Date(c.join_date).toLocaleDateString() : '—'}
                              </p>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}

                {/* 2. Vendors List */}
                {activeTab === 'vendors' && (
                  <div>
                    {vendors.length === 0 ? (
                      <p className="py-8 text-center text-xs text-gray-400">No vendors have registered using this referral code yet.</p>
                    ) : (
                      <div className="divide-y divide-gray-100 border border-gray-100 rounded-xl overflow-hidden">
                        {vendors.map((v, i) => (
                          <div key={v.id || i} className="p-3.5 hover:bg-gray-50 flex items-center justify-between text-xs">
                            <div>
                              <p className="font-bold text-gray-900">{v.name || 'Unnamed Vendor'}</p>
                              {v.store_name && <p className="text-amber-700 font-semibold mt-0.5">{v.store_name}</p>}
                              <p className="text-gray-500 mt-0.5">{v.phone || v.email || '—'}</p>
                            </div>
                            <div className="text-right">
                              <span className="px-2 py-0.5 bg-green-50 text-green-700 font-semibold rounded-md capitalize">
                                {v.status || 'Pending'}
                              </span>
                              <p className="text-[11px] text-gray-400 mt-1">
                                {v.join_date ? new Date(v.join_date).toLocaleDateString() : '—'}
                              </p>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}

                {/* 3. Transaction History */}
                {activeTab === 'transactions' && (
                  <div>
                    {transactions.length === 0 ? (
                      <p className="py-8 text-center text-xs text-gray-400">No referral transactions recorded yet.</p>
                    ) : (
                      <div className="divide-y divide-gray-100 border border-gray-100 rounded-xl overflow-hidden">
                        {transactions.map((t, i) => (
                          <div key={i} className="p-3.5 hover:bg-gray-50 flex items-center justify-between text-xs">
                            <div className="flex items-center gap-3">
                              <div className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 ${
                                t.type === 'Earned' ? 'bg-emerald-50 text-emerald-600' : 'bg-red-50 text-red-600'
                              }`}>
                                {t.type === 'Earned' ? <ArrowDownLeft className="w-4 h-4" /> : <ArrowUpRight className="w-4 h-4" />}
                              </div>
                              <div>
                                <p className="font-bold text-gray-900">{t.description || t.type}</p>
                                <p className="text-[11px] text-gray-400 mt-0.5">
                                  {t.date ? new Date(t.date).toLocaleString('en-IN') : '—'}
                                  {t.reference_id && ` • Ref: ${t.reference_id}`}
                                </p>
                              </div>
                            </div>
                            <div className="text-right">
                              <p className={`font-bold ${t.type === 'Earned' ? 'text-emerald-700' : 'text-gray-900'}`}>
                                {t.type === 'Earned' ? '+' : '-'}₹{t.amount.toLocaleString()}
                              </p>
                              {t.percentage_applied && (
                                <span className="text-[10px] bg-purple-50 text-purple-700 px-1.5 py-0.5 rounded font-bold">
                                  {t.percentage_applied} applied
                                </span>
                              )}
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}

                {/* 4. Payouts */}
                {activeTab === 'payouts' && (
                  <div>
                    {payouts.length === 0 ? (
                      <p className="py-8 text-center text-xs text-gray-400">No payout requests submitted by this referrer.</p>
                    ) : (
                      <div className="divide-y divide-gray-100 border border-gray-100 rounded-xl overflow-hidden">
                        {payouts.map((p, i) => (
                          <div key={p.id || i} className="p-3.5 hover:bg-gray-50 flex items-center justify-between text-xs">
                            <div>
                              <p className="font-bold text-gray-900">{p.payout_id}</p>
                              <p className="text-[11px] text-gray-400 mt-0.5">
                                {p.created_at ? new Date(p.created_at).toLocaleString('en-IN') : '—'}
                              </p>
                              {p.bank_details?.bank_name && (
                                <p className="text-[11px] text-gray-600 mt-0.5">
                                  {p.bank_details.bank_name} • A/C: {p.bank_details.account_number}
                                </p>
                              )}
                            </div>
                            <div className="text-right">
                              <p className="font-bold text-gray-900">₹{parseFloat(p.amount).toLocaleString()}</p>
                              <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold uppercase mt-1 inline-block ${
                                p.status === 'paid' ? 'bg-green-100 text-green-700' :
                                p.status === 'pending' ? 'bg-yellow-100 text-yellow-700' : 'bg-red-100 text-red-700'
                              }`}>
                                {p.status}
                              </span>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </div>
            </>
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-gray-100 bg-gray-50 flex justify-end">
          <button
            onClick={onClose}
            className="px-5 py-2 bg-gray-900 text-white rounded-xl text-xs font-semibold hover:bg-gray-800 transition-colors"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
}

