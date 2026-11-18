const axios = require('axios');
const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '../.env') });

const cleanVal = (val) => val ? String(val).trim().replace(/^["']|["']$/g, '') : '';

const BASE_URL = cleanVal(process.env.SHIPROCKET_BASE_URL) || 'https://apiv2.shiprocket.in/v1/external';
const AUTH_ENDPOINT = cleanVal(process.env.SHIPROCKET_AUTH_ENDPOINT) || '/auth/login';
let cachedToken = null;
let tokenExpiry = null;

/**
 * Authenticates with Shiprocket API User credentials and caches the bearer token.
 * Token is automatically refreshed upon expiration (cached for 8 days) or on 401 failures.
 */
async function authenticate(forceRefresh = false) {
  if (!forceRefresh && cachedToken && tokenExpiry && new Date() < tokenExpiry) {
    return cachedToken;
  }

  const email = cleanVal(process.env.SHIPROCKET_API_EMAIL || process.env.SHIPROCKET_EMAIL);
  const password = cleanVal(process.env.SHIPROCKET_API_PASSWORD || process.env.SHIPROCKET_PASSWORD);

  if (!email || !password) {
    console.warn('Shiprocket credentials not configured in environment. Operating in mock mode.');
    return "mock_token";
  }

  try {
    const response = await axios.post(`${BASE_URL}${AUTH_ENDPOINT}`, {
      email,
      password,
    });
    
    cachedToken = response.data?.token;
    const expiry = new Date();
    // Cache for 8 days (official Shiprocket JWT is valid for 10 days)
    expiry.setDate(expiry.getDate() + 8);
    tokenExpiry = expiry;
    
    return cachedToken;
  } catch (error) {
    console.warn('Shiprocket Auth failed:', error.response?.data?.message || error.message);
    cachedToken = null;
    tokenExpiry = null;
    return "mock_token";
  }
}

/**
 * Helper to execute Shiprocket requests with automatic 401 token refresh retry.
 */
async function executeRequest(requestFn) {
  let token = await authenticate();
  if (token === "mock_token") {
    return requestFn(token);
  }

  try {
    return await requestFn(token);
  } catch (err) {
    if (err.response && err.response.status === 401) {
      console.warn('Shiprocket token expired or rejected (401). Refreshing token and retrying...');
      token = await authenticate(true);
      return await requestFn(token);
    }
    throw err;
  }
}

/**
 * Fetch registered pickup locations from Shiprocket
 */
async function getPickupLocations() {
  return executeRequest(async (token) => {
    if (token === "mock_token") {
      return [
        { id: 1, pickup_location: 'suresh', pin_code: '505326', city: 'Karim Nagar', state: 'Telangana' }
      ];
    }

    try {
      const response = await axios.get(`${BASE_URL}/settings/company/pickup`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      return response.data?.data?.shipping_address || [];
    } catch (error) {
      console.error('Shiprocket Get Pickup Locations Error:', error.response?.data || error.message);
      throw new Error(error.response?.data?.message || 'Failed to fetch pickup locations from Shiprocket');
    }
  });
}

/**
 * Register or ensure a pickup location in Shiprocket
 * Location data: { pickup_location, name, email, phone, address, address_2, city, state, pin_code }
 */
async function addPickupLocation(locationData) {
  return executeRequest(async (token) => {
    if (token === "mock_token") {
      return {
        success: true,
        pickup_id: "mock_loc_" + Date.now(),
        pickup_location: locationData.pickup_location,
        message: "Mock pickup location registered"
      };
    }

    // First check if location nickname already exists
    try {
      const existing = await getPickupLocations();
      const found = existing.find(
        l => String(l.pickup_location).toLowerCase() === String(locationData.pickup_location).toLowerCase()
      );
      if (found) {
        return {
          success: true,
          pickup_id: found.id,
          pickup_location: found.pickup_location,
          already_exists: true
        };
      }
    } catch (checkErr) {
      console.warn('Could not verify existing pickup locations, attempting registration directly:', checkErr.message);
    }

    try {
      const response = await axios.post(`${BASE_URL}/settings/company/addpickup`, {
        pickup_location: locationData.pickup_location,
        name: locationData.name,
        email: locationData.email,
        phone: String(locationData.phone).replace(/\D/g, '').slice(-10),
        address: locationData.address,
        address_2: locationData.address_2 || '',
        city: locationData.city,
        state: locationData.state,
        country: 'India',
        pin_code: String(locationData.pin_code).trim(),
      }, {
        headers: { Authorization: `Bearer ${token}` }
      });

      return {
        success: true,
        pickup_id: response.data?.address?.id || response.data?.pickup_id || null,
        pickup_location: locationData.pickup_location,
        data: response.data
      };
    } catch (error) {
      const errorMsg = error.response?.data?.message || '';
      if (typeof errorMsg === 'string' && (errorMsg.includes('already exists') || errorMsg.includes('already been taken'))) {
        return {
          success: true,
          pickup_location: locationData.pickup_location,
          already_exists: true
        };
      }
      console.error('Shiprocket Add Pickup Location Error:', error.response?.data || error.message);
      throw new Error(error.response?.data?.message || 'Failed to register pickup location with Shiprocket');
    }
  });
}

/**
 * Creates custom order in Shiprocket
 */
async function createCustomOrder(orderData) {
  return executeRequest(async (token) => {
    if (token === "mock_token") {
      const mockShipmentId = "mock_ship_" + Date.now();
      return { 
        shipment_id: mockShipmentId, 
        order_id: "mock_sr_order_" + Date.now(),
        payload: { shipment_id: mockShipmentId }
      };
    }

    try {
      const response = await axios.post(`${BASE_URL}/orders/create/adhoc`, orderData, {
        headers: { Authorization: `Bearer ${token}` }
      });
      
      const resData = response.data;
      const shipmentId = resData?.shipment_id || resData?.payload?.shipment_id;
      if (!shipmentId) {
        const errorMsg = resData?.message || 
          (resData?.errors ? (typeof resData.errors === 'string' ? resData.errors : JSON.stringify(resData.errors)) : null) || 
          'Shiprocket rejected order creation with no shipment ID.';
        const err = new Error(errorMsg);
        err.shiprocketData = resData;
        throw err;
      }
      return resData;
    } catch (error) {
      if (error.shiprocketData) {
        throw error;
      }
      console.error('Shiprocket Create Order Error:', error.response?.data || error.message);
      const serverErr = error.response?.data;
      const detailedMsg = serverErr?.message || 
        (serverErr?.errors ? (typeof serverErr.errors === 'string' ? serverErr.errors : JSON.stringify(serverErr.errors)) : null) || 
        error.message || 'Failed to create order in Shiprocket';
      const err = new Error(detailedMsg);
      err.shiprocketData = serverErr;
      throw err;
    }
  });
}

/**
 * Assigns AWB and courier to a shipment
 */
async function assignAWB(shipmentId, courierId = null) {
  return executeRequest(async (token) => {
    if (token === "mock_token") {
      const mockAwb = "MOCKAWB" + Date.now();
      return { 
        awb_code: mockAwb, 
        courier_name: "Shiprocket Express (Mock)", 
        courier_company_id: 1, 
        tracking_url: `https://shiprocket.co/tracking/${mockAwb}`,
        response: { data: { awb_code: mockAwb, courier_name: "Shiprocket Express (Mock)" } } 
      };
    }

    try {
      const payload = { shipment_id: shipmentId };
      if (courierId) payload.courier_id = courierId;

      const response = await axios.post(`${BASE_URL}/courier/assign/awb`, payload, {
        headers: { Authorization: `Bearer ${token}` }
      });

      const resData = response.data?.response?.data || response.data || {};
      const awbCode = resData.awb_code || response.data?.awb_code;
      const courierName = resData.courier_name || response.data?.courier_name || 'Standard Courier';
      const courierCompanyId = resData.courier_company_id || response.data?.courier_company_id || null;
      const trackingUrl = `https://shiprocket.co/tracking/${awbCode}`;

      return {
        awb_code: awbCode,
        courier_name: courierName,
        courier_company_id: courierCompanyId,
        tracking_url: trackingUrl,
        raw: response.data
      };
    } catch (error) {
      console.error('Shiprocket AWB Error:', error.response?.data || error.message);
      throw new Error(error.response?.data?.message || 'Failed to generate AWB');
    }
  });
}

/**
 * Requests courier pickup for one or more shipments
 */
async function requestPickup(shipmentId) {
  return executeRequest(async (token) => {
    if (token === "mock_token") return { pickup_scheduled: true };

    try {
      const response = await axios.post(`${BASE_URL}/courier/generate/pickup`, {
        shipment_id: Array.isArray(shipmentId) ? shipmentId : [shipmentId]
      }, {
        headers: { Authorization: `Bearer ${token}` }
      });
      return response.data;
    } catch (error) {
      console.error('Shiprocket Pickup Error:', error.response?.data || error.message);
      throw new Error(error.response?.data?.message || 'Failed to request pickup');
    }
  });
}

/**
 * Generates shipping label URL for shipments
 */
async function generateLabel(shipmentId) {
  return executeRequest(async (token) => {
    if (token === "mock_token") return { label_created: 1, label_url: "https://mock.shiprocket.co/label.pdf" };

    try {
      const response = await axios.post(`${BASE_URL}/courier/generate/label`, {
        shipment_id: Array.isArray(shipmentId) ? shipmentId : [shipmentId]
      }, {
        headers: { Authorization: `Bearer ${token}` }
      });
      return response.data;
    } catch (error) {
      console.error('Shiprocket Label Error:', error.response?.data || error.message);
      throw new Error(error.response?.data?.message || 'Failed to generate shipping label');
    }
  });
}

/**
 * Generates shipping manifest for shipments
 */
async function generateManifest(shipmentId) {
  return executeRequest(async (token) => {
    if (token === "mock_token") return { manifest_url: "https://mock.shiprocket.co/manifest.pdf" };

    try {
      const response = await axios.post(`${BASE_URL}/manifests/generate`, {
        shipment_id: Array.isArray(shipmentId) ? shipmentId : [shipmentId]
      }, {
        headers: { Authorization: `Bearer ${token}` }
      });
      return response.data;
    } catch (error) {
      console.error('Shiprocket Manifest Error:', error.response?.data || error.message);
      throw new Error(error.response?.data?.message || 'Failed to generate manifest');
    }
  });
}

/**
 * Tracks a shipment using AWB code
 */
async function trackShipment(awbCode) {
  return executeRequest(async (token) => {
    if (!awbCode) throw new Error('AWB code is required for tracking');
    if (token === "mock_token") {
      return {
        tracking_data: {
          track_status: 1,
          shipment_status: 1,
          shipment_track: [{ current_status: 'In Transit', location: 'Hub', date: new Date().toISOString() }],
          track_url: `https://shiprocket.co/tracking/${awbCode}`
        }
      };
    }

    try {
      const response = await axios.get(`${BASE_URL}/courier/track/awb/${encodeURIComponent(awbCode)}`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      return response.data;
    } catch (error) {
      console.error('Shiprocket Tracking Error:', error.response?.data || error.message);
      throw new Error(error.response?.data?.message || 'Failed to retrieve tracking data');
    }
  });
}

/**
 * Calculates courier serviceability and dynamic rates
 */
async function calculateServiceability({ pickupPostcode, deliveryPostcode, weight = 0.5, length = 10, breadth = 10, height = 10, cod = 0, declaredValue = 500 }) {
  return executeRequest(async (token) => {
    const safeWeight = Math.max(0.1, parseFloat(weight) || 0.5);
    const safeLength = Math.max(1, parseFloat(length) || 10);
    const safeBreadth = Math.max(1, parseFloat(breadth) || 10);
    const safeHeight = Math.max(1, parseFloat(height) || 10);

    if (token === "mock_token") {
      const mockRate = Math.round((60 + (safeWeight > 0.5 ? (safeWeight - 0.5) * 40 : 0)) * 100) / 100;
      return {
        success: true,
        serviceable: true,
        rate: mockRate,
        courier_name: "Shiprocket Surface",
        courier_id: 1,
        etd: "3-5 days",
        available_couriers: [{ courier_name: "Shiprocket Surface", rate: mockRate, courier_company_id: 1 }]
      };
    }

    try {
      const params = {
        pickup_postcode: String(pickupPostcode).trim(),
        delivery_postcode: String(deliveryPostcode).trim(),
        weight: safeWeight,
        length: safeLength,
        breadth: safeBreadth,
        height: safeHeight,
        cod: cod ? 1 : 0,
        declared_value: declaredValue || 500
      };

      const response = await axios.get(`${BASE_URL}/courier/serviceability/`, {
        params,
        headers: { Authorization: `Bearer ${token}` }
      });

      const courierList = response.data?.data?.available_courier_companies || [];
      if (!courierList || courierList.length === 0) {
        return {
          success: false,
          serviceable: false,
          rate: 0,
          error: `Delivery to pincode ${deliveryPostcode} is not serviceable from pickup hub (${pickupPostcode}). Please check your delivery pincode.`,
          available_couriers: []
        };
      }

      // Sort couriers by rate ascending to choose the most economical option
      courierList.sort((a, b) => parseFloat(a.rate) - parseFloat(b.rate));
      const bestCourier = courierList[0];

      return {
        success: true,
        serviceable: true,
        rate: parseFloat(bestCourier.rate),
        courier_name: bestCourier.courier_name,
        courier_id: bestCourier.courier_company_id,
        etd: bestCourier.etd || '3-5 days',
        available_couriers: courierList
      };
    } catch (error) {
      const errorMsg = error.response?.data?.message || error.message;
      console.error('Shiprocket Serviceability Error:', errorMsg);
      return {
        success: false,
        serviceable: false,
        rate: 0,
        error: `Courier rate service error: ${errorMsg}. Please verify your delivery pincode and retry.`,
        available_couriers: []
      };
    }
  });
}

/**
 * Checks Quick / Hyperlocal courier serviceability
 */
async function checkHyperlocalServiceability({ pickupPostcode, deliveryPostcode, weight = 0.5 }) {
  return executeRequest(async (token) => {
    if (token === "mock_token") {
      return { available: false, error: 'Mock mode: Hyperlocal not available' };
    }

    try {
      const response = await axios.get(`${BASE_URL}/courier/serviceability/`, {
        params: {
          pickup_postcode: String(pickupPostcode).trim(),
          delivery_postcode: String(deliveryPostcode).trim(),
          weight: Math.max(0.1, parseFloat(weight) || 0.5),
          is_hyperlocal: 1
        },
        headers: { Authorization: `Bearer ${token}` }
      });

      const couriers = response.data?.data?.available_courier_companies || [];
      const hyperlocalCouriers = couriers.filter(c => c.is_hyperlocal || String(c.courier_name).toLowerCase().includes('hyperlocal'));
      return {
        available: hyperlocalCouriers.length > 0,
        couriers: hyperlocalCouriers,
        totalReturned: couriers.length
      };
    } catch (error) {
      return {
        available: false,
        error: error.response?.data?.message || error.message
      };
    }
  });
}

module.exports = {
  authenticate,
  getPickupLocations,
  addPickupLocation,
  createCustomOrder,
  assignAWB,
  requestPickup,
  generateLabel,
  generateManifest,
  trackShipment,
  calculateServiceability,
  checkHyperlocalServiceability
};
