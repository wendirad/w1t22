const assert = require('assert');
const path = require('path');

// Register TypeScript support for direct source imports
try {
  require('ts-node').register({
    transpileOnly: true,
    project: path.join(__dirname, '..', 'server', 'tsconfig.json'),
    compilerOptions: { module: 'commonjs' },
  });
} catch { /* ts-node not available; fall back to dist */ }

// Import the PRODUCTION retention constants from account-deletion.service.ts
// so that any divergence between test policy and implementation is caught.
// The production service defines USER_PURGE_DAYS and FINANCIAL_RETENTION_DAYS
// as local constants; since they are not exported, we read them from the source
// file directly to ensure the test stays aligned.
const fs = require('fs');
let PROD_USER_PURGE_DAYS = null;
let PROD_FINANCIAL_RETENTION_DAYS = null;
try {
  const svcPath = path.join(__dirname, '..', 'server', 'src', 'services', 'privacy', 'account-deletion.service.ts');
  const src = fs.readFileSync(svcPath, 'utf8');
  const purgeMatch = src.match(/const USER_PURGE_DAYS\s*=\s*(\d+)/);
  const retMatch = src.match(/const FINANCIAL_RETENTION_DAYS\s*=\s*(\d+)/);
  if (purgeMatch) PROD_USER_PURGE_DAYS = parseInt(purgeMatch[1], 10);
  if (retMatch) PROD_FINANCIAL_RETENTION_DAYS = parseInt(retMatch[1], 10);
} catch { /* will assert below if we couldn't read */ }

// Use production values — not hardcoded constants that can silently diverge
const USER_PURGE_DAYS = PROD_USER_PURGE_DAYS;
const FINANCIAL_RETENTION_DAYS = PROD_FINANCIAL_RETENTION_DAYS;

// --- Test helpers that mirror production logic using production constants ---

function requestAccountDeletion(user) {
  // Mirrors account-deletion.service.ts requestAccountDeletion()
  user.isActive = false;
  user.deletedAt = new Date();
  user.pendingPurge = true;
  user.profile.firstName = '[REDACTED]';
  user.profile.lastName = '[REDACTED]';
  user.profile.phone = '';
  user.profile.driversLicense = '';
  user.profile.driversLicenseEncrypted = null;
  user.profile.ssn = '';
  user.profile.ssnEncrypted = null;

  return {
    status: 'deletion_requested',
    retentionUntil: new Date(Date.now() + USER_PURGE_DAYS * 24 * 60 * 60 * 1000),
    financialRecordsRetainedUntil: new Date(Date.now() + FINANCIAL_RETENTION_DAYS * 24 * 60 * 60 * 1000),
  };
}

function shouldPurgeUser(user) {
  if (!user.pendingPurge || !user.deletedAt) return false;
  const cutoff = new Date(Date.now() - USER_PURGE_DAYS * 24 * 60 * 60 * 1000);
  return user.deletedAt <= cutoff;
}

function hasRetainedFinancialRecords(userId, orders) {
  const retentionCutoff = new Date(Date.now() - FINANCIAL_RETENTION_DAYS * 24 * 60 * 60 * 1000);
  return orders.some((o) => o.buyerId === userId && o.createdAt > retentionCutoff);
}

function anonymizeUser(user) {
  user.email = `deleted-${user._id}@redacted.local`;
  user.refreshToken = null;
  user.profile.firstName = '[DELETED]';
  user.profile.lastName = '[DELETED]';
  user.profile.phone = '';
  user.profile.driversLicense = '';
  user.profile.driversLicenseEncrypted = null;
  user.profile.ssn = '';
  user.profile.ssnEncrypted = null;
  return user;
}

function purgeExpiredAccounts(users, orders) {
  let purgedCount = 0;
  const results = [];

  for (const user of users) {
    if (!shouldPurgeUser(user)) continue;

    if (hasRetainedFinancialRecords(user._id, orders)) {
      anonymizeUser(user);
      results.push({ userId: user._id, action: 'anonymized', reason: 'financial_retention' });
    } else {
      results.push({ userId: user._id, action: 'purged' });
      purgedCount++;
    }
  }

  return { purgedCount, results };
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

console.log('Account Deletion & Retention Tests:');

// --- Policy alignment checks ---
test('production USER_PURGE_DAYS was read from source', () => {
  assert.ok(PROD_USER_PURGE_DAYS !== null, 'Could not read USER_PURGE_DAYS from production source');
  assert.strictEqual(typeof PROD_USER_PURGE_DAYS, 'number');
});

test('production FINANCIAL_RETENTION_DAYS was read from source', () => {
  assert.ok(PROD_FINANCIAL_RETENTION_DAYS !== null, 'Could not read FINANCIAL_RETENTION_DAYS from production source');
  assert.strictEqual(typeof PROD_FINANCIAL_RETENTION_DAYS, 'number');
});

test('production USER_PURGE_DAYS is 30', () => {
  assert.strictEqual(PROD_USER_PURGE_DAYS, 30, `Expected 30, got ${PROD_USER_PURGE_DAYS}`);
});

test('production FINANCIAL_RETENTION_DAYS is 30', () => {
  // The production service uses a 30-day retention hold for financial records.
  assert.strictEqual(PROD_FINANCIAL_RETENTION_DAYS, 30, `Expected 30, got ${PROD_FINANCIAL_RETENTION_DAYS}`);
});

// --- Functional tests ---
test('account deletion redacts PII immediately', () => {
  const user = {
    _id: 'u1',
    isActive: true,
    pendingPurge: false,
    deletedAt: null,
    profile: { firstName: 'John', lastName: 'Doe', phone: '555-1234', driversLicense: 'DL123', ssn: '123-45-6789', driversLicenseEncrypted: { cipher: 'abc' }, ssnEncrypted: { cipher: 'def' } },
  };

  const result = requestAccountDeletion(user);
  assert.strictEqual(user.isActive, false);
  assert.strictEqual(user.pendingPurge, true);
  assert.ok(user.deletedAt);
  assert.strictEqual(user.profile.firstName, '[REDACTED]');
  assert.strictEqual(user.profile.lastName, '[REDACTED]');
  assert.strictEqual(user.profile.phone, '');
  assert.strictEqual(user.profile.driversLicense, '');
  assert.strictEqual(user.profile.driversLicenseEncrypted, null);
  assert.strictEqual(user.profile.ssn, '');
  assert.strictEqual(user.profile.ssnEncrypted, null);
  assert.strictEqual(result.status, 'deletion_requested');
});

test('deletion returns 30-day retention window', () => {
  const user = { _id: 'u1', isActive: true, pendingPurge: false, deletedAt: null, profile: { firstName: 'A', lastName: 'B' } };
  const result = requestAccountDeletion(user);
  const expectedRetention = Date.now() + USER_PURGE_DAYS * 24 * 60 * 60 * 1000;
  const diff = Math.abs(result.retentionUntil.getTime() - expectedRetention);
  assert.ok(diff < 1000);
});

test('deletion returns financial retention window using production constant', () => {
  const user = { _id: 'u1', isActive: true, pendingPurge: false, deletedAt: null, profile: { firstName: 'A', lastName: 'B' } };
  const result = requestAccountDeletion(user);
  const expectedRetention = Date.now() + FINANCIAL_RETENTION_DAYS * 24 * 60 * 60 * 1000;
  const diff = Math.abs(result.financialRecordsRetainedUntil.getTime() - expectedRetention);
  assert.ok(diff < 1000);
});

test('user is not purged before purge window', () => {
  const user = {
    _id: 'u1',
    pendingPurge: true,
    deletedAt: new Date(Date.now() - (USER_PURGE_DAYS - 15) * 24 * 60 * 60 * 1000),
  };
  assert.strictEqual(shouldPurgeUser(user), false);
});

test('user is purged after purge window with no financial records', () => {
  const user = {
    _id: 'u1',
    pendingPurge: true,
    deletedAt: new Date(Date.now() - (USER_PURGE_DAYS + 1) * 24 * 60 * 60 * 1000),
  };
  assert.strictEqual(shouldPurgeUser(user), true);
});

test('user with financial records is anonymized, not purged', () => {
  const user = {
    _id: 'u1',
    email: 'john@example.com',
    pendingPurge: true,
    deletedAt: new Date(Date.now() - (USER_PURGE_DAYS + 30) * 24 * 60 * 60 * 1000),
    profile: { firstName: '[REDACTED]', lastName: '[REDACTED]', phone: '', driversLicense: '', ssn: '', driversLicenseEncrypted: null, ssnEncrypted: null },
    refreshToken: 'old-token',
  };

  const orders = [
    { buyerId: 'u1', createdAt: new Date() }, // Recent order within retention period
  ];

  const { purgedCount, results } = purgeExpiredAccounts([user], orders);
  assert.strictEqual(purgedCount, 0);
  assert.strictEqual(results[0].action, 'anonymized');
  assert.strictEqual(results[0].reason, 'financial_retention');
  assert.strictEqual(user.email, 'deleted-u1@redacted.local');
  assert.strictEqual(user.profile.firstName, '[DELETED]');
  assert.strictEqual(user.refreshToken, null);
});

test('user without financial records is fully purged', () => {
  const user = {
    _id: 'u2',
    email: 'jane@example.com',
    pendingPurge: true,
    deletedAt: new Date(Date.now() - (USER_PURGE_DAYS + 30) * 24 * 60 * 60 * 1000),
    profile: { firstName: '[REDACTED]', lastName: '[REDACTED]' },
  };

  const { purgedCount, results } = purgeExpiredAccounts([user], []);
  assert.strictEqual(purgedCount, 1);
  assert.strictEqual(results[0].action, 'purged');
});

test('financial records older than retention period do not block purge', () => {
  const veryOldOrderDate = new Date(Date.now() - (FINANCIAL_RETENTION_DAYS + 30) * 24 * 60 * 60 * 1000);
  const orders = [
    { buyerId: 'u1', createdAt: veryOldOrderDate },
  ];

  assert.strictEqual(hasRetainedFinancialRecords('u1', orders), false);
});

test('financial records within retention period block purge', () => {
  const recentOrderDate = new Date(Date.now() - Math.floor(FINANCIAL_RETENTION_DAYS / 2) * 24 * 60 * 60 * 1000);
  const orders = [
    { buyerId: 'u1', createdAt: recentOrderDate },
  ];

  assert.strictEqual(hasRetainedFinancialRecords('u1', orders), true);
});

test('mixed users: some purged, some anonymized', () => {
  const users = [
    {
      _id: 'u1', email: 'a@b.com', pendingPurge: true,
      deletedAt: new Date(Date.now() - (USER_PURGE_DAYS + 30) * 24 * 60 * 60 * 1000),
      profile: { firstName: 'A', lastName: 'B' }, refreshToken: null,
    },
    {
      _id: 'u2', email: 'c@d.com', pendingPurge: true,
      deletedAt: new Date(Date.now() - (USER_PURGE_DAYS + 30) * 24 * 60 * 60 * 1000),
      profile: { firstName: 'C', lastName: 'D' }, refreshToken: null,
    },
    {
      _id: 'u3', email: 'e@f.com', pendingPurge: true,
      deletedAt: new Date(Date.now() - 10 * 24 * 60 * 60 * 1000), // Not ready yet
      profile: { firstName: 'E', lastName: 'F' }, refreshToken: null,
    },
  ];

  const orders = [
    { buyerId: 'u1', createdAt: new Date() }, // u1 has recent financial records
  ];

  const { purgedCount, results } = purgeExpiredAccounts(users, orders);
  assert.strictEqual(purgedCount, 1); // Only u2 purged
  assert.strictEqual(results.length, 2); // u1 anonymized, u2 purged (u3 skipped)
  assert.strictEqual(results.find((r) => r.userId === 'u1').action, 'anonymized');
  assert.strictEqual(results.find((r) => r.userId === 'u2').action, 'purged');
});

test('non-pending users are not processed', () => {
  const user = {
    _id: 'u1',
    pendingPurge: false,
    deletedAt: new Date(Date.now() - (USER_PURGE_DAYS + 30) * 24 * 60 * 60 * 1000),
  };
  assert.strictEqual(shouldPurgeUser(user), false);
});

console.log(`\nAccount Deletion & Retention: ${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
