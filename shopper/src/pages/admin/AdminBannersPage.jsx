import React, { useEffect, useState } from "react";
import { ImageIcon, Plus, Trash2, Edit2, X, Save, Upload, ExternalLink, Eye, EyeOff } from "lucide-react";
import { motion } from "framer-motion";
import { toast } from "react-toastify";

const BACKEND_URL = import.meta.env.VITE_BACKEND_URL || "http://localhost:5000/api";

const PLACEMENT_CONFIG = {
  homepage_hero: {
    label: "Homepage Top Slider",
    badge: "bg-blue-50 text-blue-700 border-blue-200",
    aspect: "aspect-[21/9]",
    hint: "Recommended: 1920x800 or 16:9 landscape. Displays in top hero carousel on Home."
  },
  category_banner: {
    label: "Shop / Category Page Banner",
    badge: "bg-emerald-50 text-emerald-700 border-emerald-200",
    aspect: "aspect-[21/9] md:aspect-[3/1]",
    hint: "Recommended: 1200x400 landscape. Displays above products in Shop & Category pages."
  },
  collection_banner: {
    label: "Beautiful Collections",
    badge: "bg-purple-50 text-purple-700 border-purple-200",
    aspect: "aspect-[3/4]",
    hint: "Recommended: 600x800 or 3:4 portrait card. Displays in the 2x2 Collections grid on Home."
  },
  budget_banner: {
    label: "Shop By Budget",
    badge: "bg-amber-50 text-amber-700 border-amber-200",
    aspect: "aspect-[3/4]",
    hint: "Recommended: 400x500 portrait deal card. Displays under Shop By Budget on Home."
  }
};

const TABS = [
  { value: "all", label: "All Banners" },
  { value: "homepage_hero", label: "Homepage Top Slider" },
  { value: "category_banner", label: "Shop / Category Page" },
  { value: "collection_banner", label: "Beautiful Collections" },
  { value: "budget_banner", label: "Shop By Budget" }
];

export function AdminBannersPage() {
  const [banners, setBanners] = useState([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState("all");
  const [editBanner, setEditBanner] = useState(null);
  const [formData, setFormData] = useState({
    title: "",
    image_url: "",
    link_url: "",
    type: "homepage_hero",
    is_active: true
  });
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [isNew, setIsNew] = useState(false);

  useEffect(() => {
    fetchBanners();
  }, []);

  const fetchBanners = async () => {
    try {
      const token = localStorage.getItem("token");
      const res = await fetch(`${BACKEND_URL}/admin/banners`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      const data = await res.json();
      if (data.banners) setBanners(data.banners);
    } catch (err) {
      console.error(err);
      toast.error("Failed to load banners");
    } finally {
      setLoading(false);
    }
  };

  const handleAdd = (defaultType = "homepage_hero") => {
    const selectedType = activeTab === "all" ? defaultType : activeTab;
    setFormData({
      title: "",
      image_url: "",
      link_url: "",
      type: selectedType,
      is_active: true
    });
    setEditBanner({});
    setIsNew(true);
  };

  const handleEdit = (banner) => {
    setFormData({
      ...banner,
      type: banner.type || "homepage_hero"
    });
    setEditBanner(banner);
    setIsNew(false);
  };

  const handleDelete = async (id) => {
    if (!confirm("Are you sure you want to delete this banner?")) return;
    try {
      const token = localStorage.getItem("token");
      const res = await fetch(`${BACKEND_URL}/admin/banners/${id}`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${token}` }
      });
      if (res.ok) {
        toast.success("Banner deleted successfully");
        fetchBanners();
      } else {
        toast.error("Failed to delete banner");
      }
    } catch (err) {
      console.error(err);
      toast.error("Delete error");
    }
  };

  const handleSave = async () => {
    if (!formData.image_url) {
      toast.error("Please upload or provide a banner image");
      return;
    }

    setSaving(true);
    try {
      const token = localStorage.getItem("token");
      const isEditing = !!formData.id;
      const url = isEditing ? `${BACKEND_URL}/admin/banners/${formData.id}` : `${BACKEND_URL}/admin/banners`;
      const res = await fetch(url, {
        method: isEditing ? "PUT" : "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify(formData),
      });

      if (res.ok) {
        toast.success(isEditing ? "Banner updated successfully" : "Banner created successfully");
        setEditBanner(null);
        fetchBanners();
      } else {
        toast.error("Failed to save banner");
      }
    } catch (err) {
      console.error(err);
      toast.error("Save error");
    } finally {
      setSaving(false);
    }
  };

  const handleImageUpload = async (e) => {
    const file = e.target.files[0];
    if (!file) return;

    setUploading(true);
    try {
      const token = localStorage.getItem("token");
      const uploadData = new FormData();
      uploadData.append("image", file);
      uploadData.append("folder", "banners");

      const res = await fetch(`${BACKEND_URL}/admin/upload`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
        body: uploadData,
      });

      const data = await res.json();
      if (data.url) {
        setFormData(prev => ({ ...prev, image_url: data.url }));
        toast.success("Image uploaded to AWS S3!");
      } else {
        toast.error(data.error || "Upload failed");
      }
    } catch (err) {
      console.error(err);
      toast.error("Upload error");
    } finally {
      setUploading(false);
    }
  };

  const filteredBanners = banners.filter(b => {
    if (activeTab === "all") return true;
    const bType = b.type || "homepage_hero";
    return bType === activeTab;
  });

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="w-8 h-8 border-4 border-gray-200 border-t-brand-navy rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="w-full max-w-6xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl md:text-3xl font-bold text-gray-900 tracking-tight">Banners Management</h1>
          <p className="text-gray-500 text-xs md:text-sm mt-1">
            Upload and control banners across Homepage Hero, Shop/Category page, Beautiful Collections, and Budget deals.
          </p>
        </div>
        <button
          onClick={() => handleAdd()}
          className="flex items-center justify-center gap-2 bg-[#012980] hover:bg-blue-900 text-white px-5 py-2.5 rounded-xl font-bold text-sm shadow-md transition-all active:scale-95 shrink-0"
        >
          <Plus className="w-4 h-4" /> Add New Banner
        </button>
      </div>

      {/* Tabs */}
      <div className="flex items-center gap-2 overflow-x-auto hide-scrollbar pb-1 border-b border-gray-100">
        {TABS.map(tab => {
          const count = tab.value === "all"
            ? banners.length
            : banners.filter(b => (b.type || "homepage_hero") === tab.value).length;

          return (
            <button
              key={tab.value}
              onClick={() => setActiveTab(tab.value)}
              className={`px-4 py-2.5 rounded-xl text-xs md:text-sm font-semibold transition-all whitespace-nowrap flex items-center gap-2 ${
                activeTab === tab.value
                  ? "bg-[#012980] text-white shadow-sm"
                  : "bg-white text-gray-600 hover:bg-gray-50 hover:text-gray-900 border border-gray-200"
              }`}
            >
              <span>{tab.label}</span>
              <span className={`px-1.5 py-0.5 rounded-full text-[10px] font-bold ${
                activeTab === tab.value ? "bg-white/20 text-white" : "bg-gray-100 text-gray-600"
              }`}>
                {count}
              </span>
            </button>
          );
        })}
      </div>

      {/* Banner Grid */}
      {filteredBanners.length === 0 ? (
        <div className="bg-white rounded-2xl border border-dashed border-gray-300 p-12 text-center flex flex-col items-center">
          <div className="w-16 h-16 rounded-full bg-blue-50 flex items-center justify-center text-brand-navy mb-4">
            <ImageIcon className="w-8 h-8" />
          </div>
          <h3 className="text-lg font-bold text-gray-900 mb-1">No banners in this section</h3>
          <p className="text-gray-500 text-xs max-w-sm mb-6">
            Upload a banner to customize this section on the customer website and mobile app.
          </p>
          <button
            onClick={() => handleAdd(activeTab === "all" ? "homepage_hero" : activeTab)}
            className="flex items-center gap-2 bg-[#012980] text-white px-5 py-2.5 rounded-xl font-bold text-xs shadow-sm hover:bg-blue-900 transition-colors"
          >
            <Plus className="w-4 h-4" /> Add {activeTab === "all" ? "Banner" : PLACEMENT_CONFIG[activeTab]?.label || "Banner"}
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {filteredBanners.map((banner, i) => {
            const placement = PLACEMENT_CONFIG[banner.type] || PLACEMENT_CONFIG.homepage_hero;
            const isPortrait = banner.type === "collection_banner" || banner.type === "budget_banner";

            return (
              <motion.div
                key={banner.id}
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: i * 0.04 }}
                className="bg-white rounded-2xl border border-gray-100 overflow-hidden shadow-sm hover:shadow-md transition-shadow flex flex-col"
              >
                {/* Image Preview Container */}
                <div className={`relative ${isPortrait ? "aspect-[4/3] md:aspect-[3/4]" : "aspect-[21/9]"} bg-gray-50 overflow-hidden`}>
                  {banner.image_url ? (
                    <img
                      src={banner.image_url}
                      alt={banner.title}
                      className="w-full h-full object-cover"
                    />
                  ) : (
                    <div className="flex items-center justify-center h-full text-gray-400">
                      <ImageIcon className="w-10 h-10" />
                    </div>
                  )}

                  {/* Actions overlay */}
                  <div className="absolute top-2 right-2 flex gap-1.5 z-10">
                    <button
                      onClick={() => handleEdit(banner)}
                      className="bg-white/90 hover:bg-white text-gray-800 p-2 rounded-full shadow-md transition-all active:scale-90"
                      title="Edit banner"
                    >
                      <Edit2 className="w-4 h-4" />
                    </button>
                    <button
                      onClick={() => handleDelete(banner.id)}
                      className="bg-white/90 hover:bg-white text-red-600 p-2 rounded-full shadow-md transition-all active:scale-90"
                      title="Delete banner"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>

                  {/* Status & Placement badges */}
                  <div className="absolute bottom-2 left-2 flex flex-wrap gap-1.5 z-10">
                    <span className={`px-2.5 py-1 rounded-full text-[10px] font-bold border backdrop-blur-xs shadow-xs ${placement.badge}`}>
                      {placement.label}
                    </span>
                    {!banner.is_active && (
                      <span className="bg-red-500/90 text-white px-2 py-1 rounded-full text-[10px] font-bold uppercase tracking-wider shadow-xs">
                        Inactive
                      </span>
                    )}
                  </div>
                </div>

                {/* Banner Info */}
                <div className="p-4 flex-1 flex flex-col justify-between">
                  <div>
                    <h3 className="font-bold text-gray-900 text-sm truncate" title={banner.title}>
                      {banner.title || "Untitled Banner"}
                    </h3>
                    <p className="text-gray-500 text-xs mt-1 truncate" title={banner.link_url}>
                      {banner.link_url ? (
                        <span className="flex items-center gap-1 text-blue-600">
                          <ExternalLink className="w-3 h-3 inline shrink-0" /> {banner.link_url}
                        </span>
                      ) : (
                        "No redirect link set"
                      )}
                    </p>
                  </div>
                  <div className="mt-3 pt-3 border-t border-gray-100 flex items-center justify-between text-[11px] text-gray-400">
                    <span>ID #{banner.id}</span>
                    <span className={`font-semibold ${banner.is_active ? "text-emerald-600" : "text-gray-400"}`}>
                      {banner.is_active ? "Live" : "Draft / Hidden"}
                    </span>
                  </div>
                </div>
              </motion.div>
            );
          })}
        </div>
      )}

      {/* Add / Edit Modal */}
      {editBanner && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-xs flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-3xl w-full max-w-lg overflow-hidden flex flex-col max-h-[92vh] shadow-2xl border border-gray-100">
            {/* Modal Header */}
            <div className="bg-white border-b border-gray-100 px-6 py-4 flex items-center justify-between shrink-0">
              <div>
                <h2 className="text-lg font-bold text-gray-900">{isNew ? "Add New Banner" : "Edit Banner"}</h2>
                <p className="text-xs text-gray-500">Configure banner placement, image upload, and redirect link.</p>
              </div>
              <button
                onClick={() => setEditBanner(null)}
                className="text-gray-400 hover:text-gray-700 p-1.5 rounded-full hover:bg-gray-100 transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Modal Form */}
            <div className="p-6 space-y-4 overflow-y-auto">
              {/* Placement Selector */}
              <div>
                <label className="text-xs font-bold text-gray-800 uppercase tracking-wide mb-1.5 block">
                  Banner Placement / Section *
                </label>
                <select
                  value={formData.type || "homepage_hero"}
                  onChange={(e) => setFormData(prev => ({ ...prev, type: e.target.value }))}
                  className="w-full px-3.5 py-2.5 rounded-xl bg-gray-50 border border-gray-200 text-gray-900 text-sm font-semibold focus:outline-none focus:border-brand-navy focus:bg-white transition-all"
                >
                  <option value="homepage_hero">Homepage Top Slider (Main carousel on Home)</option>
                  <option value="category_banner">Shop / Category Page Banner (Above product catalogue)</option>
                  <option value="collection_banner">Beautiful Collections (Wedding, Festival, Office, Casual cards)</option>
                  <option value="budget_banner">Shop By Budget (Budget deal cards on Home)</option>
                </select>
                <p className="text-[11px] text-gray-500 mt-1.5">
                  {PLACEMENT_CONFIG[formData.type || "homepage_hero"]?.hint}
                </p>
              </div>

              {/* Title */}
              <div>
                <label className="text-xs font-bold text-gray-800 uppercase tracking-wide mb-1.5 block">
                  Banner Title / Heading
                </label>
                <input
                  type="text"
                  placeholder="e.g. Festive Silk Sarees, Wedding Collection"
                  value={formData.title}
                  onChange={(e) => setFormData(prev => ({ ...prev, title: e.target.value }))}
                  className="w-full px-3.5 py-2.5 rounded-xl bg-gray-50 border border-gray-200 text-gray-900 text-sm focus:outline-none focus:border-brand-navy focus:bg-white transition-all"
                />
              </div>

              {/* Image Upload & Preview */}
              <div>
                <label className="text-xs font-bold text-gray-800 uppercase tracking-wide mb-1.5 block">
                  Banner Image *
                </label>
                {formData.image_url ? (
                  <div className="relative rounded-2xl overflow-hidden mb-3 border border-gray-200 bg-gray-50">
                    <img
                      src={formData.image_url}
                      alt="Banner Preview"
                      className="w-full max-h-52 object-contain bg-white"
                    />
                    <button
                      onClick={() => setFormData(prev => ({ ...prev, image_url: "" }))}
                      className="absolute top-2 right-2 bg-white/95 text-red-600 p-2 rounded-full hover:bg-white shadow-md transition-colors"
                      title="Remove image"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                ) : (
                  <div className="space-y-3">
                    <label className="w-full flex flex-col items-center justify-center px-4 py-8 bg-gray-50 hover:bg-blue-50/30 border-2 border-dashed border-gray-300 hover:border-brand-navy/50 rounded-2xl cursor-pointer transition-colors">
                      <input
                        type="file"
                        accept="image/*"
                        onChange={handleImageUpload}
                        className="hidden"
                        disabled={uploading}
                      />
                      <Upload className="w-8 h-8 text-gray-400 mb-2" />
                      <span className="text-sm font-bold text-gray-700">
                        {uploading ? "Uploading to AWS S3..." : "Click to upload banner image"}
                      </span>
                      <span className="text-xs text-gray-400 mt-1">PNG, JPG, WebP supported</span>
                    </label>

                    <div className="relative flex py-1 items-center">
                      <div className="flex-grow border-t border-gray-200"></div>
                      <span className="flex-shrink mx-4 text-gray-400 text-xs">or paste image URL</span>
                      <div className="flex-grow border-t border-gray-200"></div>
                    </div>

                    <input
                      type="url"
                      placeholder="https://example.com/banner.jpg"
                      value={formData.image_url}
                      onChange={(e) => setFormData(prev => ({ ...prev, image_url: e.target.value }))}
                      className="w-full px-3.5 py-2 rounded-xl bg-gray-50 border border-gray-200 text-gray-900 text-xs focus:outline-none focus:border-brand-navy focus:bg-white"
                    />
                  </div>
                )}
              </div>

              {/* Link URL */}
              <div>
                <label className="text-xs font-bold text-gray-800 uppercase tracking-wide mb-1.5 block">
                  Redirect Link URL
                </label>
                <input
                  type="text"
                  placeholder="e.g. /category/all, /collection/wedding, or https://..."
                  value={formData.link_url}
                  onChange={(e) => setFormData(prev => ({ ...prev, link_url: e.target.value }))}
                  className="w-full px-3.5 py-2.5 rounded-xl bg-gray-50 border border-gray-200 text-gray-900 text-sm focus:outline-none focus:border-brand-navy focus:bg-white transition-all"
                />
              </div>

              {/* Status Toggle */}
              <div className="flex items-center justify-between p-3.5 bg-gray-50 rounded-2xl border border-gray-100">
                <div>
                  <span className="text-sm font-bold text-gray-900 block">Banner Active Status</span>
                  <span className="text-xs text-gray-500">Show this banner live on the customer site</span>
                </div>
                <input
                  type="checkbox"
                  id="banner_active"
                  checked={formData.is_active}
                  onChange={(e) => setFormData(prev => ({ ...prev, is_active: e.target.checked }))}
                  className="w-5 h-5 rounded text-[#012980] focus:ring-0 cursor-pointer"
                />
              </div>
            </div>

            {/* Modal Actions */}
            <div className="border-t border-gray-100 px-6 py-4 flex gap-3 bg-gray-50/50">
              <button
                type="button"
                onClick={() => setEditBanner(null)}
                className="flex-1 px-4 py-2.5 bg-white border border-gray-200 text-gray-700 rounded-xl font-bold text-sm hover:bg-gray-50 transition-colors"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleSave}
                disabled={saving || uploading}
                className="flex-1 px-4 py-2.5 bg-[#012980] text-white hover:bg-blue-900 rounded-xl font-bold text-sm flex justify-center items-center gap-2 shadow-md transition-all active:scale-95 disabled:opacity-50"
              >
                {saving ? (
                  <div className="w-4 h-4 border-2 border-white/20 border-t-white rounded-full animate-spin" />
                ) : (
                  <Save className="w-4 h-4" />
                )}
                <span>{saving ? "Saving..." : "Save Banner"}</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
