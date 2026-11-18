import React, { useState, useEffect } from "react";
import { 
  Users, Banknote, Search, Calendar, CheckCircle2, XCircle, Filter, 
  Percent, ArrowUpRight, ArrowDownLeft, Eye, Store, Wallet, DollarSign,
  UserPlus, UserCheck, RefreshCw, ChevronLeft, ChevronRight
} from "lucide-react";
import { toast } from "react-toastify";
import api from "../../utils/api";
import { ReferralDetailsDrawer } from "../../components/admin/ReferralDetailsDrawer";

export function AdminReferralPayoutsPage() {
  // Navigation / Views: 'dashboard' (Referrals) | 'payouts' (Bank Requests)
  const [activeMainTab, setActiveMainTab] = useState('dashboard');

  // Filters
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedMonth, setSelectedMonth] = useState("");
  const [selectedYear, setSelectedYear] = useState("");

  // Percentage Settings (loaded dynamically from database settings)
  const [customerPercent, setCustomerPercent] = useState("");
  const [vendorPercent, setVendorPercent] = useState("");
  const [isSavingSettings, setIsSavingSettings] = useState(false);

  // Dashboard Data
  const [stats, setStats] = useState({
    total_referrals: 0,
    customers_joined: 0,
    vendors_joined: 0,
    total_earned: 0,
    total_credited_to_bank: 0,
    current_balance: 0
  });
  const [referrals, setReferrals] = useState([]);
  const [isLoadingReferrals, setIsLoadingReferrals] = useState(true);

  // Drawer Details State
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [drawerData, setDrawerData] = useState(null);
  const [drawerLoading, setDrawerLoading] = useState(false);

  // Bank Payout Requests State
  const [payouts, setPayouts] = useState([]);
  const [payoutSearch, setPayoutSearch] = useState("");
  const [payoutStatusFilter, setPayoutStatusFilter] = useState("all");
  const [isLoadingPayouts, setIsLoadingPayouts] = useState(true);
  const [processingId, setProcessingId] = useState(null);

  // Pagination for Referrals Table
  const [currentPage, setCurrentPage] = useState(1);
  const itemsPerPage = 8;

  useEffect(() => {
    fetchReferralDashboard();
    fetchPayouts();
  }, [selectedMonth, selectedYear]);

  const fetchReferralDashboard = async () => {
    setIsLoadingReferrals(true);
    try {
      const params = {};
      if (searchTerm) params.search = searchTerm;
      if (selectedMonth) params.month = selectedMonth;
      if (selectedYear) params.year = selectedYear;

      const res = await api.get('/admin/referrals', { params });
      if (res.data) {
        if (res.data.settings) {
          if (res.data.settings.customer_referral_percent !== undefined) {
            setCustomerPercent(String(res.data.settings.customer_referral_percent));
          }
          if (res.data.settings.vendor_referral_percent !== undefined) {
            setVendorPercent(String(res.data.settings.vendor_referral_percent));
          }
        }
        if (res.data.stats) setStats(res.data.stats);
        if (Array.isArray(res.data.referrals)) setReferrals(res.data.referrals);
      }
    } catch (err) {
      console.error("Failed to load referral dashboard data", err);
      toast.error("Failed to load referral dashboard");
    } finally {
      setIsLoadingReferrals(false);
    }
  };

  const fetchPayouts = async () => {
    setIsLoadingPayouts(true);
    try {
      const res = await api.get('/admin/payouts');
      setPayouts(res.data || []);
    } catch (err) {
      console.error("Failed to fetch payouts", err);
      toast.error("Failed to load payout requests");
    } finally {
      setIsLoadingPayouts(false);
    }
  };

  const handleSavePercentages = async () => {
    const cNum = parseFloat(customerPercent);
    const vNum = parseFloat(vendorPercent);

    if (isNaN(cNum) || cNum < 0 || cNum > 100) {
      toast.error("Customer referral reward must be a percentage between 0 and 100");
      return;
    }
    if (isNaN(vNum) || vNum < 0 || vNum > 100) {
      toast.error("Vendor referral reward must be a percentage between 0 and 100");
      return;
    }

    setIsSavingSettings(true);
    try {
      await api.post('/admin/settings', { key: 'customer_referral_percent', value: cNum.toString() });
      await api.post('/admin/settings', { key: 'vendor_referral_percent', value: vNum.toString() });
      toast.success("Referral percentages saved persistently!");
      fetchReferralDashboard();
    } catch (err) {
      console.error("Error saving percentage settings", err);
      toast.error(err.response?.data?.error || "Failed to save settings");
    } finally {
      setIsSavingSettings(false);
    }
  };

  const handleOpenDetails = async (code) => {
    setDrawerOpen(true);
    setDrawerLoading(true);
    try {
      const res = await api.get(`/admin/referrals/${code}/details`);
      setDrawerData(res.data);
    } catch (err) {
      toast.error("Failed to load referrer details");
      setDrawerOpen(false);
    } finally {
      setDrawerLoading(false);
    }
  };

  const handlePayoutStatusUpdate = async (payoutId, newStatus) => {
    setProcessingId(payoutId);
    try {
      await api.put(`/admin/payouts/${payoutId}/status`, { status: newStatus });
      toast.success(`Payout ${payoutId} marked as ${newStatus}`);
      fetchPayouts();
      fetchReferralDashboard();
    } catch (err) {
      toast.error(err.response?.data?.error || "Failed to update payout status");
    } finally {
      setProcessingId(null);
    }
  };

  // Filtered referrals list for client-side instant search
  const filteredReferrals = referrals.filter(r => {
    const q = (searchTerm || '').toLowerCase().trim();
    if (!q) return true;
    return (
      (r.referral_id && String(r.referral_id).toLowerCase().includes(q)) ||
      (r.referrer_name && String(r.referrer_name).toLowerCase().includes(q)) ||
      (r.contact_number && String(r.contact_number).includes(q)) ||
      (r.store_name && String(r.store_name).toLowerCase().includes(q))
    );
  });

  const totalPages = Math.ceil(filteredReferrals.length / itemsPerPage) || 1;
  const paginatedReferrals = filteredReferrals.slice((currentPage - 1) * itemsPerPage, currentPage * itemsPerPage);

  // Filtered payouts list
  const filteredPayouts = payouts.filter(p => {
    const pSearch = (payoutSearch || '').toLowerCase().trim();
    const matchesSearch = !pSearch ||
      (p.payout_id && String(p.payout_id).toLowerCase().includes(pSearch)) ||
      (p.user_name && String(p.user_name).toLowerCase().includes(pSearch)) ||
      (p.user_email && String(p.user_email).toLowerCase().includes(pSearch));
    const matchesStatus = payoutStatusFilter === "all" || p.status === payoutStatusFilter;
    return matchesSearch && matchesStatus;
  });

  const months = [
    { num: "1", name: "January" }, { num: "2", name: "February" }, { num: "3", name: "March" },
    { num: "4", name: "April" }, { num: "5", name: "May" }, { num: "6", name: "June" },
    { num: "7", name: "July" }, { num: "8", name: "August" }, { num: "9", name: "September" },
    { num: "10", name: "October" }, { num: "11", name: "November" }, { num: "12", name: "December" },
  ];

  return (
    <div className="space-y-6">
      {/* Top Title & View Switcher */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 tracking-tight">Referral Management</h1>
          <p className="text-sm text-gray-500 mt-0.5">Configure reward percentages, track referrals, and process withdrawals.</p>
        </div>

        {/* Navigation Tabs */}
        <div className="flex items-center bg-gray-100 p-1 rounded-xl self-start sm:self-auto border border-gray-200/60">
          <button
            onClick={() => setActiveMainTab('dashboard')}
            className={`px-4 py-1.5 rounded-lg text-xs font-bold transition-all ${
              activeMainTab === 'dashboard' 
                ? 'bg-white text-gray-900 shadow-sm' 
                : 'text-gray-600 hover:text-gray-900'
            }`}
          >
            Referral Dashboard
          </button>
          <button
            onClick={() => setActiveMainTab('payouts')}
            className={`px-4 py-1.5 rounded-lg text-xs font-bold transition-all flex items-center gap-1.5 ${
              activeMainTab === 'payouts' 
                ? 'bg-white text-gray-900 shadow-sm' 
                : 'text-gray-600 hover:text-gray-900'
            }`}
          >
            Bank Payout Requests
            {payouts.filter(p => p.status === 'pending').length > 0 && (
              <span className="w-2 h-2 rounded-full bg-amber-500"></span>
            )}
          </button>
        </div>
      </div>

      {/* Percentage Configuration Banner */}
      <div className="bg-white p-5 rounded-2xl shadow-sm border border-gray-100 flex flex-col lg:flex-row lg:items-center justify-between gap-4">
        <div className="flex items-center gap-3.5">
          <div className="w-11 h-11 rounded-xl bg-blue-50 text-[#012980] flex items-center justify-center shrink-0 border border-blue-100">
            <Percent className="w-5 h-5" />
          </div>
          <div>
            <h3 className="font-bold text-gray-900 text-sm">Referral Reward Percentage Settings</h3>
            <p className="text-xs text-gray-500 mt-0.5">Configured percentages automatically apply to eligible order and subscription calculations.</p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <div className="flex items-center gap-2 bg-gray-50 px-3 py-1.5 rounded-xl border border-gray-200">
            <span className="text-xs font-semibold text-gray-600">Customer:</span>
            <input 
              type="number"
              min="0"
              max="100"
              step="0.5"
              value={customerPercent}
              onChange={(e) => setCustomerPercent(e.target.value)}
              className="w-14 bg-white border border-gray-200 rounded-lg px-2 py-1 text-xs font-bold text-gray-900 text-center focus:outline-none focus:border-[#012980]"
            />
            <span className="text-xs font-bold text-gray-500">%</span>
          </div>

          <div className="flex items-center gap-2 bg-gray-50 px-3 py-1.5 rounded-xl border border-gray-200">
            <span className="text-xs font-semibold text-gray-600">Vendor:</span>
            <input 
              type="number"
              min="0"
              max="100"
              step="0.5"
              value={vendorPercent}
              onChange={(e) => setVendorPercent(e.target.value)}
              className="w-14 bg-white border border-gray-200 rounded-lg px-2 py-1 text-xs font-bold text-gray-900 text-center focus:outline-none focus:border-[#012980]"
            />
            <span className="text-xs font-bold text-gray-500">%</span>
          </div>

          <button
            onClick={handleSavePercentages}
            disabled={isSavingSettings}
            className="px-5 py-2 bg-[#012980] hover:bg-blue-900 text-white rounded-xl text-xs font-bold transition-all shadow-sm disabled:opacity-50"
          >
            {isSavingSettings ? "Saving..." : "Save Settings"}
          </button>
        </div>
      </div>

      {/* VIEW A: REFERRAL DASHBOARD & LIST (Image 2 style) */}
      {activeMainTab === 'dashboard' && (
        <div className="space-y-6">
          {/* Filters Bar: Search + Month + Year */}
          <div className="flex flex-col md:flex-row gap-3">
            <div className="relative flex-1">
              <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
              <input
                type="text"
                placeholder="Search by Referral ID, Name, or Mobile Number..."
                value={searchTerm}
                onChange={(e) => { setSearchTerm(e.target.value); setCurrentPage(1); }}
                className="w-full pl-10 pr-4 py-2.5 bg-white border border-gray-200 rounded-xl text-xs text-gray-900 placeholder:text-gray-400 focus:outline-none focus:border-[#012980] shadow-sm transition-all"
              />
            </div>

            <div className="flex gap-2">
              <select
                value={selectedMonth}
                onChange={(e) => { setSelectedMonth(e.target.value); setCurrentPage(1); }}
                className="bg-white border border-gray-200 rounded-xl px-3 py-2.5 text-xs font-semibold text-gray-700 focus:outline-none focus:border-[#012980] shadow-sm"
              >
                <option value="">All Months</option>
                {months.map(m => (
                  <option key={m.num} value={m.num}>{m.name}</option>
                ))}
              </select>

              <select
                value={selectedYear}
                onChange={(e) => { setSelectedYear(e.target.value); setCurrentPage(1); }}
                className="bg-white border border-gray-200 rounded-xl px-3 py-2.5 text-xs font-semibold text-gray-700 focus:outline-none focus:border-[#012980] shadow-sm"
              >
                <option value="">All Years</option>
                <option value="2026">2026</option>
                <option value="2025">2025</option>
                <option value="2024">2024</option>
              </select>

              {(selectedMonth || selectedYear || searchTerm) && (
                <button
                  onClick={() => { setSelectedMonth(""); setSelectedYear(""); setSearchTerm(""); setCurrentPage(1); }}
                  className="px-3 py-2.5 text-xs font-bold text-gray-500 hover:text-gray-800 bg-white border border-gray-200 rounded-xl shadow-sm transition-colors"
                >
                  Reset
                </button>
              )}
            </div>
          </div>

          {/* 6 Metric Stat Cards (Image 2 style) */}
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3.5">
            {/* Card 1: Total Referrals */}
            <div className="p-4 rounded-2xl bg-white border border-gray-100 shadow-sm hover:shadow-md transition-shadow">
              <div className="w-8 h-8 rounded-lg bg-sky-50 text-sky-600 flex items-center justify-center mb-2.5">
                <Users className="w-4 h-4" />
              </div>
              <p className="text-[11px] font-semibold text-gray-500">Total Referrals</p>
              <p className="text-xl font-bold text-gray-900 mt-0.5">{stats.total_referrals}</p>
              <p className="text-[10px] text-gray-400 mt-1">Total referral IDs</p>
            </div>

            {/* Card 2: Customers Joined */}
            <div className="p-4 rounded-2xl bg-white border border-gray-100 shadow-sm hover:shadow-md transition-shadow">
              <div className="w-8 h-8 rounded-lg bg-emerald-50 text-emerald-600 flex items-center justify-center mb-2.5">
                <UserCheck className="w-4 h-4" />
              </div>
              <p className="text-[11px] font-semibold text-gray-500">Customers Joined</p>
              <p className="text-xl font-bold text-gray-900 mt-0.5">{stats.customers_joined}</p>
              <p className="text-[10px] text-gray-400 mt-1">Through referrals</p>
            </div>

            {/* Card 3: Vendors Joined */}
            <div className="p-4 rounded-2xl bg-white border border-gray-100 shadow-sm hover:shadow-md transition-shadow">
              <div className="w-8 h-8 rounded-lg bg-indigo-50 text-indigo-600 flex items-center justify-center mb-2.5">
                <Store className="w-4 h-4" />
              </div>
              <p className="text-[11px] font-semibold text-gray-500">Vendors Joined</p>
              <p className="text-xl font-bold text-gray-900 mt-0.5">{stats.vendors_joined}</p>
              <p className="text-[10px] text-gray-400 mt-1">Through referrals</p>
            </div>

            {/* Card 4: Total Earned */}
            <div className="p-4 rounded-2xl bg-white border border-gray-100 shadow-sm hover:shadow-md transition-shadow">
              <div className="w-8 h-8 rounded-lg bg-amber-50 text-amber-600 flex items-center justify-center mb-2.5">
                <DollarSign className="w-4 h-4" />
              </div>
              <p className="text-[11px] font-semibold text-gray-500">Total Earned</p>
              <p className="text-xl font-bold text-gray-900 mt-0.5">₹{stats.total_earned.toLocaleString()}</p>
              <p className="text-[10px] text-gray-400 mt-1">From referrals</p>
            </div>

            {/* Card 5: Total Credited to Bank */}
            <div className="p-4 rounded-2xl bg-white border border-gray-100 shadow-sm hover:shadow-md transition-shadow">
              <div className="w-8 h-8 rounded-lg bg-teal-50 text-teal-600 flex items-center justify-center mb-2.5">
                <Banknote className="w-4 h-4" />
              </div>
              <p className="text-[11px] font-semibold text-gray-500">Credited to Bank</p>
              <p className="text-xl font-bold text-gray-900 mt-0.5">₹{stats.total_credited_to_bank.toLocaleString()}</p>
              <p className="text-[10px] text-gray-400 mt-1">Processed payouts</p>
            </div>

            {/* Card 6: Current Balance */}
            <div className="p-4 rounded-2xl bg-white border border-gray-100 shadow-sm hover:shadow-md transition-shadow">
              <div className="w-8 h-8 rounded-lg bg-rose-50 text-rose-600 flex items-center justify-center mb-2.5">
                <Wallet className="w-4 h-4" />
              </div>
              <p className="text-[11px] font-semibold text-gray-500">Current Balance</p>
              <p className="text-xl font-bold text-gray-900 mt-0.5">₹{stats.current_balance.toLocaleString()}</p>
              <p className="text-[10px] text-gray-400 mt-1">In referral wallets</p>
            </div>
          </div>

          {/* Referral List Table */}
          <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
            <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between">
              <h2 className="font-bold text-gray-900 text-sm">Referral List</h2>
              <span className="text-xs font-semibold text-gray-400">
                Showing {filteredReferrals.length} {filteredReferrals.length === 1 ? 'record' : 'records'}
              </span>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead className="bg-gray-50/70 border-b border-gray-100">
                  <tr>
                    <th className="px-6 py-3.5 text-[11px] font-bold text-gray-500 uppercase tracking-wider">Referral ID</th>
                    <th className="px-6 py-3.5 text-[11px] font-bold text-gray-500 uppercase tracking-wider">Referrer Name</th>
                    <th className="px-6 py-3.5 text-[11px] font-bold text-gray-500 uppercase tracking-wider">Contact Details</th>
                    <th className="px-6 py-3.5 text-[11px] font-bold text-gray-500 uppercase tracking-wider text-center">Customers</th>
                    <th className="px-6 py-3.5 text-[11px] font-bold text-gray-500 uppercase tracking-wider text-center">Vendors</th>
                    <th className="px-6 py-3.5 text-[11px] font-bold text-gray-500 uppercase tracking-wider text-right">Total Earned</th>
                    <th className="px-6 py-3.5 text-[11px] font-bold text-gray-500 uppercase tracking-wider text-right">Credited to Bank</th>
                    <th className="px-6 py-3.5 text-[11px] font-bold text-gray-500 uppercase tracking-wider text-right">Balance</th>
                    <th className="px-6 py-3.5 text-[11px] font-bold text-gray-500 uppercase tracking-wider text-center">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {isLoadingReferrals ? (
                    <tr>
                      <td colSpan={9} className="py-12 text-center text-xs text-gray-400">Loading referral records...</td>
                    </tr>
                  ) : paginatedReferrals.length === 0 ? (
                    <tr>
                      <td colSpan={9} className="py-12 text-center text-xs text-gray-400">No referral records match your filters.</td>
                    </tr>
                  ) : (
                    paginatedReferrals.map((ref) => (
                      <tr key={ref.referral_id || ref.id} className="hover:bg-gray-50/60 transition-colors">
                        <td className="px-6 py-4">
                          <span className="font-bold text-xs text-blue-700 bg-blue-50 px-2.5 py-1 rounded-md">
                            {ref.referral_id}
                          </span>
                        </td>
                        <td className="px-6 py-4">
                          <p className="font-bold text-xs text-gray-900">{ref.referrer_name || '—'}</p>
                          {ref.store_name && (
                            <p className="text-[11px] text-amber-700 font-medium flex items-center gap-1 mt-0.5">
                              <Store className="w-3 h-3" /> {ref.store_name}
                            </p>
                          )}
                        </td>
                        <td className="px-6 py-4">
                          <p className="text-xs text-gray-700 font-medium">{ref.contact_number || ref.email || '—'}</p>
                          {ref.email && ref.contact_number && (
                            <p className="text-[11px] text-gray-400 truncate max-w-[150px]">{ref.email}</p>
                          )}
                        </td>
                        <td className="px-6 py-4 text-center">
                          <span className="font-bold text-xs text-gray-900">{ref.customers_referred}</span>
                        </td>
                        <td className="px-6 py-4 text-center">
                          <span className="font-bold text-xs text-gray-900">{ref.vendors_referred}</span>
                        </td>
                        <td className="px-6 py-4 text-right">
                          <span className="font-bold text-xs text-gray-900">₹{ref.total_earned.toLocaleString()}</span>
                        </td>
                        <td className="px-6 py-4 text-right">
                          <span className="font-bold text-xs text-emerald-700">₹{ref.credited_amount.toLocaleString()}</span>
                        </td>
                        <td className="px-6 py-4 text-right">
                          <span className="font-bold text-xs text-gray-900">₹{ref.available_balance.toLocaleString()}</span>
                        </td>
                        <td className="px-6 py-4 text-center">
                          <button
                            onClick={() => handleOpenDetails(ref.referral_id)}
                            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold bg-[#012980] hover:bg-blue-900 text-white transition-colors shadow-sm"
                          >
                            <Eye className="w-3 h-3" />
                            View Details
                          </button>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>

            {/* Pagination */}
            {totalPages > 1 && (
              <div className="px-6 py-3.5 border-t border-gray-100 flex items-center justify-between text-xs text-gray-500">
                <span>Page {currentPage} of {totalPages}</span>
                <div className="flex gap-1.5">
                  <button
                    onClick={() => setCurrentPage(prev => Math.max(prev - 1, 1))}
                    disabled={currentPage === 1}
                    className="p-1.5 rounded-lg border border-gray-200 hover:bg-gray-50 disabled:opacity-40"
                  >
                    <ChevronLeft className="w-4 h-4" />
                  </button>
                  <button
                    onClick={() => setCurrentPage(prev => Math.min(prev + 1, totalPages))}
                    disabled={currentPage === totalPages}
                    className="p-1.5 rounded-lg border border-gray-200 hover:bg-gray-50 disabled:opacity-40"
                  >
                    <ChevronRight className="w-4 h-4" />
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* VIEW B: BANK PAYOUT REQUESTS (Preserving Image 1 features) */}
      {activeMainTab === 'payouts' && (
        <div className="space-y-6">
          {/* Payout Filters */}
          <div className="flex flex-col sm:flex-row gap-3">
            <div className="relative flex-1">
              <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
              <input
                type="text"
                placeholder="Search payout request ID, customer name, email..."
                value={payoutSearch}
                onChange={(e) => setPayoutSearch(e.target.value)}
                className="w-full pl-10 pr-4 py-2.5 bg-white border border-gray-200 rounded-xl text-xs text-gray-900 placeholder:text-gray-400 focus:outline-none focus:border-[#012980] shadow-sm"
              />
            </div>
            <select
              value={payoutStatusFilter}
              onChange={(e) => setPayoutStatusFilter(e.target.value)}
              className="bg-white border border-gray-200 rounded-xl px-3 py-2.5 text-xs font-semibold text-gray-700 focus:outline-none focus:border-[#012980] shadow-sm"
            >
              <option value="all">All Statuses</option>
              <option value="pending">Pending</option>
              <option value="paid">Paid</option>
              <option value="rejected">Rejected</option>
            </select>
          </div>

          {/* Payouts Table */}
          <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead className="bg-gray-50/70 border-b border-gray-100">
                  <tr>
                    <th className="px-6 py-3.5 text-[11px] font-bold text-gray-500 uppercase tracking-wider">Request Info</th>
                    <th className="px-6 py-3.5 text-[11px] font-bold text-gray-500 uppercase tracking-wider">User</th>
                    <th className="px-6 py-3.5 text-[11px] font-bold text-gray-500 uppercase tracking-wider">Amount & Bank</th>
                    <th className="px-6 py-3.5 text-[11px] font-bold text-gray-500 uppercase tracking-wider">Status</th>
                    <th className="px-6 py-3.5 text-[11px] font-bold text-gray-500 uppercase tracking-wider text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {isLoadingPayouts ? (
                    <tr>
                      <td colSpan={5} className="py-12 text-center text-xs text-gray-400">Loading payout requests...</td>
                    </tr>
                  ) : filteredPayouts.length === 0 ? (
                    <tr>
                      <td colSpan={5} className="py-12 text-center text-xs text-gray-400">No payout requests found.</td>
                    </tr>
                  ) : (
                    filteredPayouts.map((p) => {
                      const bank = typeof p.bank_details === 'string' ? JSON.parse(p.bank_details || '{}') : (p.bank_details || {});
                      return (
                        <tr key={p.id} className="hover:bg-gray-50/60 transition-colors">
                          <td className="px-6 py-4">
                            <span className="font-bold text-xs text-gray-900">{p.payout_id}</span>
                            <p className="text-[11px] text-gray-400 mt-0.5">
                              {p.created_at ? new Date(p.created_at).toLocaleDateString() : '—'}
                            </p>
                          </td>
                          <td className="px-6 py-4">
                            <p className="font-bold text-xs text-gray-900">{p.user_name || p.vendor_name || 'Customer'}</p>
                            <span className="text-[10px] bg-blue-50 text-blue-700 font-bold px-1.5 py-0.5 rounded">
                              {p.user_id ? 'CUSTOMER' : 'VENDOR'}
                            </span>
                          </td>
                          <td className="px-6 py-4">
                            <p className="font-bold text-xs text-emerald-700">₹{parseFloat(p.amount).toLocaleString()}</p>
                            {bank.bank_name && (
                              <div className="text-[11px] text-gray-500 mt-0.5">
                                <p className="font-semibold text-gray-700">{bank.bank_name}</p>
                                <p className="font-mono text-[10px]">A/C: {bank.account_number}</p>
                                <p className="font-mono text-[10px]">IFSC: {bank.ifsc_code}</p>
                              </div>
                            )}
                          </td>
                          <td className="px-6 py-4">
                            <span className={`px-2.5 py-1 rounded-full text-xs font-bold uppercase tracking-wider ${
                              p.status === 'paid' ? 'bg-green-100 text-green-700' :
                              p.status === 'pending' ? 'bg-yellow-100 text-yellow-700' : 'bg-red-100 text-red-700'
                            }`}>
                              {p.status}
                            </span>
                          </td>
                          <td className="px-6 py-4 text-right">
                            {p.status === 'pending' ? (
                              <div className="flex items-center justify-end gap-2">
                                <button
                                  onClick={() => handlePayoutStatusUpdate(p.payout_id, 'paid')}
                                  disabled={processingId === p.payout_id}
                                  className="px-3 py-1.5 bg-green-600 hover:bg-green-700 text-white rounded-lg text-xs font-bold transition-colors shadow-sm disabled:opacity-50"
                                >
                                  Mark Paid
                                </button>
                                <button
                                  onClick={() => handlePayoutStatusUpdate(p.payout_id, 'rejected')}
                                  disabled={processingId === p.payout_id}
                                  className="px-3 py-1.5 bg-red-100 hover:bg-red-200 text-red-700 rounded-lg text-xs font-bold transition-colors disabled:opacity-50"
                                >
                                  Reject
                                </button>
                              </div>
                            ) : (
                              <span className="text-xs text-gray-400 italic">Processed</span>
                            )}
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* Slide-out / Modal Drawer for Referrer Details (Image 2 style) */}
      <ReferralDetailsDrawer
        isOpen={drawerOpen}
        onClose={() => { setDrawerOpen(false); setDrawerData(null); }}
        data={drawerData}
        loading={drawerLoading}
      />
    </div>
  );
}
