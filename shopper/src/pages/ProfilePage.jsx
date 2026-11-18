import React from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Package, Heart, MapPin, Wallet, Tag, Bell, Settings, LogOut, ChevronRight, ChevronLeft, User, Gift } from 'lucide-react';
import { Header } from '../components/Header';
import { useAuthStore } from '../store/useAuthStore';
import { navigateBackSafe } from '../utils/backNavigation';

export function ProfilePage() {
  const { user, token, logout } = useAuthStore();
  const navigate = useNavigate();

  if (!token) {
    return (
      <div className="min-h-screen bg-[#f9f9f9] flex flex-col items-center justify-center gap-4 pb-20 px-4">
        <div className="w-full max-w-md flex items-center mb-4">
          <button
            onClick={() => navigateBackSafe(navigate, '/')}
            className="p-2 text-gray-700 hover:text-gray-900 hover:bg-gray-200/60 rounded-full transition-colors border border-gray-200 bg-white shadow-xs"
            aria-label="Back"
          >
            <ChevronLeft className="w-5 h-5" />
          </button>
        </div>
        <User className="w-16 h-16 text-gray-400" />
        <p className="text-gray-900 font-bold">You're not logged in</p>
        <Link to="/login" className="bg-gradient-to-r from-brand-navy to-blue-500 text-white font-bold px-8 py-3 rounded-xl text-sm shadow-md hover:-translate-y-0.5 transition-all">Login</Link>
        <Link to="/signup" className="text-brand-navy text-sm font-bold hover:underline">Create Account</Link>
      </div>
    );
  }

  const initials = user?.name?.split(' ').map(n => n[0]).join('').substring(0, 2).toUpperCase() || 'U';

  const menuItems = [
    { icon: Package, label: 'My Orders', action: () => navigate('/my-orders') },
    { icon: Gift, label: 'Refer & Earn', action: () => navigate('/refer') },
    { icon: Heart, label: 'Wishlist', action: () => navigate('/wishlist') },
    { icon: MapPin, label: 'Saved Addresses', action: () => navigate('/my-addresses') },
    { icon: Settings, label: 'Account Settings', action: () => navigate('/account-settings') },
  ];

  return (
    <div className="min-h-screen bg-[#f9f9f9] pb-20">
      <div className="bg-[#012980] border-b border-[#001d5a] text-white px-6 pt-4 pb-8 shadow-md">
        <div className="max-w-4xl mx-auto mb-4 flex items-center justify-between">
          <button
            onClick={() => navigateBackSafe(navigate, '/')}
            className="p-2 -ml-2 text-white/90 hover:text-white hover:bg-white/10 rounded-full transition-colors flex items-center gap-1.5 text-xs font-semibold"
            aria-label="Back"
          >
            <ChevronLeft className="w-5 h-5" />
            <span>Back</span>
          </button>
          <span className="text-sm font-semibold opacity-80">My Profile</span>
          <div className="w-8" />
        </div>
        <div className="max-w-4xl mx-auto flex items-center gap-4">
          <div className="w-16 h-16 bg-white/10 rounded-full flex items-center justify-center border border-white/20 shrink-0">
            <User className="w-8 h-8 text-white" />
          </div>
          <div>
            <h1 className="text-xl font-bold font-serif">{user?.name}</h1>
            <p className="text-xs text-gray-300 mt-0.5">{user?.phone || user?.email}</p>
            <Link to="/dashboard"
              className="mt-3 inline-block bg-brand-navy/20 hover:bg-brand-navy/30 text-brand-navy hover:text-white text-xs font-bold px-4 py-1.5 rounded-full border border-brand-navy/30 transition-all">
              View Dashboard
            </Link>
          </div>
        </div>
      </div>

      <div className="p-4 mt-6 max-w-4xl mx-auto">
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
          {menuItems.map((item, index) => {
            const Icon = item.icon;
            return (
              <button key={index} onClick={item.action}
                className={`w-full flex items-center justify-between p-4 bg-white hover:bg-gray-50 transition-colors ${index !== menuItems.length - 1 ? 'border-b border-gray-100' : ''}`}>
                <div className="flex items-center gap-3 text-gray-900">
                  <Icon className="w-5 h-5 text-brand-navy" />
                  <span className="text-sm font-bold">{item.label}</span>
                </div>
                <ChevronRight className="w-5 h-5 text-gray-400" />
              </button>
            );
          })}
          <button onClick={() => { logout(); navigate('/'); }}
            className="w-full flex items-center justify-between p-4 bg-white hover:bg-red-50 transition-colors border-t border-gray-100">
            <div className="flex items-center gap-3 text-red-500">
              <LogOut className="w-5 h-5" />
              <span className="text-sm font-bold">Logout</span>
            </div>
            <ChevronRight className="w-5 h-5 text-red-300" />
          </button>
        </div>
      </div>
    </div>
  );
}
