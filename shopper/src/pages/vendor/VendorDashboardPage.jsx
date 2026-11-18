import React, { useState, useEffect } from 'react';
import { Package, ShoppingBag, IndianRupee, Clock, Wallet, ChevronRight } from 'lucide-react';
import { toast } from 'react-toastify';
import { useNavigate } from 'react-router-dom';

const BACKEND_URL = import.meta.env.VITE_BACKEND_URL || "http://localhost:5000/api";

export function VendorDashboardPage() {
  const [stats, setStats] = useState({ totalProducts: 0, totalOrders: 0, totalRevenue: 0, pendingSettlements: 0 });
  const [recentOrders, setRecentOrders] = useState([]);
  const [loading, setLoading] = useState(true);
  const navigate = useNavigate();

  useEffect(() => {
    const token = localStorage.getItem('vendor_token');
    const headers = { 'Authorization': `Bearer ${token}` };

    const fetchStats = fetch(`${BACKEND_URL}/vendor/stats`, { headers }).then(r => r.json());
    const fetchOrders = fetch(`${BACKEND_URL}/vendor/orders`, { headers }).then(r => r.json());

    Promise.all([fetchStats, fetchOrders])
      .then(([statsData, ordersData]) => {
        setStats(statsData);
        setRecentOrders((ordersData.orders || []).slice(0, 5));
      })
      .catch(() => toast.error('Failed to load dashboard'))
      .finally(() => setLoading(false));
  }, []);

  const statusColor = (s) => {
    const map = { 
      pending: 'bg-yellow-100 text-yellow-800 border-yellow-200', 
      confirmed: 'bg-blue-100 text-blue-800 border-blue-200', 
      shipped: 'bg-purple-100 text-purple-800 border-purple-200', 
      delivered: 'bg-green-100 text-green-800 border-green-200', 
      cancelled: 'bg-red-100 text-red-700 border-red-200' 
    };
    return map[s] || 'bg-gray-100 text-gray-700 border-gray-200';
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="mb-4 sm:mb-6">
        <h1 className="text-2xl sm:text-3xl font-extrabold text-gray-900 tracking-tight">
          Dashboard Overview
        </h1>
        <p className="text-gray-500 mt-1 text-sm sm:text-base font-medium">
          Welcome back! Here's how your store is performing today.
        </p>
      </div>

      {/* ======================================================== */}
      {/* STAT CARDS (Responsive: Stacked on mobile, Grid on desk)  */}
      {/* ======================================================== */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 sm:gap-6">
        
        {/* TOTAL REVENUE */}
        <div className="bg-white p-5 sm:p-6 rounded-2xl sm:rounded-[24px] shadow-sm border border-gray-100/80 flex items-center gap-4 sm:gap-5 hover:shadow-md transition-all duration-300">
          <div className="w-14 h-14 sm:w-16 sm:h-16 bg-[#fe6603] rounded-2xl flex items-center justify-center text-white shadow-md shadow-orange-500/20 flex-shrink-0">
            <IndianRupee className="w-7 h-7 sm:w-8 sm:h-8" />
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-xs font-bold text-gray-400 tracking-wider uppercase mb-0.5">
              Total Revenue
            </p>
            <h3 className="text-2xl sm:text-3xl font-extrabold text-gray-900 tracking-tight truncate">
              {loading ? '...' : `₹${stats.totalRevenue?.toLocaleString() || '0'}`}
            </h3>
          </div>
        </div>

        {/* TOTAL ORDERS */}
        <div className="bg-white p-5 sm:p-6 rounded-2xl sm:rounded-[24px] shadow-sm border border-gray-100/80 flex items-center gap-4 sm:gap-5 hover:shadow-md transition-all duration-300">
          <div className="w-14 h-14 sm:w-16 sm:h-16 bg-[#2563eb] rounded-2xl flex items-center justify-center text-white shadow-md shadow-blue-500/20 flex-shrink-0">
            <ShoppingBag className="w-7 h-7 sm:w-8 sm:h-8" />
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-xs font-bold text-gray-400 tracking-wider uppercase mb-0.5">
              Total Orders
            </p>
            <h3 className="text-2xl sm:text-3xl font-extrabold text-gray-900 tracking-tight truncate">
              {loading ? '...' : stats.totalOrders || 0}
            </h3>
          </div>
        </div>

        {/* ACTIVE PRODUCTS */}
        <div className="bg-white p-5 sm:p-6 rounded-2xl sm:rounded-[24px] shadow-sm border border-gray-100/80 flex items-center gap-4 sm:gap-5 hover:shadow-md transition-all duration-300">
          <div className="w-14 h-14 sm:w-16 sm:h-16 bg-[#036e26] rounded-2xl flex items-center justify-center text-white shadow-md shadow-green-600/20 flex-shrink-0">
            <Package className="w-7 h-7 sm:w-8 sm:h-8" />
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-xs font-bold text-gray-400 tracking-wider uppercase mb-0.5">
              Active Products
            </p>
            <h3 className="text-2xl sm:text-3xl font-extrabold text-gray-900 tracking-tight truncate">
              {loading ? '...' : stats.totalProducts || 0}
            </h3>
          </div>
        </div>

        {/* PENDING PAYOUTS */}
        <div className="bg-white p-5 sm:p-6 rounded-2xl sm:rounded-[24px] shadow-sm border border-gray-100/80 flex items-center gap-4 sm:gap-5 hover:shadow-md transition-all duration-300">
          <div className="w-14 h-14 sm:w-16 sm:h-16 bg-[#d97706] rounded-2xl flex items-center justify-center text-white shadow-md shadow-amber-500/20 flex-shrink-0">
            <Wallet className="w-7 h-7 sm:w-8 sm:h-8" />
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-xs font-bold text-gray-400 tracking-wider uppercase mb-0.5">
              Pending Payouts
            </p>
            <h3 className="text-2xl sm:text-3xl font-extrabold text-gray-900 tracking-tight truncate">
              {loading ? '...' : `₹${(stats.pendingSettlements || 0).toLocaleString()}`}
            </h3>
          </div>
        </div>

      </div>

      {/* ======================================================== */}
      {/* RECENT ORDERS CONTAINER                                  */}
      {/* ======================================================== */}
      <div className="bg-white rounded-2xl sm:rounded-[24px] shadow-sm border border-gray-100/80 overflow-hidden mt-6 sm:mt-8">
        
        {/* Header */}
        <div className="px-5 sm:px-8 py-4 sm:py-5 border-b border-gray-100 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="p-1.5 bg-gray-100 rounded-lg">
              <Clock className="w-4 h-4 sm:w-5 sm:h-5 text-gray-600" />
            </div>
            <h3 className="text-base sm:text-xl font-bold text-gray-900">Recent Orders</h3>
          </div>
          <button 
            onClick={() => navigate('/vendor/orders')} 
            className="text-xs sm:text-sm font-bold text-[#fe6603] hover:text-[#e55c02] transition-colors flex items-center gap-1 group"
          >
            View All <span className="group-hover:translate-x-1 transition-transform">→</span>
          </button>
        </div>

        {/* Content */}
        {loading ? (
          <div className="p-8 text-center text-gray-400 text-sm">Loading recent orders...</div>
        ) : recentOrders.length === 0 ? (
          <div className="p-8 sm:p-12 text-center text-gray-400">
            <ShoppingBag className="w-12 h-12 mx-auto mb-3 text-gray-200" />
            <p className="text-gray-500 font-medium">No orders yet</p>
            <p className="text-xs text-gray-400 mt-1">Orders from customers will appear here.</p>
          </div>
        ) : (
          <>
            {/* 1. MOBILE LIST VIEW (Matching ULMGH369 Reference) */}
            <div className="md:hidden divide-y divide-gray-100">
              {recentOrders.map(order => {
                let items = [];
                try { items = typeof order.items === 'string' ? JSON.parse(order.items) : (order.items || []); } catch(e) {}
                let addr = {};
                try { addr = typeof order.address === 'string' ? JSON.parse(order.address) : (order.address || {}); } catch(e) {}

                const dateFormatted = order.created_at ? new Date(order.created_at).toLocaleDateString('en-IN', {
                  day: '2-digit',
                  month: 'short'
                }) : '';

                return (
                  <div 
                    key={order.id} 
                    onClick={() => navigate('/vendor/orders')}
                    className="p-4 hover:bg-gray-50/70 active:bg-gray-100/70 transition-colors flex flex-col gap-2.5 cursor-pointer"
                  >
                    {/* Top row: Order Number pill & Status Badge */}
                    <div className="flex items-center justify-between">
                      <span className="font-mono font-bold text-gray-800 text-xs bg-gray-100 px-2.5 py-1 rounded-md">
                        #{order.order_number}
                      </span>
                      <span className={`px-2.5 py-0.5 rounded-full text-[11px] font-bold capitalize border ${statusColor(order.status)}`}>
                        {order.status}
                      </span>
                    </div>

                    {/* Middle row: Customer name & Date */}
                    <div className="flex items-center justify-between">
                      <p className="font-bold text-gray-900 text-sm">
                        {addr.name || 'Customer'}
                      </p>
                      <p className="text-xs text-gray-400 font-medium">
                        {dateFormatted}
                      </p>
                    </div>

                    {/* Bottom row: Item Thumbnail & Item count on left, Large Price on right */}
                    <div className="flex items-center justify-between pt-1">
                      <div className="flex items-center gap-2">
                        {items[0] && (
                          <img 
                            src={items[0].product?.image_url || items[0].product?.images?.[0] || ''} 
                            alt="" 
                            className="w-8 h-8 rounded-lg object-cover border border-gray-100 bg-gray-50 flex-shrink-0"
                            onError={(e) => { e.target.style.display = 'none'; }}
                          />
                        )}
                        <span className="text-xs font-medium text-gray-500">
                          {items.length} item{items.length !== 1 ? 's' : ''}
                        </span>
                      </div>
                      <span className="text-base font-extrabold text-[#fe6603]">
                        ₹{parseFloat(order.total || 0).toLocaleString()}
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>

            {/* 2. DESKTOP TABLE VIEW (Retained for desktop screens) */}
            <div className="hidden md:block overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-gray-50 text-gray-500 text-xs uppercase tracking-wider">
                    <th className="text-left px-6 py-3 font-medium">Order</th>
                    <th className="text-left px-6 py-3 font-medium">Customer</th>
                    <th className="text-left px-6 py-3 font-medium">Items</th>
                    <th className="text-left px-6 py-3 font-medium">Total</th>
                    <th className="text-left px-6 py-3 font-medium">Status</th>
                    <th className="text-left px-6 py-3 font-medium">Date</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {recentOrders.map(order => {
                    let items = [];
                    try { items = typeof order.items === 'string' ? JSON.parse(order.items) : (order.items || []); } catch(e) {}
                    let addr = {};
                    try { addr = typeof order.address === 'string' ? JSON.parse(order.address) : (order.address || {}); } catch(e) {}

                    return (
                      <tr key={order.id} className="hover:bg-gray-50/50 transition-colors">
                        <td className="px-6 py-4">
                          <span className="font-semibold text-gray-900 text-xs bg-gray-100 px-2 py-1 rounded-md">
                            {order.order_number}
                          </span>
                        </td>
                        <td className="px-6 py-4">
                          <p className="font-medium text-gray-900">{addr.name || '-'}</p>
                          <p className="text-xs text-gray-400">{addr.mobile || ''}</p>
                        </td>
                        <td className="px-6 py-4">
                          <div className="flex items-center gap-2">
                            {items.slice(0, 2).map((item, i) => (
                              <img key={i} src={item.product?.image_url || item.product?.images?.[0] || ''} alt="" className="w-8 h-8 rounded-md object-cover border border-gray-100" />
                            ))}
                            <span className="text-xs text-gray-500">{items.length} item{items.length !== 1 ? 's' : ''}</span>
                          </div>
                        </td>
                        <td className="px-6 py-4 font-semibold text-gray-900">₹{parseFloat(order.total || 0).toLocaleString()}</td>
                        <td className="px-6 py-4">
                          <span className={`px-2.5 py-1 rounded-full text-xs font-semibold capitalize border ${statusColor(order.status)}`}>
                            {order.status}
                          </span>
                        </td>
                        <td className="px-6 py-4 text-gray-500 text-xs">
                          {new Date(order.created_at).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })}
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
    </div>
  );
}
