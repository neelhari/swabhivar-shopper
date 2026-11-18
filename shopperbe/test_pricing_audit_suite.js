const fs = require('fs');
const path = require('path');
const { Pool } = require(path.join(__dirname, 'node_modules', 'pg'));
const { formatProductPricing, formatProductsList, calculateOrderTotals, verifyAndCalculateOrder } = require('./services/pricingService');

const envContent = fs.readFileSync(path.join(__dirname, '.env'), 'utf-8');
const match = envContent.match(/DATABASE_URL=([^\r\n]+)/);
const dbUrl = match ? match[1].trim() : null;

const pool = new Pool({
  connectionString: dbUrl,
  ssl: { rejectUnauthorized: false }
});

async function runTestSuite() {
  console.log('===============================================================');
  console.log('SWABHIVAR SHOPPERS – CENTRALIZED PRICING & FINANCIAL AUDIT SUITE');
  console.log('===============================================================\n');

  let passedTests = 0;
  let totalTests = 0;

  function assert(condition, name, details = '') {
    totalTests++;
    if (condition) {
      console.log(`✅ [PASS] ${name}`);
      passedTests++;
    } else {
      console.error(`❌ [FAIL] ${name} - ${details}`);
    }
  }

  try {
    // -------------------------------------------------------------------------
    // TEST 1: Exact Test from Prompt
    // MRP = ₹1,800, Selling price = ₹1,300
    // Expected: Discount amount = ₹500, Discount percentage = 27.78%, displayed as 28%
    // -------------------------------------------------------------------------
    console.log('--- TEST 1: Core Pricing Calculation (MRP ₹1,800 / Price ₹1,300) ---');
    const coreResult = formatProductPricing({
      id: 9999,
      name: 'Audit Test Product',
      price: 1300,
      mrp: 1800
    });

    assert(coreResult.price === 1300, 'Selling price is exactly ₹1,300', `Got ${coreResult.price}`);
    assert(coreResult.mrp === 1800, 'MRP is exactly ₹1,800 (not ₹1,820)', `Got ${coreResult.mrp}`);
    assert(coreResult.discount_amount === 500, 'Discount amount is ₹500', `Got ${coreResult.discount_amount}`);
    assert(coreResult.discount_percent_exact === 27.78, 'Discount percentage exact is 27.78%', `Got ${coreResult.discount_percent_exact}%`);
    assert(coreResult.discount_percent === 28, 'Discount percentage rounded for display is 28%', `Got ${coreResult.discount_percent}%`);

    // -------------------------------------------------------------------------
    // TEST 2: Database Persistence & Update Test
    // -------------------------------------------------------------------------
    console.log('\n--- TEST 2: Database Persistence & Update Test ---');
    const slug = `audit-test-pricing-${Date.now()}`;
    const insertRes = await pool.query(`
      INSERT INTO products (
        name, slug, description, category, price, mrp, stock, discount_percent, is_active
      ) VALUES (
        $1, $2, $3, $4, $5, $6, $7, $8, true
      ) RETURNING *
    `, [
      'Centralized Pricing Test Product',
      slug,
      'Test description',
      'Fashion',
      1300.00,
      1800.00,
      50,
      28
    ]);
    const dbProduct = insertRes.rows[0];
    const formattedDbProd = formatProductPricing(dbProduct);

    assert(parseFloat(dbProduct.mrp) === 1800, 'DB stored MRP is 1800', `Got ${dbProduct.mrp}`);
    assert(parseFloat(dbProduct.price) === 1300, 'DB stored price is 1300', `Got ${dbProduct.price}`);
    assert(parseInt(dbProduct.discount_percent) === 28, 'DB discount_percent is 28', `Got ${dbProduct.discount_percent}`);
    assert(formattedDbProd.discount_amount === 500, 'Enriched DB discount amount is 500', `Got ${formattedDbProd.discount_amount}`);

    // Update product price (Admin changes Price to ₹1,400 and MRP to ₹2,000)
    const updateRes = await pool.query(`
      UPDATE products 
      SET price = 1400.00, mrp = 2000.00, discount_percent = ROUND(((2000.00 - 1400.00) / 2000.00) * 100)
      WHERE id = $1 RETURNING *
    `, [dbProduct.id]);
    const updatedProd = updateRes.rows[0];
    const formattedUpdated = formatProductPricing(updatedProd);

    assert(parseFloat(updatedProd.mrp) === 2000, 'Admin update MRP is ₹2,000', `Got ${updatedProd.mrp}`);
    assert(parseFloat(updatedProd.price) === 1400, 'Admin update price is ₹1,400', `Got ${updatedProd.price}`);
    assert(formattedUpdated.discount_amount === 600, 'Updated discount amount is ₹600', `Got ${formattedUpdated.discount_amount}`);
    assert(formattedUpdated.discount_percent === 30, 'Updated discount percentage is 30%', `Got ${formattedUpdated.discount_percent}%`);

    // -------------------------------------------------------------------------
    // TEST 3: Backend Order Authority & Independent Recalculation against DB
    // -------------------------------------------------------------------------
    console.log('\n--- TEST 3: Backend Order Authority (Anti-Tamper Recalculation) ---');
    // Simulate frontend submitting malicious tampered price of ₹10 instead of DB price ₹1,400
    const verifiedOrder = await verifyAndCalculateOrder({
      items: [
        {
          id: dbProduct.id,
          name: 'Tampered Item',
          price: 10.00, // MALICIOUS CLIENT SUBMISSION
          qty: 2
        }
      ],
      deliveryCharge: 100.00,
      paymentMethod: 'prepaid',
      client: pool
    });

    assert(verifiedOrder.productSubtotal === 2800.00, 'Backend rejected tampered ₹10 price and recalculated subtotal from DB (2 x 1400 = ₹2,800)', `Got ${verifiedOrder.productSubtotal}`);
    assert(verifiedOrder.mrpSubtotal === 4000.00, 'Backend recalculated MRP subtotal from DB (2 x 2000 = ₹4,000)', `Got ${verifiedOrder.mrpSubtotal}`);
    assert(verifiedOrder.productSavings === 1200.00, 'Backend verified product savings (4000 - 2800 = ₹1,200)', `Got ${verifiedOrder.productSavings}`);
    // Base = 2800 + 100 = 2900. Platform Fee (4%) = 116.00. Grand Total = 3016.00.
    assert(verifiedOrder.platformFee === 116.00, 'Backend 4% platform fee is ₹116.00', `Got ${verifiedOrder.platformFee}`);
    assert(verifiedOrder.grandTotal === 3016.00, 'Backend grand total is ₹3,016.00', `Got ${verifiedOrder.grandTotal}`);

    // Clean up test product
    await pool.query('DELETE FROM products WHERE id = $1', [dbProduct.id]);
    console.log('Cleaned up temporary test product from database.');

    // -------------------------------------------------------------------------
    // TEST 4: Cart Financial Totals & 4% Platform Fee
    // -------------------------------------------------------------------------
    console.log('\n--- TEST 4: Cart Financial Totals & 4% Platform Fee ---');
    const cartTotals = calculateOrderTotals({
      items: [
        {
          product: { id: 1, name: 'Item 1', price: 1300, mrp: 1800 },
          variant: null,
          qty: 2
        }
      ],
      deliveryCharge: 120.00,
      platformFeePercent: 4.0,
      isCod: false
    });

    assert(cartTotals.productSubtotal === 2600, 'Product Subtotal for 2 items @ 1300 is ₹2,600', `Got ${cartTotals.productSubtotal}`);
    assert(cartTotals.mrpSubtotal === 3600, 'MRP Subtotal for 2 items @ 1800 is ₹3,600', `Got ${cartTotals.mrpSubtotal}`);
    assert(cartTotals.productSavings === 1000, 'Product savings is ₹1,000 (3600 - 2600)', `Got ${cartTotals.productSavings}`);
    assert(cartTotals.deliveryCharge === 120.00, 'Delivery charge is ₹120.00', `Got ${cartTotals.deliveryCharge}`);
    assert(cartTotals.platformFee === 108.80, '4% Platform fee is ₹108.80', `Got ${cartTotals.platformFee}`);
    assert(cartTotals.grandTotal === 2828.80, 'Grand total is ₹2,828.80', `Got ${cartTotals.grandTotal}`);

    // -------------------------------------------------------------------------
    // TEST 5: COD ₹1 Advance and Remainder Check
    // -------------------------------------------------------------------------
    console.log('\n--- TEST 5: COD Reconciliation ---');
    const codTotals = calculateOrderTotals({
      items: [
        {
          product: { id: 1, name: 'Item 1', price: 1300, mrp: 1800 },
          variant: null,
          qty: 1
        }
      ],
      deliveryCharge: 100.00,
      platformFeePercent: 4.0,
      isCod: true
    });
    assert(codTotals.grandTotal === 1456.00, 'COD Grand total is ₹1,456.00', `Got ${codTotals.grandTotal}`);
    assert(codTotals.codAdvance === 1.00, 'COD Advance is exactly ₹1.00', `Got ${codTotals.codAdvance}`);
    assert(codTotals.codCollectible === 1455.00, 'COD Doorstep Collectible is ₹1,455.00', `Got ${codTotals.codCollectible}`);

    // -------------------------------------------------------------------------
    // TEST 6: Coupon Discount Integration
    // -------------------------------------------------------------------------
    console.log('\n--- TEST 6: Coupon Discount Verification ---');
    const couponTotals = calculateOrderTotals({
      items: [
        {
          product: { id: 1, name: 'Item 1', price: 1300, mrp: 1800 },
          variant: null,
          qty: 1
        }
      ],
      deliveryCharge: 100.00,
      coupon: { code: 'SAVE10', type: 'percentage', value: 10 },
      platformFeePercent: 4.0,
      isCod: false
    });
    assert(couponTotals.couponDiscount === 130.00, 'Coupon 10% discount is ₹130.00', `Got ${couponTotals.couponDiscount}`);
    assert(couponTotals.platformFee === 50.80, 'Platform fee after discount is ₹50.80', `Got ${couponTotals.platformFee}`);
    assert(couponTotals.grandTotal === 1320.80, 'Grand total after discount is ₹1,320.80', `Got ${couponTotals.grandTotal}`);

    console.log('\n===============================================================');
    console.log(`TOTAL TESTS: ${totalTests} | PASSED: ${passedTests} | FAILED: ${totalTests - passedTests}`);
    console.log('===============================================================');

  } catch (err) {
    console.error('Audit suite error:', err);
  } finally {
    await pool.end();
  }
}

runTestSuite();
