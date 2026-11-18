import React, { useState, useEffect } from 'react';
import { 
  Layers, CheckCircle2, Lock, Edit3, X, AlertTriangle, 
  ArrowRight, Plus, RefreshCw, Package, ShieldAlert, Check, Undo2
} from 'lucide-react';
import { toast } from 'react-toastify';
import { useStoreData } from '../../store/useStoreData';

const BACKEND_URL = import.meta.env.VITE_BACKEND_URL || "http://localhost:5000/api";

export function VendorCategoriesPage() {
  const [categories, setCategories] = useState([]);
  const [selectedCategories, setSelectedCategories] = useState([]);
  const [savedCategories, setSavedCategories] = useState([]);
  const [categoryLimit, setCategoryLimit] = useState(null);
  const [productCounts, setProductCounts] = useState({});
  const [totalActiveProducts, setTotalActiveProducts] = useState(0);
  
  // UI & Workflow states
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [isEditing, setIsEditing] = useState(false);

  // Replacement Preview Modal state
  const [showPreviewModal, setShowPreviewModal] = useState(false);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [replacementPreview, setReplacementPreview] = useState(null);

  const token = localStorage.getItem('vendor_token');
  const headers = { 
    'Authorization': `Bearer ${token}`,
    'Content-Type': 'application/json'
  };

  const fetchData = async () => {
    try {
      setLoading(true);
      const [catsRes, selRes] = await Promise.all([
        fetch(`${BACKEND_URL}/vendor/categories`, { headers: { 'Authorization': `Bearer ${token}` } }),
        fetch(`${BACKEND_URL}/vendor/categories/selected`, { headers: { 'Authorization': `Bearer ${token}` } })
      ]);
      
      const catsData = await catsRes.json();
      const selData = await selRes.json();
      
      if (catsRes.ok) setCategories(catsData.categories || []);
      if (selRes.ok) {
        const selected = selData.selected_categories || [];
        setSavedCategories(selected);
        setSelectedCategories(selected);
        setCategoryLimit(selData.category_limit);
        setProductCounts(selData.product_counts_by_category || {});
        setTotalActiveProducts(selData.total_active_products || 0);
      }
    } catch (error) {
      toast.error('Failed to load categories');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  const isLocked = savedCategories.length > 0 && !isEditing;

  // Toggle category in either first-time selection or edit mode
  const handleToggleCategory = (categoryName) => {
    if (isLocked) return;
    
    if (selectedCategories.includes(categoryName)) {
      setSelectedCategories(prev => prev.filter(c => c !== categoryName));
    } else {
      if (categoryLimit && selectedCategories.length >= categoryLimit) {
        toast.error(`You can only select up to ${categoryLimit} categories on your current plan.`);
        return;
      }
      setSelectedCategories(prev => [...prev, categoryName]);
    }
  };

  // Start Category Edit Mode
  const handleStartEdit = () => {
    setIsEditing(true);
    setSelectedCategories([...savedCategories]);
  };

  // Cancel Category Edit Mode
  const handleCancelEdit = () => {
    setIsEditing(false);
    setSelectedCategories([...savedCategories]);
    setReplacementPreview(null);
  };

  // First-time Save
  const handleInitialSave = async () => {
    if (selectedCategories.length === 0) {
      toast.error('Please select at least one category.');
      return;
    }
    
    setSaving(true);
    try {
      const res = await fetch(`${BACKEND_URL}/vendor/categories/selected`, {
        method: 'POST',
        headers,
        body: JSON.stringify({ categories: selectedCategories })
      });
      const data = await res.json();
      
      if (res.ok) {
        toast.success(data.message || 'Categories saved successfully!');
        setSavedCategories(selectedCategories);
        fetchData();
      } else {
        toast.error(data.error || 'Failed to save categories');
      }
    } catch (err) {
      toast.error('An error occurred while saving categories');
    } finally {
      setSaving(false);
    }
  };

  // Open Replacement Preview Modal
  const handleOpenPreview = async () => {
    if (selectedCategories.length === 0) {
      toast.error('Please select at least one category.');
      return;
    }

    // Check if any change actually happened
    const isSame = 
      selectedCategories.length === savedCategories.length &&
      selectedCategories.every(c => savedCategories.includes(c));

    if (isSame) {
      toast.info('No changes made to your selected categories.');
      setIsEditing(false);
      return;
    }

    setPreviewLoading(true);
    setShowPreviewModal(true);

    try {
      const res = await fetch(`${BACKEND_URL}/vendor/categories/preview-replacement`, {
        method: 'POST',
        headers,
        body: JSON.stringify({ new_categories: selectedCategories })
      });
      const data = await res.json();
      if (res.ok) {
        setReplacementPreview(data);
      } else {
        toast.error(data.error || 'Failed to generate replacement preview');
        setShowPreviewModal(false);
      }
    } catch (err) {
      toast.error('Failed to preview category replacement');
      setShowPreviewModal(false);
    } finally {
      setPreviewLoading(false);
    }
  };

  // Execute Category Replacement with Atomic Product Archiving
  const handleExecuteReplacement = async () => {
    setSaving(true);
    try {
      const res = await fetch(`${BACKEND_URL}/vendor/categories/replace`, {
        method: 'POST',
        headers,
        body: JSON.stringify({ 
          new_categories: selectedCategories,
          confirmed: true 
        })
      });
      const data = await res.json();

      if (res.ok) {
        toast.success(data.message || 'Categories replaced successfully!');
        setSavedCategories(selectedCategories);
        setIsEditing(false);
        setShowPreviewModal(false);
        setReplacementPreview(null);
        // Refresh product stores
        useStoreData.getState().refreshProducts();
        await fetchData();
      } else {
        toast.error(data.error || 'Failed to replace categories');
      }
    } catch (err) {
      toast.error('An error occurred during category replacement');
    } finally {
      setSaving(false);
    }
  };

  // Helper diff arrays for edit mode
  const removedCategories = savedCategories.filter(c => !selectedCategories.includes(c));
  const addedCategories = selectedCategories.filter(c => !savedCategories.includes(c));

  return (
    <div className="space-y-4 sm:space-y-6 max-w-7xl mx-auto w-full">
      {/* ======================================================== */}
      {/* 1. HEADER SECTION                                        */}
      {/* ======================================================== */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 sm:gap-4">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-2xl sm:text-3xl font-extrabold text-gray-900 tracking-tight">Platform Categories</h1>
            {savedCategories.length > 0 && !isEditing && (
              <span className="hidden sm:inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-bold bg-green-100 text-green-800 border border-green-200">
                <Check className="w-3 h-3" /> Active
              </span>
            )}
          </div>
          <p className="text-gray-500 mt-1 text-xs sm:text-sm font-medium">
            {isEditing
              ? 'Select replacement categories. Deselecting a category will archive its active products from the store.'
              : savedCategories.length > 0
                ? 'Your active store categories. You can replace or edit your selection within your plan entitlement.'
                : 'Choose the categories you want to sell products in.'}
          </p>
        </div>
        
        {/* Plan Limit & Selection Counters */}
        <div className="flex flex-wrap items-center gap-2 sm:gap-3 self-start sm:self-auto">
          {categoryLimit && (
            <div className="bg-blue-50/80 border border-blue-200/80 px-3.5 sm:px-4 py-2 rounded-xl flex items-center gap-2 shadow-2xs">
              <span className="text-[11px] font-bold text-blue-700 uppercase tracking-wider">Plan Limit:</span>
              <span className="font-extrabold text-[#012980] text-sm sm:text-base">{categoryLimit} Categories</span>
            </div>
          )}
          <div className="bg-gray-100 border border-gray-200 px-3.5 sm:px-4 py-2 rounded-xl flex items-center gap-2 shadow-2xs">
            <span className="text-[11px] font-bold text-gray-500 uppercase tracking-wider">Selected:</span>
            <span className={`font-extrabold text-sm sm:text-base ${selectedCategories.length === categoryLimit ? 'text-green-700' : 'text-gray-900'}`}>
              {selectedCategories.length}{categoryLimit ? ` / ${categoryLimit}` : ''}
            </span>
          </div>
        </div>
      </div>

      {/* ======================================================== */}
      {/* 2. EDIT MODE BANNER                                      */}
      {/* ======================================================== */}
      {isEditing && (
        <div className="bg-amber-50 border-2 border-amber-300/80 rounded-2xl p-4 sm:p-5 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 shadow-xs">
          <div className="flex items-start gap-3">
            <div className="w-9 h-9 rounded-xl bg-amber-500 text-white flex items-center justify-center shrink-0 mt-0.5">
              <AlertTriangle className="w-5 h-5" />
            </div>
            <div>
              <h3 className="font-bold text-amber-900 text-sm sm:text-base">Category Editing & Replacement Mode</h3>
              <p className="text-xs sm:text-sm text-amber-800/90 mt-0.5 leading-relaxed">
                Tap on an existing category to remove it, and choose a replacement. 
                <span className="font-semibold block sm:inline sm:ml-1 text-amber-950">
                  Products in removed categories will be safely archived and hidden from customer listings.
                </span>
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2 w-full sm:w-auto justify-end pt-2 sm:pt-0 border-t border-amber-200/60 sm:border-0">
            <button
              type="button"
              onClick={handleCancelEdit}
              className="px-3.5 py-2 text-xs font-bold text-gray-700 bg-white border border-gray-300 rounded-xl hover:bg-gray-50 transition-colors"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={handleOpenPreview}
              disabled={selectedCategories.length === 0}
              className="px-4 py-2 text-xs font-bold text-white bg-gradient-to-r from-[#012980] to-[#ff7b23] rounded-xl hover:shadow-md transition-all flex items-center gap-1.5 disabled:opacity-50"
            >
              <span>Review Changes</span>
              <ArrowRight className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      )}

      {/* ======================================================== */}
      {/* 3. CATEGORY CARDS GRID                                   */}
      {/* ======================================================== */}
      <div className="bg-white rounded-2xl sm:rounded-[24px] shadow-sm border border-gray-100 p-4 sm:p-6 lg:p-8">
        {loading ? (
          <div className="py-16 text-center text-gray-500">
            <div className="w-8 h-8 border-4 border-[#012980]/20 border-t-[#012980] rounded-full animate-spin mx-auto mb-3" />
            <p className="text-sm font-semibold">Loading platform categories...</p>
          </div>
        ) : categories.length === 0 ? (
          <div className="py-16 text-center text-gray-500">
            <Layers className="w-12 h-12 text-gray-300 mx-auto mb-3" />
            <p className="font-semibold">No platform categories available.</p>
          </div>
        ) : (
          <>
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3 sm:gap-4 md:gap-5 mb-6 sm:mb-8">
              {categories.map(category => {
                const isSelected = selectedCategories.includes(category.name);
                const isPreviouslySaved = savedCategories.includes(category.name);
                const isBeingRemoved = isEditing && isPreviouslySaved && !isSelected;
                const isBeingAdded = isEditing && !isPreviouslySaved && isSelected;
                const activeCount = productCounts[category.name] || 0;

                return (
                  <div 
                    key={category.id} 
                    onClick={() => handleToggleCategory(category.name)}
                    className={`relative p-3 sm:p-4 border rounded-xl sm:rounded-2xl transition-all group overflow-hidden flex flex-col justify-between ${
                      isLocked 
                        ? 'cursor-default' 
                        : 'cursor-pointer hover:shadow-md hover:-translate-y-0.5 active:scale-[0.98]'
                    } ${
                      isBeingRemoved
                        ? 'border-red-300 bg-red-50/60 shadow-xs ring-2 ring-red-200'
                        : isBeingAdded
                          ? 'border-green-400 bg-green-50/60 shadow-xs ring-2 ring-green-200'
                          : isSelected 
                            ? 'border-[#012980] bg-blue-50/50 shadow-xs ring-2 ring-[#012980]/20' 
                            : 'border-gray-200 hover:border-gray-300 bg-white'
                    }`}
                  >
                    {/* Top Right Status Badge */}
                    <div className="absolute top-2.5 right-2.5 z-10">
                      {isBeingRemoved ? (
                        <span className="flex items-center gap-1 bg-red-500 text-white text-[10px] font-bold px-2 py-0.5 rounded-full shadow-xs">
                          <X className="w-3 h-3" /> Remove
                        </span>
                      ) : isBeingAdded ? (
                        <span className="flex items-center gap-1 bg-green-600 text-white text-[10px] font-bold px-2 py-0.5 rounded-full shadow-xs">
                          <Plus className="w-3 h-3" /> New
                        </span>
                      ) : isSelected ? (
                        <div className="bg-[#012980] text-white rounded-full p-1 shadow-xs">
                          <CheckCircle2 className="w-4 h-4" />
                        </div>
                      ) : null}
                    </div>

                    {/* Category Image */}
                    <div className="relative w-full aspect-[4/3] mb-2.5 sm:mb-3 rounded-lg sm:rounded-xl overflow-hidden bg-gray-100 border border-gray-100">
                      <img 
                        src={category.image_url || '/placeholder.png'} 
                        alt={category.name} 
                        className="w-full h-full object-cover transition-transform duration-300 group-hover:scale-105" 
                      />
                    </div>

                    {/* Category Name & Product Count */}
                    <div className="text-center">
                      <h3 className={`font-extrabold text-xs sm:text-sm tracking-tight leading-tight line-clamp-2 ${
                        isBeingRemoved ? 'text-red-700 line-through opacity-80' : isSelected ? 'text-[#012980]' : 'text-gray-900'
                      }`}>
                        {category.name}
                      </h3>
                      
                      {activeCount > 0 && (
                        <span className="inline-block mt-1 text-[10px] font-semibold text-gray-500 bg-gray-100 px-2 py-0.5 rounded-full">
                          {activeCount} {activeCount === 1 ? 'Product' : 'Products'}
                        </span>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>

            {/* ======================================================== */}
            {/* 4. FOOTER ACTION BAR                                     */}
            {/* ======================================================== */}
            <div className="flex flex-col sm:flex-row items-center justify-between gap-4 border-t border-gray-100 pt-6">
              <div className="text-xs text-gray-500 text-center sm:text-left">
                {isEditing ? (
                  <span>
                    Changes: <strong className="text-green-700">+{addedCategories.length} added</strong>, <strong className="text-red-600">-{removedCategories.length} to remove</strong>
                  </span>
                ) : (
                  <span>Categories enable your products to be discovered in search & browsing.</span>
                )}
              </div>

              <div className="flex items-center gap-3 w-full sm:w-auto justify-end">
                {savedCategories.length > 0 && !isEditing ? (
                  <>
                    <div className="hidden sm:flex items-center gap-1.5 text-xs text-gray-400 font-medium mr-2">
                      <Lock className="w-3.5 h-3.5" /> Locked by plan
                    </div>
                    <button 
                      type="button"
                      onClick={handleStartEdit}
                      className="w-full sm:w-auto px-5 py-2.5 flex items-center justify-center gap-2 bg-white border border-[#012980] text-[#012980] font-bold rounded-xl text-xs sm:text-sm hover:bg-blue-50 transition-all shadow-2xs"
                    >
                      <Edit3 className="w-4 h-4" />
                      <span>Edit / Replace Categories</span>
                    </button>
                  </>
                ) : isEditing ? (
                  <>
                    <button
                      type="button"
                      onClick={handleCancelEdit}
                      className="px-4 py-2.5 text-xs sm:text-sm font-bold text-gray-700 bg-gray-100 hover:bg-gray-200 rounded-xl transition-colors"
                    >
                      Cancel
                    </button>
                    <button 
                      type="button"
                      onClick={handleOpenPreview}
                      disabled={selectedCategories.length === 0}
                      className="flex-1 sm:flex-none px-6 py-2.5 flex items-center justify-center gap-2 bg-gradient-to-r from-[#012980] to-[#ff7b23] text-white font-bold rounded-xl text-xs sm:text-sm hover:shadow-md transition-all disabled:opacity-50"
                    >
                      <span>Review & Replace</span>
                      <ArrowRight className="w-4 h-4" />
                    </button>
                  </>
                ) : (
                  <button 
                    type="button"
                    onClick={handleInitialSave} 
                    disabled={saving || selectedCategories.length === 0}
                    className="w-full sm:w-auto px-8 py-3 flex items-center justify-center gap-2 bg-gradient-to-r from-[#012980] to-[#ff7b23] text-white font-bold rounded-xl text-sm hover:shadow-md transition-all disabled:opacity-50"
                  >
                    {saving ? (
                      <div className="w-4 h-4 border-2 border-white/20 border-t-white rounded-full animate-spin" />
                    ) : null}
                    <span>{saving ? 'Saving...' : 'Save Category Selection'}</span>
                  </button>
                )}
              </div>
            </div>
          </>
        )}
      </div>

      {/* ======================================================== */}
      {/* 5. CATEGORY REPLACEMENT PREVIEW & CONFIRMATION MODAL     */}
      {/* ======================================================== */}
      {showPreviewModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-black/60 backdrop-blur-xs animate-fade-in overflow-y-auto">
          <div className="bg-white rounded-2xl sm:rounded-3xl shadow-2xl border border-gray-100 w-full max-w-lg overflow-hidden my-auto animate-scale-up">
            {/* Modal Header */}
            <div className="px-5 py-4 border-b border-gray-100 bg-gray-50/70 flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-lg bg-orange-100 text-[#fe6603] flex items-center justify-center">
                  <RefreshCw className="w-4 h-4" />
                </div>
                <h3 className="font-extrabold text-gray-900 text-base">Confirm Category Replacement</h3>
              </div>
              <button
                type="button"
                onClick={() => setShowPreviewModal(false)}
                className="p-1.5 text-gray-400 hover:text-gray-600 rounded-lg hover:bg-gray-100"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Modal Body */}
            <div className="p-5 space-y-4 max-h-[75vh] overflow-y-auto custom-scrollbar">
              {previewLoading ? (
                <div className="py-12 text-center text-gray-500">
                  <div className="w-8 h-8 border-4 border-[#012980]/20 border-t-[#012980] rounded-full animate-spin mx-auto mb-2" />
                  <p className="text-xs font-semibold">Analyzing affected products...</p>
                </div>
              ) : replacementPreview ? (
                <>
                  {/* Category Changes Summary */}
                  <div className="space-y-2.5 bg-gray-50 p-4 rounded-xl border border-gray-100 text-xs">
                    <p className="font-bold text-gray-700 uppercase tracking-wider text-[11px]">Proposed Changes:</p>
                    
                    {replacementPreview.removed_categories?.length > 0 && (
                      <div className="flex items-start gap-2">
                        <span className="font-bold text-red-600 min-w-[70px]">Removing:</span>
                        <div className="flex flex-wrap gap-1">
                          {replacementPreview.removed_categories.map(c => (
                            <span key={c} className="px-2 py-0.5 rounded-md bg-red-100 text-red-800 font-bold">
                              - {c}
                            </span>
                          ))}
                        </div>
                      </div>
                    )}

                    {replacementPreview.added_categories?.length > 0 && (
                      <div className="flex items-start gap-2">
                        <span className="font-bold text-green-700 min-w-[70px]">Adding:</span>
                        <div className="flex flex-wrap gap-1">
                          {replacementPreview.added_categories.map(c => (
                            <span key={c} className="px-2 py-0.5 rounded-md bg-green-100 text-green-800 font-bold">
                              + {c}
                            </span>
                          ))}
                        </div>
                      </div>
                    )}

                    {replacementPreview.kept_categories?.length > 0 && (
                      <div className="flex items-start gap-2">
                        <span className="font-bold text-gray-500 min-w-[70px]">Keeping:</span>
                        <div className="flex flex-wrap gap-1">
                          {replacementPreview.kept_categories.map(c => (
                            <span key={c} className="px-2 py-0.5 rounded-md bg-gray-200 text-gray-700 font-medium">
                              {c}
                            </span>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>

                  {/* Critical Archival Warning */}
                  {replacementPreview.affected_count > 0 ? (
                    <div className="bg-red-50 border border-red-200 rounded-xl p-4 text-xs text-red-900 space-y-2">
                      <div className="flex items-center gap-2 font-bold text-red-800 text-sm">
                        <ShieldAlert className="w-4 h-4 shrink-0 text-red-600" />
                        <span>{replacementPreview.affected_count} Product(s) Will Be Soft-Archived</span>
                      </div>
                      <p className="leading-relaxed text-red-800/90 text-[11px]">
                        Products belonging to removed categories will be removed from customer search and marketplace listings. 
                        <strong> Historical orders, invoices, and payment ledger records will remain safe and unchanged.</strong>
                      </p>

                      {/* Affected Products List */}
                      <div className="mt-2 space-y-1.5 max-h-40 overflow-y-auto pr-1 custom-scrollbar">
                        {replacementPreview.affected_products.map(p => (
                          <div key={p.id} className="flex items-center gap-2 p-2 bg-white rounded-lg border border-red-100 text-[11px]">
                            <img src={p.image_url || '/placeholder.png'} alt={p.name} className="w-8 h-8 rounded object-cover border" />
                            <div className="min-w-0 flex-1">
                              <p className="font-bold text-gray-900 truncate">{p.name}</p>
                              <span className="text-gray-400 text-[10px]">{p.category} • ₹{p.price}</span>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  ) : (
                    <div className="bg-green-50 border border-green-200 rounded-xl p-3 text-xs text-green-800 flex items-center gap-2">
                      <CheckCircle2 className="w-4 h-4 text-green-600 shrink-0" />
                      <span>No active products will be archived. Replacement is completely safe to apply.</span>
                    </div>
                  )}
                </>
              ) : null}
            </div>

            {/* Modal Footer */}
            <div className="px-5 py-4 border-t border-gray-100 bg-gray-50 flex items-center justify-end gap-3">
              <button
                type="button"
                onClick={() => setShowPreviewModal(false)}
                disabled={saving}
                className="px-4 py-2 text-xs font-bold text-gray-700 bg-white border border-gray-300 rounded-xl hover:bg-gray-100 transition-colors"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleExecuteReplacement}
                disabled={saving}
                className="px-5 py-2 text-xs font-bold text-white bg-gradient-to-r from-red-600 to-orange-600 hover:from-red-700 hover:to-orange-700 rounded-xl transition-all shadow-sm flex items-center gap-1.5 disabled:opacity-50"
              >
                {saving ? (
                  <div className="w-3.5 h-3.5 border-2 border-white/20 border-t-white rounded-full animate-spin" />
                ) : (
                  <Check className="w-3.5 h-3.5" />
                )}
                <span>
                  {saving 
                    ? 'Applying Changes...' 
                    : replacementPreview?.affected_count > 0 
                      ? `Confirm & Archive (${replacementPreview.affected_count})` 
                      : 'Confirm Replacement'}
                </span>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
