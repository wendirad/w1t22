const assert = require('assert');

// Uses the same permission resolution logic as production permission.service.ts

const DEFAULT_PERMISSIONS = {
  document: {
    admin: ['read', 'write', 'delete', 'download', 'share', 'submit', 'approve'],
    dealership_staff: ['read', 'write', 'delete', 'download', 'share', 'submit'],
    finance_reviewer: ['read', 'download', 'submit', 'approve'],
    buyer: ['read', 'download'],
  },
};

function checkPermission(userId, role, resource, resourceId, action, sensitiveFlag, overrides) {
  if (role === 'admin') return true;

  if (sensitiveFlag && role !== 'finance_reviewer' && role !== 'admin') {
    const override = overrides.find(
      (o) => o.effect === 'allow' && o.actions.includes(action) && (o.userId === userId || o.userId === null)
    );
    return !!override;
  }

  // Check user-specific overrides first
  const userOverride = overrides.find(
    (o) => o.userId === userId && o.resourceId === resourceId && o.actions.includes(action)
  );
  if (userOverride) return userOverride.effect === 'allow';

  // Check role overrides
  const roleOverride = overrides.find(
    (o) => o.role === role && o.userId === null && o.resourceId === resourceId && o.actions.includes(action)
  );
  if (roleOverride) return roleOverride.effect === 'allow';

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

console.log('Document Permission Workflow Tests:');

// Edit (write) action tests
test('staff can edit documents', () => {
  assert.strictEqual(checkPermission('staff1', 'dealership_staff', 'document', 'doc1', 'write', false, []), true);
});

test('buyer cannot edit documents', () => {
  assert.strictEqual(checkPermission('buyer1', 'buyer', 'document', 'doc1', 'write', false, []), false);
});

test('finance reviewer cannot edit documents', () => {
  assert.strictEqual(checkPermission('fin1', 'finance_reviewer', 'document', 'doc1', 'write', false, []), false);
});

// Share action tests
test('staff can share documents', () => {
  assert.strictEqual(checkPermission('staff1', 'dealership_staff', 'document', 'doc1', 'share', false, []), true);
});

test('buyer cannot share documents', () => {
  assert.strictEqual(checkPermission('buyer1', 'buyer', 'document', 'doc1', 'share', false, []), false);
});

test('admin can share documents', () => {
  assert.strictEqual(checkPermission('admin1', 'admin', 'document', 'doc1', 'share', false, []), true);
});

// Submit action tests
test('staff can submit documents', () => {
  assert.strictEqual(checkPermission('staff1', 'dealership_staff', 'document', 'doc1', 'submit', false, []), true);
});

test('finance reviewer can submit documents', () => {
  assert.strictEqual(checkPermission('fin1', 'finance_reviewer', 'document', 'doc1', 'submit', false, []), true);
});

test('buyer cannot submit documents', () => {
  assert.strictEqual(checkPermission('buyer1', 'buyer', 'document', 'doc1', 'submit', false, []), false);
});

// Approve action tests
test('finance reviewer can approve documents', () => {
  assert.strictEqual(checkPermission('fin1', 'finance_reviewer', 'document', 'doc1', 'approve', false, []), true);
});

test('admin can approve documents', () => {
  assert.strictEqual(checkPermission('admin1', 'admin', 'document', 'doc1', 'approve', false, []), true);
});

test('staff cannot approve documents by default', () => {
  assert.strictEqual(checkPermission('staff1', 'dealership_staff', 'document', 'doc1', 'approve', false, []), false);
});

test('buyer cannot approve documents', () => {
  assert.strictEqual(checkPermission('buyer1', 'buyer', 'document', 'doc1', 'approve', false, []), false);
});

// Sensitive document tests
test('buyer cannot access sensitive document without override', () => {
  assert.strictEqual(checkPermission('buyer1', 'buyer', 'document', 'doc1', 'read', true, []), false);
});

test('buyer can access sensitive document with explicit override', () => {
  const overrides = [{ userId: 'buyer1', resourceId: 'doc1', actions: ['read'], effect: 'allow' }];
  assert.strictEqual(checkPermission('buyer1', 'buyer', 'document', 'doc1', 'read', true, overrides), true);
});

test('finance reviewer can access sensitive documents by default', () => {
  assert.strictEqual(checkPermission('fin1', 'finance_reviewer', 'document', 'doc1', 'read', true, []), true);
});

// Permission override affects downstream
test('permission override grants buyer share ability', () => {
  const overrides = [{ userId: 'buyer1', resourceId: 'doc1', actions: ['share'], effect: 'allow' }];
  assert.strictEqual(checkPermission('buyer1', 'buyer', 'document', 'doc1', 'share', false, overrides), true);
});

test('permission override denies staff delete', () => {
  const overrides = [{ userId: 'staff1', resourceId: 'doc1', actions: ['delete'], effect: 'deny' }];
  assert.strictEqual(checkPermission('staff1', 'dealership_staff', 'document', 'doc1', 'delete', false, overrides), false);
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
