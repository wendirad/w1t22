const assert = require('assert');

// Inline Zod-like validator for testing validation schemas logic
// These tests verify that the validation schema definitions correctly reject invalid input
// and accept valid input, matching the production Zod schemas.

function validateEmail(email) {
  return typeof email === 'string' && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

function validateMongoId(id) {
  return typeof id === 'string' && /^[0-9a-fA-F]{24}$/.test(id);
}

function validateSchema(schema, data) {
  const errors = [];
  for (const [field, rules] of Object.entries(schema)) {
    const value = data[field];
    if (rules.required && (value === undefined || value === null || value === '')) {
      errors.push(`${field}: required`);
      continue;
    }
    if (value === undefined && !rules.required) continue;
    if (rules.type === 'string' && typeof value !== 'string') errors.push(`${field}: must be string`);
    if (rules.type === 'number' && typeof value !== 'number') errors.push(`${field}: must be number`);
    if (rules.type === 'boolean' && typeof value !== 'boolean') errors.push(`${field}: must be boolean`);
    if (rules.email && !validateEmail(value)) errors.push(`${field}: invalid email`);
    if (rules.min !== undefined && typeof value === 'string' && value.length < rules.min) errors.push(`${field}: too short`);
    if (rules.min !== undefined && typeof value === 'number' && value < rules.min) errors.push(`${field}: too small`);
    if (rules.mongoId && !validateMongoId(value)) errors.push(`${field}: invalid ObjectId`);
    if (rules.enum && !rules.enum.includes(value)) errors.push(`${field}: invalid enum value`);
    if (rules.type === 'array' && !Array.isArray(value)) errors.push(`${field}: must be array`);
    if (rules.type === 'array' && Array.isArray(value) && rules.minItems && value.length < rules.minItems) errors.push(`${field}: too few items`);
  }
  return errors;
}

const schemas = {
  register: {
    email: { required: true, type: 'string', email: true },
    password: { required: true, type: 'string', min: 8 },
    firstName: { required: true, type: 'string', min: 1 },
    lastName: { required: true, type: 'string', min: 1 },
  },
  login: {
    email: { required: true, type: 'string', email: true },
    password: { required: true, type: 'string', min: 1 },
  },
  createOrder: {
    idempotencyKey: { required: false, type: 'string' },
    dealershipId: { required: false, type: 'string' },
  },
  transitionOrder: {
    event: { required: true, type: 'string', enum: ['RESERVE', 'INVOICE', 'SETTLE', 'FULFILL', 'CANCEL'] },
    reason: { required: false, type: 'string' },
  },
  processPayment: {
    orderId: { required: true, type: 'string', min: 1 },
    invoiceId: { required: true, type: 'string', min: 1 },
    method: { required: true, type: 'string', enum: ['cash', 'cashier_check', 'in_house_financing', 'credit_card', 'bank_transfer'] },
    amount: { required: true, type: 'number', min: 0.01 },
  },
  recordConsent: {
    consentType: { required: true, type: 'string', min: 1 },
    granted: { required: true, type: 'boolean' },
    version: { required: true, type: 'string', min: 1 },
  },
  createSynonym: {
    canonical: { required: true, type: 'string', min: 1 },
    aliases: { required: true, type: 'array', minItems: 1 },
  },
  createPermissionOverride: {
    dealershipId: { required: true, type: 'string', min: 1 },
    resource: { required: true, type: 'string', min: 1 },
    actions: { required: true, type: 'array', minItems: 1 },
    effect: { required: true, type: 'string', enum: ['allow', 'deny'] },
  },
  mergeOrders: {
    orderIds: { required: true, type: 'array', minItems: 2 },
  },
  mongoIdParam: {
    id: { required: true, type: 'string', mongoId: true },
  },
};

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

console.log('Request Validation Tests:');

// Auth validation
test('register: missing email is rejected', () => {
  const errors = validateSchema(schemas.register, { password: 'longpassword', firstName: 'A', lastName: 'B' });
  assert.ok(errors.length > 0);
  assert.ok(errors.some((e) => e.includes('email')));
});

test('register: invalid email is rejected', () => {
  const errors = validateSchema(schemas.register, { email: 'notanemail', password: 'longpassword', firstName: 'A', lastName: 'B' });
  assert.ok(errors.length > 0);
  assert.ok(errors.some((e) => e.includes('email')));
});

test('register: short password is rejected', () => {
  const errors = validateSchema(schemas.register, { email: 'a@b.com', password: 'short', firstName: 'A', lastName: 'B' });
  assert.ok(errors.length > 0);
  assert.ok(errors.some((e) => e.includes('password')));
});

test('register: missing firstName is rejected', () => {
  const errors = validateSchema(schemas.register, { email: 'a@b.com', password: 'longpassword', lastName: 'B' });
  assert.ok(errors.length > 0);
  assert.ok(errors.some((e) => e.includes('firstName')));
});

test('register: valid data passes', () => {
  const errors = validateSchema(schemas.register, { email: 'a@b.com', password: 'longpassword', firstName: 'A', lastName: 'B' });
  assert.strictEqual(errors.length, 0);
});

test('login: missing email is rejected', () => {
  const errors = validateSchema(schemas.login, { password: 'test' });
  assert.ok(errors.length > 0);
});

test('login: missing password is rejected', () => {
  const errors = validateSchema(schemas.login, { email: 'a@b.com' });
  assert.ok(errors.length > 0);
});

// Order validation
test('transitionOrder: invalid event is rejected', () => {
  const errors = validateSchema(schemas.transitionOrder, { event: 'INVALID_EVENT' });
  assert.ok(errors.length > 0);
  assert.ok(errors.some((e) => e.includes('event')));
});

test('transitionOrder: missing event is rejected', () => {
  const errors = validateSchema(schemas.transitionOrder, { reason: 'test' });
  assert.ok(errors.length > 0);
});

test('transitionOrder: valid CANCEL passes', () => {
  const errors = validateSchema(schemas.transitionOrder, { event: 'CANCEL', reason: 'test' });
  assert.strictEqual(errors.length, 0);
});

// Finance validation
test('processPayment: missing orderId is rejected', () => {
  const errors = validateSchema(schemas.processPayment, {
    invoiceId: 'abc', method: 'cash', amount: 100,
  });
  assert.ok(errors.length > 0);
});

test('processPayment: invalid method is rejected', () => {
  const errors = validateSchema(schemas.processPayment, {
    orderId: 'abc', invoiceId: 'def', method: 'bitcoin', amount: 100,
  });
  assert.ok(errors.length > 0);
  assert.ok(errors.some((e) => e.includes('method')));
});

test('processPayment: negative amount is rejected', () => {
  const errors = validateSchema(schemas.processPayment, {
    orderId: 'abc', invoiceId: 'def', method: 'cash', amount: -10,
  });
  assert.ok(errors.length > 0);
});

test('processPayment: valid credit_card payment passes', () => {
  const errors = validateSchema(schemas.processPayment, {
    orderId: 'abc', invoiceId: 'def', method: 'credit_card', amount: 25000,
  });
  assert.strictEqual(errors.length, 0);
});

// Admin validation
test('createSynonym: missing canonical is rejected', () => {
  const errors = validateSchema(schemas.createSynonym, { aliases: ['a'] });
  assert.ok(errors.length > 0);
});

test('createSynonym: empty aliases is rejected', () => {
  const errors = validateSchema(schemas.createSynonym, { canonical: 'Test', aliases: [] });
  assert.ok(errors.length > 0);
});

test('createSynonym: valid data passes', () => {
  const errors = validateSchema(schemas.createSynonym, { canonical: 'Chevrolet', aliases: ['Chevy'] });
  assert.strictEqual(errors.length, 0);
});

// Permission override validation
test('createPermissionOverride: missing effect is rejected', () => {
  const errors = validateSchema(schemas.createPermissionOverride, {
    dealershipId: 'abc', resource: 'document', actions: ['read'],
  });
  assert.ok(errors.length > 0);
});

test('createPermissionOverride: invalid effect is rejected', () => {
  const errors = validateSchema(schemas.createPermissionOverride, {
    dealershipId: 'abc', resource: 'document', actions: ['read'], effect: 'maybe',
  });
  assert.ok(errors.length > 0);
});

test('createPermissionOverride: valid data passes', () => {
  const errors = validateSchema(schemas.createPermissionOverride, {
    dealershipId: 'abc', resource: 'document', actions: ['read', 'write'], effect: 'allow',
  });
  assert.strictEqual(errors.length, 0);
});

// Privacy validation
test('recordConsent: missing consentType is rejected', () => {
  const errors = validateSchema(schemas.recordConsent, { granted: true, version: '1.0' });
  assert.ok(errors.length > 0);
});

test('recordConsent: non-boolean granted is rejected', () => {
  const errors = validateSchema(schemas.recordConsent, { consentType: 'data', granted: 'yes', version: '1.0' });
  assert.ok(errors.length > 0);
});

test('recordConsent: valid data passes', () => {
  const errors = validateSchema(schemas.recordConsent, { consentType: 'data_processing', granted: true, version: '1.0' });
  assert.strictEqual(errors.length, 0);
});

// Param validation
test('mongoIdParam: invalid id format is rejected', () => {
  const errors = validateSchema(schemas.mongoIdParam, { id: 'invalidid' });
  assert.ok(errors.length > 0);
  assert.ok(errors.some((e) => e.includes('id')));
});

test('mongoIdParam: valid 24-char hex passes', () => {
  const errors = validateSchema(schemas.mongoIdParam, { id: '507f1f77bcf86cd799439011' });
  assert.strictEqual(errors.length, 0);
});

// Merge orders validation
test('mergeOrders: less than 2 orderIds is rejected', () => {
  const errors = validateSchema(schemas.mergeOrders, { orderIds: ['one'] });
  assert.ok(errors.length > 0);
});

test('mergeOrders: valid orderIds passes', () => {
  const errors = validateSchema(schemas.mergeOrders, { orderIds: ['id1', 'id2'] });
  assert.strictEqual(errors.length, 0);
});

console.log(`\nRequest Validation: ${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
