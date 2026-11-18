/**
 * Authoritative Backend Pricing Service for Swabhivar Shoppers.
 * Acts as the Single Source of Truth for all product and variant financial calculations:
 * - Regular/Selling Price
 * - MRP (Maximum Retail Price)
 * - Discount Amount (MRP - Price)
 * - Discount Percentage (Exact and Rounded)
 * - Cart & Order Financial Reconciliation
 */

/**
 * Format and enrich a single product row or object with authoritative financial fields.
 */
function formatProductPricing(product) {
  if (!product) return null;

  const price = parseFloat(product.price) || 0;
  
  // MRP must never be less than selling price. If 0 or missing, default to selling price.
  let mrp = parseFloat(product.mrp);
  if (isNaN(mrp) || mrp <= 0) {
    mrp = price;
  } else if (mrp < price) {
    // If MRP is erroneously lower than selling price, clamp MRP to price
    mrp = price;
  }

  // Calculate discount amount and percentage
  const discountAmount = mrp > price ? Math.round((mrp - price) * 100) / 100 : 0;
  const discountPercentExact = mrp > price ? Math.round(((mrp - price) / mrp) * 10000) / 100 : 0;
  const discountPercent = Math.round(discountPercentExact);

  // Process variants/sizes if present
  let sizes = product.sizes;
  if (typeof sizes === 'string') {
    try {
      sizes = JSON.parse(sizes);
    } catch {
      sizes = [];
    }
  }

  if (Array.isArray(sizes) && sizes.length > 0) {
    sizes = sizes.map(item => {
      // Handle hierarchical { color, images, sizes: [...] } vs flat { size, price, mrp }
      if (Array.isArray(item.sizes)) {
        const enrichedSubSizes = item.sizes.map(s => {
          const sPrice = parseFloat(s.price) || price;
          let sMrp = parseFloat(s.mrp);
          if (isNaN(sMrp) || sMrp <= 0) {
            sMrp = mrp >= sPrice ? mrp : sPrice;
          } else if (sMrp < sPrice) {
            sMrp = sPrice;
          }
          const sDiscountAmount = sMrp > sPrice ? Math.round((sMrp - sPrice) * 100) / 100 : 0;
          const sDiscountPercentExact = sMrp > sPrice ? Math.round(((sMrp - sPrice) / sMrp) * 10000) / 100 : 0;
          const sDiscountPercent = Math.round(sDiscountPercentExact);
          return {
            ...s,
            price: sPrice,
            mrp: sMrp,
            discount_amount: sDiscountAmount,
            discount_percent_exact: sDiscountPercentExact,
            discount_percent: sDiscountPercent
          };
        });
        return {
          ...item,
          sizes: enrichedSubSizes
        };
      } else {
        const vPrice = parseFloat(item.price) || price;
        let vMrp = parseFloat(item.mrp);
        if (isNaN(vMrp) || vMrp <= 0) {
          vMrp = mrp >= vPrice ? mrp : vPrice;
        } else if (vMrp < vPrice) {
          vMrp = vPrice;
        }
        const vDiscountAmount = vMrp > vPrice ? Math.round((vMrp - vPrice) * 100) / 100 : 0;
        const vDiscountPercentExact = vMrp > vPrice ? Math.round(((vMrp - vPrice) / vMrp) * 10000) / 100 : 0;
        const vDiscountPercent = Math.round(vDiscountPercentExact);
        return {
          ...item,
          price: vPrice,
          mrp: vMrp,
          discount_amount: vDiscountAmount,
          discount_percent_exact: vDiscountPercentExact,
          discount_percent: vDiscountPercent
        };
      }
    });
  }

  return {
    ...product,
    price,
    mrp,
    discount_amount: discountAmount,
    discount_percent_exact: discountPercentExact,
    discount_percent: discountPercent,
    sizes
  };
}

/**
 * Format a list of products
 */
function formatProductsList(products) {
  if (!Array.isArray(products)) return [];
  return products.map(formatProductPricing);
}

/**
 * Calculates authoritative cart and checkout pricing totals.
 */
function calculateOrderTotals({
  items = [],
  deliveryCharge = 0,
  coupon = null,
  platformFeePercent = 4.0,
  isCod = false
}) {
  let productSubtotal = 0;
  let mrpSubtotal = 0;

  for (const item of items) {
    const qty = Math.max(1, parseInt(item.qty || item.quantity || 1, 10));
    const price = parseFloat(item.variant?.price || item.product?.price || item.price || 0);
    const mrp = parseFloat(item.variant?.mrp || item.product?.mrp || item.mrp || price);

    productSubtotal += (price * qty);
    mrpSubtotal += (mrp * qty);
  }

  productSubtotal = Math.round(productSubtotal * 100) / 100;
  mrpSubtotal = Math.round(mrpSubtotal * 100) / 100;
  const productSavings = Math.max(0, Math.round((mrpSubtotal - productSubtotal) * 100) / 100);

  // Coupon calculation
  let couponDiscount = 0;
  if (coupon) {
    const val = parseFloat(coupon.value || coupon.discount_value || coupon.discount_percent || 0);
    const type = coupon.type || coupon.discount_type || 'percentage';

    let applicableSubtotal = productSubtotal;
    if (coupon.source === 'vendor' && coupon.vendor_id) {
      applicableSubtotal = items.reduce((sum, item) => {
        const vid = item.product?.vendor_id || item.vendor_id;
        if (vid === coupon.vendor_id) {
          const p = parseFloat(item.variant?.price || item.product?.price || item.price || 0);
          const q = Math.max(1, parseInt(item.qty || item.quantity || 1, 10));
          return sum + (p * q);
        }
        return sum;
      }, 0);
    }

    if (applicableSubtotal > 0 && val > 0) {
      if (type === 'percentage' || type === 'percent') {
        couponDiscount = Math.round((applicableSubtotal * val) / 100);
      } else {
        couponDiscount = Math.min(val, applicableSubtotal);
      }
    }
  }

  const shipping = Math.max(0, parseFloat(deliveryCharge) || 0);
  const baseBeforeFee = Math.max(0, (productSubtotal + shipping) - couponDiscount);
  const platformFee = Math.round((baseBeforeFee * (platformFeePercent / 100)) * 100) / 100;
  const grandTotal = Math.round((baseBeforeFee + platformFee) * 100) / 100;

  const codAdvance = isCod ? 1.00 : 0.00;
  const codCollectible = isCod ? Math.max(0, Math.round((grandTotal - 1.00) * 100) / 100) : 0.00;

  return {
    productSubtotal,
    mrpSubtotal,
    productSavings,
    couponDiscount,
    deliveryCharge: shipping,
    platformFeePercent,
    platformFee,
    grandTotal,
    isCod,
    codAdvance,
    codCollectible
  };
}

/**
 * Authoritatively calculates and verifies complete order financials directly from the PostgreSQL database.
 * Never trusts frontend prices, discounts, platform fees, or grand totals.
 *
 * @param {object} params
 * @param {Array} params.items - Array of cart/order items
 * @param {number|string} params.deliveryCharge - Verified courier shipping charge
 * @param {string} [params.couponCode] - Optional coupon code
 * @param {string} [params.paymentMethod='prepaid'] - 'cod' or 'prepaid'
 * @param {object} [params.client] - DB client/pool
 */
async function verifyAndCalculateOrder({
  items = [],
  deliveryCharge = 0,
  couponCode = null,
  paymentMethod = 'prepaid',
  client
}) {
  const db = client || require('../db');

  if (!items || !Array.isArray(items) || items.length === 0) {
    throw new Error('No items provided for calculation');
  }

  // 1. Fetch current product information from DB to prevent client-side price tampering
  const productIds = items.map(i => i.product_id || i.product?.id || i.id).filter(Boolean);
  const productsRes = await db.query(
    `SELECT id, name, price, mrp, stock, vendor_id, custom_attributes 
     FROM products WHERE id = ANY($1::int[])`,
    [productIds]
  );

  const productMap = {};
  for (const prod of productsRes.rows) {
    productMap[prod.id] = prod;
  }

  // 2. Fetch platform fee percent from settings (default 4%)
  let platformFeePercent = 4.0;
  try {
    const feeRes = await db.query("SELECT value FROM settings WHERE key = 'platform_fee_percent'");
    if (feeRes.rows[0]?.value && !isNaN(Number(feeRes.rows[0].value))) {
      platformFeePercent = parseFloat(Number(feeRes.rows[0].value).toFixed(2));
    }
  } catch (e) {
    platformFeePercent = 4.0;
  }

  // 3. Calculate verified product subtotal and verified items
  let verifiedProductSubtotal = 0;
  let verifiedMrpSubtotal = 0;
  const verifiedItems = [];

  for (const item of items) {
    const pid = item.product_id || item.product?.id || item.id;
    const dbProd = productMap[pid];
    if (!dbProd) {
      throw new Error(`Product ID ${pid} was not found in catalog.`);
    }

    const qty = Math.max(1, parseInt(item.qty || item.quantity || 1, 10));
    
    // Determine authoritative unit price:
    let unitPrice = parseFloat(dbProd.price) || 0;
    if (item.variant && item.variant.price && !isNaN(parseFloat(item.variant.price))) {
      unitPrice = parseFloat(item.variant.price);
    }
    
    let unitMrp = parseFloat(dbProd.mrp) || unitPrice;
    if (item.variant && item.variant.mrp && !isNaN(parseFloat(item.variant.mrp))) {
      unitMrp = parseFloat(item.variant.mrp);
    }
    if (unitMrp < unitPrice) unitMrp = unitPrice;

    verifiedProductSubtotal += (unitPrice * qty);
    verifiedMrpSubtotal += (unitMrp * qty);

    verifiedItems.push({
      ...item,
      product_id: dbProd.id,
      vendor_id: dbProd.vendor_id,
      name: dbProd.name,
      price: unitPrice,
      mrp: unitMrp,
      qty,
      product: {
        id: dbProd.id,
        name: dbProd.name,
        vendor_id: dbProd.vendor_id,
        price: unitPrice,
        mrp: unitMrp
      }
    });
  }

  verifiedProductSubtotal = Math.round(verifiedProductSubtotal * 100) / 100;
  verifiedMrpSubtotal = Math.round(verifiedMrpSubtotal * 100) / 100;
  const productSavings = Math.max(0, Math.round((verifiedMrpSubtotal - verifiedProductSubtotal) * 100) / 100);

  // 4. Validate Coupon if provided
  let verifiedDiscountAmount = 0;
  let verifiedCoupon = null;

  if (couponCode && typeof couponCode === 'string' && couponCode.trim()) {
    const cleanCode = couponCode.trim();
    const adminCouponRes = await db.query(
      `SELECT *, 'admin' as source FROM coupons WHERE UPPER(code) = UPPER($1) AND is_active = true`,
      [cleanCode]
    );
    const vendorCouponRes = await db.query(
      `SELECT *, 'vendor' as source FROM offers WHERE UPPER(code) = UPPER($1) AND is_active = true AND offer_type = 'coupon'`,
      [cleanCode]
    );

    const cRow = adminCouponRes.rows[0] || vendorCouponRes.rows[0];
    if (cRow) {
      const isExpired = cRow.expires_at && new Date(cRow.expires_at) < new Date();
      if (!isExpired) {
        let applicableSubtotal = 0;
        let applicableQty = 0;

        if (cRow.source === 'vendor' && cRow.vendor_id) {
          for (const vi of verifiedItems) {
            if (vi.vendor_id === cRow.vendor_id) {
              applicableSubtotal += (vi.price * vi.qty);
              applicableQty += vi.qty;
            }
          }
        } else {
          applicableSubtotal = verifiedProductSubtotal;
          applicableQty = verifiedItems.reduce((s, i) => s + i.qty, 0);
        }

        const minVal = parseFloat(cRow.restriction_value || cRow.min_value || cRow.min_order_value || 0);
        const minType = cRow.restriction_type || cRow.min_type || 'min_amount';
        const passesMin = (minType === 'min_qty' || minType === 'qty') ? (applicableQty >= minVal) : (applicableSubtotal >= minVal);

        if (passesMin && applicableSubtotal > 0) {
          const discountType = cRow.discount_type || 'percent';
          const val = parseFloat(cRow.discount_value || cRow.discount_percent || 0);
          if (discountType === 'percentage' || discountType === 'percent') {
            verifiedDiscountAmount = Math.round((applicableSubtotal * val) / 100);
          } else {
            verifiedDiscountAmount = Math.min(val, applicableSubtotal);
          }
          verifiedCoupon = { code: cRow.code, discountAmount: verifiedDiscountAmount };
        }
      }
    }
  }

  // 5. Calculate shipping and platform fee
  const shipping = Math.max(0, parseFloat(deliveryCharge) || 0);
  const baseBeforeFee = Math.max(0, (verifiedProductSubtotal + shipping) - verifiedDiscountAmount);
  const platformFee = Math.round((baseBeforeFee * (platformFeePercent / 100)) * 100) / 100;
  const grandTotal = Math.round((baseBeforeFee + platformFee) * 100) / 100;

  // 6. COD advance is ₹1, remaining is collectible at doorstep
  const isCod = String(paymentMethod).toLowerCase() === 'cod';
  const advanceAmount = isCod ? 1.00 : grandTotal;
  const collectibleAmount = isCod ? Math.max(0, Math.round((grandTotal - 1.00) * 100) / 100) : 0.00;

  return {
    verifiedItems,
    productSubtotal: verifiedProductSubtotal,
    mrpSubtotal: verifiedMrpSubtotal,
    productSavings,
    couponCode: verifiedCoupon ? verifiedCoupon.code : null,
    discountAmount: verifiedDiscountAmount,
    deliveryCharge: shipping,
    platformFeePercent,
    platformFee,
    grandTotal,
    isCod,
    advanceAmount,
    collectibleAmount
  };
}

module.exports = {
  formatProductPricing,
  formatProductsList,
  calculateOrderTotals,
  verifyAndCalculateOrder
};
