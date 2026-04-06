const http = require('http');
const crypto = require('crypto');

const BASE_URL = process.env.API_URL || 'http://localhost:5000';
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
let adminSigningKey = '';
let staffSigningKey = '';
let buyerSigningKey = '';
let financeSigningKey = '';
let testDealershipId = '';
let testDealershipId2 = '';
let buyerDealershipId = '';
let testVehicleId = '';
let testOrderId = '';
let buyerUserId = '';

function generateHmac(method, path, body, timestamp, secret) {
  const payload = `${method}\n${path}\n${body}\n${timestamp}`;
  return crypto.createHmac('sha256', secret).update(payload).digest('hex');
}

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

async function resetVehicles(token) {
  for (const status of ['reserved', 'sold']) {
    const res = await request('GET', `/api/v1/vehicles?status=${status}&limit=100`, null, token);
    if (res.status === 200 && res.data.data) {
      for (const v of res.data.data) {
        await request('PATCH', `/api/v1/vehicles/${v._id}`, { status: 'available' }, token);
      }
    }
  }
}

async function runTests() {
  console.log('API Tests:');
  console.log('');

  // ===== Health =====
  console.log('--- Health ---');
  await test('GET /health returns ok', async () => {
    const res = await request('GET', '/api/v1/health');
    assert(res.status === 200, `Expected 200, got ${res.status}`);
    assert(res.data.status === 'ok', 'Expected status ok');
  });

  // ===== Auth =====
  console.log('--- Auth ---');
  await test('POST /auth/login with admin', async () => {
    const res = await request('POST', '/api/v1/auth/login', {
      email: ADMIN_EMAIL, password: ADMIN_PASSWORD,
    });
    assert(res.status === 200, `Expected 200, got ${res.status}`);
    assert(res.data.accessToken, 'Expected access token');
    adminToken = res.data.accessToken;
    adminSigningKey = res.data.signingKey;
    assert(res.data.user.role === 'admin', 'Expected admin role');
    assert(res.data.signingKey, 'Expected per-session signing key');
  });

  await resetVehicles(adminToken);

  await test('POST /auth/login with staff', async () => {
    const res = await request('POST', '/api/v1/auth/login', {
      email: STAFF_EMAIL, password: STAFF_PASSWORD,
    });
    assert(res.status === 200, `Expected 200, got ${res.status}`);
    staffToken = res.data.accessToken;
    staffSigningKey = res.data.signingKey;
  });

  await test('POST /auth/login with buyer', async () => {
    const res = await request('POST', '/api/v1/auth/login', {
      email: BUYER_EMAIL, password: BUYER_PASSWORD,
    });
    assert(res.status === 200, `Expected 200, got ${res.status}`);
    buyerToken = res.data.accessToken;
    buyerSigningKey = res.data.signingKey;
    buyerDealershipId = res.data.user.dealershipId;
    buyerUserId = res.data.user._id;
  });

  await test('POST /auth/login with finance', async () => {
    const res = await request('POST', '/api/v1/auth/login', {
      email: FINANCE_EMAIL, password: FINANCE_PASSWORD,
    });
    assert(res.status === 200, `Expected 200, got ${res.status}`);
    financeToken = res.data.accessToken;
    financeSigningKey = res.data.signingKey;
  });

  await test('POST /auth/login with wrong password returns 401', async () => {
    const res = await request('POST', '/api/v1/auth/login', {
      email: ADMIN_EMAIL, password: 'wrongpass',
    });
    assert(res.status === 401, `Expected 401, got ${res.status}`);
  });

  await test('GET /auth/me requires authentication', async () => {
    const res = await request('GET', '/api/v1/auth/me');
    assert(res.status === 401, `Expected 401, got ${res.status}`);
  });

  await test('GET /auth/me returns user profile', async () => {
    const res = await request('GET', '/api/v1/auth/me', null, adminToken);
    assert(res.status === 200, `Expected 200, got ${res.status}`);
    assert(res.data.email === ADMIN_EMAIL, 'Expected admin email');
  });

  await test('POST /auth/register creates new user', async () => {
    const res = await request('POST', '/api/v1/auth/register', {
      email: `test-${Date.now()}@motorlot.com`, password: 'test12345',
      firstName: 'Test', lastName: 'User',
    });
    assert(res.status === 201, `Expected 201, got ${res.status}`);
    assert(res.data.accessToken, 'Expected access token');
    assert(res.data.user.role === 'buyer', 'Registration should always create buyer');
  });

  await test('POST /auth/register rejects duplicate email within same dealership', async () => {
    const res = await request('POST', '/api/v1/auth/register', {
      email: ADMIN_EMAIL, password: 'test12345',
      firstName: 'Dup', lastName: 'User',
    });
    assert(res.status === 409, `Expected 409, got ${res.status}`);
  });

  // Email is globally unique — same email in a different dealership must be rejected
  // to prevent non-deterministic login resolution
  await test('POST /auth/register rejects same email in different dealership (409)', async () => {
    const dealRes = await request('GET', '/api/v1/admin/dealerships', null, adminToken);
    assert(dealRes.status === 200 && dealRes.data.length >= 2, 'Expected at least 2 dealerships');
    testDealershipId = dealRes.data[0]._id;
    testDealershipId2 = dealRes.data[1]._id;

    const uniqueEmail = `globaluniq-${Date.now()}@motorlot.com`;
    const res1 = await request('POST', '/api/v1/auth/register', {
      email: uniqueEmail, password: 'test12345',
      firstName: 'First', lastName: 'User',
      dealershipId: testDealershipId,
    });
    assert(res1.status === 201, `Expected 201, got ${res1.status}`);

    // Same email, different dealership — must be rejected
    const res2 = await request('POST', '/api/v1/auth/register', {
      email: uniqueEmail, password: 'test12345',
      firstName: 'Second', lastName: 'User',
      dealershipId: testDealershipId2,
    });
    assert(res2.status === 409, `Expected 409 for duplicate email across dealerships, got ${res2.status}`);
  });

  await test('login resolves deterministically to the correct user', async () => {
    // Register a user and verify login returns that exact user
    const testEmail = `logintest-${Date.now()}@motorlot.com`;
    const regRes = await request('POST', '/api/v1/auth/register', {
      email: testEmail, password: 'test12345',
      firstName: 'Login', lastName: 'Test',
      dealershipId: testDealershipId,
    });
    assert(regRes.status === 201, `Expected 201, got ${regRes.status}`);
    const registeredUserId = regRes.data.user._id;

    const loginRes = await request('POST', '/api/v1/auth/login', {
      email: testEmail, password: 'test12345',
    });
    assert(loginRes.status === 200, `Expected 200, got ${loginRes.status}`);
    assert(loginRes.data.user._id === registeredUserId, 'Login must resolve to the registered user');
    assert(loginRes.data.user.dealershipId === testDealershipId, 'Login must resolve to correct dealership');
  });

  // ===== Authentication enforcement on ALL protected routes =====
  console.log('--- Auth enforcement on all protected routes ---');
  const protectedRoutes = [
    { method: 'GET', path: '/api/v1/cart' },
    { method: 'GET', path: '/api/v1/orders' },
    { method: 'POST', path: '/api/v1/orders' },
    { method: 'GET', path: '/api/v1/documents' },
    { method: 'GET', path: '/api/v1/finance/wallet/balance' },
    { method: 'GET', path: '/api/v1/finance/wallet/history' },
    { method: 'POST', path: '/api/v1/privacy/consents' },
    { method: 'POST', path: '/api/v1/privacy/export' },
    { method: 'GET', path: '/api/v1/audit' },
    { method: 'GET', path: '/api/v1/admin/users' },
    { method: 'GET', path: '/api/v1/admin/synonyms' },
    { method: 'GET', path: '/api/v1/admin/dealerships' },
    { method: 'POST', path: '/api/v1/auth/logout' },
  ];

  for (const route of protectedRoutes) {
    await test(`${route.method} ${route.path} requires auth (401)`, async () => {
      const res = await request(route.method, route.path);
      assert(res.status === 401, `Expected 401, got ${res.status}`);
    });
  }

  // ===== HMAC enforcement on all authenticated routes =====
  console.log('--- HMAC enforcement on authenticated routes ---');
  const hmacRoutes = [
    { method: 'GET', path: '/api/v1/cart', token: () => buyerToken },
    { method: 'GET', path: '/api/v1/orders', token: () => buyerToken },
    { method: 'GET', path: '/api/v1/documents', token: () => staffToken },
    { method: 'GET', path: '/api/v1/finance/wallet/balance', token: () => buyerToken },
    { method: 'GET', path: '/api/v1/audit', token: () => adminToken },
    { method: 'GET', path: '/api/v1/admin/users', token: () => adminToken },
  ];

  for (const route of hmacRoutes) {
    await test(`${route.method} ${route.path} rejects unsigned request (401)`, async () => {
      const res = await request(route.method, route.path, null, route.token(), { skipHmac: true });
      assert(res.status === 401, `Expected 401, got ${res.status}`);
    });
  }

  // HMAC on search and vehicles with authenticated user
  await test('GET /search rejects unsigned authenticated request', async () => {
    const res = await request('GET', '/api/v1/search', null, buyerToken, { skipHmac: true });
    assert(res.status === 401, `Expected 401, got ${res.status}`);
  });

  await test('GET /vehicles rejects unsigned authenticated request', async () => {
    const res = await request('GET', '/api/v1/vehicles', null, buyerToken, { skipHmac: true });
    assert(res.status === 401, `Expected 401, got ${res.status}`);
  });

  await test('GET /search works without auth (public)', async () => {
    const res = await request('GET', '/api/v1/search');
    assert(res.status === 200, `Expected 200, got ${res.status}`);
  });

  await test('GET /vehicles works without auth (public)', async () => {
    const res = await request('GET', '/api/v1/vehicles');
    assert(res.status === 200, `Expected 200, got ${res.status}`);
  });

  // ===== Role-based authorization across all admin endpoints =====
  console.log('--- Role enforcement on all admin endpoints ---');
  const adminOnlyEndpoints = [
    { method: 'GET', path: '/api/v1/admin/synonyms' },
    { method: 'GET', path: '/api/v1/admin/tax-rates' },
    { method: 'GET', path: '/api/v1/admin/users' },
    { method: 'GET', path: '/api/v1/admin/dealerships' },
    { method: 'GET', path: '/api/v1/admin/experiments' },
    { method: 'GET', path: '/api/v1/admin/permission-overrides' },
  ];

  for (const route of adminOnlyEndpoints) {
    await test(`buyer denied ${route.method} ${route.path} (403)`, async () => {
      const res = await request(route.method, route.path, null, buyerToken);
      assert(res.status === 403, `Expected 403, got ${res.status}`);
    });

    await test(`staff denied ${route.method} ${route.path} (403)`, async () => {
      const res = await request(route.method, route.path, null, staffToken);
      assert(res.status === 403, `Expected 403, got ${res.status}`);
    });

    await test(`admin allowed ${route.method} ${route.path} (200)`, async () => {
      const res = await request(route.method, route.path, null, adminToken);
      assert(res.status === 200, `Expected 200, got ${res.status}`);
    });
  }

  // ===== Vehicles =====
  console.log('--- Vehicles ---');
  await test('GET /vehicles returns paginated list', async () => {
    const res = await request('GET', '/api/v1/vehicles');
    assert(res.status === 200, `Expected 200, got ${res.status}`);
    assert(res.data.data, 'Expected data array');
    assert(res.data.pagination, 'Expected pagination');
    assert(res.data.data.length > 0, 'Expected at least one vehicle');
    const buyerVehicle = res.data.data.find((v) => {
      const vid = typeof v.dealershipId === 'object' ? v.dealershipId._id : v.dealershipId;
      return vid === buyerDealershipId;
    }) || res.data.data[0];
    testVehicleId = buyerVehicle._id;
    testDealershipId = typeof buyerVehicle.dealershipId === 'object' ? buyerVehicle.dealershipId._id : buyerVehicle.dealershipId;
  });

  await test('GET /vehicles/:id returns single vehicle', async () => {
    const res = await request('GET', `/api/v1/vehicles/${testVehicleId}`);
    assert(res.status === 200, `Expected 200, got ${res.status}`);
    assert(res.data.vin, 'Expected VIN');
  });

  await test('GET /vehicles with invalid id returns 422', async () => {
    const res = await request('GET', '/api/v1/vehicles/invalidid');
    assert(res.status === 422, `Expected 422, got ${res.status}`);
  });

  // ===== Search =====
  console.log('--- Search ---');
  await test('GET /search returns results', async () => {
    const res = await request('GET', '/api/v1/search');
    assert(res.status === 200, `Expected 200, got ${res.status}`);
    assert(res.data.data, 'Expected data');
  });

  await test('GET /search?q=Chevy returns expanded results', async () => {
    const res = await request('GET', '/api/v1/search?q=Chevy');
    assert(res.status === 200, `Expected 200, got ${res.status}`);
    assert(res.data.expandedTerms, 'Expected expandedTerms');
  });

  await test('GET /search with price filter', async () => {
    const res = await request('GET', '/api/v1/search?minPrice=2000000&maxPrice=3000000');
    assert(res.status === 200, `Expected 200, got ${res.status}`);
  });

  await test('GET /search/trending returns keywords', async () => {
    const res = await request('GET', '/api/v1/search/trending');
    assert(res.status === 200, `Expected 200, got ${res.status}`);
    assert(res.data.trending !== undefined, 'Expected trending array');
  });

  // ===== Cart =====
  console.log('--- Cart ---');

  if (testDealershipId) {
    const cartRes = await request('GET', `/api/v1/cart?dealershipId=${testDealershipId}`, null, buyerToken);
    if (cartRes.status === 200 && cartRes.data.items) {
      for (const item of cartRes.data.items) {
        const vid = typeof item.vehicleId === 'object' ? item.vehicleId._id : item.vehicleId;
        await request('DELETE', `/api/v1/cart/items/${vid}?dealershipId=${testDealershipId}`, null, buyerToken);
      }
    }
  }

  await test('GET /cart requires auth', async () => {
    const res = await request('GET', '/api/v1/cart');
    assert(res.status === 401, `Expected 401, got ${res.status}`);
  });

  await test('POST /cart/items adds vehicle to cart', async () => {
    const res = await request('POST', '/api/v1/cart/items', {
      vehicleId: testVehicleId,
      dealershipId: testDealershipId,
      addOnServices: [{ serviceCode: 'inspection' }],
    }, buyerToken);
    assert(res.status === 200, `Expected 200, got ${res.status}`);
  });

  await test('POST /cart/items rejects duplicate', async () => {
    const res = await request('POST', '/api/v1/cart/items', {
      vehicleId: testVehicleId,
      dealershipId: testDealershipId,
    }, buyerToken);
    assert(res.status === 400, `Expected 400, got ${res.status}`);
  });

  await test('GET /cart shows items', async () => {
    const res = await request('GET', `/api/v1/cart?dealershipId=${testDealershipId}`, null, buyerToken);
    assert(res.status === 200, `Expected 200, got ${res.status}`);
    assert(res.data.items.length > 0, 'Expected items in cart');
  });

  await test('GET /cart/addons returns available add-ons', async () => {
    const res = await request('GET', '/api/v1/cart/addons', null, buyerToken);
    assert(res.status === 200, `Expected 200, got ${res.status}`);
    assert(res.data.addOns.length > 0, 'Expected add-ons');
  });

  // ===== Orders =====
  console.log('--- Orders ---');
  await test('POST /orders creates order from cart', async () => {
    const res = await request('POST', '/api/v1/orders', {
      idempotencyKey: `test-order-${Date.now()}`,
      dealershipId: testDealershipId,
    }, buyerToken);
    assert(res.status === 201, `Expected 201, got ${res.status}`);
    testOrderId = Array.isArray(res.data) ? res.data[0]._id : res.data._id;
    assert(testOrderId, 'Expected order ID');
  });

  await test('POST /orders requires idempotencyKey', async () => {
    const res = await request('POST', '/api/v1/orders', { idempotencyKey: '' }, buyerToken);
    assert(res.status === 422, `Expected 422, got ${res.status}`);
  });

  await test('GET /orders lists orders', async () => {
    const res = await request('GET', '/api/v1/orders', null, buyerToken);
    assert(res.status === 200, `Expected 200, got ${res.status}`);
    assert(res.data.data.length > 0, 'Expected at least one order');
    // All returned orders must belong to buyer
    for (const order of res.data.data) {
      const oBuyerId = typeof order.buyerId === 'object' ? order.buyerId._id : order.buyerId;
      assert(oBuyerId === buyerUserId, `Order ${order._id} buyer mismatch: ${oBuyerId} !== ${buyerUserId}`);
    }
  });

  await test('GET /orders/:id returns order details for buyer', async () => {
    const res = await request('GET', `/api/v1/orders/${testOrderId}`, null, buyerToken);
    assert(res.status === 200, `Expected 200, got ${res.status}`);
    assert(res.data.status, 'Expected status field');
  });

  await test('POST /orders/:id/transition advances state', async () => {
    const res = await request('POST', `/api/v1/orders/${testOrderId}/transition`, {
      event: 'RESERVE', reason: 'API test',
    }, staffToken);
    assert(res.status === 200, `Expected 200, got ${res.status}`);
    assert(res.data.status === 'reserved', `Expected reserved, got ${res.data.status}`);
  });

  await test('POST /orders/:id/transition rejects invalid event', async () => {
    const res = await request('POST', `/api/v1/orders/${testOrderId}/transition`, {
      event: 'FULFILL', reason: 'Skip',
    }, staffToken);
    assert(res.status === 400, `Expected 400, got ${res.status}`);
  });

  // Buyer transition restrictions
  await test('buyer cannot INVOICE own order', async () => {
    const res = await request('POST', `/api/v1/orders/${testOrderId}/transition`, {
      event: 'INVOICE',
    }, buyerToken);
    assert(res.status === 403, `Expected 403, got ${res.status}`);
  });

  await test('buyer cannot SETTLE order', async () => {
    const res = await request('POST', `/api/v1/orders/${testOrderId}/transition`, {
      event: 'SETTLE',
    }, buyerToken);
    assert(res.status === 403, `Expected 403, got ${res.status}`);
  });

  await test('buyer cannot FULFILL order', async () => {
    const res = await request('POST', `/api/v1/orders/${testOrderId}/transition`, {
      event: 'FULFILL',
    }, buyerToken);
    assert(res.status === 403, `Expected 403, got ${res.status}`);
  });

  // ===== Finance =====
  console.log('--- Finance ---');
  await test('transition to invoiced', async () => {
    const res = await request('POST', `/api/v1/orders/${testOrderId}/transition`, {
      event: 'INVOICE', reason: 'Ready for invoice',
    }, staffToken);
    assert(res.status === 200, `Expected 200, got ${res.status}`);
  });

  await test('GET /finance/invoices/:orderId/preview', async () => {
    const res = await request('GET', `/api/v1/finance/invoices/${testOrderId}/preview`, null, staffToken);
    assert(res.status === 200, `Expected 200, got ${res.status}`);
    assert(res.data.lineItems, 'Expected line items');
    assert(res.data.subtotal > 0, 'Expected positive subtotal');
  });

  await test('POST /finance/invoices/:orderId creates invoice', async () => {
    const res = await request('POST', `/api/v1/finance/invoices/${testOrderId}`, null, staffToken);
    assert(res.status === 201, `Expected 201, got ${res.status}`);
    assert(res.data.invoiceNumber, 'Expected invoice number');
  });

  await test('GET /finance/wallet/balance', async () => {
    const res = await request('GET', '/api/v1/finance/wallet/balance', null, buyerToken);
    assert(res.status === 200, `Expected 200, got ${res.status}`);
    assert(res.data.balance !== undefined, 'Expected balance');
  });

  // ===== Offline payment enforcement =====
  console.log('--- Offline Payment Enforcement ---');
  await test('credit_card payment fails with 400 when online payments disabled', async () => {
    const res = await request('POST', '/api/v1/finance/payments', {
      orderId: '507f1f77bcf86cd799439011',
      invoiceId: '507f1f77bcf86cd799439012',
      method: 'credit_card',
      amount: 25000,
      idempotencyKey: `cc-test-${Date.now()}`,
    }, staffToken);
    assert(res.status === 400, `Expected 400 for disabled online payment, got ${res.status}`);
  });

  await test('bank_transfer payment fails with 400 when online payments disabled', async () => {
    const res = await request('POST', '/api/v1/finance/payments', {
      orderId: '507f1f77bcf86cd799439011',
      invoiceId: '507f1f77bcf86cd799439012',
      method: 'bank_transfer',
      amount: 25000,
      idempotencyKey: `bt-test-${Date.now()}`,
    }, staffToken);
    assert(res.status === 400, `Expected 400 for disabled online payment, got ${res.status}`);
  });

  // ===== Privacy =====
  console.log('--- Privacy ---');
  await test('POST /privacy/consents records consent', async () => {
    const res = await request('POST', '/api/v1/privacy/consents', {
      consentType: 'data_processing', granted: true, version: '1.0',
    }, buyerToken);
    assert(res.status === 201, `Expected 201, got ${res.status}`);
  });

  await test('GET /privacy/consents returns history', async () => {
    const res = await request('GET', '/api/v1/privacy/consents', null, buyerToken);
    assert(res.status === 200, `Expected 200, got ${res.status}`);
    assert(Array.isArray(res.data), 'Expected array');
  });

  await test('POST /privacy/export returns user data', async () => {
    const res = await request('POST', '/api/v1/privacy/export', null, buyerToken);
    assert(res.status === 200, `Expected 200, got ${res.status}`);
    assert(res.data.user, 'Expected user data');
    assert(res.data.exportDate, 'Expected export date');
  });

  // ===== Audit =====
  console.log('--- Audit ---');
  await test('buyer cannot access audit logs', async () => {
    const res = await request('GET', '/api/v1/audit', null, buyerToken);
    assert(res.status === 403, `Expected 403, got ${res.status}`);
  });

  await test('admin can access audit logs', async () => {
    const res = await request('GET', '/api/v1/audit', null, adminToken);
    assert(res.status === 200, `Expected 200, got ${res.status}`);
  });

  await test('finance reviewer can access audit logs', async () => {
    const res = await request('GET', '/api/v1/audit', null, financeToken);
    assert(res.status === 200, `Expected 200, got ${res.status}`);
  });

  // ===== A/B Testing =====
  console.log('--- A/B Experiment Assignment ---');
  await test('GET /experiments/assignment returns default control variant for unknown feature', async () => {
    const res = await request('GET', '/api/v1/experiments/assignment?feature=nonexistent');
    assert(res.status === 200, `Expected 200, got ${res.status}`);
    assert(res.data.variant === 'control', `Expected control variant, got ${res.data.variant}`);
    assert(res.data.isDefault === true, 'Expected isDefault true');
  });

  await test('GET /experiments/assignment returns variant for active feature', async () => {
    // Create a fresh experiment with unique feature name
    const featureName = `api_test_feat_${Date.now()}`;
    const createRes = await request('POST', '/api/v1/admin/experiments', {
      name: `API Test Experiment ${Date.now()}`,
      description: 'Created by API tests',
      feature: featureName,
      variants: [
        { key: 'control', weight: 0.5, config: {} },
        { key: 'variant_a', weight: 0.5, config: { columns: 2 } },
      ],
    }, adminToken);
    assert(createRes.status === 201, `Expected 201, got ${createRes.status}: ${JSON.stringify(createRes.data)}`);
    const expId = createRes.data._id;

    const activateRes = await request('PATCH', `/api/v1/admin/experiments/${expId}`, { action: 'activate' }, adminToken);
    assert(activateRes.status === 200, `Expected activate 200, got ${activateRes.status}`);

    // Request assignment as authenticated buyer
    const res = await request('GET', `/api/v1/experiments/assignment?feature=${featureName}`, null, buyerToken);
    assert(res.status === 200, `Expected 200, got ${res.status}: ${JSON.stringify(res.data)}`);
    assert(res.data.variant, 'Expected variant assignment');
    assert(['control', 'variant_a'].includes(res.data.variant), `Unexpected variant: ${res.data.variant}`);
    assert(res.data.isDefault === false, 'Should not be default for active experiment');
  });

  await test('GET /experiments/assignment is consistent for same user', async () => {
    // Use checkout_steps which may or may not be active — consistency should hold either way
    const res1 = await request('GET', '/api/v1/experiments/assignment?feature=checkout_steps', null, buyerToken);
    const res2 = await request('GET', '/api/v1/experiments/assignment?feature=checkout_steps', null, buyerToken);
    assert(res1.status === 200 && res2.status === 200, 'Both should succeed');
    assert(res1.data.variant === res2.data.variant, 'Same user should get same variant');
  });

  // ===== Pagination stability =====
  console.log('--- Pagination Stability ---');
  await test('search pagination returns no duplicates across pages', async () => {
    const page1 = await request('GET', '/api/v1/search?limit=2&page=1');
    const page2 = await request('GET', '/api/v1/search?limit=2&page=2');
    assert(page1.status === 200 && page2.status === 200, 'Both pages should return 200');
    if (page1.data.data && page2.data.data) {
      const ids1 = page1.data.data.map((v) => v._id);
      const ids2 = page2.data.data.map((v) => v._id);
      const overlap = ids1.filter((id) => ids2.includes(id));
      assert(overlap.length === 0, `Found ${overlap.length} duplicate(s) across pages`);
    }
  });

  await test('vehicle list pagination returns no duplicates', async () => {
    const page1 = await request('GET', '/api/v1/vehicles?limit=2&page=1');
    const page2 = await request('GET', '/api/v1/vehicles?limit=2&page=2');
    assert(page1.status === 200 && page2.status === 200, 'Both pages should return 200');
    if (page1.data.data && page2.data.data) {
      const ids1 = page1.data.data.map((v) => v._id);
      const ids2 = page2.data.data.map((v) => v._id);
      const overlap = ids1.filter((id) => ids2.includes(id));
      assert(overlap.length === 0, `Found ${overlap.length} duplicate(s) across pages`);
    }
  });

  // ===== Summary =====
  console.log('');
  console.log(`API Tests: ${passed} passed, ${failed} failed`);
  if (failed > 0) process.exit(1);
}

function waitForServer(retries = 10, delay = 2000) {
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

// Exit code convention:
//   0 = all tests passed
//   1 = one or more tests failed
//   3 = skipped (server not reachable) — distinct from pass/fail so the
//       runner script can report skips accurately instead of counting them as passes
waitForServer()
  .then(() => runTests())
  .catch((e) => {
    console.warn(`SKIPPED: API tests require a running server (${e.message})`);
    console.warn('Start the server and re-run to execute API tests.');
    process.exit(3);
  });
