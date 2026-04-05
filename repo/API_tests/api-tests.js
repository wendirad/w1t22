const http = require('http');

const BASE_URL = process.env.API_URL || 'http://localhost:5000';
let passed = 0;
let failed = 0;
let adminToken = '';
let staffToken = '';
let buyerToken = '';
let financeToken = '';
let testDealershipId = '';
let testVehicleId = '';
let testOrderId = '';

function request(method, path, body, token) {
  return new Promise((resolve, reject) => {
    const url = new URL(path, BASE_URL);
    const options = {
      hostname: url.hostname,
      port: url.port,
      path: url.pathname + url.search,
      method,
      headers: {
        'Content-Type': 'application/json',
        'X-Timestamp': new Date().toISOString(),
      },
    };

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
      email: 'admin@motorlot.com', password: 'admin123',
    });
    assert(res.status === 200, `Expected 200, got ${res.status}`);
    assert(res.data.accessToken, 'Expected access token');
    adminToken = res.data.accessToken;
    assert(res.data.user.role === 'admin', 'Expected admin role');
  });

  await test('POST /auth/login with staff', async () => {
    const res = await request('POST', '/api/v1/auth/login', {
      email: 'staff@motorlot.com', password: 'staff123',
    });
    assert(res.status === 200, `Expected 200, got ${res.status}`);
    staffToken = res.data.accessToken;
  });

  await test('POST /auth/login with buyer', async () => {
    const res = await request('POST', '/api/v1/auth/login', {
      email: 'buyer@motorlot.com', password: 'buyer123',
    });
    assert(res.status === 200, `Expected 200, got ${res.status}`);
    buyerToken = res.data.accessToken;
  });

  await test('POST /auth/login with finance', async () => {
    const res = await request('POST', '/api/v1/auth/login', {
      email: 'finance@motorlot.com', password: 'finance123',
    });
    assert(res.status === 200, `Expected 200, got ${res.status}`);
    financeToken = res.data.accessToken;
  });

  await test('POST /auth/login with wrong password returns 401', async () => {
    const res = await request('POST', '/api/v1/auth/login', {
      email: 'admin@motorlot.com', password: 'wrongpass',
    });
    assert(res.status === 401, `Expected 401, got ${res.status}`);
    assert(res.data.code === 401, 'Expected error code 401');
  });

  await test('GET /auth/me requires authentication', async () => {
    const res = await request('GET', '/api/v1/auth/me');
    assert(res.status === 401, `Expected 401, got ${res.status}`);
  });

  await test('GET /auth/me returns user profile', async () => {
    const res = await request('GET', '/api/v1/auth/me', null, adminToken);
    assert(res.status === 200, `Expected 200, got ${res.status}`);
    assert(res.data.email === 'admin@motorlot.com', 'Expected admin email');
  });

  await test('POST /auth/register creates new user', async () => {
    const res = await request('POST', '/api/v1/auth/register', {
      email: `test-${Date.now()}@motorlot.com`, password: 'test123',
      firstName: 'Test', lastName: 'User',
    });
    assert(res.status === 201, `Expected 201, got ${res.status}`);
    assert(res.data.accessToken, 'Expected access token');
  });

  await test('POST /auth/register rejects duplicate email', async () => {
    const res = await request('POST', '/api/v1/auth/register', {
      email: 'admin@motorlot.com', password: 'test123',
      firstName: 'Dup', lastName: 'User',
    });
    assert(res.status === 409, `Expected 409, got ${res.status}`);
  });

  // ===== Vehicles =====
  console.log('--- Vehicles ---');
  await test('GET /vehicles returns paginated list', async () => {
    const res = await request('GET', '/api/v1/vehicles');
    assert(res.status === 200, `Expected 200, got ${res.status}`);
    assert(res.data.data, 'Expected data array');
    assert(res.data.pagination, 'Expected pagination');
    assert(res.data.data.length > 0, 'Expected at least one vehicle');
    testVehicleId = res.data.data[0]._id;
    testDealershipId = res.data.data[0].dealershipId;
  });

  await test('GET /vehicles/:id returns single vehicle', async () => {
    const res = await request('GET', `/api/v1/vehicles/${testVehicleId}`);
    assert(res.status === 200, `Expected 200, got ${res.status}`);
    assert(res.data.vin, 'Expected VIN');
  });

  await test('GET /vehicles with invalid id returns 400', async () => {
    const res = await request('GET', '/api/v1/vehicles/invalidid');
    assert(res.status === 400, `Expected 400, got ${res.status}`);
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

  await test('GET /orders lists orders', async () => {
    const res = await request('GET', '/api/v1/orders', null, buyerToken);
    assert(res.status === 200, `Expected 200, got ${res.status}`);
    assert(res.data.data.length > 0, 'Expected at least one order');
  });

  await test('GET /orders/:id returns order details', async () => {
    const res = await request('GET', `/api/v1/orders/${testOrderId}`, null, buyerToken);
    assert(res.status === 200, `Expected 200, got ${res.status}`);
    assert(res.data.status === 'created', 'Expected created status');
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

  // ===== Admin (Permission checks) =====
  console.log('--- Admin Permissions ---');
  await test('buyer cannot access admin synonyms create', async () => {
    const res = await request('POST', '/api/v1/admin/synonyms', {
      canonical: 'Test', aliases: ['T'], field: 'make',
    }, buyerToken);
    assert(res.status === 403, `Expected 403, got ${res.status}`);
  });

  await test('admin can list synonyms', async () => {
    const res = await request('GET', '/api/v1/admin/synonyms', null, adminToken);
    assert(res.status === 200, `Expected 200, got ${res.status}`);
    assert(Array.isArray(res.data), 'Expected array');
  });

  await test('admin can list tax rates', async () => {
    const res = await request('GET', '/api/v1/admin/tax-rates', null, adminToken);
    assert(res.status === 200, `Expected 200, got ${res.status}`);
  });

  await test('admin can list users', async () => {
    const res = await request('GET', '/api/v1/admin/users', null, adminToken);
    assert(res.status === 200, `Expected 200, got ${res.status}`);
  });

  await test('buyer cannot list users', async () => {
    const res = await request('GET', '/api/v1/admin/users', null, buyerToken);
    assert(res.status === 403, `Expected 403, got ${res.status}`);
  });

  await test('admin can list dealerships', async () => {
    const res = await request('GET', '/api/v1/admin/dealerships', null, adminToken);
    assert(res.status === 200, `Expected 200, got ${res.status}`);
    assert(res.data.length >= 2, 'Expected at least 2 dealerships');
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

  // ===== Summary =====
  console.log('');
  console.log(`API Tests: ${passed} passed, ${failed} failed`);
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
