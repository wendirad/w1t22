const assert = require('assert');
const path = require('path');

// Register TypeScript support for direct source imports (no build step required)
try {
  require('ts-node').register({
    transpileOnly: true,
    project: path.join(__dirname, '..', 'server', 'tsconfig.json'),
    compilerOptions: { module: 'commonjs' },
  });
} catch { /* ts-node not available; fall back to dist */ }

let validationModule;
try { validationModule = require('../server/src/lib/validation-schemas'); } catch { validationModule = require('../server/dist/lib/validation-schemas'); }
const {
  registerSchema,
  loginSchema,
  transitionOrderSchema,
  processPaymentSchema,
  createSynonymSchema,
  createPermissionOverrideSchema,
  recordConsentSchema,
  mongoIdParam,
  mergeOrdersSchema,
  addToCartSchema,
} = validationModule;

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

function expectFail(schema, data) {
  const result = schema.safeParse(data);
  assert.strictEqual(result.success, false, 'Expected validation to fail');
}

function expectPass(schema, data) {
  const result = schema.safeParse(data);
  assert.strictEqual(result.success, true, `Expected validation to pass: ${JSON.stringify(result.error?.issues)}`);
}

console.log('Request Validation Tests (using production Zod schemas):');

// Auth - register
test('register: missing email is rejected', () => {
  expectFail(registerSchema, { password: 'longpassword', firstName: 'A', lastName: 'B' });
});

test('register: invalid email is rejected', () => {
  expectFail(registerSchema, { email: 'notanemail', password: 'longpassword', firstName: 'A', lastName: 'B' });
});

test('register: short password is rejected', () => {
  expectFail(registerSchema, { email: 'a@b.com', password: 'short', firstName: 'A', lastName: 'B' });
});

test('register: missing firstName is rejected', () => {
  expectFail(registerSchema, { email: 'a@b.com', password: 'longpassword', lastName: 'B' });
});

test('register: valid data passes', () => {
  expectPass(registerSchema, { email: 'a@b.com', password: 'longpassword', firstName: 'A', lastName: 'B' });
});

test('register: role field is NOT accepted (security: buyer-only)', () => {
  // The schema should strip role since it's not defined
  const result = registerSchema.safeParse({ email: 'a@b.com', password: 'longpassword', firstName: 'A', lastName: 'B', role: 'admin' });
  assert.strictEqual(result.success, true);
  assert.strictEqual(result.data.role, undefined, 'Role should not be accepted in public registration');
});

test('register: dealershipId field IS accepted (buyer dealership association)', () => {
  const result = registerSchema.safeParse({ email: 'a@b.com', password: 'longpassword', firstName: 'A', lastName: 'B', dealershipId: 'abc' });
  assert.strictEqual(result.success, true);
  assert.strictEqual(result.data.dealershipId, 'abc', 'dealershipId should be accepted for buyer dealership association');
});

// Auth - login
test('login: missing email is rejected', () => {
  expectFail(loginSchema, { password: 'test' });
});

test('login: missing password is rejected', () => {
  expectFail(loginSchema, { email: 'a@b.com' });
});

// Order validation
test('transitionOrder: invalid event is rejected', () => {
  expectFail(transitionOrderSchema, { event: 'INVALID_EVENT' });
});

test('transitionOrder: missing event is rejected', () => {
  expectFail(transitionOrderSchema, { reason: 'test' });
});

test('transitionOrder: valid CANCEL passes', () => {
  expectPass(transitionOrderSchema, { event: 'CANCEL', reason: 'test' });
});

// Finance - payment
test('processPayment: missing orderId is rejected', () => {
  expectFail(processPaymentSchema, { invoiceId: 'abc', method: 'cash', amount: 100 });
});

test('processPayment: invalid method is rejected', () => {
  expectFail(processPaymentSchema, { orderId: 'abc', invoiceId: 'def', method: 'bitcoin', amount: 100 });
});

test('processPayment: negative amount is rejected', () => {
  expectFail(processPaymentSchema, { orderId: 'abc', invoiceId: 'def', method: 'cash', amount: -10 });
});

test('processPayment: valid offline payment passes', () => {
  expectPass(processPaymentSchema, { orderId: 'abc', invoiceId: 'def', method: 'cash', amount: 25000, idempotencyKey: 'pay-123' });
});

test('processPayment: online methods accepted at schema level (runtime gated)', () => {
  // Schema allows online methods; runtime adapter check enforces the flag
  expectPass(processPaymentSchema, { orderId: 'abc', invoiceId: 'def', method: 'credit_card', amount: 25000, idempotencyKey: 'pay-456' });
});

test('processPayment: missing idempotencyKey is rejected', () => {
  expectFail(processPaymentSchema, { orderId: 'abc', invoiceId: 'def', method: 'cash', amount: 25000 });
});

// Cart
test('addToCart: missing vehicleId is rejected', () => {
  expectFail(addToCartSchema, {});
});

test('addToCart: valid data passes', () => {
  expectPass(addToCartSchema, { vehicleId: 'abc123', addOnServices: [{ serviceCode: 'inspection' }] });
});

// Admin
test('createSynonym: missing canonical is rejected', () => {
  expectFail(createSynonymSchema, { aliases: ['a'] });
});

test('createSynonym: empty aliases is rejected', () => {
  expectFail(createSynonymSchema, { canonical: 'Test', aliases: [] });
});

// Permission override
test('createPermissionOverride: invalid effect is rejected', () => {
  expectFail(createPermissionOverrideSchema, {
    dealershipId: 'abc', resource: 'document', actions: ['read'], effect: 'maybe',
  });
});

test('createPermissionOverride: valid data passes', () => {
  expectPass(createPermissionOverrideSchema, {
    dealershipId: 'abc', resource: 'document', actions: ['read', 'write'], effect: 'allow',
  });
});

// Privacy
test('recordConsent: non-boolean granted is rejected', () => {
  expectFail(recordConsentSchema, { consentType: 'data', granted: 'yes', version: '1.0' });
});

test('recordConsent: valid data passes', () => {
  expectPass(recordConsentSchema, { consentType: 'data_processing', granted: true, version: '1.0' });
});

// Param validation
test('mongoIdParam: invalid id format is rejected', () => {
  expectFail(mongoIdParam, { id: 'invalidid' });
});

test('mongoIdParam: valid 24-char hex passes', () => {
  expectPass(mongoIdParam, { id: '507f1f77bcf86cd799439011' });
});

// Merge orders
test('mergeOrders: less than 2 orderIds is rejected', () => {
  expectFail(mergeOrdersSchema, { orderIds: ['one'] });
});

test('mergeOrders: valid orderIds passes', () => {
  expectPass(mergeOrdersSchema, { orderIds: ['id1', 'id2'] });
});

console.log(`\nRequest Validation: ${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
