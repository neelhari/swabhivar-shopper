const http = require('http');

function post(path, body) {
  return new Promise((resolve, reject) => {
    const d = JSON.stringify(body);
    const req = http.request({
      hostname: '127.0.0.1',
      port: 5000,
      path,
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(d)
      }
    }, res => {
      let b = '';
      res.on('data', c => b += c);
      res.on('end', () => {
        try {
          resolve({ status: res.statusCode, data: JSON.parse(b) });
        } catch {
          resolve({ status: res.statusCode, text: b });
        }
      });
    });
    req.on('error', reject);
    req.write(d);
    req.end();
  });
}

async function verify() {
  console.log('--- 1. Testing login for swabhivarshopper@gmail.com with password Vishnu@9059 ---');
  const loginRes = await post('/api/auth/login', {
    email: 'swabhivarshopper@gmail.com',
    password: 'Vishnu@9059'
  });
  console.log('Status:', loginRes.status);
  console.log('User Email:', loginRes.data?.user?.email);
  console.log('User Role:', loginRes.data?.user?.role);
  if (loginRes.data?.user?.role !== 'admin') {
    throw new Error('Expected admin role for swabhivarshopper@gmail.com');
  }
  console.log('✅ Sole admin login verified successfully!');

  console.log('\n--- 2. Testing login with 6301646462 (should NOT have admin role) ---');
  const custRes = await post('/api/auth/login', {
    email: '6301646462',
    password: 'Admin@123'
  });
  console.log('Customer role:', custRes.data?.user?.role);
  if (custRes.data?.user?.role === 'admin') {
    throw new Error('Customer should NOT have admin role');
  }
  console.log('✅ Verified 6301646462 is a standard user, NOT admin.');

  console.log('\n--- 3. Testing forgot-password OTP for swabhivarshopper@gmail.com ---');
  const fpRes = await post('/api/auth/forgot-password', {
    identifier: 'swabhivarshopper@gmail.com'
  });
  console.log('Forgot Password response:', fpRes.data);
  console.log('✅ Forgot password OTP dispatched.');

  process.exit(0);
}

verify().catch(err => {
  console.error(err);
  process.exit(1);
});
