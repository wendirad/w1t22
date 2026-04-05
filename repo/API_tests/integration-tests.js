const http = require('http');
const crypto = require('crypto');

const BASE_URL = process.env.API_URL || 'http://localhost:5000';
const HMAC_SECRET = process.env.HMAC_SECRET || 'aG1hYyBzaGFyZWQgc2VjcmV0IGtleSBmb3IgcmVxdWVzdCBzaWdu';
const ADMIN_EMAIL = process.env.ADMIN_EMAIL || 'admin@motorlot.com';
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'MotorLot@Admin2024!';
const STAFF_EMAIL = process.env.STAFF_EMAIL || 'staff@motorlot.com';
const STAFF_PASSWORD = process.env.STAFF_PASSWORD || 'MotorLot@Staff2024!';
const BUYER_EMAIL = process.env.BUYER_EMAIL || 'buyer@motorlot.com';
const BUYER_PASSWORD = process.env.BUYER_PASSWORD || 'MotorLot@Buyer2024!';
const FINANCE_EMAIL = process.env.FINANCE_EMAIL || 'finance@motorlot.com';
const FINANCE_PASSWORD = process.env.FINANCE_PASSWORD || 'MotorLot@Finance2024!';

let passed = 0;
let failed = 0;
let adminToken = '';
let staffToken = '';
let buyerToken = '';
let financeToken = '';
let testDealershipId = '';
let testVehicleId = '';
let testVehicleId2 = '';
let testOrderId = '';
let testOrderId2 = '';
let testInvoiceId = '';

function generateHmac(method, path, body, timestamp, secret) {
  const payload = `${method}\n${path}\n${body}\n${timestamp}`;
  return crypto.createHmac('sha256', secret).update(payload).digest('hex');
}

function request(method, path, body, token, opts) {
  return new Promise((resolve, reject) => {
    const url = new URL(path, BASE_URL);
    const fullPath = url.pathname + url.search;
    const timestamp = (opts && opts.timestamp) || new Date().toISOString();
    const bodyStr = body ? JSON.stringify(body) : '';

    const options = {
      hostname: url.hostname,
      port: url.port,
      path: fullPath,
      method,
      headers: {
        'Content-Type': 'application/json',
        'X-Timestamp': timestamp,
      },
    };

    if (!(opts && opts.skipHmac)) {
      const signature = generateHmac(method, fullPath, bodyStr, timestamp, HMAC_SECRET);
      options.headers['X-Hmac-Signature'] = signature;
    }

    if (opts && opts.headers) {
      Object.assign(options.headers, opts.headers);
    }

    if (token) options.headers['Authorization'] = `Bearer ${token}`;

    const req = http.request(options, (res) => {
      let data = '';
      res.on('data', (chunk) => { data += chunk; });
      res.on('end', () => {
        let parsed;
        try { parsed = JSON.parse(data); } catch { parsed = data; }
        resolve({ status: res.statusCode, data: parsed });
      });
    });

    req.on('error', reject);
    if (body) req.write(JSON.stringify(body));
    req.end();
  });
}

async function test(name, fn) {
  try {
    await fn();
    console.log(`  PASS: ${name}`);
    passed++;
  } catch (e) {
    console.log(`  FAIL: ${name} - ${e.message}`);
    failed++;
  }
}

function assert(condition, msg) {
  if (!condition) throw new Error(msg || 'Assertion failed');
}

async function runTests() {
  console.log('Integration Tests (New Features):');
  console.log('');

  // ===== Setup: Login all users =====
  const adminRes = await request('POST', '/api/v1/auth/login', { email: ADMIN_EMAIL, password: ADMIN_PASSWORD });
  adminToken = adminRes.data.accessToken;
  const staffRes = await request('POST', '/api/v1/auth/login', { email: STAFF_EMAIL, password: STAFF_PASSWORD });
  staffToken = staffRes.data.accessToken;
  const buyerRes = await request('POST', '/api/v1/auth/login', { email: BUYER_EMAIL, password: BUYER_PASSWORD });
  buyerToken = buyerRes.data.accessToken;
  const financeRes = await request('POST', '/api/v1/auth/login', { email: FINANCE_EMAIL, password: FINANCE_PASSWORD });
  financeToken = financeRes.data.accessToken;

  // Get a test dealership and vehicle
  const dealershipsRes = await request('GET', '/api/v1/admin/dealerships', null, adminToken);
  if (dealershipsRes.data && dealershipsRes.data.length > 0) {
    testDealershipId = dealershipsRes.data[0]._id;
  }
  const vehiclesRes = await request('GET', '/api/v1/vehicles');
  if (vehiclesRes.data.data && vehiclesRes.data.data.length >= 1) {
    testVehicleId = vehiclesRes.data.data[0]._id;
    if (!testDealershipId) testDealershipId = vehiclesRes.data.data[0].dealershipId;
    if (vehiclesRes.data.data.length >= 2) {
      testVehicleId2 = vehiclesRes.data.data[1]._id;
    }
  }

  // ===== HMAC Verification =====
  console.log('--- HMAC Verification ---');
  await test('unsigned request to HMAC-protected route is rejected', async () => {
    const res = await request('GET', '/api/v1/cart', null, buyerToken, { skipHmac: true });
    assert(res.status === 401, `Expected 401, got ${res.status}`);
  });

  await test('request with invalid HMAC signature is rejected', async () => {
    const res = await request('GET', '/api/v1/cart', null, buyerToken, {
      headers: { 'X-Hmac-Signature': 'a'.repeat(64) },
    });
    assert(res.status === 401, `Expected 401, got ${res.status}`);
  });

  await test('request with expired timestamp is rejected', async () => {
    const expired = new Date(Date.now() - 600 * 1000).toISOString();
    const res = await request('GET', '/api/v1/cart', null, buyerToken, { timestamp: expired });
    assert(res.status === 401, `Expected 401, got ${res.status}`);
  });

  await test('properly signed request succeeds', async () => {
    const res = await request('GET', `/api/v1/cart?dealershipId=${testDealershipId}`, null, buyerToken);
    assert(res.status === 200, `Expected 200, got ${res.status}`);
  });

  // ===== Request Validation =====
  console.log('--- Request Validation ---');
  await test('register with invalid email returns 422', async () => {
    const res = await request('POST', '/api/v1/auth/register', {
      email: 'notanemail', password: 'longpassword', firstName: 'A', lastName: 'B',
    });
    assert(res.status === 422, `Expected 422, got ${res.status}`);
  });

  await test('register with short password returns 422', async () => {
    const res = await request('POST', '/api/v1/auth/register', {
      email: 'valid@test.com', password: 'short', firstName: 'A', lastName: 'B',
    });
    assert(res.status === 422, `Expected 422, got ${res.status}`);
  });

  await test('order transition with invalid event returns 422', async () => {
    const res = await request('POST', '/api/v1/orders/507f1f77bcf86cd799439011/transition', {
      event: 'INVALID',
    }, staffToken);
    assert(res.status === 422, `Expected 422, got ${res.status}`);
  });

  await test('payment with invalid method returns 422', async () => {
    const res = await request('POST', '/api/v1/finance/payments', {
      orderId: '507f1f77bcf86cd799439011',
      invoiceId: '507f1f77bcf86cd799439012',
      method: 'bitcoin',
      amount: 100,
    }, buyerToken);
    assert(res.status === 422, `Expected 422, got ${res.status}`);
  });

  await test('consent with missing fields returns 422', async () => {
    const res = await request('POST', '/api/v1/privacy/consents', {
      granted: true,
    }, buyerToken);
    assert(res.status === 422, `Expected 422, got ${res.status}`);
  });

  // ===== Audit Logging =====
  console.log('--- Audit Logging ---');
  await test('admin audit logs show recent activity', async () => {
    const res = await request('GET', '/api/v1/audit', null, adminToken);
    assert(res.status === 200, `Expected 200, got ${res.status}`);
    assert(res.data.data, 'Expected paginated data');
  });

  // ===== Permission Override Management =====
  console.log('--- Permission Overrides ---');
  let testOverrideId = '';

  await test('admin can create permission override', async () => {
    const res = await request('POST', '/api/v1/admin/permission-overrides', {
      dealershipId: testDealershipId,
      resource: 'document',
      actions: ['read', 'download'],
      effect: 'allow',
      reason: 'Test override',
    }, adminToken);
    assert(res.status === 201, `Expected 201, got ${res.status}`);
    assert(res.data._id, 'Expected override ID');
    testOverrideId = res.data._id;
  });

  await test('admin can list permission overrides', async () => {
    const res = await request('GET', '/api/v1/admin/permission-overrides', null, adminToken);
    assert(res.status === 200, `Expected 200, got ${res.status}`);
    assert(res.data.data, 'Expected paginated data');
  });

  await test('admin can get single permission override', async () => {
    if (!testOverrideId) return;
    const res = await request('GET', `/api/v1/admin/permission-overrides/${testOverrideId}`, null, adminToken);
    assert(res.status === 200, `Expected 200, got ${res.status}`);
    assert(res.data.resource === 'document', 'Expected document resource');
  });

  await test('admin can update permission override', async () => {
    if (!testOverrideId) return;
    const res = await request('PATCH', `/api/v1/admin/permission-overrides/${testOverrideId}`, {
      actions: ['read', 'download', 'share'],
    }, adminToken);
    assert(res.status === 200, `Expected 200, got ${res.status}`);
  });

  await test('buyer cannot manage permission overrides', async () => {
    const res = await request('GET', '/api/v1/admin/permission-overrides', null, buyerToken);
    assert(res.status === 403, `Expected 403, got ${res.status}`);
  });

  await test('admin can delete permission override', async () => {
    if (!testOverrideId) return;
    const res = await request('DELETE', `/api/v1/admin/permission-overrides/${testOverrideId}`, null, adminToken);
    assert(res.status === 200, `Expected 200, got ${res.status}`);
  });

  // ===== Search with Registration Date Filter =====
  console.log('--- Search Registration Date Filter ---');
  await test('search with minRegistrationDate returns results', async () => {
    const res = await request('GET', '/api/v1/search?minRegistrationDate=2020-01-01');
    assert(res.status === 200, `Expected 200, got ${res.status}`);
    assert(res.data.data !== undefined, 'Expected data');
  });

  await test('search with both date filters returns results', async () => {
    const res = await request('GET', '/api/v1/search?minRegistrationDate=2020-01-01&maxRegistrationDate=2030-12-31');
    assert(res.status === 200, `Expected 200, got ${res.status}`);
  });

  // ===== Discrepancy Tickets =====
  console.log('--- Discrepancy Tickets ---');
  await test('admin can list discrepancy tickets', async () => {
    const res = await request('GET', '/api/v1/finance/discrepancies', null, adminToken);
    assert(res.status === 200, `Expected 200, got ${res.status}`);
    assert(res.data.data !== undefined, 'Expected paginated data');
  });

  await test('finance reviewer can list discrepancy tickets', async () => {
    const res = await request('GET', '/api/v1/finance/discrepancies', null, financeToken);
    assert(res.status === 200, `Expected 200, got ${res.status}`);
  });

  await test('buyer cannot list discrepancy tickets', async () => {
    const res = await request('GET', '/api/v1/finance/discrepancies', null, buyerToken);
    assert(res.status === 403, `Expected 403, got ${res.status}`);
  });

  // ===== Summary =====
  console.log('');
  console.log(`Integration Tests: ${passed} passed, ${failed} failed`);
  if (failed > 0) process.exit(1);
}

function waitForServer(retries = 30, delay = 2000) {
  return new Promise((resolve, reject) => {
    function attempt(n) {
      request('GET', '/api/v1/health')
        .then((res) => {
          if (res.status === 200) resolve();
          else if (n <= 0) reject(new Error('Server not ready'));
          else setTimeout(() => attempt(n - 1), delay);
        })
        .catch(() => {
          if (n <= 0) reject(new Error('Server not reachable'));
          else setTimeout(() => attempt(n - 1), delay);
        });
    }
    attempt(retries);
  });
}

waitForServer()
  .then(() => runTests())
  .catch((e) => { console.error('Failed to connect to server:', e.message); process.exit(1); });
