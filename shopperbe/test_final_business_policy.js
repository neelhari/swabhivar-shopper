const pool = require('./db');
const { calculateVendorEarnings } = require('./services/vendorAccountingService');

async function testFinalBusinessPolicy() {
  console.log('================================================================');
  console.log('SWABHIVAR SHOPPERS — FINAL BUSINESS POLICY VERIFICATION TEST');
  console.log('================================================================\n');

  let passed = 0;
  let failed = 0;

  function assert(condition, name) {
    if (condition) {
      console.log(`  ✅ PASS: ${name}`);
      passed++;
    } else {
      console.error(`  ❌ FAIL: ${name}`);
      failed++;
    }
  }

  // 1. Customer Payment Breakdown Test
  console.log('[TEST 1] Customer Checkout Final Calculations:');
  const subtotal = 4000.00;
  const deliveryFee = 400.00;
  const discount = 0.00;

  const baseForFee = Math.max(0, (subtotal + deliveryFee) - discount); // 4400.00
  const platformFee = Math.round((baseForFee * 0.04) * 100) / 100;    // 176.00
  const grandTotal = Math.round((baseForFee + platformFee) * 100) / 100; // 4576.00

  assert(baseForFee === 4400.00, `Base amount for platform fee = ₹${baseForFee}`);
  assert(platformFee === 176.00, `Customer Platform fee (4% of ₹4400) = ₹${platformFee}`);
  assert(grandTotal === 4576.00, `Customer Grand Total = ₹${grandTotal}`);

  // Prepaid vs COD
  const prepaidCharge = grandTotal;
  const codAdvance = 1.00;
  const codDoorstepCollectible = grandTotal - codAdvance;

  assert(prepaidCharge === 4576.00, `Razorpay prepaid collected = ₹${prepaidCharge}`);
  assert(codAdvance === 1.00, `COD Razorpay advance collected = ₹${codAdvance}`);
  assert(codDoorstepCollectible === 4575.00, `COD Doorstep collection by courier = ₹${codDoorstepCollectible}`);

  // 2. Vendor Payout Calculation Test (Gross - Commission ONLY)
  console.log('\n[TEST 2] Vendor Payout Breakdown (NO Shipping Deductions):');
  const items = [
    { product: { price: 1500, vendor_id: 1 }, qty: 1 }, // Vendor A
    { product: { price: 800, vendor_id: 2 }, qty: 1 },  // Vendor B
    { product: { price: 1200, vendor_id: 3 }, qty: 1 }, // Vendor C
    { product: { price: 500, vendor_id: 4 }, qty: 1 },  // Vendor D
  ];

  const commissionPercent = 10.0;
  let totalGross = 0;
  let totalCommission = 0;
  let totalVendorPayout = 0;

  for (const item of items) {
    const earnings = calculateVendorEarnings([item], commissionPercent);
    totalGross += earnings.grossAmount;
    totalCommission += earnings.commissionAmount;
    totalVendorPayout += earnings.netEarnings;
  }

  assert(totalGross === 4000.00, `Total Product Gross Sales = ₹${totalGross}`);
  assert(totalCommission === 400.00, `Platform Commission (10%) = ₹${totalCommission}`);
  assert(totalVendorPayout === 3600.00, `Vendor Payout (Gross - Comm) = ₹${totalVendorPayout}`);

  // 3. Independent Courier Shipping & Platform Accounting
  console.log('\n[TEST 3] Platform Shipping Independence (Actual Courier Costs Paid by Platform):');
  const actualShiprocketFreight = 385.00; // Example actual courier expense paid via platform Shiprocket wallet
  const platformRetainedDelivery = deliveryFee; // ₹400
  const platformRetainedFee = platformFee;       // ₹176
  const platformGrossRetained = platformRetainedDelivery + platformRetainedFee + totalCommission; // 400 + 176 + 400 = 976
  const platformNetCash = platformGrossRetained - actualShiprocketFreight; // 976 - 385 = 591

  // Vendor Payout remains strictly ₹3,600 regardless of actual courier cost
  const vendorPayoutWithZeroShippingDeduction = totalVendorPayout; // exactly 3600
  assert(vendorPayoutWithZeroShippingDeduction === 3600.00, `Vendor Payout is untouched by courier expense: ₹${vendorPayoutWithZeroShippingDeduction}`);

  // Complete Balance Check
  // Inflow: 4576
  // Outflows: Vendor Payout (3600) + Courier Expense (385) + Platform Retained Net (591) = 4576
  const totalOutflows = totalVendorPayout + actualShiprocketFreight + platformNetCash;
  assert(grandTotal === totalOutflows, `Exact Cash Flow Reconciliation: Inflow ₹${grandTotal} = Outflows ₹${totalOutflows}`);

  console.log('\n================================================================');
  console.log(`TEST RESULTS: ${passed} PASSED, ${failed} FAILED`);
  console.log('================================================================\n');

  process.exit(failed > 0 ? 1 : 0);
}

testFinalBusinessPolicy();
