const assert = require('assert');

const DEFAULT_PERMISSIONS = {
  document: {
    admin: ['read', 'write', 'delete', 'download', 'share', 'submit', 'approve'],
    dealership_staff: ['read', 'write', 'delete', 'download', 'share', 'submit'],
    finance_reviewer: ['read', 'download', 'submit', 'approve'],
    buyer: ['read', 'download'],
  },
  order: {
    admin: ['read', 'write', 'delete'],
    dealership_staff: ['read', 'write'],
    finance_reviewer: ['read'],
    buyer: ['read'],
  },
};

function checkPermission(role, resource, action, sensitiveFlag, overrides) {
  if (role === 'admin') return true;

  if (sensitiveFlag && role !== 'finance_reviewer' && role !== 'admin') {
    const override = overrides.find(
      (o) => o.effect === 'allow' && o.actions.includes(action)
    );
    return !!override;
  }

  for (const override of overrides) {
    if (override.actions.includes(action)) {
      return override.effect === 'allow';
    }
  }

  const resourceDefaults = DEFAULT_PERMISSIONS[resource];
  if (!resourceDefaults) return false;
  const roleDefaults = resourceDefaults[role];
  if (!roleDefaults) return false;
  return roleDefaults.includes(action);
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

console.log('Permission Resolver Tests:');

test('admin has full access to everything', () => {
  assert.strictEqual(checkPermission('admin', 'document', 'read', false, []), true);
  assert.strictEqual(checkPermission('admin', 'document', 'delete', false, []), true);
  assert.strictEqual(checkPermission('admin', 'document', 'approve', false, []), true);
  assert.strictEqual(checkPermission('admin', 'document', 'read', true, []), true);
});

test('buyer can read and download documents', () => {
  assert.strictEqual(checkPermission('buyer', 'document', 'read', false, []), true);
  assert.strictEqual(checkPermission('buyer', 'document', 'download', false, []), true);
});

test('buyer cannot write or delete documents', () => {
  assert.strictEqual(checkPermission('buyer', 'document', 'write', false, []), false);
  assert.strictEqual(checkPermission('buyer', 'document', 'delete', false, []), false);
  assert.strictEqual(checkPermission('buyer', 'document', 'approve', false, []), false);
});

test('staff can manage documents', () => {
  assert.strictEqual(checkPermission('dealership_staff', 'document', 'read', false, []), true);
  assert.strictEqual(checkPermission('dealership_staff', 'document', 'write', false, []), true);
  assert.strictEqual(checkPermission('dealership_staff', 'document', 'delete', false, []), true);
  assert.strictEqual(checkPermission('dealership_staff', 'document', 'share', false, []), true);
});

test('staff cannot approve documents', () => {
  assert.strictEqual(checkPermission('dealership_staff', 'document', 'approve', false, []), false);
});

test('finance reviewer can approve documents', () => {
  assert.strictEqual(checkPermission('finance_reviewer', 'document', 'approve', false, []), true);
  assert.strictEqual(checkPermission('finance_reviewer', 'document', 'read', false, []), true);
});

test('sensitive documents block non-privileged roles without override', () => {
  assert.strictEqual(checkPermission('buyer', 'document', 'read', true, []), false);
  assert.strictEqual(checkPermission('dealership_staff', 'document', 'read', true, []), false);
});

test('sensitive documents allow finance reviewer', () => {
  assert.strictEqual(checkPermission('finance_reviewer', 'document', 'read', true, []), true);
});

test('explicit override grants access to sensitive document', () => {
  const overrides = [{ effect: 'allow', actions: ['read'] }];
  assert.strictEqual(checkPermission('buyer', 'document', 'read', true, overrides), true);
});

test('explicit deny override blocks access', () => {
  const overrides = [{ effect: 'deny', actions: ['read'] }];
  assert.strictEqual(checkPermission('dealership_staff', 'document', 'read', false, overrides), false);
});

test('override takes precedence over default', () => {
  const overrides = [{ effect: 'allow', actions: ['approve'] }];
  assert.strictEqual(checkPermission('dealership_staff', 'document', 'approve', false, overrides), true);
});

test('order permissions work correctly', () => {
  assert.strictEqual(checkPermission('buyer', 'order', 'read', false, []), true);
  assert.strictEqual(checkPermission('buyer', 'order', 'write', false, []), false);
  assert.strictEqual(checkPermission('dealership_staff', 'order', 'write', false, []), true);
  assert.strictEqual(checkPermission('finance_reviewer', 'order', 'write', false, []), false);
});

test('unknown resource returns false', () => {
  assert.strictEqual(checkPermission('buyer', 'unknown', 'read', false, []), false);
});

test('unknown role returns false', () => {
  assert.strictEqual(checkPermission('unknown_role', 'document', 'read', false, []), false);
});

console.log(`\nPermission Resolver: ${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
