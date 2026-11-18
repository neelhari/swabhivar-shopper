const shiprocket = require('./utils/shiprocket');

async function testAuth() {
  try {
    const token = await shiprocket.authenticate();
    const isMock = token === 'mock_token';
    console.log(`Shiprocket Auth Result: ${isMock ? 'MOCK MODE' : 'LIVE API TOKEN ACQUIRED'}`);
  } catch (err) {
    console.error('Shiprocket test auth error:', err.message);
  }
}

testAuth();

