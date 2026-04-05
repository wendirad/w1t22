const assert = require('assert');
const crypto = require('crypto');

const HMAC_SECRET = 'test-hmac-secret-key';
const WINDOW_SECONDS = 300;

function generateHmac(method, path, body, timestamp, secret) {
  const payload = `${method}\n${path}\n${body}\n${timestamp}`;
  return crypto.createHmac('sha256', secret).update(payload).digest('hex');
}

function verifyHmac(signature, method, path, body, timestamp, secret) {
  const expected = generateHmac(method, path, body, timestamp, secret);
  return crypto.timingSafeEqual(
    Buffer.from(signature, 'hex'),
    Buffer.from(expected, 'hex')
  );
}

// Simulate anti-replay nonce store
class NonceStore {
  constructor() { this.seen = new Set(); }
  has(key) { return this.seen.has(key); }
  add(key) { this.seen.add(key); }
}

function simulateHmacVerify(headers, method, path, body, secret, windowSeconds, nonceStore) {
  const signature = headers['x-hmac-signature'];
  const timestamp = headers['x-timestamp'];

  if (!signature || !timestamp) return { ok: false, code: 401, msg: 'Missing HMAC signature or timestamp' };

  const now = Date.now();
  const requestTime = new Date(timestamp).getTime();
  const drift = Math.abs(now - requestTime) / 1000;
  if (drift > windowSeconds) return { ok: false, code: 401, msg: 'Request timestamp outside acceptable window' };

  let valid;
  try {
    valid = verifyHmac(signature, method, path, body, timestamp, secret);
  } catch {
    return { ok: false, code: 401, msg: 'Invalid HMAC signature' };
  }
  if (!valid) return { ok: false, code: 401, msg: 'Invalid HMAC signature' };

  const nonceKey = `hmac:nonce:${signature}`;
  if (nonceStore.has(nonceKey)) return { ok: false, code: 409, msg: 'Replay detected' };
  nonceStore.add(nonceKey);

  return { ok: true };
}

let passed = 0;
let failed = 0;

function test(name, fn) {
  try {
    fn();
    console.log(`  PASS: ${name}`);
    passed++;
  } catch (e) {
    console.log(`  FAIL: ${name} - ${e.message}`);
    failed++;
  }
}

console.log('HMAC Verification Tests:');

test('valid signed request succeeds', () => {
  const nonceStore = new NonceStore();
  const timestamp = new Date().toISOString();
  const method = 'POST';
  const path = '/api/v1/orders';
  const body = '{"idempotencyKey":"test"}';
  const signature = generateHmac(method, path, body, timestamp, HMAC_SECRET);

  const result = simulateHmacVerify(
    { 'x-hmac-signature': signature, 'x-timestamp': timestamp },
    method, path, body, HMAC_SECRET, WINDOW_SECONDS, nonceStore
  );
  assert.strictEqual(result.ok, true);
});

test('missing signature is rejected with 401', () => {
  const nonceStore = new NonceStore();
  const result = simulateHmacVerify(
    { 'x-timestamp': new Date().toISOString() },
    'GET', '/api/v1/cart', '', HMAC_SECRET, WINDOW_SECONDS, nonceStore
  );
  assert.strictEqual(result.ok, false);
  assert.strictEqual(result.code, 401);
  assert.ok(result.msg.includes('Missing'));
});

test('missing timestamp is rejected with 401', () => {
  const nonceStore = new NonceStore();
  const result = simulateHmacVerify(
    { 'x-hmac-signature': 'abc123' },
    'GET', '/api/v1/cart', '', HMAC_SECRET, WINDOW_SECONDS, nonceStore
  );
  assert.strictEqual(result.ok, false);
  assert.strictEqual(result.code, 401);
});

test('invalid signature is rejected with 401', () => {
  const nonceStore = new NonceStore();
  const timestamp = new Date().toISOString();
  // Generate a valid-length hex string that is the wrong signature
  const wrongSignature = crypto.createHmac('sha256', 'wrong-secret')
    .update(`POST\n/api/v1/orders\n{}\n${timestamp}`).digest('hex');

  const result = simulateHmacVerify(
    { 'x-hmac-signature': wrongSignature, 'x-timestamp': timestamp },
    'POST', '/api/v1/orders', '{}', HMAC_SECRET, WINDOW_SECONDS, nonceStore
  );
  assert.strictEqual(result.ok, false);
  assert.strictEqual(result.code, 401);
  assert.ok(result.msg.includes('Invalid'));
});

test('expired timestamp is rejected with 401', () => {
  const nonceStore = new NonceStore();
  const expired = new Date(Date.now() - 600 * 1000).toISOString();
  const method = 'GET';
  const path = '/api/v1/cart';
  const body = '';
  const signature = generateHmac(method, path, body, expired, HMAC_SECRET);

  const result = simulateHmacVerify(
    { 'x-hmac-signature': signature, 'x-timestamp': expired },
    method, path, body, HMAC_SECRET, WINDOW_SECONDS, nonceStore
  );
  assert.strictEqual(result.ok, false);
  assert.strictEqual(result.code, 401);
  assert.ok(result.msg.includes('window'));
});

test('replay with identical signature/timestamp is rejected with 409', () => {
  const nonceStore = new NonceStore();
  const timestamp = new Date().toISOString();
  const method = 'POST';
  const path = '/api/v1/orders';
  const body = '{"idempotencyKey":"dup"}';
  const signature = generateHmac(method, path, body, timestamp, HMAC_SECRET);
  const headers = { 'x-hmac-signature': signature, 'x-timestamp': timestamp };

  const first = simulateHmacVerify(headers, method, path, body, HMAC_SECRET, WINDOW_SECONDS, nonceStore);
  assert.strictEqual(first.ok, true);

  const second = simulateHmacVerify(headers, method, path, body, HMAC_SECRET, WINDOW_SECONDS, nonceStore);
  assert.strictEqual(second.ok, false);
  assert.strictEqual(second.code, 409);
  assert.ok(second.msg.includes('Replay'));
});

test('different body produces different signature', () => {
  const timestamp = new Date().toISOString();
  const sig1 = generateHmac('POST', '/api/v1/orders', '{"a":1}', timestamp, HMAC_SECRET);
  const sig2 = generateHmac('POST', '/api/v1/orders', '{"a":2}', timestamp, HMAC_SECRET);
  assert.notStrictEqual(sig1, sig2);
});

test('different method produces different signature', () => {
  const timestamp = new Date().toISOString();
  const sig1 = generateHmac('GET', '/api/v1/orders', '', timestamp, HMAC_SECRET);
  const sig2 = generateHmac('POST', '/api/v1/orders', '', timestamp, HMAC_SECRET);
  assert.notStrictEqual(sig1, sig2);
});

test('different path produces different signature', () => {
  const timestamp = new Date().toISOString();
  const sig1 = generateHmac('GET', '/api/v1/orders', '', timestamp, HMAC_SECRET);
  const sig2 = generateHmac('GET', '/api/v1/cart', '', timestamp, HMAC_SECRET);
  assert.notStrictEqual(sig1, sig2);
});

test('timestamp within window is accepted', () => {
  const nonceStore = new NonceStore();
  const nearExpiry = new Date(Date.now() - 250 * 1000).toISOString();
  const method = 'GET';
  const path = '/api/v1/cart';
  const body = '';
  const signature = generateHmac(method, path, body, nearExpiry, HMAC_SECRET);

  const result = simulateHmacVerify(
    { 'x-hmac-signature': signature, 'x-timestamp': nearExpiry },
    method, path, body, HMAC_SECRET, WINDOW_SECONDS, nonceStore
  );
  assert.strictEqual(result.ok, true);
});

console.log(`\nHMAC Verification: ${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
