const shiprocket = require('../utils/shiprocket');

/**
 * Recalculate and update the overall order status based on all packages (platform + vendor)
 */
async function updateOverallOrderStatus(orderId, client) {
  const oRes = await client.query('SELECT * FROM orders WHERE id = $1 FOR UPDATE', [orderId]);
  if (oRes.rows.length === 0) return;
  const order = oRes.rows[0];
  const curStatus = String(order.status || '').toLowerCase();
  if (['cancelled', 'delivered'].includes(curStatus)) return;

  let items = [];
  try { items = typeof order.items === 'string' ? JSON.parse(order.items) : (order.items || []); } catch(e) {}

  const hasPlatform = items.some(i => !i.product?.vendor_id);
  const vendorIds = [...new Set(items.filter(i => i.product?.vendor_id).map(i => i.product.vendor_id))];

  // Platform package is considered shipped if platform_status is 'shipped' or platform_awb exists
  const platformShipped = !hasPlatform || Boolean(
    order.platform_status === 'shipped' || order.platform_awb || order.platform_shipment_id
  );

  const shipRes = await client.query('SELECT vendor_id FROM vendor_shipments WHERE order_id = $1', [orderId]);
  const shippedVendors = new Set(shipRes.rows.map(r => r.vendor_id));
  const allVendorsShipped = vendorIds.every(id => shippedVendors.has(id));

  const anyDispatched = (hasPlatform && platformShipped) || shipRes.rows.length > 0;
  const allDispatched = platformShipped && allVendorsShipped;

  let newStatus = order.status;
  if (allDispatched) {
    newStatus = 'shipped';
  } else if (anyDispatched) {
    newStatus = 'partially_shipped';
  }

  if (newStatus !== order.status) {
    await client.query("UPDATE orders SET status = $1 WHERE id = $2", [newStatus, orderId]);
  }
}

/**
 * Dispatch the Platform (In-House) package using Admin Warehouse
 */
async function dispatchPlatformPackage({ orderId, client }) {
  const orderRes = await client.query('SELECT * FROM orders WHERE id = $1 FOR UPDATE', [orderId]);
  if (orderRes.rows.length === 0) throw new Error('Order not found');
  const order = orderRes.rows[0];

  const curStatus = String(order.status || '').toLowerCase();
  if (['cancelled', 'delivered'].includes(curStatus)) {
    throw new Error(`Cannot dispatch an order that is currently ${order.status}`);
  }

  if (order.platform_status === 'shipped' || order.platform_awb || order.platform_shipment_id) {
    throw new Error('Platform package has already been dispatched for this order.');
  }

  let items = [];
  try { items = typeof order.items === 'string' ? JSON.parse(order.items) : (order.items || []); } catch(e) {}
  const platformItems = items.filter(i => !i.product?.vendor_id);
  if (platformItems.length === 0) {
    throw new Error('This order contains no platform-owned items.');
  }

  let address = {};
  try { address = typeof order.address === 'string' ? JSON.parse(order.address) : (order.address || {}); } catch(e) {}

  let pickupLocation = 'Primary';
  try {
    const availLocs = await shiprocket.getPickupLocations();
    if (availLocs && availLocs.length > 0) {
      const primaryLoc = availLocs.find(l => l.is_primary_location === 1 || l.is_primary_location === '1') || availLocs[0];
      pickupLocation = primaryLoc.pickup_location || 'Primary';
    }
  } catch (locErr) {
    console.warn('Could not fetch Shiprocket pickup locations for admin dispatch:', locErr.message);
  }

  const orderItems = platformItems.map((item, idx) => ({
    name: (item.product?.name || item.name || `Item ${idx + 1}`).substring(0, 50),
    sku: `${item.product?.id || 'PROD'}-${item.variant?.size || 'STD'}`.replace(/[^a-zA-Z0-9_-]/g, ''),
    units: Math.max(1, parseInt(item.qty || 1, 10)),
    selling_price: Math.max(1, parseFloat(item.variant?.price || item.product?.price || 1))
  }));
  const subtotal = platformItems.reduce(
    (sum, item) => sum + (parseInt(item.qty || 1, 10) * parseFloat(item.variant?.price || item.product?.price || 0)), 
    0
  );
  const isCod = String(order.payment_method || '').toLowerCase() === 'cod';

  let cleanPhone = String(order.user_phone || address.mobile || '').replace(/\D/g, '').slice(-10);
  if (!cleanPhone || cleanPhone.length < 10) cleanPhone = '9999999999';

  let cleanPincode = String(address.pincode || '').replace(/\D/g, '').slice(0, 6);
  if (!cleanPincode || cleanPincode.length !== 6) cleanPincode = '110001';

  const srPayload = {
    order_id: `${order.order_number || order.id}-P`,
    order_date: new Date(order.created_at || Date.now()).toISOString().split('T')[0],
    pickup_location: pickupLocation,
    billing_customer_name: address.name || order.user_name || 'Customer',
    billing_last_name: '',
    billing_address: address.line1 || address.addressLine1 || address.address || 'Delivery Address',
    billing_city: address.city || 'City',
    billing_pincode: cleanPincode,
    billing_state: address.state || 'State',
    billing_country: 'India',
    billing_email: order.user_email || 'admin@swabhivarshoppers.com',
    billing_phone: cleanPhone,
    shipping_is_billing: true,
    order_items: orderItems,
    payment_method: isCod ? 'COD' : 'Prepaid',
    sub_total: Math.max(1, subtotal),
    length: 10,
    breadth: 10,
    height: 10,
    weight: Math.max(0.5, platformItems.length * 0.5)
  };

  let srOrder = null;
  try {
    srOrder = await shiprocket.createCustomOrder(srPayload);
  } catch (createErr) {
    const validPickups = createErr.shiprocketData?.data?.data || createErr.shiprocketData?.data;
    if (Array.isArray(validPickups) && validPickups.length > 0 && validPickups[0]?.pickup_location) {
      console.warn(`Admin dispatch retrying with verified pickup location: ${validPickups[0].pickup_location}`);
      srPayload.pickup_location = validPickups[0].pickup_location;
      pickupLocation = validPickups[0].pickup_location;
      srOrder = await shiprocket.createCustomOrder(srPayload);
    } else {
      throw createErr;
    }
  }

  const shipmentId = srOrder?.shipment_id || srOrder?.payload?.shipment_id;
  if (!shipmentId) {
    const errMsg = srOrder?.message || (srOrder?.errors ? JSON.stringify(srOrder.errors) : 'Shiprocket did not return a valid shipment ID.');
    throw new Error(errMsg);
  }

  let awbCode = null;
  let courierName = 'Shiprocket Courier';
  let courierId = null;
  let trackingUrl = null;

  try {
    const awbRes = await shiprocket.assignAWB(shipmentId);
    awbCode = awbRes.awb_code;
    courierName = awbRes.courier_name || courierName;
    courierId = awbRes.courier_company_id || null;
    trackingUrl = awbRes.tracking_url || `https://shiprocket.co/tracking/${awbCode}`;
  } catch (awbErr) {
    console.warn('AWB assignment warning:', awbErr.message);
    trackingUrl = `https://shiprocket.co/tracking/${shipmentId}`;
  }

  await client.query(`
    UPDATE orders 
    SET platform_shipment_id = $1::varchar,
        platform_awb = $2::varchar,
        platform_courier_name = $3::varchar,
        platform_tracking_url = $4::text,
        platform_pickup_location = $5::varchar,
        platform_dispatched_by = 'admin',
        platform_status = 'shipped',
        tracking_id = COALESCE(tracking_id, $2::varchar),
        tracking_link = COALESCE(tracking_link, $4::varchar)
    WHERE id = $6
  `, [String(shipmentId), awbCode, courierName, trackingUrl, pickupLocation, orderId]);

  await updateOverallOrderStatus(orderId, client);

  return {
    package_id: `${order.order_number || order.id}-P`,
    shipment_id: shipmentId,
    awb: awbCode,
    courier_name: courierName,
    courier_id: courierId,
    tracking_url: trackingUrl,
    pickup_location: pickupLocation,
    dispatched_by: 'admin'
  };
}

/**
 * Dispatch a specific Vendor package using that vendor's registered pickup address
 */
async function dispatchVendorPackage({ orderId, vendorId, dispatchedBy = 'vendor', client }) {
  const orderRes = await client.query('SELECT * FROM orders WHERE id = $1 FOR UPDATE', [orderId]);
  if (orderRes.rows.length === 0) throw new Error('Order not found');
  const order = orderRes.rows[0];

  const curStatus = String(order.status || '').toLowerCase();
  if (['cancelled', 'delivered'].includes(curStatus)) {
    throw new Error(`Cannot dispatch an order that is currently ${order.status}`);
  }

  // Concurrency check: prevent duplicate shipment
  const existShipment = await client.query(
    'SELECT * FROM vendor_shipments WHERE order_id = $1 AND vendor_id = $2 FOR UPDATE',
    [orderId, vendorId]
  );
  if (existShipment.rows.length > 0) {
    const s = existShipment.rows[0];
    throw new Error(`Package for Vendor #${vendorId} has already been dispatched (Dispatched by ${s.dispatched_by || 'vendor'}, AWB: ${s.awb_code || 'Assigned'}).`);
  }

  // Extract vendor items
  let allItems = [];
  try { allItems = typeof order.items === 'string' ? JSON.parse(order.items) : (order.items || []); } catch(e) {}
  const vendorItems = allItems.filter(item => item.product && item.product.vendor_id === vendorId);
  if (vendorItems.length === 0) {
    throw new Error(`This order contains no items belonging to Vendor #${vendorId}.`);
  }

  // Fetch vendor's registered pickup address
  const vRes = await client.query(`
    SELECT id, name, email, store_name, pickup_contact_name, pickup_phone, 
           pickup_address_line1, pickup_address_line2, pickup_landmark, 
           pickup_city, pickup_state, pickup_pincode, shiprocket_pickup_name
    FROM vendors WHERE id = $1 FOR UPDATE
  `, [vendorId]);
  const vendor = vRes.rows[0];

  if (!vendor || !vendor.pickup_contact_name || !vendor.pickup_phone || !vendor.pickup_address_line1 || !vendor.pickup_city || !vendor.pickup_pincode) {
    throw new Error(`Cannot dispatch: Vendor #${vendorId} (${vendor?.name || 'Unknown'}) does not have a pickup address configured. Please add the pickup address in Store Profile before dispatching.`);
  }

  let pickupNickname = vendor.shiprocket_pickup_name || `vnd_${vendor.id}_${vendor.pickup_pincode}`;
  try {
    const locRes = await shiprocket.addPickupLocation({
      pickup_location: pickupNickname,
      name: vendor.pickup_contact_name,
      email: vendor.email || 'vendor@swabhivarshoppers.com',
      phone: vendor.pickup_phone,
      address: vendor.pickup_address_line1,
      address_2: vendor.pickup_address_line2 || '',
      city: vendor.pickup_city,
      state: vendor.pickup_state,
      pin_code: vendor.pickup_pincode
    });
    if (locRes?.pickup_location) {
      pickupNickname = locRes.pickup_location;
      if (vendor.shiprocket_pickup_name !== locRes.pickup_location) {
        await client.query('UPDATE vendors SET shiprocket_pickup_name = $1 WHERE id = $2', [locRes.pickup_location, vendor.id]);
      }
    }
  } catch (locErr) {
    console.error('Shiprocket vendor pickup registration check:', locErr.message);
    throw new Error(`Cannot dispatch: Vendor #${vendorId} pickup address registration failed on Shiprocket: ${locErr.message}. Please verify and update your pickup address in Store Profile.`);
  }

  // Verify pickup location strictly belongs to THIS vendor
  try {
    const availLocs = await shiprocket.getPickupLocations();
    if (availLocs && availLocs.length > 0) {
      const match = availLocs.find(
        l => String(l.pickup_location).trim().toLowerCase() === String(pickupNickname).trim().toLowerCase() ||
             String(l.pickup_location).trim().toLowerCase().startsWith(`vnd_${vendor.id}_`)
      );
      if (match) {
        pickupNickname = match.pickup_location;
        if (vendor.shiprocket_pickup_name !== match.pickup_location) {
          await client.query('UPDATE vendors SET shiprocket_pickup_name = $1 WHERE id = $2', [match.pickup_location, vendor.id]);
        }
      } else {
        throw new Error(`Cannot dispatch: Vendor pickup location "${pickupNickname}" is not registered on Shiprocket. Please update your pickup address in Store Profile.`);
      }
    }
  } catch (verifyErr) {
    if (verifyErr.message && verifyErr.message.includes('not registered on Shiprocket')) {
      throw verifyErr;
    }
    console.warn('Shiprocket list pickup locations check:', verifyErr.message);
  }

  let deliveryAddr = {};
  try { deliveryAddr = typeof order.address === 'string' ? JSON.parse(order.address) : (order.address || {}); } catch(e) {}

  const srOrderItems = vendorItems.map((item, idx) => ({
    name: (item.product?.name || item.name || `Vendor Item ${idx + 1}`).substring(0, 50),
    sku: `${item.product?.id || 'PROD'}-${item.variant?.size || 'STD'}`.replace(/[^a-zA-Z0-9_-]/g, ''),
    units: Math.max(1, parseInt(item.qty || 1, 10)),
    selling_price: Math.max(1, parseFloat(item.variant?.price || item.product?.price || 1))
  }));

  const vendorSubtotal = vendorItems.reduce(
    (sum, item) => sum + (parseInt(item.qty || 1, 10) * parseFloat(item.variant?.price || item.product?.price || 0)), 
    0
  );

  const isCod = String(order.payment_method || '').toLowerCase() === 'cod';

  // Calculate dimensional attributes from items
  let totalActualWeight = 0;
  let maxL = 15;
  let maxW = 12;
  let totalH = 0;

  for (const item of vendorItems) {
    const qty = parseInt(item.qty || 1, 10);
    const prod = item.product || {};
    const attrs = prod.custom_attributes || {};
    const w = parseFloat(prod.shipping_weight || prod.weight || attrs.shipping_weight || attrs.weight || 0.4);
    const l = parseFloat(prod.length || attrs.length || 15);
    const wid = parseFloat(prod.width || attrs.width || 12);
    const h = parseFloat(prod.height || attrs.height || 4);

    totalActualWeight += (w * qty);
    maxL = Math.max(maxL, l);
    maxW = Math.max(maxW, wid);
    totalH += (h * qty);
  }

  const boxLength = Math.max(10, maxL);
  const boxWidth = Math.max(10, maxW);
  const boxHeight = Math.max(5, totalH);
  const volumetricWeight = Math.round(((boxLength * boxWidth * boxHeight) / 5000) * 1000) / 1000;
  const chargeableWeight = Math.max(0.5, totalActualWeight, volumetricWeight);

  let cleanPhone = String(deliveryAddr.mobile || order.user_phone || '').replace(/\D/g, '').slice(-10);
  if (!cleanPhone || cleanPhone.length < 10) cleanPhone = '9999999999';

  let cleanPincode = String(deliveryAddr.pincode || '').replace(/\D/g, '').slice(0, 6);
  if (!cleanPincode || cleanPincode.length !== 6) cleanPincode = '500001';

  const srPayload = {
    order_id: `${order.order_number || order.id}-V${vendorId}`,
    order_date: new Date(order.created_at || Date.now()).toISOString().split('T')[0],
    pickup_location: pickupNickname,
    billing_customer_name: deliveryAddr.name || order.user_name || 'Customer',
    billing_last_name: '',
    billing_address: deliveryAddr.line1 || deliveryAddr.addressLine1 || deliveryAddr.address || 'Delivery Address',
    billing_city: deliveryAddr.city || 'City',
    billing_pincode: cleanPincode,
    billing_state: deliveryAddr.state || 'Telangana',
    billing_country: 'India',
    billing_email: order.user_email || 'customer@swabhivarshoppers.com',
    billing_phone: cleanPhone,
    shipping_is_billing: true,
    order_items: srOrderItems,
    payment_method: isCod ? 'COD' : 'Prepaid',
    sub_total: Math.max(1, vendorSubtotal),
    length: boxLength,
    breadth: boxWidth,
    height: boxHeight,
    weight: chargeableWeight
  };

  let srOrder = null;
  try {
    srOrder = await shiprocket.createCustomOrder(srPayload);
  } catch (createErr) {
    const validPickups = createErr.shiprocketData?.data?.data || createErr.shiprocketData?.data;
    if (Array.isArray(validPickups) && validPickups.length > 0) {
      const vendorPick = validPickups.find(p => String(p.pickup_location).startsWith(`vnd_${vendor.id}_`));
      if (vendorPick?.pickup_location) {
        console.warn(`Vendor dispatch retrying with verified pickup location: ${vendorPick.pickup_location}`);
        srPayload.pickup_location = vendorPick.pickup_location;
        pickupNickname = vendorPick.pickup_location;
        srOrder = await shiprocket.createCustomOrder(srPayload);
      } else {
        throw new Error(`Cannot dispatch: Vendor #${vendorId} pickup location is not verified in Shiprocket. Please update your pickup address in Store Profile.`);
      }
    } else {
      throw createErr;
    }
  }

  const shipmentId = srOrder?.shipment_id || srOrder?.payload?.shipment_id;
  if (!shipmentId) {
    const errMsg = srOrder?.message || (srOrder?.errors ? JSON.stringify(srOrder.errors) : 'Shiprocket did not return a valid shipment ID.');
    throw new Error(errMsg);
  }

  let awbCode = null;
  let courierName = 'Shiprocket Courier';
  let courierId = null;
  let trackingUrl = null;

  try {
    const awbRes = await shiprocket.assignAWB(shipmentId);
    awbCode = awbRes.awb_code;
    courierName = awbRes.courier_name || courierName;
    courierId = awbRes.courier_company_id || null;
    trackingUrl = awbRes.tracking_url || `https://shiprocket.co/tracking/${awbCode}`;
  } catch (awbErr) {
    console.warn('AWB auto-assignment warning:', awbErr.message);
    trackingUrl = `https://shiprocket.co/tracking/${shipmentId}`;
  }

  const shipIns = await client.query(`
    INSERT INTO vendor_shipments (
      order_id, vendor_id, shiprocket_shipment_id, shiprocket_order_id,
      awb_code, courier_name, courier_id, tracking_url, pickup_location,
      pickup_address, shipping_address, items, status, dispatched_by
    ) VALUES (
      $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, 'shipped', $13
    ) RETURNING *
  `, [
    orderId, vendorId, String(shipmentId), String(srOrder.order_id || srPayload.order_id),
    awbCode, courierName, courierId, trackingUrl, pickupNickname,
    JSON.stringify({
      contact_name: vendor.pickup_contact_name,
      phone: vendor.pickup_phone,
      address_line1: vendor.pickup_address_line1,
      address_line2: vendor.pickup_address_line2,
      landmark: vendor.pickup_landmark,
      city: vendor.pickup_city,
      state: vendor.pickup_state,
      pincode: vendor.pickup_pincode,
      nickname: pickupNickname
    }),
    JSON.stringify(deliveryAddr),
    JSON.stringify(vendorItems),
    dispatchedBy
  ]);

  // Set order tracking if not set
  await client.query(`
    UPDATE orders 
    SET tracking_id = COALESCE(tracking_id, $1::varchar),
        tracking_link = COALESCE(tracking_link, $2::varchar)
    WHERE id = $3
  `, [awbCode, trackingUrl, orderId]);

  await updateOverallOrderStatus(orderId, client);

  return shipIns.rows[0];
}

/**
 * Format an order with separate platform and vendor package cards
 */
function formatOrderPackages(order, payouts = [], shipments = [], vendorsMap = {}) {
  let items = [];
  try { items = typeof order.items === 'string' ? JSON.parse(order.items) : (order.items || []); } catch(e) {}

  const platformItems = items.filter(item => !item.product?.vendor_id);
  const vendorItemsGrouped = {};

  items.forEach(item => {
    if (item.product?.vendor_id) {
      const vId = item.product.vendor_id;
      if (!vendorItemsGrouped[vId]) vendorItemsGrouped[vId] = [];
      vendorItemsGrouped[vId].push(item);
    }
  });

  // Platform package
  let platformPackage = null;
  if (platformItems.length > 0) {
    const platformSubtotal = platformItems.reduce(
      (sum, item) => sum + (parseInt(item.qty || 1, 10) * parseFloat(item.variant?.price || item.product?.price || 0)), 
      0
    );
    const isPlatformShipped = Boolean(
      order.platform_status === 'shipped' || 
      order.platform_awb || 
      order.platform_shipment_id ||
      (order.tracking_id && Object.keys(vendorItemsGrouped).length === 0)
    );
    const awb = order.platform_awb || (Object.keys(vendorItemsGrouped).length === 0 ? order.tracking_id : null);
    const trackingUrl = order.platform_tracking_url || (Object.keys(vendorItemsGrouped).length === 0 ? order.tracking_link : null);

    platformPackage = {
      package_id: `${order.order_number || order.id}-P`,
      items: platformItems,
      subtotal: platformSubtotal,
      warehouse: order.platform_pickup_location || 'suresh',
      status: isPlatformShipped ? 'shipped' : (order.status === 'cancelled' ? 'cancelled' : 'pending'),
      shipment_id: order.platform_shipment_id || null,
      awb: awb || null,
      courier_name: order.platform_courier_name || 'Shiprocket Courier',
      tracking_url: trackingUrl || null,
      dispatched_by: order.platform_dispatched_by || (isPlatformShipped ? 'admin' : null),
      can_dispatch: !isPlatformShipped && !['cancelled', 'delivered'].includes(String(order.status).toLowerCase())
    };
  }

  // Vendor packages
  const vendorPackages = [];
  for (const [vIdStr, vItems] of Object.entries(vendorItemsGrouped)) {
    const vId = parseInt(vIdStr, 10);
    const vendor = vendorsMap[vId] || {};
    const shipment = shipments.find(s => s.order_id === order.id && s.vendor_id === vId);
    const vSubtotal = vItems.reduce(
      (sum, item) => sum + (parseInt(item.qty || 1, 10) * parseFloat(item.variant?.price || item.product?.price || 0)), 
      0
    );
    const hasPickup = Boolean(
      vendor.pickup_contact_name && vendor.pickup_phone && 
      vendor.pickup_address_line1 && vendor.pickup_city && vendor.pickup_pincode
    );

    vendorPackages.push({
      vendor_id: vId,
      package_id: `${order.order_number || order.id}-V${vId}`,
      vendor_name: vendor.name || `Vendor #${vId}`,
      store_name: vendor.store_name || vendor.name || `Vendor Store #${vId}`,
      vendor_email: vendor.email || '',
      vendor_phone: vendor.phone || '',
      pickup_address: {
        contact_name: vendor.pickup_contact_name || '',
        phone: vendor.pickup_phone || '',
        address_line1: vendor.pickup_address_line1 || '',
        address_line2: vendor.pickup_address_line2 || '',
        landmark: vendor.pickup_landmark || '',
        city: vendor.pickup_city || '',
        state: vendor.pickup_state || '',
        pincode: vendor.pickup_pincode || '',
        nickname: vendor.shiprocket_pickup_name || `vnd_${vId}_${vendor.pickup_pincode || ''}`
      },
      has_valid_pickup_address: hasPickup,
      items: vItems,
      subtotal: vSubtotal,
      shipment: shipment || null,
      status: shipment ? 'shipped' : (order.status === 'cancelled' ? 'cancelled' : 'pending'),
      dispatched_by: shipment?.dispatched_by || (shipment ? 'vendor' : null),
      awb: shipment?.awb_code || null,
      courier_name: shipment?.courier_name || null,
      tracking_url: shipment?.tracking_url || null,
      shiprocket_shipment_id: shipment?.shiprocket_shipment_id || null,
      can_dispatch: !shipment && !['cancelled', 'delivered'].includes(String(order.status).toLowerCase())
    });
  }

  const hasPlatform = platformItems.length > 0;
  const hasVendor = vendorPackages.length > 0;
  let orderType = 'platform';
  if (hasPlatform && hasVendor) orderType = 'mixed';
  else if (hasVendor) orderType = 'vendor';

  order.platform_package = platformPackage;
  order.vendor_packages = vendorPackages;
  order.order_type = orderType;
  order.vendor_payouts = payouts.filter(p => p.order_id === order.id);

  return order;
}

module.exports = {
  updateOverallOrderStatus,
  dispatchPlatformPackage,
  dispatchVendorPackage,
  formatOrderPackages
};
