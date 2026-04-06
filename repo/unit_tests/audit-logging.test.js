const assert = require('assert');
const { sanitizeForAudit } = require('../server/src/lib/logger');

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

console.log('Audit Logging & Sanitization Tests (using production sanitizer):');

// Sanitizer tests — sensitive data must never appear in audit logs
test('sanitizer redacts SSN from audit data', () => {
  const data = { userId: 'u1', profile: { firstName: 'John', ssn: '123-45-6789' } };
  const result = sanitizeForAudit(data);
  assert.strictEqual(result.profile.ssn, '[REDACTED]');
  assert.strictEqual(result.profile.firstName, 'John');
});

test('sanitizer redacts driversLicense from audit data', () => {
  const data = { driversLicense: 'DL-12345678' };
  const result = sanitizeForAudit(data);
  assert.strictEqual(result.driversLicense, '[REDACTED]');
});

test('sanitizer redacts encrypted field metadata', () => {
  const data = {
    profile: {
      ssnEncrypted: { ciphertext: 'abc', iv: 'def', tag: 'ghi', keyVersion: 'v1' },
      driversLicenseEncrypted: { ciphertext: 'xyz' },
    },
  };
  const result = sanitizeForAudit(data);
  assert.strictEqual(result.profile.ssnEncrypted, '[REDACTED]');
  assert.strictEqual(result.profile.driversLicenseEncrypted, '[REDACTED]');
});

test('sanitizer redacts password and tokens', () => {
  const data = { password: 'secret123', refreshToken: 'tok-abc', accessToken: 'tok-def' };
  const result = sanitizeForAudit(data);
  assert.strictEqual(result.password, '[REDACTED]');
  assert.strictEqual(result.refreshToken, '[REDACTED]');
  assert.strictEqual(result.accessToken, '[REDACTED]');
});

test('sanitizer preserves non-sensitive fields', () => {
  const data = { email: 'user@test.com', role: 'buyer', status: 'active' };
  const result = sanitizeForAudit(data);
  assert.strictEqual(result.email, 'user@test.com');
  assert.strictEqual(result.role, 'buyer');
  assert.strictEqual(result.status, 'active');
});

test('sanitizer handles null input', () => {
  assert.strictEqual(sanitizeForAudit(null), null);
  assert.strictEqual(sanitizeForAudit(undefined), null);
});

test('sanitizer handles nested objects', () => {
  const data = {
    before: { profile: { ssn: '111-22-3333', firstName: 'Jane' } },
    after: { profile: { ssn: '444-55-6666', firstName: 'Jane' } },
  };
  const result = sanitizeForAudit(data);
  assert.strictEqual(result.before.profile.ssn, '[REDACTED]');
  assert.strictEqual(result.after.profile.ssn, '[REDACTED]');
  assert.strictEqual(result.before.profile.firstName, 'Jane');
});

test('audit record for profile update does not leak PII', () => {
  // Simulate what auth.controller does: audit before/after profile update
  const before = { profile: { firstName: 'John', lastName: 'Doe', ssn: '123-45-6789', driversLicense: 'DL-999' } };
  const after = { profile: { firstName: 'John', lastName: 'Smith', ssn: '123-45-6789', driversLicense: 'DL-999' } };

  const sanitizedBefore = sanitizeForAudit(before);
  const sanitizedAfter = sanitizeForAudit(after);

  assert.strictEqual(sanitizedBefore.profile.ssn, '[REDACTED]');
  assert.strictEqual(sanitizedBefore.profile.driversLicense, '[REDACTED]');
  assert.strictEqual(sanitizedAfter.profile.ssn, '[REDACTED]');
  assert.strictEqual(sanitizedAfter.profile.driversLicense, '[REDACTED]');
  // Non-sensitive data preserved
  assert.strictEqual(sanitizedBefore.profile.firstName, 'John');
  assert.strictEqual(sanitizedAfter.profile.lastName, 'Smith');
});

test('passwordHash is redacted', () => {
  const data = { email: 'a@b.com', passwordHash: '$2a$12$abc...' };
  const result = sanitizeForAudit(data);
  assert.strictEqual(result.passwordHash, '[REDACTED]');
});

test('creditCard field is redacted', () => {
  const data = { creditCard: '4111-1111-1111-1111', amount: 5000 };
  const result = sanitizeForAudit(data);
  assert.strictEqual(result.creditCard, '[REDACTED]');
  assert.strictEqual(result.amount, 5000);
});

test('bankAccount and routingNumber are redacted', () => {
  const data = { bankAccount: '123456789', routingNumber: '021000021' };
  const result = sanitizeForAudit(data);
  assert.strictEqual(result.bankAccount, '[REDACTED]');
  assert.strictEqual(result.routingNumber, '[REDACTED]');
});

test('taxId is redacted', () => {
  const data = { taxId: '12-3456789', businessName: 'Acme Motors' };
  const result = sanitizeForAudit(data);
  assert.strictEqual(result.taxId, '[REDACTED]');
  assert.strictEqual(result.businessName, 'Acme Motors');
});

test('encryption keys and secrets are redacted', () => {
  const data = { masterEncryptionKey: 'abcdef0123456789', hmacSecret: 'secret123', jwtSecret: 'jwt456' };
  const result = sanitizeForAudit(data);
  assert.strictEqual(result.masterEncryptionKey, '[REDACTED]');
  assert.strictEqual(result.hmacSecret, '[REDACTED]');
  assert.strictEqual(result.jwtSecret, '[REDACTED]');
});

console.log(`\nAudit Logging: ${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
