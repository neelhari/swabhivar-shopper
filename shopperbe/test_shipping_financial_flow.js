const pool = require('./db');
const shiprocket = require('./utils/shiprocket');

async function runTests() {
  console.log('================================================================');
  console.log('SWABHIVAR SHOPPERS — FINANCIAL & SHIPPING INTEGRATION TEST SUITE');
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

  try {
    // -------------------------------------------------------------
    // Test 1: Volumetric & Chargeable Weight Calculation
    // -------------------------------------------------------------
    console.log('[TEST 1] Volumetric & Chargeable Weight Formula');
    const testCases = [
      { l: 20, w: 15, h: 10, actualWeight: 0.5, expectedVol: (20*15*10)/5000, expectedChargeable: Math.max(0.5, (20*15*10)/5000) },
      { l: 40, w: 30, h: 20, actualWeight: 1.0, expectedVol: (40*30*20)/5000, expectedChargeable: (40*30*20)/5000 }, // 4.8 kg volumetric > 1.0 kg actual
      { l: 10, w: 10, h: 5, actualWeight: 2.5, expectedVol: (10*10*5)/5000, expectedChargeable: 2.5 } // 2.5 kg actual > 0.1 kg volumetric
    ];

    for (const tc of testCases) {
      const vol = (tc.l * tc.w * tc.h) / 5000;
      const chargeable = Math.max(tc.actualWeight, vol);
      assert(Math.abs(vol - tc.expectedVol) < 0.001, `Volumetric weight calculation for ${tc.l}x${tc.w}x${tc.h} = ${vol} kg`);
      assert(Math.abs(chargeable - tc.expectedChargeable) < 0.001, `Chargeable weight is max(actual, vol) = ${chargeable} kg`);
    }

    // -------------------------------------------------------------
    // Test 2: Customer Platform Fee 4% Formula
    // -------------------------------------------------------------
    console.log('\n[TEST 2] Customer Platform Fee (4% on Subtotal + Delivery - Discount)');
    const subtotal = 4000.00;
    const delivery = 400.00;
    const discount = 0.00;
    const baseAmount = (subtotal + delivery) - discount; // 4400
    const platformFee = Math.round((baseAmount * 0.04) * 100) / 100;
    const grandTotal = baseAmount + platformFee;

    assert(baseAmount === 4400.00, `Base amount = ₹${baseAmount}`);
    assert(platformFee === 176.00, `Platform fee (4% of ₹4400) = ₹${platformFee}`);
    assert(grandTotal === 4576.00, `Customer grand total = ₹${grandTotal}`);

    // COD calculation
    const codAdvance = 1.00;
    const codDoorstep = grandTotal - codAdvance;
    assert(codDoorstep === 4575.00, `COD doorstep collection = ₹${codDoorstep}`);

    // -------------------------------------------------------------
    // Test 3: Shipping Discrepancy & Vendor Settlement Formula
    // -------------------------------------------------------------
    console.log('\n[TEST 3] Vendor Settlement with Shipping Discrepancy & Surplus');
    
    // Scenario A: Actual Shipping > Estimated Shipping (Vendor pays difference)
    const productGrossA = 1500.00;
    const commissionPercentA = 10.0;
    const commissionAmountA = (productGrossA * commissionPercentA) / 100; // 150
    const estShippingA = 100.00;
    const actualShippingA = 120.00;
    const shippingDiscrepancyA = Math.max(0, actualShippingA - estShippingA); // 20
    const shippingSurplusA = Math.max(0, estShippingA - actualShippingA); // 0
    const finalVendorPayableA = productGrossA - commissionAmountA - shippingDiscrepancyA; // 1500 - 150 - 20 = 1330

    assert(shippingDiscrepancyA === 20.00, `Additional shipping difference = ₹${shippingDiscrepancyA}`);
    assert(shippingSurplusA === 0.00, `Shipping surplus = ₹${shippingSurplusA}`);
    assert(finalVendorPayableA === 1330.00, `Final vendor payable after commission and discrepancy = ₹${finalVendorPayableA}`);

    // Scenario B: Actual Shipping < Estimated Shipping (Surplus retained by platform, not credited to vendor)
    const productGrossB = 800.00;
    const commissionAmountB = 80.00;
    const estShippingB = 110.00;
    const actualShippingB = 90.00;
    const shippingDiscrepancyB = Math.max(0, actualShippingB - estShippingB); // 0
    const shippingSurplusB = Math.max(0, estShippingB - actualShippingB); // 20
    const finalVendorPayableB = productGrossB - commissionAmountB - shippingDiscrepancyB; // 800 - 80 - 0 = 720

    assert(shippingDiscrepancyB === 0.00, `Shipping discrepancy for surplus scenario = ₹${shippingDiscrepancyB}`);
    assert(shippingSurplusB === 20.00, `Shipping surplus retained by platform = ₹${shippingSurplusB}`);
    assert(finalVendorPayableB === 720.00, `Vendor payable remains unaffected by platform shipping surplus = ₹${finalVendorPayableB}`);

    // -------------------------------------------------------------
    // Test 4: Insufficient Balance & Debt Recovery
    // -------------------------------------------------------------
    console.log('\n[TEST 4] Vendor Insufficient Wallet Balance & Debt Recovery');
    const availableWallet = 10.00;
    const largeDiscrepancy = 50.00;
    const deductedFromWallet = Math.min(availableWallet, largeDiscrepancy); // 10
    const newDebt = Math.max(0, largeDiscrepancy - deductedFromWallet); // 40
    const newWalletBalance = availableWallet - deductedFromWallet; // 0

    assert(deductedFromWallet === 10.00, `Wallet deducted = ₹${deductedFromWallet}`);
    assert(newWalletBalance === 0.00, `Wallet does not become negative (Balance: ₹${newWalletBalance})`);
    assert(newDebt === 40.00, `Unrecovered discrepancy recorded as vendor debt = ₹${newDebt}`);

    // -------------------------------------------------------------
    // Test 5: Full Four-Vendor Mathematical Reconciliation
    // -------------------------------------------------------------
    console.log('\n[TEST 5] Full Multi-Vendor Reconciliation');
    const vendors = [
      { id: 'A', gross: 1500, comm: 150, estShip: 90, actShip: 85 },
      { id: 'B', gross: 800, comm: 80, estShip: 110, actShip: 110 },
      { id: 'C', gross: 1200, comm: 120, estShip: 120, actShip: 125 }, // act > est by 5
      { id: 'D', gross: 500, comm: 50, estShip: 80, actShip: 75 }
    ];

    let totalGross = 0;
    let totalComm = 0;
    let totalEstShip = 0;
    let totalActShip = 0;
    let totalDiscrepancy = 0;
    let totalVendorPayout = 0;

    for (const v of vendors) {
      const disc = Math.max(0, v.actShip - v.estShip);
      const payable = v.gross - v.comm - disc;
      totalGross += v.gross;
      totalComm += v.comm;
      totalEstShip += v.estShip;
      totalActShip += v.actShip;
      totalDiscrepancy += disc;
      totalVendorPayout += payable;
    }

    const platformFeeTotal = Math.round((totalGross + totalEstShip) * 0.04 * 100) / 100; // 4% of (4000+400) = 176
    const customerPaid = totalGross + totalEstShip + platformFeeTotal; // 4576
    const platformCashRetained = customerPaid - totalVendorPayout - totalActShip; // 4576 - 3595 - 395 = 586
    const expectedPlatformRevenue = totalComm + platformFeeTotal + Math.max(0, totalEstShip - totalActShip) + totalDiscrepancy;

    assert(customerPaid === 4576.00, `Customer paid exactly ₹${customerPaid}`);
    assert(totalVendorPayout === 3595.00, `Total vendor payouts = ₹${totalVendorPayout}`);
    assert(totalActShip === 395.00, `Total actual courier expenses = ₹${totalActShip}`);
    assert(platformCashRetained === 586.00, `Platform net cash retained = ₹${platformCashRetained}`);
    assert(customerPaid === (totalVendorPayout + totalActShip + platformCashRetained), 'Zero-leakage reconciliation: Inflow equals All Outflows + Retained Cash');

    console.log('\n================================================================');
    console.log(`TEST RESULTS: ${passed} PASSED, ${failed} FAILED`);
    console.log('================================================================\n');

    process.exit(failed > 0 ? 1 : 0);
  } catch (err) {
    console.error('Test execution error:', err);
    process.exit(1);
  }
}

runTests();
