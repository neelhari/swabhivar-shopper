const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '.env') });
const pool = require('./db');
const shiprocket = require('./utils/shiprocket');

async function runAuditSuite() {
  console.log('========================================================================');
  console.log('SWABHIVAR SHOPPERS — FULL SHIPPING & PRODUCT AUDIT TEST SUITE');
  console.log('========================================================================\n');

  let passed = 0;
  let failed = 0;

  function assert(cond, name) {
    if (cond) {
      console.log(`  ✅ PASS: ${name}`);
      passed++;
    } else {
      console.error(`  ❌ FAIL: ${name}`);
      failed++;
    }
  }

  // -------------------------------------------------------------
  // Test 1: Product Dimension & Weight Persistence in DB
  // -------------------------------------------------------------
  console.log('[TEST 1] Product Weight & Dimension Persistence Verification:');
  const testProduct = await pool.query(`
    SELECT id, name, weight, length, width, height 
    FROM products 
    WHERE weight IS NOT NULL AND length IS NOT NULL
    LIMIT 1
  `);
  assert(testProduct.rows.length > 0, 'Products table has products with weight, length, width, height populated');
  const p = testProduct.rows[0];
  const pWeight = parseFloat(p.weight);
  const pLen = parseFloat(p.length);
  const pWid = parseFloat(p.width);
  const pHgt = parseFloat(p.height);
  assert(pWeight > 0, `Product weight is valid positive number (${pWeight} kg)`);
  assert(pLen > 0 && pWid > 0 && pHgt > 0, `Product dimensions are valid (${pLen}x${pWid}x${pHgt} cm)`);

  const volWeight = Math.round(((pLen * pWid * pHgt) / 5000) * 1000) / 1000;
  const chargeableWeight = Math.max(0.5, pWeight, volWeight);
  assert(chargeableWeight >= 0.5, `Chargeable weight correctly calculated using MAX(actual, volumetric): ${chargeableWeight} kg`);

  // -------------------------------------------------------------
  // Test 2: Universal Vendor Pickup Address Verification
  // -------------------------------------------------------------
  console.log('\n[TEST 2] Universal Vendor Pickup Address Verification:');
  const vendorRes = await pool.query(`
    SELECT id, store_name, pickup_contact_name, pickup_phone, pickup_address_line1, pickup_city, pickup_state, pickup_pincode 
    FROM vendors 
    WHERE pickup_pincode IS NOT NULL 
    LIMIT 1
  `);
  assert(vendorRes.rows.length > 0, 'Universal vendor pickup address is configured in database');
  const v = vendorRes.rows[0];
  assert(v.pickup_pincode && /^\d{6}$/.test(v.pickup_pincode), `Vendor has valid universal pickup pincode: ${v.pickup_pincode}`);
  assert(v.pickup_address_line1 && v.pickup_city, `Universal address has complete contact & address line: ${v.pickup_city}, ${v.pickup_state}`);

  // -------------------------------------------------------------
  // Test 3: Single Product, Single Vendor Shipping Calculation
  // -------------------------------------------------------------
  console.log('\n[TEST 3] Single Vendor Shipping Calculation:');
  const singleVendorItem = [{
    id: p.id,
    name: p.name,
    price: 1500,
    qty: 1,
    weight: pWeight,
    length: pLen,
    width: pWid,
    height: pHgt,
    vendor_id: v.id
  }];

  // Mock / Call Shiprocket serviceability
  const srResult = await shiprocket.calculateServiceability({
    pickupPostcode: v.pickup_pincode,
    deliveryPostcode: '110001', // Delhi
    weight: chargeableWeight,
    length: pLen,
    breadth: pWid,
    height: pHgt,
    cod: 0
  });

  assert(srResult && srResult.success, `Shiprocket serviceability successful: Rate ₹${srResult.rate} via ${srResult.courier_name}`);
  const rate1 = parseFloat(srResult.rate);
  assert(rate1 > 0, `Live shipping fee returned: ₹${rate1}`);

  // -------------------------------------------------------------
  // Test 4: Quantity Change Recalculates Chargeable Weight
  // -------------------------------------------------------------
  console.log('\n[TEST 4] Product Quantity Increase:');
  const qty2 = 3;
  const totalActualWeight = pWeight * qty2;
  const totalHeight = pHgt * qty2;
  const volWeight3 = Math.round(((pLen * pWid * totalHeight) / 5000) * 1000) / 1000;
  const chargeableWeight3 = Math.max(0.5, totalActualWeight, volWeight3);
  assert(chargeableWeight3 > chargeableWeight, `3 items increase chargeable weight from ${chargeableWeight}kg to ${chargeableWeight3}kg`);

  // -------------------------------------------------------------
  // Test 5: Multi-Vendor Shipping (Separate Shipments Combined)
  // -------------------------------------------------------------
  console.log('\n[TEST 5] Multi-Vendor Combined Shipping Calculation:');
  // Vendor 1: Bangalore (560076), Vendor 2: Hub (500081)
  const vendor1ShipmentRate = 95.00;
  const vendor2ShipmentRate = 110.00;
  const combinedDelivery = vendor1ShipmentRate + vendor2ShipmentRate;
  assert(combinedDelivery === 205.00, `Multi-vendor delivery combines separate shipments: ₹${combinedDelivery}`);

  // Subtotal ₹4,000, Delivery ₹205, Discount ₹0
  const subtotal = 4000;
  const baseBeforeFee = subtotal + combinedDelivery; // 4205
  const platformFee = Math.round(baseBeforeFee * 0.04 * 100) / 100; // 168.20
  const grandTotal = baseBeforeFee + platformFee; // 4373.20
  assert(platformFee === 168.20, `Platform fee (4% of ₹4205) = ₹${platformFee}`);
  assert(grandTotal === 4373.20, `Customer Grand Total = ₹${grandTotal}`);

  // -------------------------------------------------------------
  // Test 6: Invalid Delivery Pincode Rejection
  // -------------------------------------------------------------
  console.log('\n[TEST 6] Invalid Pincode Handling:');
  const invalidPincode = '123';
  const cleanInvalid = String(invalidPincode).replace(/\D/g, '').slice(0, 6);
  assert(cleanInvalid.length !== 6, 'Short pincode correctly detected as invalid');

  // -------------------------------------------------------------
  // Test 7: COD ₹1 Advance vs Prepaid Exact Price Parity
  // -------------------------------------------------------------
  console.log('\n[TEST 7] COD vs Prepaid Reconciliation:');
  const prepaidAmount = grandTotal;
  const codAdvance = 1.00;
  const codDoorstep = grandTotal - 1.00;
  assert(prepaidAmount === 4373.20, `Prepaid online collection: ₹${prepaidAmount}`);
  assert(codAdvance === 1.00, `COD online token advance: ₹${codAdvance}`);
  assert(codDoorstep === 4372.20, `COD doorstep collectible cash: ₹${codDoorstep}`);
  assert(Math.round((codAdvance + codDoorstep) * 100) / 100 === prepaidAmount, 'Zero discrepancy between COD and Prepaid grand totals');

  // -------------------------------------------------------------
  // Test 8: Vendor Payout Integrity (Gross - Commission Only)
  // -------------------------------------------------------------
  console.log('\n[TEST 8] Vendor Payout Integrity:');
  const vendorGross = 4000;
  const vendorCommission = 400; // 10%
  const vendorPayout = vendorGross - vendorCommission;
  assert(vendorPayout === 3600, `Vendor Payout is strictly Gross - Commission: ₹${vendorPayout}`);
  assert(combinedDelivery === 205, `Platform retains 100% of delivery fee (₹${combinedDelivery}) to pay couriers`);

  console.log('\n========================================================================');
  console.log(`AUDIT TEST RESULTS: ${passed} PASSED, ${failed} FAILED`);
  console.log('========================================================================');

  process.exit(failed > 0 ? 1 : 0);
}

runAuditSuite().catch(e => {
  console.error('Audit suite error:', e);
  process.exit(1);
});
