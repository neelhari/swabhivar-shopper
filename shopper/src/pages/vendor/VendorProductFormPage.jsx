import React, { useState, useEffect, useRef } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import {
  ArrowLeft, Save, Eye, Send, Trash2, Upload, X, Plus, ChevronRight,
  Package, Image, DollarSign, Truck, Search, FileText, MapPin, Tag, AlertTriangle,
  ChevronDown, Check, ArrowRight
} from 'lucide-react';
import { toast } from 'react-toastify';
import { useStoreData } from '../../store/useStoreData';

const BACKEND_URL = import.meta.env.VITE_BACKEND_URL || 'http://localhost:5000/api';

const TABS = [
  { id: 'basic',    label: 'Basic Info',    icon: Package },
  { id: 'media',    label: 'Media',         icon: Image },
  { id: 'pricing',  label: 'Pricing & Stock', icon: DollarSign },
  { id: 'shipping', label: 'Shipping',      icon: Truck },
  { id: 'seo',      label: 'SEO & Tags',    icon: Search },
  { id: 'extra',    label: 'More Info',     icon: FileText },
];

const STOCK_STATUS_OPTS = ['In Stock', 'Out of Stock', 'Pre Order', 'On Backorder'];
const CONDITION_OPTS = ['New', 'Used', 'Refurbished', 'Open Box'];
const PRODUCT_TYPE_OPTS = ['Physical', 'Digital', 'Service'];

function Field({ label, required, children, hint }) {
  return (
    <div>
      <label className="block text-xs font-semibold text-gray-600 uppercase tracking-wider mb-1.5">
        {label} {required && <span className="text-red-500">*</span>}
      </label>
      {children}
      {hint && <p className="text-xs text-gray-400 mt-1">{hint}</p>}
    </div>
  );
}

function Input({ className = '', error, ...props }) {
  return (
    <input
      className={`w-full px-4 py-3 border ${error ? 'border-red-500 bg-red-50 focus:border-red-500 focus:ring-red-200' : 'border-gray-200 bg-gray-50/50 hover:bg-white focus:bg-white focus:border-[#012980] focus:ring-[#012980]/30'} rounded-[12px] text-sm text-gray-900 focus:outline-none focus:ring-2 transition-all shadow-inner ${className}`}
      {...props}
    />
  );
}

function Textarea({ className = '', error, ...props }) {
  return (
    <textarea
      className={`w-full px-4 py-3 border ${error ? 'border-red-500 bg-red-50 focus:border-red-500 focus:ring-red-200' : 'border-gray-200 bg-gray-50/50 hover:bg-white focus:bg-white focus:border-[#012980] focus:ring-[#012980]/30'} rounded-[12px] text-sm text-gray-900 focus:outline-none focus:ring-2 transition-all shadow-inner resize-none ${className}`}
      {...props}
    />
  );
}

function Select({ className = '', error, children, ...props }) {
  return (
    <select
      className={`w-full px-4 py-3 border ${error ? 'border-red-500 bg-red-50 focus:border-red-500 focus:ring-red-200' : 'border-gray-200 bg-gray-50/50 hover:bg-white focus:bg-white focus:border-[#012980] focus:ring-[#012980]/30'} rounded-[12px] text-sm text-gray-900 focus:outline-none focus:ring-2 transition-all shadow-inner ${className}`}
      {...props}
    >
      {children}
    </select>
  );
}

function Section({ title, children }) {
  return (
    <div className="bg-white rounded-2xl sm:rounded-[24px] border border-gray-100 p-4 sm:p-6 lg:p-8 shadow-[0_2px_12px_rgb(0,0,0,0.03)] sm:hover:shadow-[0_8px_30px_rgb(0,0,0,0.06)] transition-shadow duration-200">
      {title && <h3 className="text-sm sm:text-base font-extrabold text-gray-900 mb-4 sm:mb-6 pb-3 sm:pb-4 border-b border-gray-100/80 tracking-tight">{title}</h3>}
      <div className="space-y-4 sm:space-y-5">{children}</div>
    </div>
  );
}

export function VendorProductFormPage() {
  const navigate = useNavigate();
  const { id } = useParams();
  const isEdit = Boolean(id);
  const [activeTab, setActiveTab] = useState('basic');
  const [saving, setSaving] = useState(false);
  const [categories, setCategories] = useState([]);
  const [subcategories, setSubcategories] = useState([]);
  const [categoryCustomFields, setCategoryCustomFields] = useState([]);
  const [uploadingField, setUploadingField] = useState(null);
  const [uploadingImages, setUploadingImages] = useState(false);
  const [tagInput, setTagInput] = useState('');
  const [errors, setErrors] = useState({});
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  const currentTabIndex = TABS.findIndex(t => t.id === activeTab);
  const currentTab = TABS[currentTabIndex] || TABS[0];
  const prevTab = currentTabIndex > 0 ? TABS[currentTabIndex - 1] : null;
  const nextTab = currentTabIndex < TABS.length - 1 ? TABS[currentTabIndex + 1] : null;

  const switchTab = (tabId) => {
    setActiveTab(tabId);
    setMobileMenuOpen(false);
    window.scrollTo(0, 0);
    document.documentElement.scrollTop = 0;
    document.body.scrollTop = 0;
  };

  const [form, setForm] = useState({
    // Basic
    name: '', sku: '', barcode: '', product_code: '', brand: '', gender: 'Any',
    category: '', subcategory: '', product_type: 'Physical', condition: 'New',
    description: '', short_description: '',
    // Media
    image_url: '', images: [], video_url: '', view_360_url: '',
    // Pricing & Stock
    price: '', mrp: '', sale_price: '', cost_price: '', gst_percent: '',
    stock: '', stock_status: 'In Stock', min_order_qty: 1, max_order_qty: '',
    low_stock_alert: '', cod_available: true,
    // Shipping & Physical
    weight: '', shipping_weight: '', length: '', width: '', height: '',
    material: '', free_shipping: false,
    // SEO & Tags
    seo_title: '', seo_keywords: '', meta_description: '', search_tags: [],
    status: 'draft',
    // Policies
    warranty: '', return_policy: '', replacement_policy: '', refund_available: false,
    // Docs & Files
    user_manual_url: '', brochure_url: '', certificate_urls: [],
    manufacturer_name: '', country_of_origin: '', hsn_code: '',
    gst_number: '',
    // Category custom fields
    custom_attributes: {},
  });

  const token = localStorage.getItem('vendor_token');
  const headers = { Authorization: `Bearer ${token}` };

  useEffect(() => {
    const init = async () => {
      const cats = await fetchCategories();
      if (isEdit) fetchProduct(cats);
    };
    init();
  }, [id]);

  const fetchCategories = async () => {
    const res = await fetch(`${BACKEND_URL}/vendor/categories`, { headers });
    const data = await res.json();
    let cats = data.categories || [];

    try {
      const selRes = await fetch(`${BACKEND_URL}/vendor/categories/selected`, { headers });
      const selData = await selRes.json();
      if (selData.category_limit && selData.selected_categories) {
        cats = cats.filter(c => selData.selected_categories.includes(c.name));
      }
    } catch (e) {
      console.warn("Could not fetch selected categories");
    }

    setCategories(cats);
    return cats;
  };

  const fetchProduct = async (cats) => {
    const res = await fetch(`${BACKEND_URL}/vendor/products`, { headers });
    const data = await res.json();
    const product = (data.products || []).find(p => String(p.id) === String(id));
    if (product) {
      const attrs = typeof product.custom_attributes === 'string'
        ? JSON.parse(product.custom_attributes || '{}')
        : (product.custom_attributes || {});
      setForm(prev => ({
        ...prev, ...product,
        gender: product.gender || 'Any',
        weight: product.weight || attrs.shipping_weight || attrs.weight || '',
        shipping_weight: product.weight || attrs.shipping_weight || attrs.weight || '',
        length: product.length || attrs.length || '',
        width: product.width || attrs.width || '',
        height: product.height || attrs.height || '',
        images: Array.isArray(product.images) ? product.images : [],
        search_tags: attrs.search_tags || [],
        certificate_urls: attrs.certificate_urls || [],
        video_url: attrs.video_url || '',
        view_360_url: attrs.view_360_url || '',
        user_manual_url: attrs.user_manual_url || '',
        brochure_url: attrs.brochure_url || '',
        manufacturer_name: attrs.manufacturer_name || '',
        country_of_origin: attrs.country_of_origin || '',
        gst_number: attrs.gst_number || '',
        product_code: attrs.product_code || '',
        product_type: attrs.product_type || 'Physical',
        condition: attrs.condition || 'New',
        seo_title: attrs.seo_title || '',
        seo_keywords: attrs.seo_keywords || '',
        meta_description: attrs.meta_description || '',
        refund_available: attrs.refund_available || false,
        custom_attributes: attrs,
      }));

      // Use the cats param (already loaded) — fixes race condition
      const cat = (cats || []).find(c => c.name === product.category);
      if (cat) {
        setSubcategories(cat.subcategories || []);
        setCategoryCustomFields(cat.custom_fields || []);
      }
    }
  };

  const handleCategoryChange = (catName) => {
    setForm(prev => ({ ...prev, category: catName, subcategory: '' }));
    const cat = categories.find(c => c.name === catName);
    setSubcategories(cat?.subcategories || []);
    setCategoryCustomFields(cat?.custom_fields || []);
  };

  const set = (field, value) => setForm(prev => ({ ...prev, [field]: value }));
  const setCustomAttr = (field, value) => setForm(prev => ({
    ...prev, custom_attributes: { ...prev.custom_attributes, [field]: value }
  }));

  // Image Upload
  const uploadFile = async (file) => {
    const fd = new FormData();
    fd.append('image', file);
    fd.append('folder', 'products');
    const vToken = localStorage.getItem('vendor_token') || localStorage.getItem('token');
    const res = await fetch(`${BACKEND_URL}/upload`, {
      method: 'POST',
      headers: vToken ? { 'Authorization': `Bearer ${vToken}` } : {},
      body: fd
    });
    const data = await res.json();
    if (!res.ok) {
      throw new Error(data.error || data.message || 'Upload failed');
    }
    return data.url;
  };

  const handleMainImageUpload = async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    setUploadingField('main');
    try {
      const url = await uploadFile(file);
      if (url) set('image_url', url);
    } catch (err) { toast.error(err.message || 'Upload failed'); }
    finally { setUploadingField(null); }
  };

  const handleGalleryUpload = async (e) => {
    const files = Array.from(e.target.files);
    if (!files.length) return;
    setUploadingImages(true);
    try {
      const urls = await Promise.all(files.map(uploadFile));
      set('images', [...(form.images || []), ...urls.filter(Boolean)]);
    } catch (err) { toast.error(err.message || 'Upload failed'); }
    finally { setUploadingImages(false); }
  };

  const handleDocUpload = async (e, field) => {
    const file = e.target.files[0];
    if (!file) return;
    setUploadingField(field);
    try {
      const url = await uploadFile(file);
      if (url) set(field, url);
    } catch (err) { toast.error(err.message || 'Upload failed'); }
    finally { setUploadingField(null); }
  };

  const handleCertUpload = async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    setUploadingField('cert');
    try {
      const url = await uploadFile(file);
      if (url) set('certificate_urls', [...(form.certificate_urls || []), url]);
    } catch (err) { toast.error(err.message || 'Upload failed'); }
    finally { setUploadingField(null); }
  };

  const addTag = (e) => {
    if (e.key === 'Enter' || e.key === ',') {
      e.preventDefault();
      const tag = tagInput.trim().replace(/,$/, '');
      if (tag && !form.search_tags.includes(tag)) {
        set('search_tags', [...form.search_tags, tag]);
      }
      setTagInput('');
    }
  };

  const handleSave = async (publishStatus) => {
    const newErrors = {};
    if (!form.name) newErrors.name = true;
    if (!form.category) newErrors.category = true;
    if (!form.price) newErrors.price = true;
    if (!form.mrp) newErrors.mrp = true;
    if (!form.stock) newErrors.stock = true;
    if (!form.description) newErrors.description = true;

    const pWeight = parseFloat(form.shipping_weight || form.weight || 0);
    const pLen = parseFloat(form.length || 0);
    const pWid = parseFloat(form.width || 0);
    const pHgt = parseFloat(form.height || 0);

    if (!pWeight || pWeight <= 0) newErrors.shipping_weight = true;
    if (!pLen || pLen <= 0) newErrors.length = true;
    if (!pWid || pWid <= 0) newErrors.width = true;
    if (!pHgt || pHgt <= 0) newErrors.height = true;

    if (Object.keys(newErrors).length > 0) {
      setErrors(newErrors);
      if (newErrors.shipping_weight || newErrors.length || newErrors.width || newErrors.height) {
        toast.error('Please enter valid package dimensions (Length, Width, Height) and estimated packed weight.');
        setActiveTab('shipping');
      } else {
        toast.error('Please fill in all required fields');
        if (newErrors.name || newErrors.category || newErrors.description) setActiveTab('basic');
        else if (newErrors.price || newErrors.mrp || newErrors.stock) setActiveTab('pricing');
      }
      return;
    }
    setErrors({});

    setSaving(publishStatus || 'saving');
    try {
      const extraAttrs = {
        ...form.custom_attributes,
        video_url: form.video_url, view_360_url: form.view_360_url,
        user_manual_url: form.user_manual_url, brochure_url: form.brochure_url,
        certificate_urls: form.certificate_urls,
        manufacturer_name: form.manufacturer_name, country_of_origin: form.country_of_origin,
        gst_number: form.gst_number,
        product_code: form.product_code, product_type: form.product_type,
        condition: form.condition, seo_title: form.seo_title,
        seo_keywords: form.seo_keywords, meta_description: form.meta_description,
        search_tags: form.search_tags, refund_available: form.refund_available,
        shipping_weight: String(pWeight),
        length: String(pLen),
        width: String(pWid),
        height: String(pHgt),
      };

      const body = {
        name: form.name,
        slug: (form.name || '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, ''),
        sku: form.sku, barcode: form.barcode, brand: form.brand, gender: form.gender,
        category: form.category, subcategory: form.subcategory,
        short_description: form.short_description, description: form.description,
        image_url: form.image_url || (form.images?.[0] || ''),
        images: form.images || [],
        price: parseFloat(form.price) || 0,
        mrp: parseFloat(form.mrp) || 0,
        cost_price: parseFloat(form.cost_price) || 0,
        gst_percent: parseFloat(form.gst_percent) || 0,
        stock: parseInt(form.stock) || 0,
        stock_status: form.stock_status,
        min_order_qty: parseInt(form.min_order_qty) || 1,
        max_order_qty: parseInt(form.max_order_qty) || null,
        low_stock_alert: parseInt(form.low_stock_alert) || null,
        cod_available: form.cod_available,
        free_shipping: form.free_shipping,
        weight: String(pWeight), length: String(pLen), width: String(pWid), height: String(pHgt),
        material: form.material, hsn_code: form.hsn_code,
        warranty: form.warranty, return_policy: form.return_policy,
        replacement_policy: form.replacement_policy,
        custom_attributes: JSON.stringify(extraAttrs),
        status: publishStatus === 'publish' ? 'pending' : 'draft',
      };

      const url = isEdit
        ? `${BACKEND_URL}/vendor/products/${id}`
        : `${BACKEND_URL}/vendor/products`;
      const method = isEdit ? 'PUT' : 'POST';

      const res = await fetch(url, {
        method,
        headers: { ...headers, 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (!res.ok) { toast.error(data.error || 'Save failed'); return; }
      if (data.product) {
        useStoreData.getState().updateProductInStore(data.product);
        useStoreData.getState().refreshProducts();
      }

      if (publishStatus === 'publish') {
        toast.success('🚀 Product submitted for admin approval!');
      } else {
        toast.success('💾 Draft saved successfully!');
      }
      navigate('/vendor/products');
    } catch { toast.error('An error occurred'); }
    finally { setSaving(false); }
  };

  const UploadBtn = ({ field, label, accept = 'image/*', onUpload, loading }) => (
    <label className="relative inline-flex items-center gap-2 cursor-pointer px-4 py-2 bg-gray-50 border border-dashed border-gray-300 rounded-xl text-sm text-gray-600 hover:bg-blue-50 hover:border-[#012980] transition-colors">
      <input type="file" accept={accept} onChange={onUpload} className="absolute inset-0 opacity-0 cursor-pointer" />
      <Upload className="w-4 h-4" />
      {loading ? 'Uploading...' : label}
    </label>
  );

  const renderTabContent = () => {
    switch (activeTab) {
      case 'basic':
        return (
          <div className="space-y-5">
            <Section title="Basic Details">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <Field label="Product Name" required>
                  <Input value={form.name} onChange={e => set('name', e.target.value)} placeholder="e.g. Premium Cotton T-Shirt" error={errors.name} />
                </Field>
                <Field label="Product SKU">
                  <Input value={form.sku} onChange={e => set('sku', e.target.value)} placeholder="e.g. SKU-001" />
                </Field>
                <Field label="Barcode (Optional)">
                  <Input value={form.barcode} onChange={e => set('barcode', e.target.value)} placeholder="EAN / UPC barcode" />
                </Field>
                <Field label="Product Code">
                  <Input value={form.product_code} onChange={e => set('product_code', e.target.value)} placeholder="Internal product code" />
                </Field>
                <Field label="Brand">
                  <Input value={form.brand} onChange={e => set('brand', e.target.value)} placeholder="e.g. Samsung" />
                </Field>
                <Field label="Gender">
                  <Select value={form.gender} onChange={e => set('gender', e.target.value)}>
                    <option value="Any">Any</option>
                    <option value="Male">Male</option>
                    <option value="Female">Female</option>
                    <option value="Others">Others</option>
                  </Select>
                </Field>
              </div>
            </Section>

            <Section title="Category">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <Field label="Product Category" required hint={categories.length === 0 ? "You haven't selected any categories yet. Please go to Platform Categories to select them." : ""}>
                  <Select value={form.category} onChange={e => handleCategoryChange(e.target.value)} error={errors.category}>
                    <option value="">Select Category</option>
                    {categories.map(c => <option key={c.id} value={c.name}>{c.name}</option>)}
                  </Select>
                </Field>
                <Field label="Sub Category">
                  <Select value={form.subcategory} onChange={e => set('subcategory', e.target.value)}>
                    <option value="">Select Sub Category</option>
                    {subcategories.map((s, i) => <option key={i} value={typeof s === 'string' ? s : s.name}>{typeof s === 'string' ? s : s.name}</option>)}
                  </Select>
                </Field>
              </div>
            </Section>

            <Section title="Description">
              <Field label="Short Description">
                <Input value={form.short_description} onChange={e => set('short_description', e.target.value)} placeholder="One-line summary..." />
              </Field>
              <Field label="Product Description" required hint="Full product details, features, specifications">
                <Textarea rows={6} value={form.description} onChange={e => set('description', e.target.value)} placeholder="Write a detailed product description..." error={errors.description} />
              </Field>
            </Section>
          </div>
        );

      case 'media':
        return (
          <div className="space-y-4 sm:space-y-6">
            <Section title="Main Product Image">
              <div className="flex flex-col sm:flex-row items-center sm:items-start gap-4 text-center sm:text-left">
                <div className="w-28 h-28 sm:w-32 sm:h-32 rounded-2xl border-2 border-dashed border-gray-200 overflow-hidden flex items-center justify-center bg-gray-50 flex-shrink-0 shadow-xs relative">
                  {form.image_url
                    ? <img src={form.image_url} alt="Main" className="w-full h-full object-cover" />
                    : <Package className="w-10 h-10 text-gray-300" />}
                </div>
                <div className="space-y-2 flex-1 w-full sm:w-auto flex flex-col items-center sm:items-start">
                  <UploadBtn label="Upload Main Image" onUpload={handleMainImageUpload} loading={uploadingField === 'main'} />
                  {form.image_url && (
                    <button onClick={() => set('image_url', '')} className="flex items-center gap-1 text-xs text-red-500 hover:text-red-700 font-semibold py-1">
                      <X className="w-3.5 h-3.5" /> Remove Main Image
                    </button>
                  )}
                  <p className="text-xs text-gray-400">High-resolution square image (800×800px recommended). JPG, PNG, WEBP.</p>
                </div>
              </div>
            </Section>

            <Section title="Gallery Images">
              <p className="text-xs text-gray-500 mb-2">Add multiple product photos from different angles (up to 8 images).</p>
              <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 gap-2.5 sm:gap-3 mb-3">
                {(form.images || []).map((url, i) => (
                  <div key={i} className="relative aspect-square rounded-xl overflow-hidden border border-gray-200 group bg-gray-50 shadow-2xs">
                    <img src={url} alt={`Gallery ${i+1}`} className="w-full h-full object-cover" />
                    <button 
                      type="button"
                      onClick={() => set('images', form.images.filter((_, idx) => idx !== i))}
                      className="absolute top-1 right-1 w-6 h-6 bg-red-500 text-white rounded-full flex items-center justify-center shadow-md transition-transform active:scale-95"
                      title="Remove image"
                    >
                      <X className="w-3.5 h-3.5" />
                    </button>
                  </div>
                ))}
                <label className="aspect-square rounded-xl border-2 border-dashed border-gray-300 hover:border-[#012980] bg-gray-50/50 hover:bg-blue-50/50 flex flex-col items-center justify-center cursor-pointer transition-colors relative">
                  <input type="file" multiple accept="image/*" onChange={handleGalleryUpload} className="absolute inset-0 opacity-0 cursor-pointer" />
                  <Plus className="w-5 h-5 text-gray-400" />
                  <span className="text-[11px] font-semibold text-gray-500 mt-1">Add Photo</span>
                </label>
              </div>
              {uploadingImages && <p className="text-xs font-semibold text-[#012980] animate-pulse">Uploading gallery photos...</p>}
            </Section>
          </div>
        );

      case 'pricing':
        return (
          <div className="space-y-5">
            <Section title="Pricing">
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                <Field label="Regular Price (₹)" required>
                  <Input type="number" min="0" value={form.price} onChange={e => set('price', e.target.value)} placeholder="0.00" error={errors.price} />
                </Field>
                <Field label="MRP (₹)" required hint="Maximum Retail Price">
                  <Input type="number" min="0" value={form.mrp} onChange={e => set('mrp', e.target.value)} placeholder="0.00" error={errors.mrp} />
                </Field>
              </div>
            </Section>

            <Section title="Stock & Inventory">
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                <Field label="Stock Quantity" required>
                  <Input type="number" min="0" value={form.stock} onChange={e => set('stock', e.target.value)} placeholder="0" error={errors.stock} />
                </Field>
                <Field label="Stock Status">
                  <Select value={form.stock_status} onChange={e => set('stock_status', e.target.value)}>
                    {STOCK_STATUS_OPTS.map(s => <option key={s}>{s}</option>)}
                  </Select>
                </Field>
                <Field label="Low Stock Alert" hint="Alert when stock falls below this">
                  <Input type="number" min="0" value={form.low_stock_alert} onChange={e => set('low_stock_alert', e.target.value)} placeholder="e.g. 5" />
                </Field>
              </div>
            </Section>
          </div>
        );

      case 'shipping': {
        const pWeight = parseFloat(form.shipping_weight || form.weight || 0);
        const pLen = parseFloat(form.length || 0);
        const pWid = parseFloat(form.width || 0);
        const pHgt = parseFloat(form.height || 0);
        const volWeight = (pLen > 0 && pWid > 0 && pHgt > 0) ? ((pLen * pWid * pHgt) / 5000) : 0;
        const chargeableWeight = Math.max(pWeight, volWeight);

        return (
          <div className="space-y-5">
            <div className="p-4 bg-amber-50 border-2 border-amber-300 rounded-2xl text-amber-950 text-xs sm:text-sm flex items-start gap-3 shadow-xs mb-2 scroll-mt-36">
              <span className="text-xl shrink-0 mt-0.5">⚠️</span>
              <div className="space-y-1">
                <strong className="font-extrabold text-amber-950 text-xs sm:text-sm block">Important Courier Measurement Policy:</strong>
                <p className="text-amber-900 text-xs sm:text-sm leading-relaxed font-medium">
                  Enter the estimated packed weight and parcel dimensions, including packaging. These details are used to estimate shipping charges. Incorrect measurements may result in additional courier charges.
                </p>
              </div>
            </div>

            <Section title="Packaging & Shipping Measurements">
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                <Field label="Estimated Packed Weight (kg)" required hint="Include final packaging">
                  <Input type="number" step="0.01" min="0" value={form.shipping_weight || form.weight} onChange={e => { set('shipping_weight', e.target.value); set('weight', e.target.value); }} placeholder="e.g. 0.5" />
                </Field>
                <Field label="Length (cm)" required hint="Parcel length">
                  <Input type="number" step="0.1" min="0" value={form.length} onChange={e => set('length', e.target.value)} placeholder="e.g. 20" />
                </Field>
                <Field label="Width (cm)" required hint="Parcel width">
                  <Input type="number" step="0.1" min="0" value={form.width} onChange={e => set('width', e.target.value)} placeholder="e.g. 15" />
                </Field>
                <Field label="Height (cm)" required hint="Parcel height">
                  <Input type="number" step="0.1" min="0" value={form.height} onChange={e => set('height', e.target.value)} placeholder="e.g. 10" />
                </Field>
              </div>

              {/* Live Volumetric Calculation Preview */}
              <div className="mt-4 p-3.5 bg-blue-50 border border-blue-100 rounded-xl flex flex-wrap items-center justify-between text-xs sm:text-sm text-blue-900 gap-2">
                <div>
                  <span className="font-medium text-gray-600">Volumetric Weight ((L×W×H)/5000):</span>{' '}
                  <strong className="text-blue-950 font-bold">{volWeight.toFixed(3)} kg</strong>
                </div>
                <div>
                  <span className="font-medium text-gray-600">Chargeable Courier Weight:</span>{' '}
                  <strong className="text-[#036e26] font-bold text-sm sm:text-base">{chargeableWeight.toFixed(3)} kg</strong>
                  <span className="text-[11px] text-gray-500 ml-1.5">(Courier bills the higher of actual vs volumetric)</span>
                </div>
              </div>
            </Section>

            <Section title="Material & Classification">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <Field label="Material"><Input value={form.material} onChange={e => set('material', e.target.value)} placeholder="e.g. Cotton, Silk, Plastic" /></Field>
              </div>
            </Section>
          </div>
        );
      }

      case 'seo':
        return (
          <div className="space-y-5">
            <Section title="SEO Details">
              <Field label="SEO Title" hint="Appears as the browser tab title (max 60 chars)">
                <Input value={form.seo_title} onChange={e => set('seo_title', e.target.value)} placeholder="Product SEO title..." maxLength={60} />
              </Field>
              <Field label="SEO Keywords" hint="Comma-separated keywords for search engines">
                <Input value={form.seo_keywords} onChange={e => set('seo_keywords', e.target.value)} placeholder="keyword1, keyword2, keyword3" />
              </Field>
              <Field label="Meta Description" hint="Search engine result description (max 160 chars)">
                <Textarea rows={3} value={form.meta_description} onChange={e => set('meta_description', e.target.value)} placeholder="Brief description for search results..." maxLength={160} />
              </Field>
            </Section>

            <Section title="Search Tags">
              <Field label="Search Tags" hint="Press Enter or comma to add a tag">
                <div className="border border-gray-200 rounded-xl p-2 bg-white min-h-[48px] flex flex-wrap gap-2 focus-within:ring-2 focus-within:ring-[#012980]/30">
                  {form.search_tags.map((tag, i) => (
                    <span key={i} className="flex items-center gap-1 px-2.5 py-1 bg-blue-100 text-[#012980] rounded-lg text-xs font-semibold">
                      {tag}
                      <button type="button" onClick={() => set('search_tags', form.search_tags.filter((_, idx) => idx !== i))}>
                        <X className="w-3 h-3" />
                      </button>
                    </span>
                  ))}
                  <input
                    value={tagInput}
                    onChange={e => setTagInput(e.target.value)}
                    onKeyDown={addTag}
                    placeholder={form.search_tags.length === 0 ? 'Add tags...' : ''}
                    className="flex-1 min-w-[120px] text-sm outline-none border-none bg-transparent p-1"
                  />
                </div>
              </Field>
            </Section>

            <Section title="Publish Status">
              <div className="flex flex-col gap-3">
                <p className="text-xs text-gray-500 bg-amber-50 border border-amber-200 rounded-xl p-3 flex items-start gap-2">
                  <AlertTriangle className="w-4 h-4 text-amber-500 flex-shrink-0 mt-0.5" />
                  Products are reviewed by admin before going live. Save as Draft to continue editing, or Submit for Approval to request publishing.
                </p>
              </div>
            </Section>
          </div>
        );

      case 'extra':
        return (
          <div className="space-y-5">
            <Section title="Warranty & Policies">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <Field label="Warranty Period">
                  <Input value={form.warranty} onChange={e => set('warranty', e.target.value)} placeholder="e.g. 1 Year Manufacturer Warranty" />
                </Field>
                <Field label="Return Policy">
                  <Input value={form.return_policy} onChange={e => set('return_policy', e.target.value)} placeholder="e.g. 7 Days Return" />
                </Field>
                <Field label="Replacement Policy">
                  <Input value={form.replacement_policy} onChange={e => set('replacement_policy', e.target.value)} placeholder="e.g. 7 Days Replacement" />
                </Field>
              </div>
              <div className="flex gap-6">
                <label className="flex items-center gap-2 cursor-pointer">
                  <input type="checkbox" checked={form.refund_available} onChange={e => set('refund_available', e.target.checked)}
                    className="w-4 h-4 rounded border-gray-300 text-[#012980] focus:ring-[#012980]" />
                  <span className="text-sm font-medium text-gray-700">Refund Available</span>
                </label>
              </div>
            </Section>

            <Section title="Documents & Certificates">
              <div className="space-y-4">
                <Field label="User Manual">
                  <div className="flex items-center gap-3">
                    {form.user_manual_url && <a href={form.user_manual_url} target="_blank" rel="noreferrer" className="text-xs text-blue-500 underline truncate max-w-[200px]">View Manual</a>}
                    <UploadBtn label="Upload Manual" accept="application/pdf,image/*" onUpload={e => handleDocUpload(e, 'user_manual_url')} loading={uploadingField === 'user_manual_url'} />
                  </div>
                </Field>
                <Field label="Product Brochure">
                  <div className="flex items-center gap-3">
                    {form.brochure_url && <a href={form.brochure_url} target="_blank" rel="noreferrer" className="text-xs text-blue-500 underline truncate max-w-[200px]">View Brochure</a>}
                    <UploadBtn label="Upload Brochure" accept="application/pdf,image/*" onUpload={e => handleDocUpload(e, 'brochure_url')} loading={uploadingField === 'brochure_url'} />
                  </div>
                </Field>
                <Field label="Certificates">
                  <div className="flex flex-wrap gap-2 mb-2">
                    {(form.certificate_urls || []).map((url, i) => (
                      <div key={i} className="flex items-center gap-1 bg-gray-100 rounded-lg px-2 py-1 text-xs">
                        <a href={url} target="_blank" rel="noreferrer" className="text-blue-500 underline">Cert {i+1}</a>
                        <button onClick={() => set('certificate_urls', form.certificate_urls.filter((_, idx) => idx !== i))}><X className="w-3 h-3 text-red-400" /></button>
                      </div>
                    ))}
                  </div>
                  <UploadBtn label="Add Certificate" accept="application/pdf,image/*" onUpload={handleCertUpload} loading={uploadingField === 'cert'} />
                </Field>
              </div>
            </Section>

            <Section title="Manufacturer & Tax">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <Field label="Manufacturer Name">
                  <Input value={form.manufacturer_name} onChange={e => set('manufacturer_name', e.target.value)} placeholder="e.g. Samsung Electronics" />
                </Field>
                <Field label="Country of Origin">
                  <Input value={form.country_of_origin} onChange={e => set('country_of_origin', e.target.value)} placeholder="e.g. India, China" />
                </Field>
                <Field label="HSN Code">
                  <Input value={form.hsn_code} onChange={e => set('hsn_code', e.target.value)} placeholder="e.g. 8517" />
                </Field>
                <Field label="GST Number">
                  <Input value={form.gst_number} onChange={e => set('gst_number', e.target.value)} placeholder="GST registration number" />
                </Field>
              </div>
            </Section>

            {/* Category Custom Fields */}
            {categoryCustomFields.length > 0 && (
              <Section title={`Custom Fields (${form.category || 'Category'})`}>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  {categoryCustomFields.map((field, idx) => {
                    const val = form.custom_attributes?.[field.name] || '';
                    return (
                      <Field key={idx} label={field.name} required={field.required}>
                        {field.type === 'number' ? (
                          <Input type="number" value={val} onChange={e => setCustomAttr(field.name, e.target.value)} required={field.required} />
                        ) : field.type === 'long_text' ? (
                          <Textarea rows={3} value={val} onChange={e => setCustomAttr(field.name, e.target.value)} required={field.required} />
                        ) : field.type === 'select' ? (
                          <Select value={val} onChange={e => setCustomAttr(field.name, e.target.value)}>
                            <option value="">Select...</option>
                            {(field.options || []).map((o, i) => <option key={i}>{o}</option>)}
                          </Select>
                        ) : field.type === 'boolean' ? (
                          <Select value={val} onChange={e => setCustomAttr(field.name, e.target.value)}>
                            <option value="">Select...</option>
                            <option value="Yes">Yes</option>
                            <option value="No">No</option>
                          </Select>
                        ) : field.type === 'upload' ? (
                          <div className="flex items-center gap-3">
                            {val && <a href={val} target="_blank" rel="noreferrer" className="text-xs text-blue-500 underline">View File</a>}
                            <label className="relative inline-flex items-center gap-2 cursor-pointer px-3 py-2 bg-gray-50 border border-dashed border-gray-300 rounded-xl text-xs text-gray-600 hover:bg-blue-50 hover:border-[#012980] transition-colors">
                              <input type="file" accept="image/*,application/pdf"
                                onChange={async (e) => {
                                  const file = e.target.files[0];
                                  if (!file) return;
                                  setUploadingField(field.name);
                                  try {
                                    const url = await uploadFile(file);
                                    if (url) setCustomAttr(field.name, url);
                                  } catch (err) {
                                    toast.error(err.message || 'Upload failed');
                                  } finally {
                                    setUploadingField(null);
                                  }
                                }}
                                className="absolute inset-0 opacity-0 cursor-pointer" />
                              <Upload className="w-3.5 h-3.5" />
                              {uploadingField === field.name ? 'Uploading...' : 'Upload'}
                            </label>
                          </div>
                        ) : (
                          <Input type="text" value={val} onChange={e => setCustomAttr(field.name, e.target.value)} required={field.required} />
                        )}
                      </Field>
                    );
                  })}
                </div>
              </Section>
            )}
          </div>
        );

      default: return null;
    }
  };

  return (
    <div className="min-h-screen bg-gray-50/60 pb-16">
      {/* Top Action Bar & Mobile Section Navigation */}
      <div 
        className="sticky top-0 z-30 bg-white border-b border-gray-100 shadow-xs"
        style={{
          transform: 'translateZ(0)',
          WebkitTransform: 'translateZ(0)',
          willChange: 'transform',
          backfaceVisibility: 'hidden',
          WebkitBackfaceVisibility: 'hidden',
        }}
      >
        <div className="max-w-6xl mx-auto px-3 sm:px-6 py-2.5 sm:py-3.5 flex items-center justify-between gap-2 sm:gap-4">
          <div className="flex items-center gap-2 sm:gap-3 min-w-0 flex-1">
            <button 
              type="button"
              onClick={() => navigate('/vendor/products')}
              className="p-1.5 sm:p-2 text-gray-500 hover:text-gray-800 hover:bg-gray-100 rounded-xl transition-colors flex-shrink-0"
              aria-label="Back to Products"
            >
              <ArrowLeft className="w-5 h-5" />
            </button>
            <div className="min-w-0">
              <p className="text-[10px] sm:text-xs font-bold text-gray-400 uppercase tracking-wider mb-0.5">Vendor Portal</p>
              <h1 className="text-sm sm:text-lg md:text-xl font-extrabold text-gray-900 truncate tracking-tight">
                {isEdit ? 'Edit Product' : 'Add New Product'}
              </h1>
            </div>
          </div>
          <div className="flex items-center gap-1.5 sm:gap-3 flex-shrink-0">
            <button 
              type="button"
              onClick={() => handleSave('draft')} 
              disabled={!!saving}
              className="flex items-center gap-1.5 px-2.5 sm:px-5 py-2 sm:py-2.5 bg-gray-50 border border-gray-200 text-gray-700 rounded-xl sm:rounded-[12px] text-xs sm:text-sm font-bold hover:bg-gray-100 transition-all disabled:opacity-50"
              title="Save Draft"
            >
              {saving === 'draft' ? (
                <div className="w-3.5 h-3.5 border-2 border-gray-400 border-t-gray-700 rounded-full animate-spin" />
              ) : (
                <Save className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
              )}
              <span className="hidden sm:inline">{saving === 'draft' ? 'Saving...' : 'Save Draft'}</span>
            </button>
            <button 
              type="button"
              onClick={() => handleSave('publish')} 
              disabled={!!saving}
              className="flex items-center gap-1.5 sm:gap-2 px-3 sm:px-6 py-2 sm:py-2.5 bg-gradient-to-r from-[#012980] to-[#ff7b23] text-white rounded-xl sm:rounded-[12px] text-xs sm:text-sm font-bold hover:shadow-[0_8px_20px_rgba(254,102,3,0.3)] hover:-translate-y-0.5 transition-all disabled:opacity-50 disabled:hover:transform-none disabled:hover:shadow-none whitespace-nowrap"
            >
              {saving === 'publish' ? (
                <div className="w-3.5 h-3.5 border-2 border-white/20 border-t-white rounded-full animate-spin" />
              ) : (
                <Send className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
              )}
              <span className="hidden xs:inline sm:inline">{saving === 'publish' ? 'Submitting...' : 'Submit for Approval'}</span>
              <span className="xs:hidden sm:hidden">{saving === 'publish' ? 'Submitting...' : 'Submit'}</span>
            </button>
          </div>
        </div>

        {/* Mobile Section Switcher & Scrollable Tab Strip (Visible only on < md screens) */}
        <div className="md:hidden border-t border-gray-100 bg-white">
          <div className="px-3 py-2 flex items-center justify-between gap-2 border-b border-gray-100/80 bg-gray-50/50">
            {/* Quick Section Selector Pill (Opens all options just like desktop sidebar) */}
            <button
              type="button"
              onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
              className="flex items-center gap-2 px-3 py-1.5 bg-white hover:bg-gray-100 border border-gray-200 rounded-xl text-xs font-bold text-gray-800 transition-colors shadow-xs"
            >
              <currentTab.icon className="w-3.5 h-3.5 text-[#012980]" />
              <span>Section {currentTabIndex + 1}/6: {currentTab.label}</span>
              <ChevronDown className={`w-3.5 h-3.5 text-gray-500 transition-transform ${mobileMenuOpen ? 'rotate-180' : ''}`} />
            </button>
            
            <span className="text-[11px] font-semibold text-gray-500">
              Step {currentTabIndex + 1} of 6
            </span>
          </div>

          {/* Swipeable Tabs Row */}
          <div 
            className="flex gap-2 overflow-x-auto px-3 py-2 scrollbar-none bg-white"
            style={{
              WebkitOverflowScrolling: 'touch',
              overscrollBehaviorX: 'contain',
              touchAction: 'pan-x pan-y',
            }}
          >
            {TABS.map((tab, idx) => {
              const Icon = tab.icon;
              const isActive = activeTab === tab.id;
              return (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() => switchTab(tab.id)}
                  className={`flex-shrink-0 flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold transition-colors ${
                    isActive
                      ? 'bg-[#012980] text-white shadow-xs border border-[#012980]'
                      : 'bg-gray-50 text-gray-600 border border-gray-200'
                  }`}
                >
                  <Icon className="w-3.5 h-3.5" />
                  <span>{tab.label}</span>
                </button>
              );
            })}
          </div>

          {/* Mobile Full Section Dropdown Drawer (Mirrors desktop sidebar exactly) */}
          {mobileMenuOpen && (
            <div className="bg-white border-b border-gray-200 shadow-xl p-3 space-y-1.5 animate-in fade-in duration-200">
              <div className="text-[11px] font-bold text-gray-400 uppercase tracking-wider px-3 py-1">
                All Form Sections
              </div>
              {TABS.map((tab, idx) => {
                const Icon = tab.icon;
                const isActive = activeTab === tab.id;
                return (
                  <button
                    key={tab.id}
                    type="button"
                    onClick={() => switchTab(tab.id)}
                    className={`w-full flex items-center justify-between px-3 py-2.5 rounded-xl text-sm font-semibold transition-all ${
                      isActive
                        ? 'bg-[#012980]/10 text-[#012980] font-bold'
                        : 'text-gray-700 hover:bg-gray-50'
                    }`}
                  >
                    <div className="flex items-center gap-2.5">
                      <div className={`p-1.5 rounded-lg ${isActive ? 'bg-[#012980] text-white' : 'bg-gray-100 text-gray-500'}`}>
                        <Icon className="w-4 h-4" />
                      </div>
                      <span>{tab.label}</span>
                    </div>
                    {isActive ? (
                      <Check className="w-4 h-4 text-[#012980]" />
                    ) : (
                      <ChevronRight className="w-4 h-4 text-gray-400" />
                    )}
                  </button>
                );
              })}

              <div className="pt-2 mt-2 border-t border-gray-100">
                <button
                  type="button"
                  onClick={() => {
                    setMobileMenuOpen(false);
                    handleSave('draft');
                  }}
                  disabled={!!saving}
                  className="w-full flex items-center justify-center gap-2 px-3 py-2.5 bg-gray-50 hover:bg-gray-100 text-gray-700 rounded-xl text-sm font-semibold border border-gray-200 transition-colors"
                >
                  <Save className="w-4 h-4" />
                  <span>{saving === 'draft' ? 'Saving Draft...' : 'Save Draft'}</span>
                </button>
              </div>
            </div>
          )}
        </div>
      </div>

      <div className="max-w-6xl mx-auto px-3 sm:px-6 py-4 sm:py-6">
        <div className="flex flex-col md:flex-row gap-4 md:gap-6">
          {/* Desktop Sidebar Tabs (Preserved exactly as shown in Image 2) */}
          <aside className="hidden md:block w-52 flex-shrink-0">
            <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-2 sticky top-20">
              {TABS.map(tab => {
                const Icon = tab.icon;
                return (
                  <button 
                    key={tab.id} 
                    type="button"
                    onClick={() => setActiveTab(tab.id)}
                    className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-colors text-left ${activeTab === tab.id ? 'bg-[#012980]/10 text-[#012980] font-semibold' : 'text-gray-500 hover:text-gray-800 hover:bg-gray-50'}`}
                  >
                    <Icon className="w-4 h-4 flex-shrink-0" />
                    <span>{tab.label}</span>
                    {activeTab === tab.id && <ChevronRight className="w-3.5 h-3.5 ml-auto" />}
                  </button>
                );
              })}

              <div className="mt-3 pt-3 border-t border-gray-100">
                <button 
                  type="button"
                  onClick={() => handleSave('draft')} 
                  disabled={!!saving}
                  className="w-full flex items-center justify-center gap-2 px-3 py-2 bg-gray-50 text-gray-700 rounded-xl text-sm font-semibold hover:bg-gray-100 transition-colors disabled:opacity-50"
                >
                  {saving === 'draft' ? (
                    <div className="w-3.5 h-3.5 border-2 border-gray-400 border-t-gray-700 rounded-full animate-spin" />
                  ) : (
                    <Save className="w-3.5 h-3.5" />
                  )}
                  {saving === 'draft' ? 'Saving...' : 'Save Draft'}
                </button>
              </div>
            </div>
          </aside>

          {/* Main Content Area */}
          <main className="flex-1 w-full min-w-0">
            {renderTabContent()}

            {/* Bottom Step Navigation Bar (Previous / Next / Save Draft) */}
            <div className="mt-6 p-4 bg-white rounded-2xl border border-gray-100 shadow-xs flex flex-col sm:flex-row items-center justify-between gap-3">
              <div className="w-full sm:w-auto flex items-center gap-2">
                {prevTab ? (
                  <button
                    type="button"
                    onClick={() => switchTab(prevTab.id)}
                    className="flex-1 sm:flex-none flex items-center justify-center gap-1.5 px-4 py-2.5 bg-gray-50 hover:bg-gray-100 text-gray-700 font-bold text-xs sm:text-sm rounded-xl border border-gray-200 transition-colors"
                  >
                    <ArrowLeft className="w-4 h-4" />
                    <span>Back: {prevTab.label}</span>
                  </button>
                ) : (
                  <span className="text-xs text-gray-400 font-medium px-2">First section (Basic Info)</span>
                )}
              </div>

              <div className="w-full sm:w-auto flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => handleSave('draft')}
                  disabled={!!saving}
                  className="flex-1 sm:flex-none flex items-center justify-center gap-1.5 px-4 py-2.5 bg-gray-50 hover:bg-gray-100 text-gray-700 font-bold text-xs sm:text-sm rounded-xl border border-gray-200 transition-colors disabled:opacity-50"
                >
                  <Save className="w-4 h-4" />
                  <span>Save Draft</span>
                </button>

                {nextTab ? (
                  <button
                    type="button"
                    onClick={() => switchTab(nextTab.id)}
                    className="flex-1 sm:flex-none flex items-center justify-center gap-1.5 px-5 py-2.5 bg-[#012980] hover:bg-blue-900 text-white font-bold text-xs sm:text-sm rounded-xl shadow-xs transition-all"
                  >
                    <span>Next: {nextTab.label}</span>
                    <ArrowRight className="w-4 h-4" />
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={() => handleSave('publish')}
                    disabled={!!saving}
                    className="flex-1 sm:flex-none flex items-center justify-center gap-1.5 px-5 py-2.5 bg-gradient-to-r from-[#012980] to-[#ff7b23] text-white font-bold text-xs sm:text-sm rounded-xl shadow-xs hover:shadow-md transition-all disabled:opacity-50"
                  >
                    <Send className="w-4 h-4" />
                    <span>Submit for Approval</span>
                  </button>
                )}
              </div>
            </div>
          </main>
        </div>
      </div>
    </div>
  );
}
