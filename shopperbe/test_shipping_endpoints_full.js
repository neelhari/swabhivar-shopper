const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '.env') });
const express = require('express');
const pool = require('./db');
const shippingRoutes = require('./routes/shipping');

const app = express();
app.use(express.json());
app.use('/api/shipping', shippingRoutes);

async function runEndpointTests() {
  const server = app.listen(0);
  const port = server.address().port;
  const baseUrl = `http://localhost:${port}/api/shipping/calculate-rates`;

  console.log(`--- Testing /api/shipping/calculate-rates on port ${port} ---`);

  // Test 1: Missing items
  const res1 = await fetch(baseUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ items: [], deliveryPincode: '560001' })
  });
  const data1 = await res1.json();
  console.log('1. Missing items check:', res1.status === 400 ? '✅ PASS' : '❌ FAIL', data1.error);

  // Test 2: Missing / Invalid Pincode
  const res2 = await fetch(baseUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ items: [{ id: 118, qty: 1 }], deliveryPincode: '' })
  });
  const data2 = await res2.json();
  console.log('2. Missing pincode check:', res2.status === 400 ? '✅ PASS' : '❌ FAIL', data2.error);

  // Test 3: Valid delivery pincode (Bangalore to Delhi)
  const res3 = await fetch(baseUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ items: [{ id: 118, qty: 1 }], deliveryPincode: '110001' })
  });
  const data3 = await res3.json();
  console.log('3. Valid Rate Calculation:', res3.status === 200 ? '✅ PASS' : '❌ FAIL');
  if (res3.status === 200) {
    console.log('   Delivery Fee: ₹' + data3.totalShippingCharge);
    console.log('   Platform Fee (4%): ₹' + data3.platformFee);
    console.log('   Grand Total: ₹' + data3.grandTotal);
    console.log('   Shipments: ' + data3.vendorShipments.length + ' (' + data3.vendorShipments[0]?.courierName + ')');
  } else {
    console.log('   Error:', data3);
  }

  // Test 4: Quantity change (1 -> 3)
  const res4 = await fetch(baseUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ items: [{ id: 118, qty: 3 }], deliveryPincode: '110001' })
  });
  const data4 = await res4.json();
  console.log('4. Quantity update (Qty=3):', res4.status === 200 ? '✅ PASS' : '❌ FAIL');
  if (res4.status === 200) {
    console.log('   Chargeable weight: ' + data4.vendorShipments[0]?.chargeableWeight + ' kg');
    console.log('   Delivery Fee: ₹' + data4.totalShippingCharge);
    console.log('   Grand Total: ₹' + data4.grandTotal);
  }

  // Test 5: COD Mode Calculation
  const res5 = await fetch(baseUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ items: [{ id: 118, qty: 1 }], deliveryPincode: '110001', isCod: true })
  });
  const data5 = await res5.json();
  console.log('5. COD Mode Calculation:', res5.status === 200 ? '✅ PASS' : '❌ FAIL');
  if (res5.status === 200) {
    console.log('   COD Advance: ₹' + data5.codAdvanceAmount);
    console.log('   COD Collectible at Doorstep: ₹' + data5.codCollectibleAmount);
    const totalMatch = (data5.codAdvanceAmount + data5.codCollectibleAmount) === data5.grandTotal;
    console.log('   Total Match (₹1 + Doorstep = Grand Total):', totalMatch ? '✅ PASS' : '❌ FAIL');
  }

  server.close();
  process.exit(0);
}

runEndpointTests().catch(e => { console.error(e); process.exit(1); });
