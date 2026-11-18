import React, { useState, useEffect } from 'react';
import { useParams, useNavigate, useSearchParams, Link } from 'react-router-dom';
import { Search, SlidersHorizontal, ArrowLeft, ChevronLeft, Filter, X, ChevronDown, Check } from 'lucide-react';
import { Header } from '../components/Header';
import { ProductCard } from '../components/ProductCard';
import { AdBanner } from '../components/AdBanner';
import { useStoreData } from '../store/useStoreData';
import { registerModal, navigateBackSafe } from '../utils/backNavigation';
import api from '../utils/api';
import imgAarti from '../assets/story_aarti.png';

const PRICE_RANGES = [
  { id: 'under_1000', label: 'Under ₹1,000' },
  { id: '1000_2000', label: '₹1,000 - ₹2,000' },
  { id: '2000_5000', label: '₹2,000 - ₹5,000' },
  { id: 'above_5000', label: 'Above ₹5,000' },
];

const SORT_OPTIONS = [
  { id: 'featured', label: 'Featured / Recommended' },
  { id: 'price_asc', label: 'Price: Low to High' },
  { id: 'price_desc', label: 'Price: High to Low' },
];

export function CategoryListingPage() {
  const { categoryId } = useParams();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();

  const [layout, setLayout] = useState('grid');
  const [showMobileFilters, setShowMobileFilters] = useState(false);
  const [sortBy, setSortBy] = useState('featured'); // featured, price_asc, price_desc
  const { products, categories, loading, error, fetchData } = useStoreData();
  const [banners, setBanners] = useState([]);

  // Staged Filter States for Myntra-style Modal
  const [stagedCat, setStagedCat] = useState('all');
  const [stagedSub, setStagedSub] = useState('');
  const [stagedPrice, setStagedPrice] = useState('');
  const [stagedSort, setStagedSort] = useState('featured');
  const [activeFilterTab, setActiveFilterTab] = useState('categories'); // 'categories' | 'subcategories' | 'price' | 'sort'

  useEffect(() => {
    api.get('/general/banners?type=category_banner')
      .then(res => {
        const list = res.data?.banners || [];
        if (list.length > 0) {
          setBanners(list);
        } else {
          api.get('/general/banners?type=category_page_banner')
            .then(res2 => { if (res2.data?.banners) setBanners(res2.data.banners); })
            .catch(() => {});
        }
      })
      .catch(e => console.error(e));
  }, []);

  const modelQuery = searchParams.get('model');
  const searchQuery = searchParams.get('search');
  const priceQuery = searchParams.get('price');

  // Prevent body scroll and register modal close handler when mobile filter is open
  useEffect(() => {
    if (showMobileFilters) {
      document.body.style.overflow = 'hidden';
      const unregister = registerModal(() => setShowMobileFilters(false));
      return () => {
        document.body.style.overflow = 'unset';
        unregister();
      };
    } else {
      document.body.style.overflow = 'unset';
    }
  }, [showMobileFilters]);

  // Current Category and its real dynamic subcategories (combines subcategories + models from database)
  const currentCat = categories.find(c => c.id.toString() === categoryId);
  const currentSubcategories = React.useMemo(() => {
    if (!currentCat) return [];
    const list = [];
    if (Array.isArray(currentCat.subcategories)) {
      currentCat.subcategories.forEach(s => {
        const name = typeof s === 'string' ? s : s?.name;
        if (name && !list.includes(name)) list.push(name);
      });
    }
    if (Array.isArray(currentCat.models)) {
      currentCat.models.forEach(m => {
        const name = typeof m === 'string' ? m : m?.name;
        if (name && !list.includes(name)) list.push(name);
      });
    }
    return list;
  }, [currentCat]);

  // Staged Category and its dynamic subcategories inside Modal
  const stagedCategoryObj = categories.find(c => c.id.toString() === stagedCat);
  const stagedSubcategories = React.useMemo(() => {
    if (!stagedCategoryObj) return [];
    const list = [];
    if (Array.isArray(stagedCategoryObj.subcategories)) {
      stagedCategoryObj.subcategories.forEach(s => {
        const name = typeof s === 'string' ? s : s?.name;
        if (name && !list.includes(name)) list.push(name);
      });
    }
    if (Array.isArray(stagedCategoryObj.models)) {
      stagedCategoryObj.models.forEach(m => {
        const name = typeof m === 'string' ? m : m?.name;
        if (name && !list.includes(name)) list.push(name);
      });
    }
    return list;
  }, [stagedCategoryObj]);

  let categoryName = modelQuery ? `${modelQuery}` : 'All Products';
  let bannerImg = imgAarti;

  if (categoryId !== 'all' && currentCat) {
    categoryName = modelQuery ? `${currentCat.name} - ${modelQuery}` : currentCat.name;
    if (currentCat.image_url) bannerImg = currentCat.image_url;
  }
  if (searchQuery) categoryName = `Search: "${searchQuery}"`;

  // Helper to safely get base price of a product
  const getProductPrice = (p) => {
    let price = p.price || 0;
    try {
      let parsedSizes = [];
      if (typeof p.sizes === 'string') parsedSizes = JSON.parse(p.sizes);
      else if (Array.isArray(p.sizes)) parsedSizes = p.sizes;

      if (parsedSizes?.length > 0) {
        if (Array.isArray(parsedSizes[0].sizes) && parsedSizes[0].sizes.length > 0) {
          price = parsedSizes[0].sizes[0].price || price;
        } else if (parsedSizes[0].price) {
          price = parsedSizes[0].price || price;
        }
      }
    } catch (e) { }
    return Number(price);
  };

  // Memoized filter and sort on cached products with dynamic subcategory matching
  const filteredProducts = React.useMemo(() => {
    let list = products.filter(p => {
      let matchCat = true;
      if (categoryId !== 'all' && !searchQuery) {
        const cat = categories.find(c => c.id.toString() === categoryId);
        matchCat = cat ? (p.category && p.category.toLowerCase() === cat.name.toLowerCase()) : false;
      }

      let matchSubcategory = true;
      if (modelQuery) {
        const q = modelQuery.trim().toLowerCase();
        const pSub = (p.subcategory || '').trim().toLowerCase();
        const pMod = (p.model || '').trim().toLowerCase();
        matchSubcategory = pSub === q || pMod === q || pSub.includes(q) || pMod.includes(q);
      }

      let matchSearch = true;
      if (searchQuery) {
        const lowerSearch = searchQuery.toLowerCase();
        matchSearch = (p.name && p.name.toLowerCase().includes(lowerSearch)) ||
          (p.description && p.description.toLowerCase().includes(lowerSearch)) ||
          (p.subcategory && p.subcategory.toLowerCase().includes(lowerSearch)) ||
          (p.model && p.model.toLowerCase().includes(lowerSearch));
      }

      let matchPrice = true;
      if (priceQuery) {
        const pPrice = getProductPrice(p);
        if (priceQuery === 'under_1000') matchPrice = pPrice < 1000;
        else if (priceQuery === '1000_2000') matchPrice = pPrice >= 1000 && pPrice <= 2000;
        else if (priceQuery === '2000_5000') matchPrice = pPrice > 2000 && pPrice <= 5000;
        else if (priceQuery === 'above_5000') matchPrice = pPrice > 5000;
      }

      return matchCat && matchSubcategory && matchSearch && matchPrice;
    });

    if (sortBy === 'price_asc') {
      return [...list].sort((a, b) => getProductPrice(a) - getProductPrice(b));
    } else if (sortBy === 'price_desc') {
      return [...list].sort((a, b) => getProductPrice(b) - getProductPrice(a));
    }
    return list;
  }, [products, categoryId, searchQuery, modelQuery, priceQuery, sortBy, categories]);

  const handleCategoryChange = (newCatId) => {
    setSearchParams({});
    navigate(`/category/${newCatId}`);
  };

  const handleModelChange = (model) => {
    const newParams = Object.fromEntries(searchParams.entries());
    if (model) {
      newParams.model = model;
    } else {
      delete newParams.model;
    }
    setSearchParams(newParams);
  };

  const handlePriceChange = (priceKey) => {
    const newParams = Object.fromEntries(searchParams.entries());
    if (priceKey && newParams.price !== priceKey) {
      newParams.price = priceKey;
    } else {
      delete newParams.price;
    }
    setSearchParams(newParams);
  };

  // Open Myntra-style mobile filters with current staged values
  const openMobileFiltersModal = () => {
    setStagedCat(categoryId || 'all');
    setStagedSub(modelQuery || '');
    setStagedPrice(priceQuery || '');
    setStagedSort(sortBy || 'featured');
    setActiveFilterTab(categoryId !== 'all' ? 'subcategories' : 'categories');
    setShowMobileFilters(true);
  };

  const handleStagedCategorySelect = (catId) => {
    setStagedCat(catId);
    if (catId === 'all') {
      setStagedSub('');
    } else {
      const newCat = categories.find(c => c.id.toString() === catId);
      const newSubs = [
        ...(Array.isArray(newCat?.subcategories) ? newCat.subcategories.map(s => typeof s === 'string' ? s : s?.name) : []),
        ...(Array.isArray(newCat?.models) ? newCat.models.map(m => typeof m === 'string' ? m : m?.name) : []),
      ];
      if (stagedSub && !newSubs.map(s => (s || '').toLowerCase()).includes(stagedSub.toLowerCase())) {
        setStagedSub('');
      }
    }
  };

  const handleApplyFilters = () => {
    const newParams = {};
    if (stagedSub) newParams.model = stagedSub;
    if (stagedPrice) newParams.price = stagedPrice;
    if (searchQuery) newParams.search = searchQuery;
    setSortBy(stagedSort);
    setSearchParams(newParams);
    setShowMobileFilters(false);

    if (stagedCat !== categoryId) {
      const queryStr = Object.keys(newParams).length > 0 ? `?${new URLSearchParams(newParams).toString()}` : '';
      navigate(`/category/${stagedCat}${queryStr}`);
    }
  };

  const handleResetFilters = () => {
    setStagedSub('');
    setStagedPrice('');
    setStagedSort('featured');
  };

  // Active filter count on the live page
  const activeFilterCount = (modelQuery ? 1 : 0) + (priceQuery ? 1 : 0) + (sortBy !== 'featured' ? 1 : 0);

  // Active filter count in the draft modal
  const activeDraftFilterCount = (stagedSub ? 1 : 0) + (stagedPrice ? 1 : 0) + (stagedSort !== 'featured' ? 1 : 0);

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-[#f9f9f9]">
        <div className="w-8 h-8 border-4 border-brand-navy/20 border-t-brand-navy rounded-full animate-spin" />
      </div>
    );
  }

  if (error && products.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] bg-[#f9f9f9] px-4 text-center">
        <p className="text-gray-800 font-bold mb-1 text-base font-serif">Unable to load catalogue</p>
        <p className="text-gray-500 text-xs mb-5 max-w-xs">{error}</p>
        <button
          onClick={() => fetchData()}
          className="bg-brand-navy hover:bg-blue-900 text-white px-6 py-2.5 rounded-xl text-sm font-bold shadow-sm transition-all active:scale-95"
        >
          Retry
        </button>
      </div>
    );
  }

  // Desktop Sidebar Filter Content
  const FilterSidebarContent = () => (
    <div className="flex flex-col gap-6">
      {/* Categories */}
      <div>
        <h3 className="text-sm font-bold text-gray-900 mb-3 uppercase tracking-wider">Categories</h3>
        <ul className="space-y-1.5 max-h-56 overflow-y-auto pr-1 custom-scrollbar">
          <li>
            <button
              onClick={() => handleCategoryChange('all')}
              className={`w-full text-left px-3.5 py-2 rounded-xl text-xs sm:text-sm transition-all border ${categoryId === 'all' ? 'bg-blue-50/50 border-brand-navy text-brand-navy font-bold shadow-xs' : 'border-transparent text-gray-600 hover:bg-gray-50 hover:text-gray-900 hover:border-gray-200'}`}
            >
              All Products
            </button>
          </li>
          {categories.map(cat => (
            <li key={cat.id}>
              <button
                onClick={() => handleCategoryChange(cat.id.toString())}
                className={`w-full text-left px-3.5 py-2 rounded-xl text-xs sm:text-sm transition-all border flex items-center justify-between ${categoryId === cat.id.toString() ? 'bg-blue-50/50 border-brand-navy text-brand-navy font-bold shadow-xs' : 'border-transparent text-gray-600 hover:bg-gray-50 hover:text-gray-900 hover:border-gray-200'}`}
              >
                <span className="truncate">{cat.name}</span>
                {categoryId === cat.id.toString() && <Check className="w-3.5 h-3.5 text-brand-navy flex-shrink-0" />}
              </button>
            </li>
          ))}
        </ul>
      </div>

      {/* Dynamic Subcategories */}
      {currentSubcategories.length > 0 && (
        <div className="border-t border-gray-100 pt-5">
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-sm font-bold text-gray-900 uppercase tracking-wider">Subcategories</h3>
            {modelQuery && (
              <button onClick={() => handleModelChange('')} className="text-[11px] text-[#fe6603] hover:underline font-bold">Clear</button>
            )}
          </div>
          <div className="space-y-2 max-h-48 overflow-y-auto pr-2 custom-scrollbar">
            {currentSubcategories.map((sub, idx) => {
              const isSelected = (modelQuery || '').toLowerCase() === sub.toLowerCase();
              return (
                <label key={idx} className="flex items-center gap-2.5 cursor-pointer group">
                  <div className={`w-4 h-4 rounded border flex items-center justify-center transition-all ${isSelected ? 'border-brand-navy bg-brand-navy shadow-xs' : 'border-gray-300 group-hover:border-brand-navy bg-white'}`}>
                    {isSelected && <Check className="w-3 h-3 text-white" strokeWidth={3} />}
                  </div>
                  <span className={`text-xs sm:text-sm capitalize ${isSelected ? 'text-brand-navy font-bold' : 'text-gray-600 group-hover:text-gray-900'}`}>{sub}</span>
                  <input type="radio" name="sub_radio" className="hidden" checked={isSelected} onChange={() => handleModelChange(isSelected ? '' : sub)} />
                </label>
              );
            })}
          </div>
        </div>
      )}

      {/* Shop by Price */}
      <div className="border-t border-gray-100 pt-5">
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-sm font-bold text-gray-900 uppercase tracking-wider">Price Range</h3>
          {priceQuery && (
            <button onClick={() => handlePriceChange('')} className="text-[11px] text-[#fe6603] hover:underline font-bold">Clear</button>
          )}
        </div>
        <div className="space-y-2">
          {PRICE_RANGES.map(opt => (
            <label key={opt.id} className="flex items-center gap-2.5 cursor-pointer group">
              <div className={`w-4 h-4 rounded border flex items-center justify-center transition-all ${priceQuery === opt.id ? 'border-brand-navy bg-brand-navy shadow-xs' : 'border-gray-300 group-hover:border-brand-navy bg-white'}`}>
                {priceQuery === opt.id && <Check className="w-3 h-3 text-white" strokeWidth={3} />}
              </div>
              <span className={`text-xs sm:text-sm ${priceQuery === opt.id ? 'text-brand-navy font-bold' : 'text-gray-600 group-hover:text-gray-900'}`}>{opt.label}</span>
              <input type="radio" name="price_radio" className="hidden" checked={priceQuery === opt.id} onChange={() => handlePriceChange(opt.id)} />
            </label>
          ))}
        </div>
      </div>

      {/* Sort By */}
      <div className="border-t border-gray-100 pt-5">
        <h3 className="text-sm font-bold text-gray-900 mb-3 uppercase tracking-wider">Sort By</h3>
        <div className="space-y-2">
          {SORT_OPTIONS.map(opt => (
            <label key={opt.id} className="flex items-center gap-2.5 cursor-pointer group">
              <div className={`w-4 h-4 rounded-full border flex items-center justify-center transition-all ${sortBy === opt.id ? 'border-brand-navy bg-brand-navy shadow-xs' : 'border-gray-300 group-hover:border-brand-navy bg-white'}`}>
                {sortBy === opt.id && <div className="w-1.5 h-1.5 rounded-full bg-white" />}
              </div>
              <span className={`text-xs sm:text-sm ${sortBy === opt.id ? 'text-brand-navy font-bold' : 'text-gray-600 group-hover:text-gray-900'}`}>{opt.label}</span>
              <input type="radio" name="sort_radio" className="hidden" checked={sortBy === opt.id} onChange={() => setSortBy(opt.id)} />
            </label>
          ))}
        </div>
      </div>
    </div>
  );

  return (
    <div className="bg-transparent min-h-screen pb-20">
      <Header title={categoryName} showShare={true} />

      {/* Category Banner or Search UI */}
      {categoryId === 'all' ? (
        <div className="pt-6 pb-2 relative z-10 px-4">
          <div className="flex items-center gap-3 max-w-7xl mx-auto">
            <button
              onClick={() => navigateBackSafe(navigate, '/')}
              className="w-11 h-11 bg-white border border-gray-200 rounded-2xl flex items-center justify-center text-gray-700 shadow-sm hover:bg-gray-50 hover:text-gray-900 transition-all shrink-0"
              aria-label="Back"
            >
              <ChevronLeft className="w-5 h-5" />
            </button>
            <div className="flex-1 relative group">
              <Search className="w-4 h-4 text-gray-500 absolute left-4 top-1/2 -translate-y-1/2 group-focus-within:text-brand-navy transition-colors" />
              <input
                type="text"
                value={searchQuery || ''}
                onChange={(e) => {
                  const newParams = Object.fromEntries(searchParams.entries());
                  if (e.target.value) newParams.search = e.target.value;
                  else delete newParams.search;
                  setSearchParams(newParams);
                }}
                placeholder="Search products or subcategories..."
                className="w-full bg-white border border-gray-200 rounded-full py-2.5 pl-11 pr-10 text-[15px] text-gray-900 focus:outline-none focus:ring-1 focus:border-brand-navy focus:shadow-sm transition-all placeholder-gray-400"
              />
              {searchQuery && (
                <button
                  onClick={() => {
                    const newParams = Object.fromEntries(searchParams.entries());
                    delete newParams.search;
                    setSearchParams(newParams);
                  }}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-700 p-1.5 rounded-full hover:bg-gray-100 transition-colors"
                >
                  <X className="w-4 h-4" />
                </button>
              )}
            </div>
            <button 
              onClick={openMobileFiltersModal} 
              className="lg:hidden w-11 h-11 bg-[#012980] rounded-2xl flex items-center justify-center text-white shadow-md hover:bg-blue-900 transition-all shrink-0 relative"
              aria-label="Open Filters"
            >
              <SlidersHorizontal className="w-5 h-5" />
              {activeFilterCount > 0 && (
                <span className="absolute -top-1 -right-1 w-5 h-5 bg-[#fe6603] text-white text-[10px] font-bold rounded-full flex items-center justify-center border-2 border-white">
                  {activeFilterCount}
                </span>
              )}
            </button>
          </div>
        </div>
      ) : (
        <div className="bg-white mx-4 lg:mx-8 rounded-3xl mt-6 relative overflow-hidden shadow-sm border border-gray-100">
          <div className="absolute inset-0 bg-gradient-to-r from-blue-50/50 to-transparent pointer-events-none" />
          <div className="max-w-7xl mx-auto flex flex-col md:flex-row items-center justify-between p-6 md:px-12 md:py-10 gap-6 relative z-10">
            <div className="text-center md:text-left text-gray-900 max-w-2xl">
              <button
                onClick={() => navigateBackSafe(navigate, '/category/all')}
                className="mb-4 inline-flex items-center gap-1.5 px-3.5 py-1.5 bg-gray-50 hover:bg-gray-100 text-gray-700 hover:text-gray-900 text-xs font-semibold rounded-full border border-gray-200 transition-colors shadow-xs"
              >
                <ChevronLeft className="w-4 h-4" />
                <span>Back to All Products</span>
              </button>
              <h1 className="text-3xl md:text-5xl font-extrabold mb-3 tracking-tight font-serif text-[#012980]">{categoryName}</h1>
              <p className="text-gray-600 font-sans text-xs md:text-base leading-relaxed max-w-xl">
                Explore authentic, premium quality collection handpicked for you.
              </p>
            </div>
            <div className="w-24 h-24 md:w-36 md:h-36 shrink-0 rounded-full bg-white p-2 border border-brand-navy/30 shadow-sm hidden md:block">
              <img src={bannerImg} alt={categoryName} className="w-full h-full object-cover rounded-full" />
            </div>
          </div>
        </div>
      )}

      <div className="max-w-7xl mx-auto px-3 sm:px-6 lg:px-8 py-5 md:py-8">

        {/* Categories Ribbon (Horizontal swipeable category circles) */}
        <div className="bg-white border border-gray-100 rounded-2xl mb-6 px-3 py-4 overflow-x-auto hide-scrollbar shadow-xs">
          <div className="flex gap-4 md:gap-8 justify-start md:justify-center min-w-max mx-auto px-1">
            <Link to="/category/all" className="flex flex-col items-center gap-2 group">
              <div className={`w-14 h-14 md:w-16 md:h-16 rounded-2xl flex items-center justify-center border overflow-hidden transition-all ${categoryId === 'all' ? 'border-[#012980] border-2 shadow-xs bg-blue-50/50' : 'border-gray-200 bg-white group-hover:border-[#012980]'}`}>
                <div className={`w-full h-full flex items-center justify-center font-extrabold text-xs text-center leading-tight ${categoryId === 'all' ? 'text-[#012980]' : 'text-gray-600 group-hover:text-[#012980]'}`}>All<br />Products</div>
              </div>
              <span className={`text-xs font-bold text-center transition-colors ${categoryId === 'all' ? 'text-[#012980]' : 'text-gray-600 group-hover:text-gray-900'}`}>All Products</span>
            </Link>
            {categories.map(cat => (
              <Link key={cat.id} to={`/category/${cat.id}`} className="flex flex-col items-center gap-2 group">
                <div className={`w-14 h-14 md:w-16 md:h-16 rounded-2xl flex items-center justify-center border overflow-hidden transition-all ${categoryId === cat.id.toString() ? 'border-[#012980] border-2 shadow-xs bg-blue-50/50' : 'border-gray-200 bg-white p-0.5 group-hover:border-[#012980]'}`}>
                  {cat.image_url ? (
                    <img src={cat.image_url} alt={cat.name} className="w-full h-full object-cover rounded-xl" />
                  ) : (
                    <img src={imgAarti} alt="Cat" className="w-full h-full object-cover opacity-50 rounded-xl mix-blend-multiply" />
                  )}
                </div>
                <span className={`text-xs font-bold text-center transition-colors ${categoryId === cat.id.toString() ? 'text-[#012980]' : 'text-gray-600 group-hover:text-gray-900'}`}>{cat.name}</span>
              </Link>
            ))}
          </div>
        </div>

        {/* Ad Block */}
        {banners.length > 0 && (
          <div className="mb-6">
            <AdBanner
              imageUrl={banners[0].image_url}
              altText={banners[0].title || "Category Special Ad"}
              link={banners[0].link_url || "/category/all"}
            />
          </div>
        )}

        {/* Listing Control Bar: Count + Filter Trigger + Active Chips */}
        <div className="mb-4 bg-white p-3 sm:p-4 rounded-2xl shadow-xs border border-gray-100 flex flex-col gap-3">
          <div className="flex items-center justify-between w-full">
            <span className="text-xs sm:text-sm font-extrabold text-[#012980] bg-blue-50/70 border border-blue-200/60 px-3.5 py-1.5 rounded-xl">
              {filteredProducts.length} {filteredProducts.length === 1 ? 'Item' : 'Items'}
            </span>

            {/* Mobile Filter Trigger Button */}
            <div className="flex items-center gap-2 lg:hidden">
              <button
                type="button"
                onClick={openMobileFiltersModal}
                className="flex items-center gap-1.5 text-xs font-bold text-white bg-[#012980] hover:bg-blue-900 px-4 py-2 rounded-xl shadow-xs transition-all active:scale-95"
              >
                <SlidersHorizontal className="w-3.5 h-3.5" />
                <span>Filters</span>
                {activeFilterCount > 0 && (
                  <span className="w-4 h-4 rounded-full bg-[#fe6603] text-white text-[10px] font-extrabold flex items-center justify-center ml-0.5">
                    {activeFilterCount}
                  </span>
                )}
              </button>
            </div>

            {/* Desktop View Switcher */}
            <div className="hidden lg:flex items-center gap-4">
              <span className="text-xs font-bold text-gray-400 uppercase tracking-wider">View:</span>
              <div className="flex bg-gray-50 border border-gray-200 rounded-xl p-1">
                <button onClick={() => setLayout('grid')} className={`px-4 py-1.5 text-xs font-bold rounded-lg transition-all ${layout === 'grid' ? 'bg-[#012980] text-white shadow-xs' : 'text-gray-600 hover:text-gray-900'}`}>Grid</button>
                <button onClick={() => setLayout('list')} className={`px-4 py-1.5 text-xs font-bold rounded-lg transition-all ${layout === 'list' ? 'bg-[#012980] text-white shadow-xs' : 'text-gray-600 hover:text-gray-900'}`}>List</button>
              </div>
            </div>
          </div>

          {/* Active Filter Chips Strip */}
          {activeFilterCount > 0 && (
            <div className="flex flex-wrap items-center gap-2 pt-2 border-t border-gray-100">
              <span className="text-[11px] font-bold text-gray-400 uppercase tracking-wider mr-1">Active:</span>
              {modelQuery && (
                <span className="inline-flex items-center gap-1.5 px-2.5 py-1 bg-blue-50 text-[#012980] border border-blue-200 rounded-full text-xs font-bold shadow-2xs">
                  <span>{modelQuery}</span>
                  <button 
                    type="button"
                    onClick={() => handleModelChange('')} 
                    className="hover:text-red-500 rounded-full p-0.5"
                    aria-label="Remove subcategory filter"
                  >
                    <X className="w-3 h-3" />
                  </button>
                </span>
              )}
              {priceQuery && (
                <span className="inline-flex items-center gap-1.5 px-2.5 py-1 bg-blue-50 text-[#012980] border border-blue-200 rounded-full text-xs font-bold shadow-2xs">
                  <span>{PRICE_RANGES.find(p => p.id === priceQuery)?.label || priceQuery}</span>
                  <button 
                    type="button"
                    onClick={() => handlePriceChange('')} 
                    className="hover:text-red-500 rounded-full p-0.5"
                    aria-label="Remove price filter"
                  >
                    <X className="w-3 h-3" />
                  </button>
                </span>
              )}
              {sortBy !== 'featured' && (
                <span className="inline-flex items-center gap-1.5 px-2.5 py-1 bg-blue-50 text-[#012980] border border-blue-200 rounded-full text-xs font-bold shadow-2xs">
                  <span>{SORT_OPTIONS.find(s => s.id === sortBy)?.label || sortBy}</span>
                  <button 
                    type="button"
                    onClick={() => setSortBy('featured')} 
                    className="hover:text-red-500 rounded-full p-0.5"
                    aria-label="Reset sort"
                  >
                    <X className="w-3 h-3" />
                  </button>
                </span>
              )}
              <button
                type="button"
                onClick={() => {
                  setSearchParams(searchQuery ? { search: searchQuery } : {});
                  setSortBy('featured');
                }}
                className="text-[11px] font-bold text-red-600 hover:text-red-800 underline ml-2"
              >
                Clear All
              </button>
            </div>
          )}
        </div>

        <div className="flex gap-8 items-start">
          {/* Desktop Sidebar */}
          <aside className="hidden lg:block w-72 shrink-0 bg-white p-6 rounded-3xl shadow-sm border border-gray-100 sticky top-28">
            <FilterSidebarContent />
          </aside>

          {/* Product Grid */}
          <div className="flex-1 min-w-0">
            <div className={layout === 'grid' ? 'grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-4 gap-2.5 sm:gap-4 lg:gap-6' : 'flex flex-col gap-4'}>
              {filteredProducts.map((product, index) => {
                const isAdSlot = (index + 1) % 14 === 0;
                return (
                  <React.Fragment key={product.id}>
                    <ProductCard product={product} layout={layout} />
                    {isAdSlot && (
                      <div className="col-span-full">
                        {banners.length > 1 ? (
                          <AdBanner
                            imageUrl={banners[1 % banners.length].image_url}
                            altText={banners[1 % banners.length].title || "In-Feed Ad"}
                            link={banners[1 % banners.length].link_url || "/category/all"}
                          />
                        ) : (
                          <AdBanner
                            imageUrl={imgAarti}
                            altText="In-Feed Ad"
                          />
                        )}
                      </div>
                    )}
                  </React.Fragment>
                );
              })}

              {filteredProducts.length === 0 && (
                <div className="col-span-full py-20 text-center flex flex-col items-center bg-white rounded-3xl shadow-xs border border-gray-100 px-4">
                  <div className="w-16 h-16 bg-gray-50 border border-gray-100 rounded-full flex items-center justify-center mb-4">
                    <Search className="w-7 h-7 text-gray-400" />
                  </div>
                  <h3 className="text-xl font-extrabold text-[#012980] mb-2 font-serif">No products found</h3>
                  <p className="text-gray-500 text-xs sm:text-sm max-w-md">No items match your active filters or search. Try clearing or relaxing some filters.</p>
                  <button 
                    onClick={() => { 
                      handleCategoryChange('all'); 
                      setSortBy('featured'); 
                    }} 
                    className="mt-6 bg-[#012980] hover:bg-blue-900 text-white font-bold px-6 py-2.5 rounded-xl shadow-xs transition-all active:scale-95 text-xs sm:text-sm"
                  >
                    Clear All Filters
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Bottom Ad Block */}
        {banners.length > 2 ? (
          <div className="mt-8">
            <AdBanner
              imageUrl={banners[2 % banners.length].image_url}
              altText={banners[2 % banners.length].title || "Category Bottom Ad"}
              link={banners[2 % banners.length].link_url || "/category/all"}
            />
          </div>
        ) : banners.length > 0 ? (
          <div className="mt-8">
            <AdBanner
              imageUrl={banners[0].image_url}
              altText={banners[0].title || "Category Bottom Ad"}
              link={banners[0].link_url || "/category/all"}
            />
          </div>
        ) : null}
      </div>

      {/* ======================================================== */}
      {/* MYNTRA-STYLE MULTI-FACET MOBILE FILTERS DRAWER / MODAL   */}
      {/* ======================================================== */}
      {showMobileFilters && (
        <div className="fixed inset-0 z-[60] lg:hidden flex">
          {/* Backdrop */}
          <div 
            className="fixed inset-0 bg-black/60 backdrop-blur-xs transition-opacity" 
            onClick={() => setShowMobileFilters(false)} 
          />

          {/* Modal Panel */}
          <div className="relative ml-auto w-[92%] sm:w-[85%] max-w-md bg-white h-full flex flex-col shadow-2xl transition-transform">
            
            {/* Header */}
            <div className="flex items-center justify-between px-4 py-3.5 border-b border-gray-200 bg-white">
              <div className="flex items-center gap-2">
                <SlidersHorizontal className="w-5 h-5 text-[#012980]" />
                <h2 className="text-base font-extrabold text-gray-900 tracking-tight">Filters</h2>
                {activeDraftFilterCount > 0 && (
                  <span className="px-2 py-0.5 bg-[#fe6603] text-white rounded-full text-[10px] font-bold">
                    {activeDraftFilterCount} active
                  </span>
                )}
              </div>
              <button 
                type="button"
                onClick={() => setShowMobileFilters(false)} 
                className="p-1.5 text-gray-500 hover:text-gray-900 rounded-full hover:bg-gray-100 transition-colors"
                aria-label="Close filters"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* 2-Column Body */}
            <div className="flex-1 flex min-h-0">
              
              {/* Left Column: Facet Tabs */}
              <div className="w-36 sm:w-40 bg-gray-50/80 border-r border-gray-200 flex flex-col overflow-y-auto">
                
                {/* Tab: Categories */}
                <button
                  type="button"
                  onClick={() => setActiveFilterTab('categories')}
                  className={`flex items-center justify-between p-3.5 text-left text-xs font-bold border-l-4 transition-colors ${
                    activeFilterTab === 'categories'
                      ? 'bg-white text-[#012980] border-[#012980] shadow-2xs'
                      : 'border-transparent text-gray-600 hover:text-gray-900 hover:bg-gray-100/60'
                  }`}
                >
                  <span>Categories</span>
                  {stagedCat !== 'all' && (
                    <span className="w-2 h-2 rounded-full bg-[#012980]" />
                  )}
                </button>

                {/* Tab: Subcategories */}
                <button
                  type="button"
                  onClick={() => setActiveFilterTab('subcategories')}
                  className={`flex items-center justify-between p-3.5 text-left text-xs font-bold border-l-4 transition-colors ${
                    activeFilterTab === 'subcategories'
                      ? 'bg-white text-[#012980] border-[#012980] shadow-2xs'
                      : 'border-transparent text-gray-600 hover:text-gray-900 hover:bg-gray-100/60'
                  }`}
                >
                  <span>Subcategories</span>
                  {stagedSub ? (
                    <span className="w-2 h-2 rounded-full bg-[#fe6603]" />
                  ) : stagedSubcategories.length > 0 ? (
                    <span className="text-[10px] text-gray-400 font-semibold">{stagedSubcategories.length}</span>
                  ) : null}
                </button>

                {/* Tab: Price */}
                <button
                  type="button"
                  onClick={() => setActiveFilterTab('price')}
                  className={`flex items-center justify-between p-3.5 text-left text-xs font-bold border-l-4 transition-colors ${
                    activeFilterTab === 'price'
                      ? 'bg-white text-[#012980] border-[#012980] shadow-2xs'
                      : 'border-transparent text-gray-600 hover:text-gray-900 hover:bg-gray-100/60'
                  }`}
                >
                  <span>Price Range</span>
                  {stagedPrice && (
                    <span className="w-2 h-2 rounded-full bg-[#012980]" />
                  )}
                </button>

                {/* Tab: Sort */}
                <button
                  type="button"
                  onClick={() => setActiveFilterTab('sort')}
                  className={`flex items-center justify-between p-3.5 text-left text-xs font-bold border-l-4 transition-colors ${
                    activeFilterTab === 'sort'
                      ? 'bg-white text-[#012980] border-[#012980] shadow-2xs'
                      : 'border-transparent text-gray-600 hover:text-gray-900 hover:bg-gray-100/60'
                  }`}
                >
                  <span>Sort By</span>
                  {stagedSort !== 'featured' && (
                    <span className="w-2 h-2 rounded-full bg-[#012980]" />
                  )}
                </button>

              </div>

              {/* Right Column: Tab Content */}
              <div className="flex-1 p-3.5 overflow-y-auto bg-white custom-scrollbar">
                
                {/* CATEGORIES CONTENT */}
                {activeFilterTab === 'categories' && (
                  <div className="space-y-1.5">
                    <p className="text-[11px] font-bold text-gray-400 uppercase tracking-wider mb-2">Select Category</p>
                    <button
                      type="button"
                      onClick={() => handleStagedCategorySelect('all')}
                      className={`w-full flex items-center justify-between p-2.5 rounded-xl border text-xs font-semibold transition-all ${
                        stagedCat === 'all'
                          ? 'border-[#012980] bg-blue-50/60 text-[#012980] font-bold'
                          : 'border-gray-200 text-gray-700 hover:bg-gray-50'
                      }`}
                    >
                      <span>All Products</span>
                      {stagedCat === 'all' && <Check className="w-4 h-4 text-[#012980]" />}
                    </button>
                    {categories.map(cat => (
                      <button
                        key={cat.id}
                        type="button"
                        onClick={() => handleStagedCategorySelect(cat.id.toString())}
                        className={`w-full flex items-center justify-between p-2.5 rounded-xl border text-xs font-semibold transition-all ${
                          stagedCat === cat.id.toString()
                            ? 'border-[#012980] bg-blue-50/60 text-[#012980] font-bold'
                            : 'border-gray-200 text-gray-700 hover:bg-gray-50'
                        }`}
                      >
                        <div className="flex items-center gap-2 min-w-0">
                          {cat.image_url ? (
                            <img src={cat.image_url} alt="" className="w-6 h-6 rounded-md object-cover flex-shrink-0" />
                          ) : (
                            <div className="w-6 h-6 rounded-md bg-gray-100 flex-shrink-0" />
                          )}
                          <span className="truncate">{cat.name}</span>
                        </div>
                        {stagedCat === cat.id.toString() && <Check className="w-4 h-4 text-[#012980] flex-shrink-0 ml-2" />}
                      </button>
                    ))}
                  </div>
                )}

                {/* SUBCATEGORIES CONTENT */}
                {activeFilterTab === 'subcategories' && (
                  <div className="space-y-2">
                    <div className="flex items-center justify-between mb-2">
                      <p className="text-[11px] font-bold text-gray-400 uppercase tracking-wider">
                        {stagedCategoryObj ? `${stagedCategoryObj.name} Subcategories` : 'Subcategories'}
                      </p>
                      {stagedSub && (
                        <button
                          type="button"
                          onClick={() => setStagedSub('')}
                          className="text-[11px] text-[#fe6603] font-bold hover:underline"
                        >
                          Clear
                        </button>
                      )}
                    </div>

                    {stagedSubcategories.length === 0 ? (
                      <div className="py-8 text-center px-2">
                        <p className="text-xs text-gray-500 font-medium leading-relaxed">
                          {stagedCat === 'all' ? 'Select a specific category on the left to see its subcategories.' : 'No subcategories found for this category.'}
                        </p>
                      </div>
                    ) : (
                      <div className="space-y-1.5">
                        {stagedSubcategories.map((sub, idx) => {
                          const isSelected = stagedSub.trim().toLowerCase() === sub.trim().toLowerCase();
                          return (
                            <button
                              key={idx}
                              type="button"
                              onClick={() => setStagedSub(isSelected ? '' : sub)}
                              className={`w-full flex items-center justify-between p-2.5 rounded-xl border text-xs font-semibold transition-all ${
                                isSelected
                                  ? 'border-[#012980] bg-blue-50/60 text-[#012980] font-bold'
                                  : 'border-gray-200 text-gray-700 hover:bg-gray-50'
                              }`}
                            >
                              <span className="capitalize">{sub}</span>
                              <div className={`w-4 h-4 rounded border flex items-center justify-center transition-colors ${
                                isSelected ? 'border-[#012980] bg-[#012980]' : 'border-gray-300 bg-white'
                              }`}>
                                {isSelected && <Check className="w-3 h-3 text-white" strokeWidth={3} />}
                              </div>
                            </button>
                          );
                        })}
                      </div>
                    )}
                  </div>
                )}

                {/* PRICE RANGE CONTENT */}
                {activeFilterTab === 'price' && (
                  <div className="space-y-2">
                    <div className="flex items-center justify-between mb-2">
                      <p className="text-[11px] font-bold text-gray-400 uppercase tracking-wider">Price Range</p>
                      {stagedPrice && (
                        <button
                          type="button"
                          onClick={() => setStagedPrice('')}
                          className="text-[11px] text-[#fe6603] font-bold hover:underline"
                        >
                          Clear
                        </button>
                      )}
                    </div>
                    <div className="space-y-1.5">
                      {PRICE_RANGES.map(opt => {
                        const isSelected = stagedPrice === opt.id;
                        return (
                          <button
                            key={opt.id}
                            type="button"
                            onClick={() => setStagedPrice(isSelected ? '' : opt.id)}
                            className={`w-full flex items-center justify-between p-2.5 rounded-xl border text-xs font-semibold transition-all ${
                              isSelected
                                ? 'border-[#012980] bg-blue-50/60 text-[#012980] font-bold'
                                : 'border-gray-200 text-gray-700 hover:bg-gray-50'
                            }`}
                          >
                            <span>{opt.label}</span>
                            <div className={`w-4 h-4 rounded-full border flex items-center justify-center transition-colors ${
                              isSelected ? 'border-[#012980] bg-[#012980]' : 'border-gray-300 bg-white'
                            }`}>
                              {isSelected && <div className="w-1.5 h-1.5 rounded-full bg-white" />}
                            </div>
                          </button>
                        );
                      })}
                    </div>
                  </div>
                )}

                {/* SORT CONTENT */}
                {activeFilterTab === 'sort' && (
                  <div className="space-y-2">
                    <p className="text-[11px] font-bold text-gray-400 uppercase tracking-wider mb-2">Sort Order</p>
                    <div className="space-y-1.5">
                      {SORT_OPTIONS.map(opt => {
                        const isSelected = stagedSort === opt.id;
                        return (
                          <button
                            key={opt.id}
                            type="button"
                            onClick={() => setStagedSort(opt.id)}
                            className={`w-full flex items-center justify-between p-2.5 rounded-xl border text-xs font-semibold transition-all ${
                              isSelected
                                ? 'border-[#012980] bg-blue-50/60 text-[#012980] font-bold'
                                : 'border-gray-200 text-gray-700 hover:bg-gray-50'
                            }`}
                          >
                            <span>{opt.label}</span>
                            <div className={`w-4 h-4 rounded-full border flex items-center justify-center transition-colors ${
                              isSelected ? 'border-[#012980] bg-[#012980]' : 'border-gray-300 bg-white'
                            }`}>
                              {isSelected && <div className="w-1.5 h-1.5 rounded-full bg-white" />}
                            </div>
                          </button>
                        );
                      })}
                    </div>
                  </div>
                )}

              </div>

            </div>

            {/* Modal Bottom Actions */}
            <div className="p-3 border-t border-gray-200 bg-gray-50 flex items-center gap-2.5">
              <button
                type="button"
                onClick={handleResetFilters}
                className="flex-1 py-2.5 px-3 border border-gray-300 text-gray-700 hover:bg-gray-100 font-bold text-xs rounded-xl bg-white transition-colors"
              >
                Clear All
              </button>
              <button
                type="button"
                onClick={handleApplyFilters}
                className="flex-[2] py-2.5 px-4 bg-[#012980] hover:bg-blue-900 text-white font-bold text-xs rounded-xl shadow-md transition-colors flex items-center justify-center gap-1.5"
              >
                <span>Apply Filters</span>
                {activeDraftFilterCount > 0 && (
                  <span className="w-5 h-5 rounded-full bg-white/20 text-white text-[10px] flex items-center justify-center font-extrabold">
                    {activeDraftFilterCount}
                  </span>
                )}
              </button>
            </div>

          </div>
        </div>
      )}
    </div>
  );
}