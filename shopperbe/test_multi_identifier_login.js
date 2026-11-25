const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '.env') });
const { Pool } = require('pg');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');

const useSsl =
  process.env.DB_SSL === 'true' ||
  (process.env.DATABASE_URL || '').includes('sslmode=require');

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: useSsl ? { rejectUnauthorized: false } : false,
});

const JWT_SECRET = process.env.JWT_SECRET || 'fallback_secret';

// Simulate backend login logic for customer (mobile and email only)
async function customerLoginLogic({ identifier, password }) {
  const cleanId = (identifier || '').trim();
  if (!cleanId || !password) return { status: 400, error: 'Mobile number or email address and password required' };

  const rawDigits = cleanId.replace(/\D/g, '');
  const isPotentialPhone = rawDigits.length >= 10 && !cleanId.includes('@');
  let result;

  if (isPotentialPhone) {
    const tenDigit = rawDigits.slice(-10);
    result = await pool.query(
      'SELECT * FROM users WHERE phone = $1 OR phone = $2 OR phone = $3 ORDER BY id DESC',
      [tenDigit, '91' + tenDigit, '+91' + tenDigit]
    );
  } else {
    const cleanEmail = cleanId.toLowerCase();
    result = await pool.query('SELECT * FROM users WHERE LOWER(email) = $1 ORDER BY id DESC', [cleanEmail]);
  }

  if (!result.rows.length) return { status: 401, error: 'Invalid credentials' };

  let authenticatedUser = null;
  let hasUnverifiedMatch = false;

  for (const candidate of result.rows) {
    const isMatch = await bcrypt.compare(password, candidate.password_hash);
    if (isMatch) {
      if (!candidate.is_verified) {
        hasUnverifiedMatch = true;
        continue;
      }
      authenticatedUser = candidate;
      break;
    }
  }

  if (!authenticatedUser && hasUnverifiedMatch) {
    return { status: 403, error: 'Please verify your mobile number with the SMS OTP sent to your phone before logging in.' };
  }

  if (!authenticatedUser) {
    return { status: 401, error: 'Invalid credentials' };
  }

  const token = jwt.sign(
    { id: authenticatedUser.id, email: authenticatedUser.email, role: authenticatedUser.role },
    JWT_SECRET,
    { expiresIn: '7d' }
  );

  return {
    status: 200,
    token,
    user: {
      id: authenticatedUser.id,
      name: authenticatedUser.name,
      email: authenticatedUser.email,
      phone: authenticatedUser.phone,
      role: authenticatedUser.role
    }
  };
}

// Simulate backend login logic for vendor (mobile and email only)
async function vendorLoginLogic({ identifier, password }) {
  const cleanId = (identifier || '').trim();
  if (!cleanId || !password) return { status: 400, error: 'Mobile number or email address and password required' };

  const rawDigits = cleanId.replace(/\D/g, '');
  const isPotentialPhone = rawDigits.length >= 10 && !cleanId.includes('@');
  let result;

  if (isPotentialPhone) {
    const tenDigit = rawDigits.slice(-10);
    const phoneCandidates = [tenDigit, '91' + tenDigit, '+91' + tenDigit];
    result = await pool.query(
      'SELECT * FROM vendors WHERE phone = ANY($1::text[]) OR pickup_phone = ANY($1::text[]) ORDER BY id DESC',
      [phoneCandidates]
    );
  } else {
    const cleanEmail = cleanId.toLowerCase();
    result = await pool.query('SELECT * FROM vendors WHERE LOWER(email) = $1 ORDER BY id DESC', [cleanEmail]);
  }

  if (result.rows.length === 0) return { status: 400, error: 'Invalid credentials' };

  let authenticatedVendor = null;
  let restrictedVendor = null;

  for (const candidate of result.rows) {
    const isMatch = await bcrypt.compare(password, candidate.password_hash);
    if (isMatch) {
      if (candidate.status !== 'approved') {
        restrictedVendor = candidate;
        continue;
      }
      authenticatedVendor = candidate;
      break;
    }
  }

  if (authenticatedVendor) {
    const token = jwt.sign({ id: authenticatedVendor.id, role: 'vendor' }, JWT_SECRET, { expiresIn: '7d' });
    return {
      status: 200,
      token,
      vendor: {
        id: authenticatedVendor.id,
        name: authenticatedVendor.name,
        email: authenticatedVendor.email,
        store_name: authenticatedVendor.store_name
      }
    };
  }

  if (restrictedVendor) {
    if (restrictedVendor.status === 'pending') {
      return { status: 403, error: 'The application is under review. Once admin approves you can login here.' };
    }
    if (restrictedVendor.status === 'rejected') {
      return { status: 403, error: 'Your vendor application has been rejected by the admin.' };
    }
    if (restrictedVendor.status === 'unverified') {
      return { status: 403, error: 'Please verify your mobile number via the SMS OTP sent during signup before logging in.' };
    }
    if (restrictedVendor.status === 'closed') {
      return { status: 403, error: 'This vendor store has been deactivated and closed. Please contact administration to request reactivation.' };
    }
    return { status: 403, error: `Vendor account status: ${restrictedVendor.status}. Login not allowed.` };
  }

  return { status: 400, error: 'Invalid credentials' };
}

async function runTests() {
  console.log('====================================================');
  console.log('SWABHIVAR SHOPPERS - MOBILE & EMAIL LOGIN TESTS');
  console.log('====================================================\n');

  let passed = 0;
  let failed = 0;

  function assert(condition, message) {
    if (condition) {
      console.log(`[PASS] ${message}`);
      passed++;
    } else {
      console.error(`[FAIL] ${message}`);
      failed++;
    }
  }

  const testPassword = 'Password123!';
  const hashedPassword = await bcrypt.hash(testPassword, 10);
  const timestamp = Date.now();

  const testCustomer = {
    name: 'Mobile Email Customer',
    email: `cust_${timestamp}@swabhivartest.com`,
    phone: '98765' + String(timestamp).slice(-5),
    password: testPassword
  };

  const testUnverifiedCustomer = {
    name: 'Unverified Customer',
    email: `unver_${timestamp}@swabhivartest.com`,
    phone: '98764' + String(timestamp).slice(-5),
    password: testPassword
  };

  const testApprovedVendor = {
    name: 'Approved Vendor',
    email: `vend_app_${timestamp}@swabhivartest.com`,
    phone: '98763' + String(timestamp).slice(-5),
    password: testPassword,
    store_name: 'Test Approved Store'
  };

  const testPendingVendor = {
    name: 'Pending Vendor',
    email: `vend_pnd_${timestamp}@swabhivartest.com`,
    phone: '98762' + String(timestamp).slice(-5),
    password: testPassword,
    store_name: 'Test Pending Store'
  };

  let testCustId, testUnverCustId, testAppVendId, testPndVendId;

  try {
    // 1. Seed test customer
    const cRes = await pool.query(
      `INSERT INTO users (name, email, phone, password_hash, is_verified, role)
       VALUES ($1, $2, $3, $4, true, 'user') RETURNING id`,
      [testCustomer.name, testCustomer.email, testCustomer.phone, hashedPassword]
    );
    testCustId = cRes.rows[0].id;

    // 2. Seed test unverified customer
    const ucRes = await pool.query(
      `INSERT INTO users (name, email, phone, password_hash, is_verified, role)
       VALUES ($1, $2, $3, $4, false, 'user') RETURNING id`,
      [testUnverifiedCustomer.name, testUnverifiedCustomer.email, testUnverifiedCustomer.phone, hashedPassword]
    );
    testUnverCustId = ucRes.rows[0].id;

    // 3. Seed test approved vendor
    const avRes = await pool.query(
      `INSERT INTO vendors (name, email, phone, password_hash, status, store_name, address)
       VALUES ($1, $2, $3, $4, 'approved', $5, 'Test Address') RETURNING id`,
      [testApprovedVendor.name, testApprovedVendor.email, testApprovedVendor.phone, hashedPassword, testApprovedVendor.store_name]
    );
    testAppVendId = avRes.rows[0].id;

    // 4. Seed test pending vendor
    const pvRes = await pool.query(
      `INSERT INTO vendors (name, email, phone, password_hash, status, store_name, address)
       VALUES ($1, $2, $3, $4, 'pending', $5, 'Test Address') RETURNING id`,
      [testPendingVendor.name, testPendingVendor.email, testPendingVendor.phone, hashedPassword, testPendingVendor.store_name]
    );
    testPndVendId = pvRes.rows[0].id;

    console.log('Seeded test fixtures successfully.\n');

    // TEST 1: Customer login using mobile number
    console.log('--- TEST 1: Customer Login with Mobile Number ---');
    const cPhoneLogin = await customerLoginLogic({ identifier: testCustomer.phone, password: testPassword });
    assert(cPhoneLogin.status === 200, `Login succeeded with 10-digit phone (got status ${cPhoneLogin.status})`);
    assert(cPhoneLogin.user && cPhoneLogin.user.id === testCustId, 'Authenticated correct user account');

    const cPhoneLoginWithPrefix = await customerLoginLogic({ identifier: '+91 ' + testCustomer.phone, password: testPassword });
    assert(cPhoneLoginWithPrefix.status === 200, 'Login succeeded with +91 prefixed phone');

    // TEST 2: Customer login using email
    console.log('\n--- TEST 2: Customer Login with Email ---');
    const cEmailLogin = await customerLoginLogic({ identifier: testCustomer.email, password: testPassword });
    assert(cEmailLogin.status === 200, `Login succeeded with email (got status ${cEmailLogin.status})`);
    assert(cEmailLogin.user && cEmailLogin.user.email === testCustomer.email, 'Authenticated correct email account');

    const cEmailMixedCase = await customerLoginLogic({ identifier: testCustomer.email.toUpperCase(), password: testPassword });
    assert(cEmailMixedCase.status === 200, 'Login succeeded with uppercase email');

    // TEST 3: Vendor login using mobile number
    console.log('\n--- TEST 3: Vendor Login with Mobile Number ---');
    const vPhoneLogin = await vendorLoginLogic({ identifier: testApprovedVendor.phone, password: testPassword });
    assert(vPhoneLogin.status === 200, `Vendor login succeeded with mobile number (got status ${vPhoneLogin.status})`);
    assert(vPhoneLogin.vendor && vPhoneLogin.vendor.id === testAppVendId, 'Authenticated correct vendor account');

    const vPhoneWithPrefix = await vendorLoginLogic({ identifier: '+91' + testApprovedVendor.phone, password: testPassword });
    assert(vPhoneWithPrefix.status === 200, 'Vendor login succeeded with +91 prefixed mobile number');

    // TEST 4: Vendor login using email
    console.log('\n--- TEST 4: Vendor Login with Email ---');
    const vEmailLogin = await vendorLoginLogic({ identifier: testApprovedVendor.email, password: testPassword });
    assert(vEmailLogin.status === 200, `Vendor login succeeded with email (got status ${vEmailLogin.status})`);
    assert(vEmailLogin.vendor && vEmailLogin.vendor.email === testApprovedVendor.email, 'Authenticated correct vendor email');

    const vEmailMixedCase = await vendorLoginLogic({ identifier: testApprovedVendor.email.toUpperCase(), password: testPassword });
    assert(vEmailMixedCase.status === 200, 'Vendor login succeeded with uppercase email');

    // TEST 5: Incorrect passwords rejected
    console.log('\n--- TEST 5: Incorrect Password Rejection ---');
    const cWrongPass = await customerLoginLogic({ identifier: testCustomer.email, password: 'WrongPassword999' });
    assert(cWrongPass.status === 401 && cWrongPass.error === 'Invalid credentials', 'Customer incorrect password rejected with 401');

    const vWrongPass = await vendorLoginLogic({ identifier: testApprovedVendor.email, password: 'WrongPassword999' });
    assert(vWrongPass.status === 400 && vWrongPass.error === 'Invalid credentials', 'Vendor incorrect password rejected with 400');

    // TEST 6: Unverified customer remains blocked
    console.log('\n--- TEST 6: Unverified Customer Restriction ---');
    const cUnverifiedPhone = await customerLoginLogic({ identifier: testUnverifiedCustomer.phone, password: testPassword });
    assert(cUnverifiedPhone.status === 403, `Unverified customer blocked with 403 (got status ${cUnverifiedPhone.status})`);
    assert(cUnverifiedPhone.error.includes('verify your mobile number'), 'Returns verification notice');

    const cUnverifiedEmail = await customerLoginLogic({ identifier: testUnverifiedCustomer.email, password: testPassword });
    assert(cUnverifiedEmail.status === 403, 'Unverified customer login by email blocked with 403');

    // TEST 7: Pending vendor remains blocked
    console.log('\n--- TEST 7: Vendor Approval Restriction ---');
    const vPendingLogin = await vendorLoginLogic({ identifier: testPendingVendor.email, password: testPassword });
    assert(vPendingLogin.status === 403, `Pending vendor blocked with 403 (got status ${vPendingLogin.status})`);
    assert(vPendingLogin.error.includes('under review'), 'Returns pending approval notice');

    const vPendingByPhone = await vendorLoginLogic({ identifier: testPendingVendor.phone, password: testPassword });
    assert(vPendingByPhone.status === 403, 'Pending vendor login by phone blocked with 403');

    // TEST 8: Verify username is NOT accepted
    console.log('\n--- TEST 8: Verify Username is NOT Accepted ---');
    const cArbitraryText = await customerLoginLogic({ identifier: 'arbitrary_username', password: testPassword });
    assert(cArbitraryText.status === 401, 'Customer non-email/non-phone identifier rejected with 401');

    const vArbitraryText = await vendorLoginLogic({ identifier: 'arbitrary_username', password: testPassword });
    assert(vArbitraryText.status === 400, 'Vendor non-email/non-phone identifier rejected with 400');
  } catch (err) {
    console.error('Test execution error:', err);
    failed++;
  } finally {
    // Clean up test rows
    if (testCustId) await pool.query('DELETE FROM users WHERE id = $1', [testCustId]);
    if (testUnverCustId) await pool.query('DELETE FROM users WHERE id = $1', [testUnverCustId]);
    if (testAppVendId) await pool.query('DELETE FROM vendors WHERE id = $1', [testAppVendId]);
    if (testPndVendId) await pool.query('DELETE FROM vendors WHERE id = $1', [testPndVendId]);
    console.log('\nCleaned up test fixtures.');
    await pool.end();
  }

  console.log('\n====================================================');
  console.log(`TEST SUMMARY: ${passed} Passed, ${failed} Failed`);
  console.log('====================================================');

  process.exit(failed > 0 ? 1 : 0);
}

runTests();
