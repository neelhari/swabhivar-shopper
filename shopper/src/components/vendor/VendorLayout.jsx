import React, { useEffect, useState } from "react";
import { useNavigate, useLocation, Link } from "react-router-dom";
import { 
  Home,
  LayoutDashboard, 
  LayoutGrid,
  ShoppingBag, 
  Package, 
  LogOut, 
  Store, 
  Menu, 
  X, 
  Wallet, 
  UserCircle, 
  Layers, 
  HeadphonesIcon, 
  Tag, 
  Users, 
  IndianRupee, 
  RotateCcw,
  ChevronRight,
  ShieldCheck,
  CheckCircle2,
  HelpCircle
} from "lucide-react";
import logo from '../../assets/logo.png';
import { registerPushNotifications, unregisterPushNotifications } from '../../services/pushNotificationService';

const BACKEND_URL = import.meta.env.VITE_BACKEND_URL || "http://localhost:5000/api";

const DESKTOP_NAV = [
  { href: "/vendor", label: "Dashboard", icon: <LayoutDashboard className="w-4 h-4" /> },
  { href: "/vendor/orders", label: "Orders", icon: <ShoppingBag className="w-4 h-4" /> },
  { href: "/vendor/returns", label: "Returns & Refunds", icon: <RotateCcw className="w-4 h-4" /> },
  { href: "/vendor/products", label: "Products", icon: <Package className="w-4 h-4" /> },
  { href: "/vendor/categories", label: "Categories", icon: <Layers className="w-4 h-4" /> },
  { href: "/vendor/wallet", label: "Virtual Wallet", icon: <Wallet className="w-4 h-4" /> },
  { href: "/vendor/revenue", label: "Revenue", icon: <IndianRupee className="w-4 h-4" /> },
  { href: "/vendor/offers", label: "Offers", icon: <Tag className="w-4 h-4" /> },
  { href: "/vendor/referrals", label: "Refer & Earn", icon: <Users className="w-4 h-4" /> },
  { href: "/vendor/profile", label: "Profile", icon: <UserCircle className="w-4 h-4" /> },
  { href: "/vendor/support", label: "Support", icon: <HeadphonesIcon className="w-4 h-4" /> },
];

export function VendorLayout({ children }) {
  const navigate = useNavigate();
  const location = useLocation();
  const pathname = location.pathname;
  const [vendor, setVendor] = useState(null);
  const [accountDrawerOpen, setAccountDrawerOpen] = useState(false);
  const [showGuidelines, setShowGuidelines] = useState(false);

  useEffect(() => {
    const token = localStorage.getItem("vendor_token");
    if (!token) {
      navigate("/vendor-login");
      return;
    }

    fetch(`${BACKEND_URL}/vendorAuth/me`, { headers: { Authorization: `Bearer ${token}` } })
      .then((r) => r.json())
      .then((d) => {
        if (!d.vendor) { navigate("/vendor-login"); return; }
        setVendor(d.vendor);
        registerPushNotifications('vendor');
      })
      .catch(() => navigate("/vendor-login"));
  }, [navigate]);

  // Close drawer on route change
  useEffect(() => {
    setAccountDrawerOpen(false);
  }, [pathname]);

  const handleLogout = () => {
    unregisterPushNotifications('vendor');
    localStorage.removeItem("vendor_token");
    navigate("/vendor-login");
  };

  if (!vendor) return (
    <div className="min-h-screen bg-[#FDFBF7] flex items-center justify-center">
      <div className="w-10 h-10 border-4 border-[#012980]/20 border-t-[#012980] rounded-full animate-spin" />
    </div>
  );

  // Active state checks for bottom navigation options
  const isHomeActive = pathname === '/vendor' || pathname === '/vendor/';
  const isProductsActive = pathname.startsWith('/vendor/products');
  const isCategoriesActive = pathname.startsWith('/vendor/categories');
  const isWalletActive = pathname.startsWith('/vendor/wallet');
  const isAccountActive = accountDrawerOpen || pathname === '/vendor/profile';
  const isProductFormPage = pathname.includes('/products/new') || (pathname.includes('/products/') && pathname.includes('/edit'));

  return (
    <div className="min-h-screen bg-[#FDFBF7] flex flex-col md:flex-row">

      {/* ======================================================== */}
      {/* 1. MOBILE COMPACT HEADER (md:hidden)                     */}
      {/* Hidden on product form page to prevent double-headers and gaps on mobile */}
      {/* ======================================================== */}
      {!isProductFormPage && (
        <header className="md:hidden fixed top-0 left-0 right-0 h-14 bg-white/95 backdrop-blur-md border-b border-gray-100 px-4 flex items-center justify-between z-40 shadow-xs">
          <Link to="/vendor" className="flex items-center gap-2">
            <img src={logo} alt="Shopper Logo" className="h-8 object-contain mix-blend-multiply" />
            <div className="flex items-center gap-1.5">
              <span className="font-extrabold text-base tracking-tight">
                <span className="text-[#012980]">Swabhivar</span> <span className="text-[#036e26]">Shoppers</span>
              </span>
              <span className="text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full bg-orange-50 text-[#fe6603] border border-orange-200">
                Vendor
              </span>
            </div>
          </Link>
          <button 
            onClick={() => setAccountDrawerOpen(true)} 
            className="p-2 text-gray-700 hover:text-gray-900 rounded-xl hover:bg-gray-100 transition-colors"
            aria-label="Open Account Menu"
          >
            <Menu className="w-6 h-6" />
          </button>
        </header>
      )}

      {/* ======================================================== */}
      {/* 2. DESKTOP SIDEBAR (Retained unchanged for desktop)      */}
      {/* ======================================================== */}
      <aside className="hidden md:flex w-72 bg-gradient-to-b from-white to-[#FDFBF7] border-r border-[#012980]/10 flex-col fixed h-full z-30 shadow-[4px_0_24px_rgba(254,102,3,0.03)]">
        <div className="p-6 border-b border-[#012980]/10 bg-white/50 backdrop-blur-sm">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 bg-white rounded-2xl shadow-sm border border-[#012980]/10 flex items-center justify-center flex-shrink-0">
              <img src={logo} alt="Swabhivar Shoppers" className="w-8 h-8 object-contain mix-blend-multiply" />
            </div>
            <div>
              <p className="font-extrabold text-xl tracking-tight leading-tight">
                <span className="text-[#012980]">Swabhivar</span><br/><span className="text-[#036e26]">Shoppers</span>
              </p>
              <div className="flex items-center gap-1.5 mt-1.5 bg-[#012980]/10 w-fit px-2 py-0.5 rounded-md">
                <Store className="w-3 h-3 text-[#012980]" />
                <p className="text-[#012980] text-[10px] font-sans font-bold uppercase tracking-wider">Vendor Portal</p>
              </div>
            </div>
          </div>
        </div>

        <div className="p-5 border-b border-[#012980]/5 bg-gradient-to-r from-transparent to-[#012980]/[0.02]">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-full bg-gradient-to-br from-[#012980] to-[#e55c02] text-white flex items-center justify-center font-bold text-lg shadow-sm">
              {vendor.name ? vendor.name.charAt(0).toUpperCase() : 'V'}
            </div>
            <div className="flex-1 min-w-0">
              <p className="font-sans font-bold text-gray-900 text-sm truncate">{vendor.name}</p>
              <p className="text-gray-500 text-xs font-sans truncate">{vendor.email}</p>
            </div>
          </div>
        </div>

        <nav className="flex-1 p-4 space-y-1.5 overflow-y-auto custom-scrollbar">
          {DESKTOP_NAV.map((item) => {
            const isActive = pathname === item.href;
            return (
              <Link 
                key={item.href} 
                to={item.href}
                className={`group flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-sans font-medium transition-all duration-300 ${
                  isActive 
                    ? "bg-gradient-to-r from-[#012980] to-[#ff7b23] text-white shadow-md shadow-[#012980]/20 translate-x-1" 
                    : "text-gray-600 hover:text-[#012980] hover:bg-blue-50 hover:translate-x-1"
                }`}
              >
                <div className={`transition-transform duration-300 ${isActive ? 'scale-110' : 'group-hover:scale-110'}`}>
                  {item.icon}
                </div>
                {item.label}
              </Link>
            );
          })}
        </nav>

        <div className="p-4 border-t border-[#012980]/10 bg-white">
          <button 
            onClick={handleLogout}
            className="group flex items-center justify-center gap-2 px-4 py-3 rounded-xl text-sm font-sans font-bold text-red-500 hover:text-white hover:bg-red-500 transition-all w-full border border-red-100 hover:border-transparent hover:shadow-md hover:shadow-red-500/20"
          >
            <LogOut className="w-4 h-4 transition-transform group-hover:-translate-x-1" /> Logout
          </button>
        </div>
      </aside>

      {/* ======================================================== */}
      {/* 3. MAIN CONTENT AREA (with mobile safe bottom padding)   */}
      {/* ======================================================== */}
      <main className={`flex-1 md:ml-72 min-w-0 w-full pb-24 md:pb-8 ${
        isProductFormPage 
          ? 'p-0 pt-0 md:p-6 lg:p-8 md:pt-8' 
          : 'p-3 sm:p-5 lg:p-8 pt-16 md:pt-8 overflow-x-hidden'
      }`}>
        <div className={`w-full min-w-0 ${isProductFormPage ? '' : 'max-w-7xl mx-auto'}`}>
          {children}
        </div>
      </main>

      {/* ======================================================== */}
      {/* 4. MOBILE BOTTOM NAVIGATION (Home, Products, Categories, Wallet, Account) */}
      {/* ======================================================== */}
      <nav 
        className="md:hidden fixed bottom-0 left-0 right-0 z-40 bg-white border-t border-gray-200/80 shadow-[0_-4px_25px_rgba(0,0,0,0.06)]"
        style={{ paddingBottom: 'max(0.5rem, env(safe-area-inset-bottom, 0.5rem))' }}
      >
        <div className="grid grid-cols-5 items-center h-14">
          
          {/* TAB 1: HOME */}
          <Link
            to="/vendor"
            className={`flex flex-col items-center justify-center py-1 transition-all relative ${
              isHomeActive ? "text-[#fe6603]" : "text-gray-400 hover:text-gray-600"
            }`}
          >
            {isHomeActive && (
              <span className="absolute top-0 w-7 h-1 bg-[#fe6603] rounded-full" />
            )}
            <Home className={`w-5 h-5 transition-transform duration-200 ${isHomeActive ? "scale-110" : ""}`} />
            <span className={`text-[10px] sm:text-[11px] mt-1 ${isHomeActive ? "font-bold text-[#fe6603]" : "font-medium"}`}>
              Home
            </span>
          </Link>

          {/* TAB 2: PRODUCTS */}
          <Link
            to="/vendor/products"
            className={`flex flex-col items-center justify-center py-1 transition-all relative ${
              isProductsActive ? "text-[#fe6603]" : "text-gray-400 hover:text-gray-600"
            }`}
          >
            {isProductsActive && (
              <span className="absolute top-0 w-7 h-1 bg-[#fe6603] rounded-full" />
            )}
            <Package className={`w-5 h-5 transition-transform duration-200 ${isProductsActive ? "scale-110" : ""}`} />
            <span className={`text-[10px] sm:text-[11px] mt-1 ${isProductsActive ? "font-bold text-[#fe6603]" : "font-medium"}`}>
              Products
            </span>
          </Link>

          {/* TAB 3: CATEGORIES */}
          <Link
            to="/vendor/categories"
            className={`flex flex-col items-center justify-center py-1 transition-all relative ${
              isCategoriesActive ? "text-[#fe6603]" : "text-gray-400 hover:text-gray-600"
            }`}
          >
            {isCategoriesActive && (
              <span className="absolute top-0 w-7 h-1 bg-[#fe6603] rounded-full" />
            )}
            <Layers className={`w-5 h-5 transition-transform duration-200 ${isCategoriesActive ? "scale-110" : ""}`} />
            <span className={`text-[10px] sm:text-[11px] mt-1 ${isCategoriesActive ? "font-bold text-[#fe6603]" : "font-medium"}`}>
              Categories
            </span>
          </Link>

          {/* TAB 4: WALLET */}
          <Link
            to="/vendor/wallet"
            className={`flex flex-col items-center justify-center py-1 transition-all relative ${
              isWalletActive ? "text-[#fe6603]" : "text-gray-400 hover:text-gray-600"
            }`}
          >
            {isWalletActive && (
              <span className="absolute top-0 w-7 h-1 bg-[#fe6603] rounded-full" />
            )}
            <Wallet className={`w-5 h-5 transition-transform duration-200 ${isWalletActive ? "scale-110" : ""}`} />
            <span className={`text-[10px] sm:text-[11px] mt-1 ${isWalletActive ? "font-bold text-[#fe6603]" : "font-medium"}`}>
              Wallet
            </span>
          </Link>

          {/* TAB 5: ACCOUNT */}
          <button
            onClick={() => setAccountDrawerOpen(!accountDrawerOpen)}
            className={`flex flex-col items-center justify-center py-1 transition-all relative ${
              isAccountActive ? "text-[#fe6603]" : "text-gray-400 hover:text-gray-600"
            }`}
            aria-label="Account Menu"
          >
            {isAccountActive && (
              <span className="absolute top-0 w-7 h-1 bg-[#fe6603] rounded-full" />
            )}
            <UserCircle className={`w-5 h-5 transition-transform duration-200 ${isAccountActive ? "scale-110" : ""}`} />
            <span className={`text-[10px] sm:text-[11px] mt-1 ${isAccountActive ? "font-bold text-[#fe6603]" : "font-medium"}`}>
              Account
            </span>
          </button>

        </div>
      </nav>

      {/* ======================================================== */}
      {/* 5. MOBILE ACCOUNT DRAWER (Visual Reference: ULMGH369)    */}
      {/* ======================================================== */}
      {accountDrawerOpen && (
        <div className="md:hidden fixed inset-0 z-50 flex justify-end">
          {/* Backdrop */}
          <div 
            className="fixed inset-0 bg-black/50 backdrop-blur-xs transition-opacity duration-300"
            onClick={() => setAccountDrawerOpen(false)}
          />

          {/* Drawer Panel */}
          <div className="relative w-full max-w-[340px] bg-white h-full shadow-2xl flex flex-col z-50 overflow-y-auto animate-in slide-in-from-right duration-200">
            
            {/* Drawer Header */}
            <div className="p-4 border-b border-gray-100 flex items-center justify-between bg-white sticky top-0 z-10">
              <div className="flex items-center gap-2.5">
                <img src={logo} alt="Shopper Logo" className="h-8 object-contain mix-blend-multiply" />
                <div>
                  <h2 className="font-extrabold text-sm text-gray-900 leading-tight">
                    <span className="text-[#012980]">Shopper</span> <span className="text-[#fe6603]">Vendor Portal</span>
                  </h2>
                  <p className="text-[11px] font-semibold text-gray-400">Store Management</p>
                </div>
              </div>
              <button 
                onClick={() => setAccountDrawerOpen(false)}
                className="p-1.5 text-gray-400 hover:text-gray-700 hover:bg-gray-100 rounded-full transition-colors"
                aria-label="Close"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Vendor Profile Card */}
            <div className="p-4 bg-gray-50/60 border-b border-gray-100 flex items-center gap-3">
              <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-[#fe6603] to-[#e55c02] text-white flex items-center justify-center font-extrabold text-xl shadow-sm flex-shrink-0">
                {vendor.store_name?.charAt(0).toUpperCase() || vendor.name?.charAt(0).toUpperCase() || 'S'}
              </div>
              <div className="min-w-0 flex-1">
                <h3 className="font-bold text-gray-900 text-sm leading-tight truncate">
                  {vendor.store_name || vendor.name}
                </h3>
                <p className="text-xs text-gray-500 font-medium truncate mt-0.5">
                  {vendor.email}
                </p>
                <div className="mt-1">
                  <span className="inline-block px-2 py-0.5 bg-orange-100 text-[#fe6603] border border-orange-200 text-[10px] font-extrabold rounded-md uppercase tracking-wider">
                    {vendor.plan_name || 'Active Plan'}
                  </span>
                </div>
              </div>
            </div>

            {/* STORE OPERATIONS SECTION */}
            <div className="p-4 flex-1">
              <p className="text-[11px] font-bold text-gray-400 uppercase tracking-wider mb-2 px-1">
                Store Operations
              </p>
              
              <div className="space-y-0.5">
                
                {/* Orders */}
                <Link
                  to="/vendor/orders"
                  onClick={() => setAccountDrawerOpen(false)}
                  className="flex items-center justify-between p-2.5 rounded-xl hover:bg-gray-50 text-gray-700 transition-colors group"
                >
                  <div className="flex items-center gap-3">
                    <ShoppingBag className="w-4 h-4 text-gray-500 group-hover:text-[#fe6603]" />
                    <span className="text-sm font-semibold">Orders</span>
                  </div>
                  <ChevronRight className="w-4 h-4 text-gray-400 group-hover:text-gray-600 group-hover:translate-x-0.5 transition-transform" />
                </Link>

                {/* Offers & Coupons */}
                <Link
                  to="/vendor/offers"
                  onClick={() => setAccountDrawerOpen(false)}
                  className="flex items-center justify-between p-2.5 rounded-xl hover:bg-gray-50 text-gray-700 transition-colors group"
                >
                  <div className="flex items-center gap-3">
                    <Tag className="w-4 h-4 text-gray-500 group-hover:text-[#fe6603]" />
                    <span className="text-sm font-semibold">Offers & Coupons</span>
                  </div>
                  <ChevronRight className="w-4 h-4 text-gray-400 group-hover:text-gray-600 group-hover:translate-x-0.5 transition-transform" />
                </Link>

                {/* Returns & Refunds (Vendor Managed) */}
                <Link
                  to="/vendor/returns"
                  onClick={() => setAccountDrawerOpen(false)}
                  className="flex items-center justify-between p-2.5 rounded-xl hover:bg-gray-50 text-gray-700 transition-colors group"
                >
                  <div className="flex items-center gap-3">
                    <RotateCcw className="w-4 h-4 text-gray-500 group-hover:text-[#fe6603]" />
                    <span className="text-sm font-semibold">Returns & Refunds</span>
                  </div>
                  <ChevronRight className="w-4 h-4 text-gray-400 group-hover:text-gray-600 group-hover:translate-x-0.5 transition-transform" />
                </Link>

                {/* Guidelines */}
                <button
                  type="button"
                  onClick={() => { setShowGuidelines(true); }}
                  className="w-full flex items-center justify-between p-2.5 rounded-xl hover:bg-gray-50 text-gray-700 transition-colors group text-left"
                >
                  <div className="flex items-center gap-3">
                    <ShieldCheck className="w-4 h-4 text-gray-500 group-hover:text-[#fe6603]" />
                    <span className="text-sm font-semibold">Guidelines</span>
                  </div>
                  <ChevronRight className="w-4 h-4 text-gray-400 group-hover:text-gray-600 group-hover:translate-x-0.5 transition-transform" />
                </button>

                {/* Support & Team */}
                <Link
                  to="/vendor/support"
                  onClick={() => setAccountDrawerOpen(false)}
                  className="flex items-center justify-between p-2.5 rounded-xl hover:bg-gray-50 text-gray-700 transition-colors group"
                >
                  <div className="flex items-center gap-3">
                    <HeadphonesIcon className="w-4 h-4 text-gray-500 group-hover:text-[#fe6603]" />
                    <span className="text-sm font-semibold">Support & Team</span>
                  </div>
                  <ChevronRight className="w-4 h-4 text-gray-400 group-hover:text-gray-600 group-hover:translate-x-0.5 transition-transform" />
                </Link>

                {/* Profile & Subscription */}
                <Link
                  to="/vendor/profile"
                  onClick={() => setAccountDrawerOpen(false)}
                  className="flex items-center justify-between p-2.5 rounded-xl hover:bg-gray-50 text-gray-700 transition-colors group"
                >
                  <div className="flex items-center gap-3">
                    <UserCircle className="w-4 h-4 text-gray-500 group-hover:text-[#fe6603]" />
                    <span className="text-sm font-semibold">Profile & Subscription</span>
                  </div>
                  <ChevronRight className="w-4 h-4 text-gray-400 group-hover:text-gray-600 group-hover:translate-x-0.5 transition-transform" />
                </Link>

                {/* Revenue & Commission */}
                <Link
                  to="/vendor/revenue"
                  onClick={() => setAccountDrawerOpen(false)}
                  className="flex items-center justify-between p-2.5 rounded-xl hover:bg-gray-50 text-gray-700 transition-colors group"
                >
                  <div className="flex items-center gap-3">
                    <IndianRupee className="w-4 h-4 text-gray-500 group-hover:text-[#fe6603]" />
                    <span className="text-sm font-semibold">Revenue & Settlements</span>
                  </div>
                  <ChevronRight className="w-4 h-4 text-gray-400 group-hover:text-gray-600 group-hover:translate-x-0.5 transition-transform" />
                </Link>

                {/* Refer & Earn */}
                <Link
                  to="/vendor/referrals"
                  onClick={() => setAccountDrawerOpen(false)}
                  className="flex items-center justify-between p-2.5 rounded-xl hover:bg-gray-50 text-gray-700 transition-colors group"
                >
                  <div className="flex items-center gap-3">
                    <Users className="w-4 h-4 text-gray-500 group-hover:text-[#fe6603]" />
                    <span className="text-sm font-semibold">Refer & Earn</span>
                  </div>
                  <ChevronRight className="w-4 h-4 text-gray-400 group-hover:text-gray-600 group-hover:translate-x-0.5 transition-transform" />
                </Link>

              </div>

              {/* MAIN SECTIONS GRID */}
              <p className="text-[11px] font-bold text-gray-400 uppercase tracking-wider mb-2.5 px-1 mt-5">
                Main Sections
              </p>
              <div className="grid grid-cols-2 gap-2.5">
                
                {/* Home */}
                <Link
                  to="/vendor"
                  onClick={() => setAccountDrawerOpen(false)}
                  className={`flex items-center gap-2 p-3 rounded-xl border text-xs font-bold transition-all ${
                    pathname === '/vendor'
                      ? 'border-[#fe6603] bg-orange-50/60 text-[#fe6603] shadow-xs'
                      : 'border-gray-200 text-gray-700 hover:border-gray-300 hover:bg-gray-50'
                  }`}
                >
                  <Home className="w-4 h-4" />
                  <span>Home</span>
                </Link>

                {/* Categories */}
                <Link
                  to="/vendor/categories"
                  onClick={() => setAccountDrawerOpen(false)}
                  className={`flex items-center gap-2 p-3 rounded-xl border text-xs font-bold transition-all ${
                    pathname.startsWith('/vendor/categories')
                      ? 'border-[#fe6603] bg-orange-50/60 text-[#fe6603] shadow-xs'
                      : 'border-gray-200 text-gray-700 hover:border-gray-300 hover:bg-gray-50'
                  }`}
                >
                  <Layers className="w-4 h-4" />
                  <span>Categories</span>
                </Link>

                {/* Products */}
                <Link
                  to="/vendor/products"
                  onClick={() => setAccountDrawerOpen(false)}
                  className={`flex items-center gap-2 p-3 rounded-xl border text-xs font-bold transition-all ${
                    pathname.startsWith('/vendor/products')
                      ? 'border-[#fe6603] bg-orange-50/60 text-[#fe6603] shadow-xs'
                      : 'border-gray-200 text-gray-700 hover:border-gray-300 hover:bg-gray-50'
                  }`}
                >
                  <Package className="w-4 h-4" />
                  <span>Products</span>
                </Link>

                {/* Wallet */}
                <Link
                  to="/vendor/wallet"
                  onClick={() => setAccountDrawerOpen(false)}
                  className={`flex items-center gap-2 p-3 rounded-xl border text-xs font-bold transition-all ${
                    pathname.startsWith('/vendor/wallet')
                      ? 'border-[#fe6603] bg-orange-50/60 text-[#fe6603] shadow-xs'
                      : 'border-gray-200 text-gray-700 hover:border-gray-300 hover:bg-gray-50'
                  }`}
                >
                  <Wallet className="w-4 h-4" />
                  <span>Wallet</span>
                </Link>

              </div>

              {/* Logout Button */}
              <div className="mt-6 pt-4 border-t border-gray-100 pb-6">
                <button
                  onClick={handleLogout}
                  className="w-full py-3 px-4 rounded-xl border border-red-200 text-red-600 font-bold text-xs flex items-center justify-center gap-2 hover:bg-red-50 hover:border-red-300 transition-all shadow-xs"
                >
                  <LogOut className="w-4 h-4" />
                  <span>Logout from Vendor Portal</span>
                </button>
              </div>

            </div>

          </div>
        </div>
      )}

      {/* ======================================================== */}
      {/* 6. GUIDELINES MODAL                                      */}
      {/* ======================================================== */}
      {showGuidelines && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs">
          <div className="bg-white rounded-2xl max-w-md w-full p-6 shadow-2xl max-h-[85vh] overflow-y-auto animate-in zoom-in-95 duration-200">
            <div className="flex items-center justify-between border-b border-gray-100 pb-3 mb-4">
              <div className="flex items-center gap-2">
                <ShieldCheck className="w-5 h-5 text-[#fe6603]" />
                <h3 className="text-base font-bold text-gray-900">Vendor Guidelines & Policies</h3>
              </div>
              <button 
                onClick={() => setShowGuidelines(false)}
                className="p-1 rounded-full text-gray-400 hover:text-gray-700 hover:bg-gray-100"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="space-y-3.5 text-xs text-gray-600 leading-relaxed">
              <div className="p-3 bg-orange-50/60 border border-orange-100 rounded-xl">
                <p className="font-bold text-[#fe6603] text-xs mb-1">1. Order Fulfillment & Dispatch</p>
                <p>Orders must be packed and marked as shipped with valid tracking within 48 hours of confirmation.</p>
              </div>

              <div className="p-3 bg-blue-50/60 border border-blue-100 rounded-xl">
                <p className="font-bold text-[#012980] text-xs mb-1">2. 7-Day Return Policy</p>
                <p>Shopper enforces a 7-day return window from delivery date. Vendors must review, respond, and process eligible return claims promptly.</p>
              </div>

              <div className="p-3 bg-green-50/60 border border-green-100 rounded-xl">
                <p className="font-bold text-[#036e26] text-xs mb-1">3. Genuine Products & Pricing</p>
                <p>All catalog products must accurately reflect authenticity, stock availability, and manufacturer warranties.</p>
              </div>

              <div className="p-3 bg-purple-50/60 border border-purple-100 rounded-xl">
                <p className="font-bold text-purple-700 text-xs mb-1">4. Bank & Wallet Payouts</p>
                <p>Ensure your bank details are active and accurate in your Virtual Wallet for seamless settlement withdrawals.</p>
              </div>
            </div>

            <button
              onClick={() => setShowGuidelines(false)}
              className="mt-5 w-full py-2.5 bg-gray-900 text-white rounded-xl font-bold text-xs hover:bg-gray-800 transition-colors"
            >
              Close Guidelines
            </button>
          </div>
        </div>
      )}

    </div>
  );
}
