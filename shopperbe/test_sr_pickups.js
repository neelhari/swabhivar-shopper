const axios = require('axios');
const shiprocket = require('./utils/shiprocket');

async function checkPickupLocations() {
  try {
    const token = await shiprocket.authenticate();
    const res = await axios.get('https://apiv2.shiprocket.in/v1/external/settings/company/pickup', {
      headers: { Authorization: `Bearer ${token}` }
    });
    console.log('Shiprocket Registered Pickup Locations:');
    const locs = res.data?.data?.shipping_address || [];
    console.log(locs.map(l => ({
      id: l.id,
      pickup_location: l.pickup_location,
      name: l.name,
      email: l.email,
      phone: l.phone,
      address: l.address,
      city: l.city,
      state: l.state,
      pin_code: l.pin_code
    })));
  } catch (err) {
    console.error('Error fetching pickup locations:', err.response?.data || err.message);
  }
}

checkPickupLocations();

