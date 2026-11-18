import React, { useEffect, useState } from "react";
import { Mail, CheckCircle2, XCircle, RefreshCw, Send, ShieldCheck, Server, Clock, AlertTriangle } from "lucide-react";
import { toast } from "react-toastify";
import axios from "axios";

const BACKEND_URL = import.meta.env.VITE_BACKEND_URL || "http://localhost:5000/api";

export function AdminSettingsPage() {
  const [emailStatus, setEmailStatus] = useState(null);
  const [loadingStatus, setLoadingStatus] = useState(true);
  const [testingConnection, setTestingConnection] = useState(false);
  const [sendingTestMail, setSendingTestMail] = useState(false);
  const [testRecipient, setTestRecipient] = useState("");
  const [lastResult, setLastResult] = useState(null);

  // Settings
  const [customerPercent, setCustomerPercent] = useState("");
  const [vendorPercent, setVendorPercent] = useState("");
  const [savingSettings, setSavingSettings] = useState(false);

  const getHeaders = () => {
    const token = localStorage.getItem("token");
    return {
      headers: {
        Authorization: `Bearer ${token}`
      }
    };
  };

  const fetchEmailStatus = async () => {
    setLoadingStatus(true);
    try {
      const res = await axios.get(`${BACKEND_URL}/admin/email-status`, getHeaders());
      setEmailStatus(res.data);
      if (res.data.sender && !testRecipient) {
        setTestRecipient(res.data.sender);
      }
    } catch (err) {
      console.error("Failed to load email status:", err);
      toast.error("Could not fetch SMTP status");
    } finally {
      setLoadingStatus(false);
    }
  };

  const fetchPlatformSettings = async () => {
    try {
      const res = await axios.get(`${BACKEND_URL}/admin/settings`, getHeaders());
      if (res.data) {
        if (res.data.customer_referral_percent !== undefined) {
          setCustomerPercent(String(res.data.customer_referral_percent));
        }
        if (res.data.vendor_referral_percent !== undefined) {
          setVendorPercent(String(res.data.vendor_referral_percent));
        }
      }
    } catch (err) {
      console.error("Failed to load settings:", err);
    }
  };

  useEffect(() => {
    fetchEmailStatus();
    fetchPlatformSettings();
  }, []);

  const handleTestConnection = async () => {
    setTestingConnection(true);
    try {
      const res = await axios.post(`${BACKEND_URL}/admin/test-email`, {}, getHeaders());
      setLastResult({
        success: true,
        message: res.data.message || "SMTP handshake verified successfully",
        timestamp: res.data.timestamp || new Date().toISOString(),
        details: res.data
      });
      toast.success("✅ Gmail SMTP connection verified successfully!");
    } catch (err) {
      const errData = err.response?.data || {};
      setLastResult({
        success: false,
        message: errData.error || err.message || "Connection failed",
        timestamp: new Date().toISOString(),
        details: errData
      });
      toast.error("❌ SMTP Connection Failed: " + (errData.error || err.message));
    } finally {
      setTestingConnection(false);
    }
  };

  const handleSendTestEmail = async (e) => {
    e.preventDefault();
    if (!testRecipient) {
      toast.warning("Please enter a recipient email address");
      return;
    }
    setSendingTestMail(true);
    try {
      const res = await axios.post(
        `${BACKEND_URL}/admin/test-email`,
        { testRecipient: testRecipient.trim() },
        getHeaders()
      );
      setLastResult({
        success: true,
        message: res.data.message || `Test email dispatched to ${testRecipient}`,
        timestamp: res.data.timestamp || new Date().toISOString(),
        details: res.data
      });
      toast.success(`📧 Test email delivered to ${testRecipient}`);
    } catch (err) {
      const errData = err.response?.data || {};
      setLastResult({
        success: false,
        message: errData.error || err.message || "Failed to send test email",
        timestamp: new Date().toISOString(),
        details: errData
      });
      toast.error("❌ Email Delivery Failed: " + (errData.error || err.message));
    } finally {
      setSendingTestMail(false);
    }
  };

  const handleSaveSettings = async (e) => {
    e.preventDefault();
    setSavingSettings(true);
    try {
      if (customerPercent) {
        await axios.post(`${BACKEND_URL}/admin/settings`, { key: "customer_referral_percent", value: customerPercent }, getHeaders());
      }
      if (vendorPercent) {
        await axios.post(`${BACKEND_URL}/admin/settings`, { key: "vendor_referral_percent", value: vendorPercent }, getHeaders());
      }
      toast.success("Settings saved successfully");
    } catch (err) {
      toast.error("Failed to save settings: " + (err.response?.data?.error || err.message));
    } finally {
      setSavingSettings(false);
    }
  };

  return (
    <div className="space-y-6 max-w-5xl">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Email & System Settings</h1>
        <p className="text-sm text-gray-500 mt-1">
          Inspect and verify the real Gmail SMTP configuration, test live email delivery, and manage system preferences.
        </p>
      </div>

      {/* Gmail SMTP Status Card */}
      <div className="bg-white rounded-2xl border border-gray-100 p-6 shadow-sm">
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between pb-5 border-b border-gray-100 gap-4">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 rounded-xl bg-green-50 flex items-center justify-center text-green-600">
              <Mail className="w-6 h-6" />
            </div>
            <div>
              <h2 className="text-lg font-bold text-gray-900">Gmail SMTP Integration</h2>
              <p className="text-xs text-gray-500">Google Workspace / Gmail App Password connection</p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {loadingStatus ? (
              <span className="px-3 py-1 bg-gray-100 text-gray-600 rounded-full text-xs font-semibold flex items-center gap-1.5">
                <RefreshCw className="w-3.5 h-3.5 animate-spin" /> Checking...
              </span>
            ) : lastResult?.success || (emailStatus && emailStatus.configured) ? (
              <span className="px-3 py-1 bg-green-100 text-green-800 rounded-full text-xs font-bold flex items-center gap-1.5">
                <CheckCircle2 className="w-4 h-4 text-green-600" /> Connected
              </span>
            ) : (
              <span className="px-3 py-1 bg-red-100 text-red-800 rounded-full text-xs font-bold flex items-center gap-1.5">
                <XCircle className="w-4 h-4 text-red-600" /> Disconnected
              </span>
            )}
          </div>
        </div>

        {/* Configuration Overview */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mt-6">
          <div className="bg-gray-50 rounded-xl p-4">
            <div className="flex items-center gap-2 text-gray-500 text-xs mb-1">
              <Mail className="w-4 h-4 text-gray-400" /> Sender Email
            </div>
            <p className="font-semibold text-gray-900 text-sm truncate" title={emailStatus?.sender || "Not configured"}>
              {emailStatus?.sender || "swabhivarshopper@gmail.com"}
            </p>
          </div>

          <div className="bg-gray-50 rounded-xl p-4">
            <div className="flex items-center gap-2 text-gray-500 text-xs mb-1">
              <Server className="w-4 h-4 text-gray-400" /> Host & Protocol
            </div>
            <p className="font-semibold text-gray-900 text-sm">
              {emailStatus?.host || "smtp.gmail.com"} (STARTTLS)
            </p>
          </div>

          <div className="bg-gray-50 rounded-xl p-4">
            <div className="flex items-center gap-2 text-gray-500 text-xs mb-1">
              <ShieldCheck className="w-4 h-4 text-gray-400" /> Port & Security
            </div>
            <p className="font-semibold text-gray-900 text-sm">
              Port {emailStatus?.port || 587} &middot; TLS 1.2+
            </p>
          </div>

          <div className="bg-gray-50 rounded-xl p-4">
            <div className="flex items-center gap-2 text-gray-500 text-xs mb-1">
              <Clock className="w-4 h-4 text-gray-400" /> Last Tested
            </div>
            <p className="font-semibold text-gray-900 text-xs">
              {lastResult?.timestamp
                ? new Date(lastResult.timestamp).toLocaleTimeString("en-IN", { timeZone: "Asia/Kolkata" }) + " IST"
                : "Not tested this session"}
            </p>
          </div>
        </div>

        {/* Action Panel: Test Connection & Send Test Email */}
        <div className="mt-6 pt-6 border-t border-gray-100 flex flex-col lg:flex-row items-stretch lg:items-center justify-between gap-4">
          <button
            onClick={handleTestConnection}
            disabled={testingConnection}
            className="flex items-center justify-center gap-2 px-5 py-2.5 bg-gray-900 hover:bg-black text-white text-sm font-semibold rounded-xl transition-all shadow-sm disabled:opacity-50"
          >
            <RefreshCw className={`w-4 h-4 ${testingConnection ? "animate-spin" : ""}`} />
            {testingConnection ? "Verifying Handshake..." : "Test SMTP Handshake"}
          </button>

          <form onSubmit={handleSendTestEmail} className="flex-1 flex flex-col sm:flex-row items-center gap-2 max-w-xl">
            <input
              type="email"
              value={testRecipient}
              onChange={(e) => setTestRecipient(e.target.value)}
              placeholder="Recipient email address"
              className="w-full text-sm px-4 py-2.5 bg-gray-50 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-green-500 focus:bg-white"
            />
            <button
              type="submit"
              disabled={sendingTestMail}
              className="w-full sm:w-auto whitespace-nowrap flex items-center justify-center gap-2 px-5 py-2.5 bg-green-600 hover:bg-green-700 text-white text-sm font-semibold rounded-xl transition-all shadow-sm disabled:opacity-50"
            >
              <Send className={`w-4 h-4 ${sendingTestMail ? "animate-pulse" : ""}`} />
              {sendingTestMail ? "Sending..." : "Send Test Email"}
            </button>
          </form>
        </div>

        {/* Live Response Box */}
        {lastResult && (
          <div className={`mt-6 p-4 rounded-xl border ${lastResult.success ? "bg-green-50/70 border-green-200 text-green-900" : "bg-red-50/70 border-red-200 text-red-900"}`}>
            <div className="flex items-start gap-3">
              {lastResult.success ? (
                <CheckCircle2 className="w-5 h-5 text-green-600 shrink-0 mt-0.5" />
              ) : (
                <AlertTriangle className="w-5 h-5 text-red-600 shrink-0 mt-0.5" />
              )}
              <div className="text-xs space-y-1">
                <p className="font-bold text-sm">{lastResult.message}</p>
                {lastResult.details?.messageId && (
                  <p className="font-mono text-[11px] text-green-700">
                    Message ID: {lastResult.details.messageId}
                  </p>
                )}
                <p className="text-gray-500 text-[11px]">
                  Timestamp: {new Date(lastResult.timestamp).toLocaleString("en-IN", { timeZone: "Asia/Kolkata" })} IST
                </p>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Referral & Platform Settings Card */}
      <div className="bg-white rounded-2xl border border-gray-100 p-6 shadow-sm">
        <h2 className="text-lg font-bold text-gray-900 mb-1">Referral Reward Rules</h2>
        <p className="text-xs text-gray-500 mb-6">Configure platform percentages stored in PostgreSQL settings.</p>

        <form onSubmit={handleSaveSettings} className="space-y-4 max-w-lg">
          <div>
            <label className="block text-xs font-semibold text-gray-700 mb-1">Customer Referral Reward (%)</label>
            <input
              type="number"
              step="0.01"
              value={customerPercent}
              onChange={(e) => setCustomerPercent(e.target.value)}
              placeholder="e.g. 5"
              className="w-full text-sm px-4 py-2.5 bg-gray-50 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-green-500 focus:bg-white"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-gray-700 mb-1">Vendor Referral Reward (%)</label>
            <input
              type="number"
              step="0.01"
              value={vendorPercent}
              onChange={(e) => setVendorPercent(e.target.value)}
              placeholder="e.g. 10"
              className="w-full text-sm px-4 py-2.5 bg-gray-50 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-green-500 focus:bg-white"
            />
          </div>

          <button
            type="submit"
            disabled={savingSettings}
            className="px-6 py-2.5 bg-green-600 hover:bg-green-700 text-white text-sm font-semibold rounded-xl transition-all shadow-sm disabled:opacity-50"
          >
            {savingSettings ? "Saving..." : "Save Settings"}
          </button>
        </form>
      </div>
    </div>
  );
}

