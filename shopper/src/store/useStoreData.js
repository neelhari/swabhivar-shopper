import { create } from 'zustand';
import api from '../utils/api';

export const useStoreData = create((set, get) => ({
  products: [],
  categories: [],
  vendors: [],
  loading: true,
  lastFetchedAt: null,
  error: null,

  // Standard cached fetch: reuses cached data unless force=true or store is empty
  fetchData: async (force = false) => {
    const state = get();
    if (!force && state.products.length > 0 && state.categories.length > 0 && !state.error) {
      return;
    }

    try {
      set({ loading: state.products.length === 0, error: null });
      const [prodRes, catRes, vendRes] = await Promise.all([
        api.get('/general/products'),
        api.get('/general/categories'),
        api.get('/general/vendors')
      ]);

      set({
        products: prodRes.data?.products || [],
        categories: catRes.data?.categories || [],
        vendors: vendRes.data?.vendors || [],
        loading: false,
        lastFetchedAt: Date.now(),
        error: null
      });
    } catch (err) {
      console.error("Failed to load store data from API:", err);
      set({
        loading: false,
        error: err.response?.data?.error || err.message || "Failed to load catalogue"
      });
    }
  },

  // Explicit cache invalidation / refresh for latest saved products
  refreshProducts: async () => {
    try {
      const prodRes = await api.get('/general/products');
      const products = prodRes.data?.products || [];
      set({ products, lastFetchedAt: Date.now() });
      return products;
    } catch (err) {
      console.error("Failed to refresh products:", err);
    }
  },

  // Authoritative single product fetch / refresh from backend
  fetchSingleProduct: async (id) => {
    try {
      const res = await api.get(`/general/products/${id}`);
      const product = res.data?.product;
      if (product) {
        set(state => ({
          products: state.products.some(p => p.id === product.id)
            ? state.products.map(p => p.id === product.id ? product : p)
            : [product, ...state.products]
        }));
      }
      return product;
    } catch (err) {
      console.warn(`Failed to fetch single product ${id}:`, err.message);
      // Fallback to local store if available
      return get().products.find(p => String(p.id) === String(id)) || null;
    }
  },

  // Invalidate or update a single product in store (e.g., after admin/vendor save)
  updateProductInStore: (updatedProduct) => {
    if (!updatedProduct || !updatedProduct.id) return;
    set(state => ({
      products: state.products.some(p => p.id === updatedProduct.id)
        ? state.products.map(p => p.id === updatedProduct.id ? updatedProduct : p)
        : [updatedProduct, ...state.products]
    }));
  }
}));
