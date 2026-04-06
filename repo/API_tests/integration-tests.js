const http = require('http');
const crypto = require('crypto');

const BASE_URL = process.env.API_URL || 'http://localhost:5000';

function requireEnv(name) {
  const value = process.env[name];
  if (!value) throw new Error(`Required environment variable ${name} is not set. Set it or use .env file.`);
  return value;
}

const ADMIN_EMAIL = requireEnv('ADMIN_EMAIL');
const ADMIN_PASSWORD = requireEnv('ADMIN_PASSWORD');
const STAFF_EMAIL = requireEnv('STAFF_EMAIL');
const STAFF_PASSWORD = requireEnv('STAFF_PASSWORD');
const BUYER_EMAIL = requireEnv('BUYER_EMAIL');
const BUYER_PASSWORD = requireEnv('BUYER_PASSWORD');
const FINANCE_EMAIL = requireEnv('FINANCE_EMAIL');
const FINANCE_PASSWORD = requireEnv('FINANCE_PASSWORD');

let passed = 0;
let failed = 0;
let adminToken = '';
let staffToken = '';
let buyerToken = '';
let financeToken = '';
// Per-session HMAC signing keys (issued by server on login)
let adminSigningKey = '';
let staffSigningKey = '';
let buyerSigningKey = '';
let financeSigningKey = '';
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

// Resolve signing key for a given token
function resolveSigningKey(token) {
  if (token === adminToken) return adminSigningKey;
  if (token === staffToken) return staffSigningKey;
  if (token === buyerToken) return buyerSigningKey;
  if (token === financeToken) return financeSigningKey;
  return '';
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

    // Use per-session signing key for HMAC (issued on login)
    const signingKey = (opts && opts.signingKey) || (token ? resolveSigningKey(token) : '');
    if (!(opts && opts.skipHmac) && signingKey) {
      const signature = generateHmac(method, fullPath, bodyStr, timestamp, signingKey);
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

  // ===== Setup: Login all users (capture per-session signing keys) =====
  const adminRes = await request('POST', '/api/v1/auth/login', { email: ADMIN_EMAIL, password: ADMIN_PASSWORD });
  adminToken = adminRes.data.accessToken;
  adminSigningKey = adminRes.data.signingKey;
  const staffRes = await request('POST', '/api/v1/auth/login', { email: STAFF_EMAIL, password: STAFF_PASSWORD });
  staffToken = staffRes.data.accessToken;
  staffSigningKey = staffRes.data.signingKey;
  const buyerRes = await request('POST', '/api/v1/auth/login', { email: BUYER_EMAIL, password: BUYER_PASSWORD });
  buyerToken = buyerRes.data.accessToken;
  buyerSigningKey = buyerRes.data.signingKey;
  const financeRes = await request('POST', '/api/v1/auth/login', { email: FINANCE_EMAIL, password: FINANCE_PASSWORD });
  financeToken = financeRes.data.accessToken;
  financeSigningKey = financeRes.data.signingKey;

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
    const res = await request('GET', '/api/v1/cart', null, buyerToken);
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

  // ===== Security: Role Escalation Prevention =====
  console.log('--- Security: Role Escalation ---');
  await test('public registration ignores role field (always buyer)', async () => {
    const res = await request('POST', '/api/v1/auth/register', {
      email: `escalation-${Date.now()}@test.com`,
      password: 'test12345',
      firstName: 'Attacker',
      lastName: 'Test',
      role: 'admin', // Attempt privilege escalation
      dealershipId: testDealershipId, // Attempt dealership injection
    });
    assert(res.status === 201, `Expected 201, got ${res.status}`);
    assert(res.data.user.role === 'buyer', `Expected buyer role, got ${res.data.user.role}`);
  });

  // ===== Security: Cross-Tenant Access =====
  console.log('--- Security: Cross-Tenant Isolation ---');
  await test('buyer cannot access orders from another dealership', async () => {
    // Create a fake order ID that doesn't belong to buyer's dealership
    const res = await request('GET', '/api/v1/orders/507f1f77bcf86cd799439011', null, buyerToken);
    // Should be 404 (not found) or 403 (forbidden), not 200
    assert(res.status === 404 || res.status === 403, `Expected 404/403, got ${res.status}`);
  });

  await test('buyer can only see their own orders in list', async () => {
    const res = await request('GET', '/api/v1/orders', null, buyerToken);
    assert(res.status === 200, `Expected 200, got ${res.status}`);
    // All returned orders should belong to the buyer
    if (res.data.data && res.data.data.length > 0) {
      const buyerProfile = await request('GET', '/api/v1/auth/me', null, buyerToken);
      const buyerId = buyerProfile.data._id;
      for (const order of res.data.data) {
        const oBuyerId = typeof order.buyerId === 'object' ? order.buyerId._id : order.buyerId;
        assert(oBuyerId === buyerId, `Order ${order._id} belongs to ${oBuyerId}, not buyer ${buyerId}`);
      }
    }
  });

  // ===== Security: Order Transition Role Restrictions =====
  console.log('--- Security: Order Transition Roles ---');
  await test('buyer cannot perform INVOICE transition', async () => {
    const res = await request('POST', '/api/v1/orders/507f1f77bcf86cd799439011/transition', {
      event: 'INVOICE',
    }, buyerToken);
    // Should fail with 403 (forbidden) or 404 (order not found for buyer)
    assert(res.status === 403 || res.status === 404, `Expected 403/404, got ${res.status}`);
  });

  await test('buyer cannot perform SETTLE transition', async () => {
    const res = await request('POST', '/api/v1/orders/507f1f77bcf86cd799439011/transition', {
      event: 'SETTLE',
    }, buyerToken);
    assert(res.status === 403 || res.status === 404, `Expected 403/404, got ${res.status}`);
  });

  await test('buyer cannot perform FULFILL transition', async () => {
    const res = await request('POST', '/api/v1/orders/507f1f77bcf86cd799439011/transition', {
      event: 'FULFILL',
    }, buyerToken);
    assert(res.status === 403 || res.status === 404, `Expected 403/404, got ${res.status}`);
  });

  // ===== Pagination Stability =====
  console.log('--- Pagination Stability ---');
  await test('search pagination returns consistent results with no duplicates', async () => {
    const page1 = await request('GET', '/api/v1/search?limit=2&page=1');
    const page2 = await request('GET', '/api/v1/search?limit=2&page=2');
    assert(page1.status === 200, `Expected 200, got ${page1.status}`);
    assert(page2.status === 200, `Expected 200, got ${page2.status}`);
    if (page1.data.data && page2.data.data) {
      const ids1 = page1.data.data.map((v) => v._id);
      const ids2 = page2.data.data.map((v) => v._id);
      const overlap = ids1.filter((id) => ids2.includes(id));
      assert(overlap.length === 0, `Found ${overlap.length} duplicate(s) across pages: ${overlap.join(', ')}`);
    }
  });

  await test('vehicle list pagination has no duplicates across pages', async () => {
    const page1 = await request('GET', '/api/v1/vehicles?limit=2&page=1');
    const page2 = await request('GET', '/api/v1/vehicles?limit=2&page=2');
    assert(page1.status === 200, `Expected 200, got ${page1.status}`);
    assert(page2.status === 200, `Expected 200, got ${page2.status}`);
    if (page1.data.data && page2.data.data) {
      const ids1 = page1.data.data.map((v) => v._id);
      const ids2 = page2.data.data.map((v) => v._id);
      const overlap = ids1.filter((id) => ids2.includes(id));
      assert(overlap.length === 0, `Found ${overlap.length} duplicate(s) across pages: ${overlap.join(', ')}`);
    }
  });

  // ===== Security: Admin Endpoint Access Control =====
  console.log('--- Security: Admin Access Control ---');
  await test('buyer cannot list admin dealerships', async () => {
    const res = await request('GET', '/api/v1/admin/dealerships', null, buyerToken);
    assert(res.status === 403, `Expected 403, got ${res.status}`);
  });

  await test('buyer cannot list admin synonyms', async () => {
    const res = await request('GET', '/api/v1/admin/synonyms', null, buyerToken);
    assert(res.status === 403, `Expected 403, got ${res.status}`);
  });

  await test('buyer cannot list admin tax-rates', async () => {
    const res = await request('GET', '/api/v1/admin/tax-rates', null, buyerToken);
    assert(res.status === 403, `Expected 403, got ${res.status}`);
  });

  // ===== Security: HMAC Malformed Signature =====
  console.log('--- Security: HMAC Malformed ---');
  await test('malformed hex signature returns 401 not 500', async () => {
    const res = await request('GET', '/api/v1/cart', null, buyerToken, {
      headers: { 'X-Hmac-Signature': 'not-hex-at-all!!!' },
    });
    assert(res.status === 401, `Expected 401, got ${res.status}`);
  });

  await test('short signature returns 401 not 500', async () => {
    const res = await request('GET', '/api/v1/cart', null, buyerToken, {
      headers: { 'X-Hmac-Signature': 'abcdef' },
    });
    assert(res.status === 401, `Expected 401, got ${res.status}`);
  });

  // ===== Security: Offline Payment Enforcement =====
  console.log('--- Security: Offline Payment Enforcement ---');
  await test('credit_card payment fails when online payments disabled', async () => {
    const res = await request('POST', '/api/v1/finance/payments', {
      orderId: '507f1f77bcf86cd799439011',
      invoiceId: '507f1f77bcf86cd799439012',
      method: 'credit_card',
      amount: 25000,
    }, staffToken);
    // Should fail because online payments are disabled by default
    assert(res.status === 400 || res.status === 500, `Expected 400/500 for disabled online payment, got ${res.status}`);
  });

  await test('bank_transfer payment fails when online payments disabled', async () => {
    const res = await request('POST', '/api/v1/finance/payments', {
      orderId: '507f1f77bcf86cd799439011',
      invoiceId: '507f1f77bcf86cd799439012',
      method: 'bank_transfer',
      amount: 25000,
    }, staffToken);
    assert(res.status === 400 || res.status === 500, `Expected 400/500 for disabled online payment, got ${res.status}`);
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
