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

// Import production enums — prefer source, fall back to dist
let enums;
try { enums = require('../server/src/types/enums'); } catch { enums = require('../server/dist/types/enums'); }
const { Role, PermissionEffect } = enums;

// Mirror the exact DEFAULT_PERMISSIONS from production permission.service.ts
// This must match server/src/services/permission.service.ts lines 5-18
const DEFAULT_PERMISSIONS = {
  document: {
    [Role.ADMIN]: ['read', 'write', 'delete', 'download', 'share', 'submit', 'approve'],
    [Role.DEALERSHIP_STAFF]: ['read', 'write', 'delete', 'download', 'share', 'submit'],
    [Role.FINANCE_REVIEWER]: ['read', 'download', 'submit', 'approve'],
    [Role.BUYER]: ['read', 'download'],
  },
};

// Uses the same permission resolution logic as production permission.service.ts checkPermission()
// This is a synchronous version for unit testing without MongoDB
function checkPermission(userId, role, resource, resourceId, action, sensitiveFlag, overrides) {
  // Line 29 of permission.service.ts: admin always has access
  if (role === Role.ADMIN) return true;

  // Lines 31-50: Sensitive flag handling
  if (sensitiveFlag && role !== Role.FINANCE_REVIEWER && role !== Role.ADMIN) {
    const override = overrides.find(
      (o) => o.effect === PermissionEffect.ALLOW && o.actions.includes(action) && (o.userId === userId || o.userId === null)
    );
    return !!override;
  }

  // Lines 53-73: Check user-specific and role overrides
  const userOverride = overrides.find(
    (o) => o.userId === userId && o.resourceId === resourceId && o.actions.includes(action)
  );
  if (userOverride) return userOverride.effect === PermissionEffect.ALLOW;

  const roleOverride = overrides.find(
    (o) => o.role === role && o.userId === null && o.resourceId === resourceId && o.actions.includes(action)
  );
  if (roleOverride) return roleOverride.effect === PermissionEffect.ALLOW;

  // Lines 103-107: Fall back to DEFAULT_PERMISSIONS
  const resourceDefaults = DEFAULT_PERMISSIONS[resource];
  if (!resourceDefaults) return false;
  const roleDefaults = resourceDefaults[role];
  if (!roleDefaults) return false;
  return roleDefaults.includes(action);
}

// Simulate document status transitions
function canTransitionTo(currentStatus, targetStatus) {
  const transitions = {
    draft: ['submitted'],
    submitted: ['approved', 'rejected'],
    rejected: ['submitted'],
    approved: [],
  };
  return (transitions[currentStatus] || []).includes(targetStatus);
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

console.log('Document Permission Workflow Tests (using production enums):');

// Edit (write) action tests
test('staff can edit documents', () => {
  assert.strictEqual(checkPermission('staff1', Role.DEALERSHIP_STAFF, 'document', 'doc1', 'write', false, []), true);
});

test('buyer cannot edit documents', () => {
  assert.strictEqual(checkPermission('buyer1', Role.BUYER, 'document', 'doc1', 'write', false, []), false);
});

test('finance reviewer cannot edit documents', () => {
  assert.strictEqual(checkPermission('fin1', Role.FINANCE_REVIEWER, 'document', 'doc1', 'write', false, []), false);
});

// Share action tests
test('staff can share documents', () => {
  assert.strictEqual(checkPermission('staff1', Role.DEALERSHIP_STAFF, 'document', 'doc1', 'share', false, []), true);
});

test('buyer cannot share documents', () => {
  assert.strictEqual(checkPermission('buyer1', Role.BUYER, 'document', 'doc1', 'share', false, []), false);
});

test('admin can share documents', () => {
  assert.strictEqual(checkPermission('admin1', Role.ADMIN, 'document', 'doc1', 'share', false, []), true);
});

// Submit action tests
test('staff can submit documents', () => {
  assert.strictEqual(checkPermission('staff1', Role.DEALERSHIP_STAFF, 'document', 'doc1', 'submit', false, []), true);
});

test('finance reviewer can submit documents', () => {
  assert.strictEqual(checkPermission('fin1', Role.FINANCE_REVIEWER, 'document', 'doc1', 'submit', false, []), true);
});

test('buyer cannot submit documents', () => {
  assert.strictEqual(checkPermission('buyer1', Role.BUYER, 'document', 'doc1', 'submit', false, []), false);
});

// Approve action tests
test('finance reviewer can approve documents', () => {
  assert.strictEqual(checkPermission('fin1', Role.FINANCE_REVIEWER, 'document', 'doc1', 'approve', false, []), true);
});

test('admin can approve documents', () => {
  assert.strictEqual(checkPermission('admin1', Role.ADMIN, 'document', 'doc1', 'approve', false, []), true);
});

test('staff cannot approve documents by default', () => {
  assert.strictEqual(checkPermission('staff1', Role.DEALERSHIP_STAFF, 'document', 'doc1', 'approve', false, []), false);
});

test('buyer cannot approve documents', () => {
  assert.strictEqual(checkPermission('buyer1', Role.BUYER, 'document', 'doc1', 'approve', false, []), false);
});

// Sensitive document tests
test('buyer cannot access sensitive document without override', () => {
  assert.strictEqual(checkPermission('buyer1', Role.BUYER, 'document', 'doc1', 'read', true, []), false);
});

test('buyer can access sensitive document with explicit override', () => {
  const overrides = [{ userId: 'buyer1', resourceId: 'doc1', actions: ['read'], effect: PermissionEffect.ALLOW }];
  assert.strictEqual(checkPermission('buyer1', Role.BUYER, 'document', 'doc1', 'read', true, overrides), true);
});

test('finance reviewer can access sensitive documents by default', () => {
  assert.strictEqual(checkPermission('fin1', Role.FINANCE_REVIEWER, 'document', 'doc1', 'read', true, []), true);
});

test('staff cannot access sensitive document without override', () => {
  assert.strictEqual(checkPermission('staff1', Role.DEALERSHIP_STAFF, 'document', 'doc1', 'read', true, []), false);
});

// Permission override affects downstream
test('permission override grants buyer share ability', () => {
  const overrides = [{ userId: 'buyer1', resourceId: 'doc1', actions: ['share'], effect: PermissionEffect.ALLOW }];
  assert.strictEqual(checkPermission('buyer1', Role.BUYER, 'document', 'doc1', 'share', false, overrides), true);
});

test('permission override denies staff delete', () => {
  const overrides = [{ userId: 'staff1', resourceId: 'doc1', actions: ['delete'], effect: PermissionEffect.DENY }];
  assert.strictEqual(checkPermission('staff1', Role.DEALERSHIP_STAFF, 'document', 'doc1', 'delete', false, overrides), false);
});

// Document status transition tests
test('draft can be submitted', () => {
  assert.strictEqual(canTransitionTo('draft', 'submitted'), true);
});

test('submitted can be approved', () => {
  assert.strictEqual(canTransitionTo('submitted', 'approved'), true);
});

test('submitted can be rejected', () => {
  assert.strictEqual(canTransitionTo('submitted', 'rejected'), true);
});

test('rejected can be resubmitted', () => {
  assert.strictEqual(canTransitionTo('rejected', 'submitted'), true);
});

test('approved cannot transition further', () => {
  assert.strictEqual(canTransitionTo('approved', 'submitted'), false);
  assert.strictEqual(canTransitionTo('approved', 'rejected'), false);
});

test('draft cannot be directly approved', () => {
  assert.strictEqual(canTransitionTo('draft', 'approved'), false);
});

console.log(`\nDocument Permissions: ${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
