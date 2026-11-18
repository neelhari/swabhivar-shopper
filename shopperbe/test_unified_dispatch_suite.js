const pool = require('./db');
const orderDispatchService = require('./services/orderDispatchService');
const shiprocket = require('./utils/shiprocket');

async function runTestSuite() {
  const client = await pool.connect();
  let passedCount = 0;
  let failedCount = 0;

  function assert(condition, message) {
    if (condition) {
      console.log(`  ✓ PASS: ${message}`);
      passedCount++;
    } else {
      console.error(`  ✗ FAIL: ${message}`);
      failedCount++;
    }
  }

  try {
    console.log('================================================================');
    console.log('       UNIFIED ADMIN & VENDOR DISPATCH TEST SUITE               ');
    console.log('================================================================\n');

    // Setup Test Vendors: Vendor A (ID: 998) and Vendor B (ID: 999)
    await client.query('BEGIN');

    // 0. Cleanup any previous test data
    await client.query('DELETE FROM vendor_shipments WHERE order_id IN (99981, 99982, 99983)');
    await client.query('DELETE FROM orders WHERE id IN (99981, 99982, 99983)');
    await client.query('DELETE FROM vendors WHERE id IN (998, 999)');

    await client.query(`
      INSERT INTO vendors (
        id, name, email, password_hash, phone, store_name, 
        pickup_contact_name, pickup_phone, pickup_address_line1, pickup_city, pickup_state, pickup_pincode, shiprocket_pickup_name
      ) VALUES 
      (998, 'Vendor Alice', 'alice@test.com', 'dummyhash', '9876543210', 'Alice Store', 
       'Alice Manager', '9876543210', 'Shop 101, Main Road', 'Hyderabad', 'Telangana', '500001', 'vnd_998_500001'),
      (999, 'Vendor Bob', 'bob@test.com', 'dummyhash', '9876543211', 'Bob Store', 
       'Bob Manager', '9876543211', 'Shop 202, Market Lane', 'Warangal', 'Telangana', '506002', 'vnd_999_506002')
    `);

    // Mock Shiprocket createCustomOrder and assignAWB to safely simulate carrier without real orders
    const originalCreateCustomOrder = shiprocket.createCustomOrder;
    const originalAssignAWB = shiprocket.assignAWB;
    const originalAddPickup = shiprocket.addPickupLocation;

    let capturedSrPayloads = [];
    shiprocket.createCustomOrder = async (payload) => {
      capturedSrPayloads.push(payload);
      return {
        order_id: payload.order_id,
        shipment_id: Math.floor(100000 + Math.random() * 900000),
        status: 'NEW'
      };
    };

    shiprocket.assignAWB = async (shipmentId) => {
      return {
        awb_code: `TESTAWB${shipmentId}`,
        courier_name: 'Test Express Courier',
        courier_company_id: 12,
        tracking_url: `https://track.shiprocket.co/TESTAWB${shipmentId}`
      };
    };

    shiprocket.addPickupLocation = async (loc) => ({ success: true });

    // -------------------------------------------------------------
    // Scenario 1: Admin dispatches a platform-owned package
    // -------------------------------------------------------------
    console.log('Test 1: Admin dispatches a platform-owned package');
    await client.query(`
      INSERT INTO orders (id, order_number, total, items, address, status, payment_method)
      VALUES (99981, 'ORD-TEST-PLATFORM', 1500, $1, $2, 'pending', 'prepaid')
    `, [
      JSON.stringify([
        { product: { id: 10, name: 'Platform T-Shirt', price: 1500, vendor_id: null }, qty: 1 }
      ]),
      JSON.stringify({ name: 'Ravi Kumar', line1: 'Flat 402', city: 'Koratla', state: 'Telangana', pincode: '505326', mobile: '9988776655' })
    ]);

    const res1 = await orderDispatchService.dispatchPlatformPackage({ orderId: 99981, client });
    assert(res1.awb && res1.awb.startsWith('TESTAWB'), 'Platform shipment generated AWB code');
    assert(res1.pickup_location === 'suresh', 'Platform shipment strictly used admin warehouse pickup (suresh)');

    const checkO1 = await client.query('SELECT status, platform_status, platform_awb FROM orders WHERE id = 99981');
    assert(checkO1.rows[0].status === 'shipped', 'Order status transitioned to shipped after platform dispatch');
    assert(checkO1.rows[0].platform_status === 'shipped', 'Platform package status marked shipped');

    // -------------------------------------------------------------
    // Scenario 2: Admin dispatches a vendor-owned package using the correct vendor pickup address
    // -------------------------------------------------------------
    console.log('\nTest 2: Admin dispatches vendor package using correct vendor pickup address');
    capturedSrPayloads = [];
    await client.query(`
      INSERT INTO orders (id, order_number, total, items, address, status, payment_method)
      VALUES (99982, 'ORD-TEST-VENDOR', 2000, $1, $2, 'pending', 'prepaid')
    `, [
      JSON.stringify([
        { product: { id: 20, name: 'Alice Silk Scarf', price: 2000, vendor_id: 998 }, qty: 1 }
      ]),
      JSON.stringify({ name: 'Sneha Rao', line1: 'Plot 12', city: 'Hyderabad', state: 'Telangana', pincode: '500001', mobile: '9123456789' })
    ]);

    const res2 = await orderDispatchService.dispatchVendorPackage({
      orderId: 99982,
      vendorId: 998,
      dispatchedBy: 'admin',
      client
    });

    assert(res2.awb_code && res2.awb_code.startsWith('TESTAWB'), 'Vendor package generated AWB');
    assert(res2.dispatched_by === 'admin', 'Shipment record accurately flagged dispatched_by: admin');
    assert(res2.pickup_location === 'vnd_998_500001', 'Used Vendor 998 registered pickup nickname');
    assert(capturedSrPayloads[0]?.pickup_location === 'vnd_998_500001', 'Shiprocket API payload sent vendor 998 pickup location');

    // -------------------------------------------------------------
    // Scenario 3: Vendor dispatches their own package
    // -------------------------------------------------------------
    console.log('\nTest 3: Vendor dispatches their own package');
    capturedSrPayloads = [];
    await client.query(`
      INSERT INTO orders (id, order_number, total, items, address, status, payment_method)
      VALUES (99983, 'ORD-TEST-MULTI', 5000, $1, $2, 'pending', 'prepaid')
    `, [
      JSON.stringify([
        { product: { id: 31, name: 'Platform Mug', price: 1000, vendor_id: null }, qty: 1 },
        { product: { id: 32, name: 'Alice Handbag', price: 2000, vendor_id: 998 }, qty: 1 },
        { product: { id: 33, name: 'Bob Watch', price: 2000, vendor_id: 999 }, qty: 1 }
      ]),
      JSON.stringify({ name: 'Kiran Patel', line1: 'Sector 5', city: 'Warangal', state: 'Telangana', pincode: '506002', mobile: '9345678901' })
    ]);

    // Vendor 998 dispatches their own package
    const res3 = await orderDispatchService.dispatchVendorPackage({
      orderId: 99983,
      vendorId: 998,
      dispatchedBy: 'vendor',
      client
    });

    assert(res3.dispatched_by === 'vendor', 'Shipment recorded as dispatched_by: vendor');
    assert(res3.pickup_location === 'vnd_998_500001', 'Vendor 998 used their own registered pickup address');

    // -------------------------------------------------------------
    // Scenario 4: Admin immediately sees the vendor-dispatched package as dispatched
    // -------------------------------------------------------------
    console.log('\nTest 4: Admin formatOrderPackages reflects vendor dispatch');
    const o3 = (await client.query('SELECT * FROM orders WHERE id = 99983')).rows[0];
    const s3 = (await client.query('SELECT * FROM vendor_shipments WHERE order_id = 99983')).rows;
    const vMap = {
      998: { name: 'Vendor Alice', store_name: 'Alice Store', pickup_contact_name: 'Alice Manager', pickup_phone: '9876543210', pickup_address_line1: 'Shop 101', pickup_city: 'Hyderabad', pickup_pincode: '500001' },
      999: { name: 'Vendor Bob', store_name: 'Bob Store', pickup_contact_name: 'Bob Manager', pickup_phone: '9876543211', pickup_address_line1: 'Shop 202', pickup_city: 'Warangal', pickup_pincode: '506002' }
    };

    const formatted = orderDispatchService.formatOrderPackages(o3, [], s3, vMap);
    const alicePkg = formatted.vendor_packages.find(p => p.vendor_id === 998);
    const bobPkg = formatted.vendor_packages.find(p => p.vendor_id === 999);

    assert(alicePkg.status === 'shipped', 'Alice package shown as shipped');
    assert(alicePkg.dispatched_by === 'vendor', 'Alice package displays dispatched_by: vendor');
    assert(alicePkg.can_dispatch === false, 'Alice package cannot be dispatched again by Admin');
    assert(bobPkg.status === 'pending', 'Bob package remains pending');
    assert(bobPkg.can_dispatch === true, 'Bob package can still be dispatched');

    // -------------------------------------------------------------
    // Scenario 5: Admin cannot dispatch that package again (duplicate protection)
    // -------------------------------------------------------------
    console.log('\nTest 5: Admin cannot dispatch already dispatched vendor package');
    let duplicateAdminBlocked = false;
    try {
      await orderDispatchService.dispatchVendorPackage({
        orderId: 99983,
        vendorId: 998,
        dispatchedBy: 'admin',
        client
      });
    } catch (err) {
      duplicateAdminBlocked = true;
    }
    assert(duplicateAdminBlocked, 'Duplicate dispatch attempt by Admin was cleanly rejected');

    // -------------------------------------------------------------
    // Scenario 6: Vendor cannot dispatch a package already dispatched by Admin
    // -------------------------------------------------------------
    console.log('\nTest 6: Vendor cannot dispatch a package already dispatched by Admin');
    let duplicateVendorBlocked = false;
    try {
      // In order 99982, package 998 was dispatched by Admin in Test 2
      await orderDispatchService.dispatchVendorPackage({
        orderId: 99982,
        vendorId: 998,
        dispatchedBy: 'vendor',
        client
      });
    } catch (err) {
      duplicateVendorBlocked = true;
    }
    assert(duplicateVendorBlocked, 'Vendor cannot dispatch a package already dispatched by Admin');

    // -------------------------------------------------------------
    // Scenario 7: Admin can dispatch another vendor\'s package using that vendor\'s own pickup address
    // -------------------------------------------------------------
    console.log('\nTest 7: Admin dispatches Bob\'s package using Bob\'s pickup address');
    capturedSrPayloads = [];
    const res7 = await orderDispatchService.dispatchVendorPackage({
      orderId: 99983,
      vendorId: 999,
      dispatchedBy: 'admin',
      client
    });

    assert(res7.pickup_location === 'vnd_999_506002', 'Admin dispatch for Bob strictly used Bob\'s Warangal pickup (vnd_999_506002)');
    assert(capturedSrPayloads[0]?.pickup_location === 'vnd_999_506002', 'Shiprocket called with Bob\'s pickup location');

    // -------------------------------------------------------------
    // Scenario 8: Multi-vendor orders create correctly separated shipments
    // -------------------------------------------------------------
    console.log('\nTest 8: Multi-vendor order separate shipments verification');
    const sMulti = (await client.query('SELECT * FROM vendor_shipments WHERE order_id = 99983 ORDER BY vendor_id')).rows;
    assert(sMulti.length === 2, 'Order 99983 has 2 distinct vendor shipment rows in DB');
    assert(sMulti[0].vendor_id === 998 && sMulti[1].vendor_id === 999, 'Separate rows for Vendor 998 and Vendor 999');
    assert(sMulti[0].awb_code !== sMulti[1].awb_code, 'Distinct AWBs generated for each package');
    assert(sMulti[0].pickup_location !== sMulti[1].pickup_location, 'Each vendor package has its own pickup location');

    // -------------------------------------------------------------
    // Scenario 9: Shipment creation failure does not mark a package dispatched
    // -------------------------------------------------------------
    console.log('\nTest 9: Failure in Shiprocket does not mark package dispatched');
    shiprocket.createCustomOrder = async () => { throw new Error('Shiprocket API Network Error: 502 Bad Gateway'); };
    
    await client.query(`
      INSERT INTO orders (id, order_number, total, items, address, status, payment_method)
      VALUES (99984, 'ORD-TEST-FAIL', 1000, $1, $2, 'pending', 'prepaid')
    `, [
      JSON.stringify([{ product: { id: 40, name: 'Item', price: 1000, vendor_id: 998 }, qty: 1 }]),
      JSON.stringify({ name: 'Test', line1: 'Addr', city: 'Hyd', state: 'TS', pincode: '500001' })
    ]);

    let failCaught = false;
    try {
      await orderDispatchService.dispatchVendorPackage({ orderId: 99984, vendorId: 998, client });
    } catch (err) {
      failCaught = true;
    }
    assert(failCaught, 'Shiprocket error was caught and transaction aborted');
    const failShipmentCheck = await client.query('SELECT * FROM vendor_shipments WHERE order_id = 99984');
    assert(failShipmentCheck.rows.length === 0, 'No false shipment row was written to vendor_shipments');

    // Cleanup 99984
    await client.query('DELETE FROM orders WHERE id = 99984');

    // -------------------------------------------------------------
    // Scenario 10: Overall status handles partially_shipped and shipped correctly
    // -------------------------------------------------------------
    console.log('\nTest 10: Multi-package partial vs full dispatch status');
    // For order 99983: Platform package is still pending, but both vendor packages are shipped
    const o3Check = await client.query('SELECT status FROM orders WHERE id = 99983');
    assert(o3Check.rows[0].status === 'partially_shipped', 'Order with 2/3 packages dispatched is partially_shipped');

    // Now dispatch platform package
    shiprocket.createCustomOrder = async (p) => ({ order_id: p.order_id, shipment_id: 777888 });
    await orderDispatchService.dispatchPlatformPackage({ orderId: 99983, client });
    const o3FullCheck = await client.query('SELECT status FROM orders WHERE id = 99983');
    assert(o3FullCheck.rows[0].status === 'shipped', 'Order with all packages dispatched transitions to shipped');

    // -------------------------------------------------------------
    // Scenario 11: A package with missing pickup address cannot be dispatched
    // -------------------------------------------------------------
    console.log('\nTest 11: Missing pickup address rejection');
    await client.query("INSERT INTO vendors (id, name, email) VALUES (997, 'No Addr Vendor', 'noaddr@test.com')");
    await client.query(`
      INSERT INTO orders (id, order_number, total, items, address, status)
      VALUES (99985, 'ORD-TEST-NOADDR', 500, $1, $2, 'pending')
    `, [
      JSON.stringify([{ product: { id: 50, name: 'Item', price: 500, vendor_id: 997 }, qty: 1 }]),
      JSON.stringify({ name: 'Test', city: 'Hyd' })
    ]);

    let missingAddrBlocked = false;
    try {
      await orderDispatchService.dispatchVendorPackage({ orderId: 99985, vendorId: 997, client });
    } catch (err) {
      missingAddrBlocked = true;
    }
    assert(missingAddrBlocked, 'Vendor without pickup address cannot be dispatched');

    // Clean up test records
    await client.query('DELETE FROM vendor_shipments WHERE order_id IN (99981, 99982, 99983, 99985)');
    await client.query('DELETE FROM orders WHERE id IN (99981, 99982, 99983, 99985)');
    await client.query('DELETE FROM vendors WHERE id IN (997, 998, 999)');

    await client.query('COMMIT');

    // Restore original functions
    shiprocket.createCustomOrder = originalCreateCustomOrder;
    shiprocket.assignAWB = originalAssignAWB;
    shiprocket.addPickupLocation = originalAddPickup;

    console.log('\n================================================================');
    console.log(`TEST RESULTS: ${passedCount} PASSED, ${failedCount} FAILED`);
    console.log('================================================================\n');

    if (failedCount > 0) process.exit(1);

  } catch (err) {
    await client.query('ROLLBACK');
    console.error('Fatal test error:', err);
    process.exit(1);
  } finally {
    client.release();
    pool.end();
  }
}

runTestSuite();
