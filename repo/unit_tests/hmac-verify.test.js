const assert = require('assert');
const { generateHmac, verifyHmac } = require('../server/dist/lib/crypto');

const HMAC_SECRET = 'test-hmac-secret-key';
const WINDOW_SECONDS = 300;

// Simulate nonce store (production uses Redis)
class NonceStore {
  constructor() { this.seen = new Set(); }
  has(key) { return this.seen.has(key); }
  add(key) { this.seen.add(key); }
}

// Uses production verifyHmac for actual signature verification
function simulateHmacVerify(headers, method, path, body, secret, windowSeconds, nonceStore) {
  const signature = headers['x-hmac-signature'];
  const timestamp = headers['x-timestamp'];

  if (!signature || !timestamp) return { ok: false, code: 401, msg: 'Missing HMAC signature or timestamp' };

  // Input guard: signature must be valid 64-char hex
  if (!/^[0-9a-fA-F]{64}$/.test(signature)) return { ok: false, code: 401, msg: 'Invalid HMAC signature format' };

  const requestTime = new Date(timestamp).getTime();
  if (isNaN(requestTime)) return { ok: false, code: 401, msg: 'Invalid timestamp format' };

  const now = Date.now();
  const drift = Math.abs(now - requestTime) / 1000;
  if (drift > windowSeconds) return { ok: false, code: 401, msg: 'Request timestamp outside acceptable window' };

  const valid = verifyHmac(signature, method, path, body, timestamp, secret);
  if (!valid) return { ok: false, code: 401, msg: 'Invalid HMAC signature' };

  const nonceKey = `hmac:nonce:${signature}`;
  if (nonceStore.has(nonceKey)) return { ok: false, code: 401, msg: 'Replay detected' };
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

console.log('HMAC Verification Tests (using production crypto module):');

test('valid signed request succeeds', () => {
  const nonceStore = new NonceStore();
  const timestamp = new Date().toISOString();
  const body = '{"idempotencyKey":"test"}';
  const signature = generateHmac('POST', '/api/v1/orders', body, timestamp, HMAC_SECRET);
  const result = simulateHmacVerify(
    { 'x-hmac-signature': signature, 'x-timestamp': timestamp },
    'POST', '/api/v1/orders', body, HMAC_SECRET, WINDOW_SECONDS, nonceStore
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
});

test('missing timestamp is rejected with 401', () => {
  const nonceStore = new NonceStore();
  const result = simulateHmacVerify(
    { 'x-hmac-signature': 'a'.repeat(64) },
    'GET', '/api/v1/cart', '', HMAC_SECRET, WINDOW_SECONDS, nonceStore
  );
  assert.strictEqual(result.ok, false);
  assert.strictEqual(result.code, 401);
});

test('malformed signature (non-hex) returns 401 not 500', () => {
  const nonceStore = new NonceStore();
  const result = simulateHmacVerify(
    { 'x-hmac-signature': 'not-valid-hex!@#$', 'x-timestamp': new Date().toISOString() },
    'GET', '/api/v1/cart', '', HMAC_SECRET, WINDOW_SECONDS, nonceStore
  );
  assert.strictEqual(result.ok, false);
  assert.strictEqual(result.code, 401);
});

test('malformed signature (wrong length) returns 401 not 500', () => {
  const nonceStore = new NonceStore();
  const result = simulateHmacVerify(
    { 'x-hmac-signature': 'abcdef', 'x-timestamp': new Date().toISOString() },
    'GET', '/api/v1/cart', '', HMAC_SECRET, WINDOW_SECONDS, nonceStore
  );
  assert.strictEqual(result.ok, false);
  assert.strictEqual(result.code, 401);
});

test('invalid signature is rejected with 401', () => {
  const nonceStore = new NonceStore();
  const timestamp = new Date().toISOString();
  const wrongSignature = generateHmac('POST', '/api/v1/orders', '{}', timestamp, 'wrong-secret');
  const result = simulateHmacVerify(
    { 'x-hmac-signature': wrongSignature, 'x-timestamp': timestamp },
    'POST', '/api/v1/orders', '{}', HMAC_SECRET, WINDOW_SECONDS, nonceStore
  );
  assert.strictEqual(result.ok, false);
  assert.strictEqual(result.code, 401);
});

test('expired timestamp is rejected with 401', () => {
  const nonceStore = new NonceStore();
  const expired = new Date(Date.now() - 600 * 1000).toISOString();
  const signature = generateHmac('GET', '/api/v1/cart', '', expired, HMAC_SECRET);
  const result = simulateHmacVerify(
    { 'x-hmac-signature': signature, 'x-timestamp': expired },
    'GET', '/api/v1/cart', '', HMAC_SECRET, WINDOW_SECONDS, nonceStore
  );
  assert.strictEqual(result.ok, false);
  assert.strictEqual(result.code, 401);
});

test('replay with identical signature is rejected with 401', () => {
  const nonceStore = new NonceStore();
  const timestamp = new Date().toISOString();
  const body = '{"idempotencyKey":"dup"}';
  const signature = generateHmac('POST', '/api/v1/orders', body, timestamp, HMAC_SECRET);
  const headers = { 'x-hmac-signature': signature, 'x-timestamp': timestamp };

  const first = simulateHmacVerify(headers, 'POST', '/api/v1/orders', body, HMAC_SECRET, WINDOW_SECONDS, nonceStore);
  assert.strictEqual(first.ok, true);

  const second = simulateHmacVerify(headers, 'POST', '/api/v1/orders', body, HMAC_SECRET, WINDOW_SECONDS, nonceStore);
  assert.strictEqual(second.ok, false);
  assert.strictEqual(second.code, 401);
});

test('timestamp within window is accepted', () => {
  const nonceStore = new NonceStore();
  const nearExpiry = new Date(Date.now() - 250 * 1000).toISOString();
  const signature = generateHmac('GET', '/api/v1/cart', '', nearExpiry, HMAC_SECRET);
  const result = simulateHmacVerify(
    { 'x-hmac-signature': signature, 'x-timestamp': nearExpiry },
    'GET', '/api/v1/cart', '', HMAC_SECRET, WINDOW_SECONDS, nonceStore
  );
  assert.strictEqual(result.ok, true);
});

test('invalid timestamp format returns 401', () => {
  const nonceStore = new NonceStore();
  const result = simulateHmacVerify(
    { 'x-hmac-signature': 'a'.repeat(64), 'x-timestamp': 'not-a-date' },
    'GET', '/api/v1/cart', '', HMAC_SECRET, WINDOW_SECONDS, nonceStore
  );
  assert.strictEqual(result.ok, false);
  assert.strictEqual(result.code, 401);
});

console.log(`\nHMAC Verification: ${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
