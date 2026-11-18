const express = require('express');
const router = express.Router();
const pool = require('../db');
const shiprocket = require('../utils/shiprocket');

/**
 * Calculates dynamic multi-vendor shipping rates and the 4% platform fee.
 * POST /api/shipping/calculate-rates
 * Body: { items: Array, deliveryPincode: string, isCod: boolean, discountAmount: number }
 */
router.post('/calculate-rates', async (req, res) => {
  try {
    const { items, deliveryPincode, isCod = false, discountAmount = 0 } = req.body;

    if (!items || !Array.isArray(items) || items.length === 0) {
      return res.status(400).json({ error: 'No items provided for shipping calculation.' });
    }

    const cleanPincode = String(deliveryPincode || '').replace(/\D/g, '').slice(0, 6);
    const isValidPincode = cleanPincode.length === 6;

    // 1. Fetch current product information from DB to prevent client-side price/weight tampering
    const productIds = items.map(i => i.product_id || i.product?.id || i.id).filter(Boolean);
    const productsRes = await pool.query(
      `SELECT id, name, price, weight, length, width, height, vendor_id, custom_attributes 
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
      const feeRes = await pool.query("SELECT value FROM settings WHERE key = 'platform_fee_percent'");
      if (feeRes.rows[0]?.value && !isNaN(Number(feeRes.rows[0].value))) {
        platformFeePercent = parseFloat(Number(feeRes.rows[0].value).toFixed(2));
      }
    } catch (e) {
      platformFeePercent = 4.0;
    }

    // 3. Group verified items by vendor
    const vendorGroups = {};
    let productSubtotal = 0;

    for (const item of items) {
      const pid = item.product_id || item.product?.id || item.id;
      const dbProd = productMap[pid];
      const qty = Math.max(1, parseInt(item.qty || item.quantity || 1, 10));
      const price = dbProd ? parseFloat(dbProd.price) : parseFloat(item.price || 0);

      productSubtotal += (price * qty);

      const vid = dbProd?.vendor_id || item.vendor_id || 'platform';
      if (!vendorGroups[vid]) {
        vendorGroups[vid] = {
          vendorId: vid === 'platform' ? null : vid,
          items: [],
          totalActualWeight: 0,
          maxLength: 15,
          maxWidth: 12,
          totalHeight: 0
        };
      }

      // Read dimensional attributes
      const attrs = dbProd?.custom_attributes || {};
      const rawWeight = dbProd?.weight || attrs.shipping_weight || attrs.weight || item.weight;
      const rawLen = dbProd?.length || attrs.length || item.length;
      const rawWid = dbProd?.width || attrs.width || item.width;
      const rawHgt = dbProd?.height || attrs.height || item.height;

      const itemWeight = parseFloat(rawWeight);
      const itemLen = parseFloat(rawLen);
      const itemWid = parseFloat(rawWid);
      const itemHgt = parseFloat(rawHgt);

      if (isNaN(itemWeight) || itemWeight <= 0 || isNaN(itemLen) || itemLen <= 0 || isNaN(itemWid) || itemWid <= 0 || isNaN(itemHgt) || itemHgt <= 0) {
        return res.status(400).json({
          success: false,
          error: `Product "${dbProd?.name || item.name || 'Item'}" is missing required parcel dimensions (Length, Width, Height) or weight for shipping calculation.`
        });
      }

      vendorGroups[vid].items.push({
        id: pid,
        name: dbProd?.name || item.name || 'Product',
        qty,
        price,
        itemWeight,
        itemLen,
        itemWid,
        itemHgt
      });

      vendorGroups[vid].totalActualWeight += (itemWeight * qty);
      vendorGroups[vid].maxLength = Math.max(vendorGroups[vid].maxLength, itemLen);
      vendorGroups[vid].maxWidth = Math.max(vendorGroups[vid].maxWidth, itemWid);
      vendorGroups[vid].totalHeight += (itemHgt * qty);
    }

    productSubtotal = Math.round(productSubtotal * 100) / 100;

    // 4. Calculate shipping per vendor shipment
    const vendorShipments = [];
    let totalShippingCharge = 0;

    for (const [vid, group] of Object.entries(vendorGroups)) {
      let pickupPincode = '500081'; // Default Admin/Hub Pincode (Hyderabad)
      let vendorStoreName = 'Swabhivar Warehouse';

      if (group.vendorId) {
        const vRes = await pool.query(
          'SELECT store_name, pickup_pincode, pickup_city, pickup_state FROM vendors WHERE id = $1',
          [group.vendorId]
        );
        if (vRes.rows[0]) {
          vendorStoreName = vRes.rows[0].store_name || `Vendor #${group.vendorId}`;
          if (vRes.rows[0].pickup_pincode) {
            pickupPincode = String(vRes.rows[0].pickup_pincode).trim();
          }
        }
      }

      // Volumetric weight: (L * W * H) / 5000
      const boxLength = Math.max(10, group.maxLength);
      const boxWidth = Math.max(10, group.maxWidth);
      const boxHeight = Math.max(5, group.totalHeight);
      const volumetricWeight = Math.round(((boxLength * boxWidth * boxHeight) / 5000) * 1000) / 1000;
      const actualWeight = Math.round(group.totalActualWeight * 1000) / 1000;
      const chargeableWeight = Math.max(0.5, actualWeight, volumetricWeight);

      let shipmentRate = 80.00; // standard fallback
      let courierName = 'Standard Express';
      let courierId = null;
      let etd = '3-5 business days';

      if (!isValidPincode) {
        return res.status(400).json({
          success: false,
          error: 'Please enter a valid 6-digit delivery pincode to calculate shipping.'
        });
      }

      try {
        const rateResult = await shiprocket.calculateServiceability({
          pickupPostcode: pickupPincode,
          deliveryPostcode: cleanPincode,
          weight: chargeableWeight,
          length: boxLength,
          breadth: boxWidth,
          height: boxHeight,
          cod: isCod ? 1 : 0
        });

        if (!rateResult || !rateResult.success || !rateResult.rate) {
          return res.status(400).json({
            success: false,
            error: rateResult?.error || `Courier service unavailable for delivery to pincode ${cleanPincode} from ${vendorStoreName}. Please check your pincode or retry.`
          });
        }

        shipmentRate = Math.round(parseFloat(rateResult.rate) * 100) / 100;
        courierName = rateResult.courier_name || courierName;
        courierId = rateResult.courier_id || null;
        etd = rateResult.etd || etd;
      } catch (apiErr) {
        return res.status(502).json({
          success: false,
          error: `Failed to calculate courier rate for ${vendorStoreName}: ${apiErr.message}. Please retry.`
        });
      }

      totalShippingCharge += shipmentRate;

      vendorShipments.push({
        vendorId: group.vendorId,
        vendorName: vendorStoreName,
        pickupPincode,
        itemsCount: group.items.length,
        actualWeight,
        volumetricWeight,
        chargeableWeight,
        parcelLength: boxLength,
        parcelWidth: boxWidth,
        parcelHeight: boxHeight,
        shippingCharge: shipmentRate,
        courierName,
        courierId,
        etd
      });
    }

    totalShippingCharge = Math.round(totalShippingCharge * 100) / 100;
    const discount = Math.max(0, parseFloat(discountAmount) || 0);

    // 5. Customer Platform Fee calculation:
    // Base = Product Subtotal + Delivery Charges - Discounts
    const baseAmount = Math.max(0, (productSubtotal + totalShippingCharge) - discount);
    const platformFee = Math.round((baseAmount * (platformFeePercent / 100)) * 100) / 100;
    const grandTotal = Math.round((baseAmount + platformFee) * 100) / 100;

    // COD advance is ₹1, remaining is collectible at doorstep
    const codAdvanceAmount = isCod ? 1.00 : 0.00;
    const codCollectibleAmount = isCod ? Math.max(0, grandTotal - 1.00) : 0.00;

    res.json({
      success: true,
      isValidPincode,
      deliveryPincode: cleanPincode,
      vendorShipments,
      shipmentCount: vendorShipments.length,
      productSubtotal,
      totalShippingCharge,
      platformFeePercent,
      platformFee,
      discountAmount: discount,
      grandTotal,
      isCod,
      codAdvanceAmount,
      codCollectibleAmount
    });
  } catch (error) {
    console.error('Calculate shipping rates error:', error);
    res.status(500).json({ error: 'Failed to calculate shipping and platform fees' });
  }
});

module.exports = router;
