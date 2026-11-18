import { create } from 'zustand';
import { useToastStore } from './useToastStore';
import api from '../utils/api';

export const useCartStore = create(
  (set, get) => ({
    items: [],
    deliveryCharge: 0,
    platformFee: 0,
    platformFeePercent: 4.0,
    vendorShipments: [],
    deliveryPincode: localStorage.getItem('cart_delivery_pincode') || '',
    shippingCalculatedForPincode: '',
    isCalculatingShipping: false,
    shippingError: '',

    setDeliveryPincode: (pin) => {
      const clean = String(pin || '').replace(/\D/g, '').slice(0, 6);
      localStorage.setItem('cart_delivery_pincode', clean);
      set({ deliveryPincode: clean });
    },

    // Fetch cart from backend
    fetchCart: async () => {
      try {
        const res = await api.get('/general/cart');
        set({ items: res.data });
      } catch (err) {
        console.error("Failed to fetch cart:", err);
      }
    },

    addToCart: async (product, variant, qty = 1) => {
      try {
        const currentItems = get().items;
        const existingItem = currentItems.find(
          i => (i.product_id === product.id || i.product?.id === product.id) &&
            JSON.stringify(i.variant) === JSON.stringify(variant)
        );
        const existingQty = existingItem ? existingItem.qty : 0;
        const totalRequestedQty = existingQty + qty;

        // Stock guard: clamp to available stock if known
        const availableStock = product.stock !== undefined && product.stock !== null ? parseInt(product.stock, 10) : 999;
        if (availableStock > 0 && totalRequestedQty > availableStock) {
          const maxAddable = Math.max(0, availableStock - existingQty);
          if (maxAddable === 0) {
            useToastStore.getState().showToast(`Cannot add more. Maximum available stock (${availableStock}) already in cart.`, 'error');
            return;
          }
          useToastStore.getState().showToast(`Only ${availableStock} units in stock. Adjusted quantity.`, 'warning');
          qty = maxAddable;
        }

        await api.post('/general/cart', { product_id: product.id, variant, qty });
        await get().fetchCart();
        if (get().deliveryPincode?.length === 6) {
          get().calculateRates(get().deliveryPincode);
        }
        useToastStore.getState().showToast(`Added ${product.name} to cart!`);
      } catch (err) {
        console.error("Add to cart failed:", err);
        const errMsg = err.response?.data?.error || `Failed to add ${product.name} to cart.`;
        useToastStore.getState().showToast(errMsg, 'error');
      }
    },

    removeFromCart: async (productId, variant) => {
      const prevItems = get().items;
      // Optimistic instant removal
      const updatedItems = prevItems.filter(
        i => !((i.product_id === productId || i.product?.id === productId) &&
               JSON.stringify(i.variant) === JSON.stringify(variant))
      );
      set({ items: updatedItems });

      if (updatedItems.length === 0) {
        set({ deliveryCharge: 0, platformFee: 0, vendorShipments: [], shippingError: '' });
      }

      try {
        await api.delete('/general/cart', { data: { product_id: productId, variant } });
        if (updatedItems.length > 0 && get().deliveryPincode?.length === 6) {
          get().calculateRates(get().deliveryPincode);
        }
        useToastStore.getState().showToast('Item removed from cart');
      } catch (err) {
        console.error("Remove from cart failed:", err);
        set({ items: prevItems });
        const errMsg = err.response?.data?.error || 'Failed to remove item';
        useToastStore.getState().showToast(errMsg, 'error');
      }
    },

    updateQuantity: async (productId, variant, qty) => {
      const prevItems = get().items;
      const targetItem = prevItems.find(
        i => (i.product_id === productId || i.product?.id === productId) &&
          JSON.stringify(i.variant) === JSON.stringify(variant)
      );

      if (!targetItem) return;

      const availableStock = targetItem?.product?.stock !== undefined && targetItem?.product?.stock !== null
        ? parseInt(targetItem.product.stock, 10)
        : 999;

      let newQty = parseInt(qty, 10);
      if (isNaN(newQty) || newQty <= 0) {
        return get().removeFromCart(productId, variant);
      }

      if (availableStock > 0 && newQty > availableStock) {
        useToastStore.getState().showToast(`Maximum available stock (${availableStock}) reached.`, 'warning');
        newQty = availableStock;
      }

      // Optimistic instant update so subtotal, totals, and stepper update in 0ms
      const updatedItems = prevItems.map(i => {
        const isMatch = (i.product_id === productId || i.product?.id === productId) &&
          JSON.stringify(i.variant) === JSON.stringify(variant);
        return isMatch ? { ...i, qty: newQty } : i;
      });
      set({ items: updatedItems });

      try {
        await api.put('/general/cart', { product_id: productId, variant, qty: newQty });
        if (get().deliveryPincode?.length === 6) {
          get().calculateRates(get().deliveryPincode);
        }
      } catch (err) {
        console.error("Update quantity failed:", err);
        set({ items: prevItems });
        const errMsg = err.response?.data?.error || 'Failed to update quantity';
        useToastStore.getState().showToast(errMsg, 'error');
      }
    },

    clearCart: async () => {
      try {
        await api.delete('/general/cart/clear');
        set({ items: [], deliveryCharge: 0, platformFee: 0, vendorShipments: [], shippingError: '' });
      } catch (err) {
        console.error("Clear cart failed:", err);
      }
    },

    // Clear local state when user logs out
    clearLocalCart: () => {
      set({ items: [], deliveryCharge: 0, platformFee: 0, vendorShipments: [], shippingError: '' });
    },

    // Dynamic shipping and 4% platform fee calculation via Shiprocket rate engine
    calculateRates: async (deliveryPincode, isCod = false, discountAmount = 0) => {
      const items = get().items;
      if (!items || items.length === 0) {
        set({ deliveryCharge: 0, platformFee: 0, vendorShipments: [], shippingError: '' });
        return null;
      }

      const rawPin = deliveryPincode || get().deliveryPincode || '';
      const cleanPin = String(rawPin).replace(/\D/g, '').slice(0, 6);

      if (cleanPin.length !== 6) {
        set({ deliveryCharge: 0, platformFee: 0, vendorShipments: [], shippingError: 'Please enter a valid 6-digit delivery pincode' });
        return { success: false, error: 'Please enter a 6-digit pincode' };
      }

      set({ isCalculatingShipping: true, shippingError: '' });

      try {
        const res = await api.post('/shipping/calculate-rates', {
          items,
          deliveryPincode: cleanPin,
          isCod,
          discountAmount
        });

        if (res.data?.success) {
          localStorage.setItem('cart_delivery_pincode', cleanPin);
          set({
            deliveryPincode: cleanPin,
            deliveryCharge: res.data.totalShippingCharge,
            platformFee: res.data.platformFee,
            platformFeePercent: res.data.platformFeePercent || 4.0,
            vendorShipments: res.data.vendorShipments || [],
            shippingCalculatedForPincode: cleanPin,
            shippingError: '',
            isCalculatingShipping: false
          });
          return res.data;
        } else {
          const err = res.data?.error || 'Shipping calculation failed';
          set({ deliveryCharge: 0, platformFee: 0, vendorShipments: [], shippingError: err });
          return { success: false, error: err };
        }
      } catch (err) {
        const errMsg = err.response?.data?.error || err.message || 'Failed to calculate courier rates';
        set({ deliveryCharge: 0, platformFee: 0, vendorShipments: [], shippingError: errMsg });
        return { success: false, error: errMsg };
      } finally {
        set({ isCalculatingShipping: false });
      }
    },

    getSubtotal: () => {
      return get().items.reduce((sum, item) => {
        const itemPrice = item.variant?.price || item.product?.price || item.price || 0;
        return sum + (Number(itemPrice) * item.qty);
      }, 0);
    },

    getTotal: () => {
      const subtotal = get().getSubtotal();
      const delivery = get().deliveryCharge;
      const fee = get().platformFee;
      return subtotal + delivery + fee;
    },

    getDiscount: () => {
      return get().items.reduce((sum, item) => {
        const itemPrice = item.variant?.price || item.product?.price || item.price || 0;
        const itemMrp = item.variant?.mrp || item.product?.mrp || itemPrice;
        return sum + ((Number(itemMrp) - Number(itemPrice)) * item.qty);
      }, 0);
    }
  })
);
