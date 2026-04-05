const assert = require('assert');

// Simulate audit logging from production code

class AuditStore {
  constructor() { this.logs = []; }

  create(entry) {
    const record = {
      _id: `audit-${this.logs.length}`,
      ...entry,
      timestamp: new Date(),
    };
    this.logs.push(record);
    return record;
  }

  find(filters) {
    return this.logs.filter((log) => {
      if (filters.dealershipId && log.dealershipId !== filters.dealershipId) return false;
      if (filters['actor.userId'] && log.actor.userId !== filters['actor.userId']) return false;
      if (filters['resource.type'] && log.resource.type !== filters['resource.type']) return false;
      if (filters['resource.id'] && log.resource.id !== filters['resource.id']) return false;
      if (filters.action && !log.action.match(new RegExp(filters.action, 'i'))) return false;
      return true;
    });
  }
}

function logAuditEvent(store, params) {
  return store.create({
    dealershipId: params.dealershipId || null,
    actor: {
      userId: params.userId,
      role: params.role,
      ip: params.ip,
    },
    action: params.action,
    resource: {
      type: params.resourceType,
      id: params.resourceId,
    },
    before: params.before || null,
    after: params.after || null,
    requestId: params.requestId || '',
  });
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

console.log('Audit Logging Tests:');

test('order creation generates audit record', () => {
  const store = new AuditStore();
  const entry = logAuditEvent(store, {
    dealershipId: 'deal1',
    userId: 'user1',
    role: 'buyer',
    ip: '127.0.0.1',
    action: 'order.create',
    resourceType: 'order',
    resourceId: 'ord1',
    after: { orderNumber: 'ORD-001', status: 'created', totals: { total: 25000 } },
    requestId: 'req-1',
  });

  assert.strictEqual(store.logs.length, 1);
  assert.strictEqual(entry.action, 'order.create');
  assert.strictEqual(entry.resource.type, 'order');
  assert.strictEqual(entry.resource.id, 'ord1');
  assert.strictEqual(entry.actor.userId, 'user1');
  assert.strictEqual(entry.actor.role, 'buyer');
});

test('order transition audit has before/after state', () => {
  const store = new AuditStore();
  logAuditEvent(store, {
    dealershipId: 'deal1',
    userId: 'staff1',
    role: 'dealership_staff',
    ip: '10.0.0.1',
    action: 'order.transition.RESERVE',
    resourceType: 'order',
    resourceId: 'ord1',
    before: { status: 'created' },
    after: { status: 'reserved', reason: 'Ready to reserve' },
    requestId: 'req-2',
  });

  const log = store.logs[0];
  assert.deepStrictEqual(log.before, { status: 'created' });
  assert.deepStrictEqual(log.after.status, 'reserved');
});

test('invoice creation audit includes financial data', () => {
  const store = new AuditStore();
  logAuditEvent(store, {
    dealershipId: 'deal1',
    userId: 'staff1',
    role: 'dealership_staff',
    ip: '10.0.0.1',
    action: 'invoice.create',
    resourceType: 'invoice',
    resourceId: 'inv1',
    after: { invoiceNumber: 'INV-001', total: 27225, status: 'issued' },
  });

  const log = store.logs[0];
  assert.strictEqual(log.action, 'invoice.create');
  assert.strictEqual(log.after.invoiceNumber, 'INV-001');
  assert.strictEqual(log.after.total, 27225);
});

test('payment processing audit records adapter info', () => {
  const store = new AuditStore();
  logAuditEvent(store, {
    dealershipId: 'deal1',
    userId: 'buyer1',
    role: 'buyer',
    ip: '192.168.1.1',
    action: 'payment.process',
    resourceType: 'payment',
    resourceId: 'pay1',
    after: { amount: 27225, method: 'credit_card', status: 'completed', adapterUsed: 'online' },
  });

  const log = store.logs[0];
  assert.strictEqual(log.action, 'payment.process');
  assert.strictEqual(log.after.adapterUsed, 'online');
});

test('document upload audit records file metadata', () => {
  const store = new AuditStore();
  logAuditEvent(store, {
    dealershipId: 'deal1',
    userId: 'staff1',
    role: 'dealership_staff',
    ip: '10.0.0.1',
    action: 'document.upload',
    resourceType: 'document',
    resourceId: 'doc1',
    after: { filename: 'title.pdf', type: 'title', sensitiveFlag: true, quarantined: false },
  });

  const log = store.logs[0];
  assert.strictEqual(log.resource.type, 'document');
  assert.strictEqual(log.after.sensitiveFlag, true);
});

test('document deletion audit records before state', () => {
  const store = new AuditStore();
  logAuditEvent(store, {
    dealershipId: 'deal1',
    userId: 'admin1',
    role: 'admin',
    ip: '10.0.0.1',
    action: 'document.delete',
    resourceType: 'document',
    resourceId: 'doc1',
    before: { filename: 'old-file.pdf', type: 'other' },
  });

  const log = store.logs[0];
  assert.strictEqual(log.action, 'document.delete');
  assert.strictEqual(log.before.filename, 'old-file.pdf');
  assert.strictEqual(log.after, null);
});

test('audit logs are filterable by dealershipId', () => {
  const store = new AuditStore();
  logAuditEvent(store, { dealershipId: 'deal1', userId: 'u1', role: 'admin', ip: '', action: 'order.create', resourceType: 'order', resourceId: 'o1' });
  logAuditEvent(store, { dealershipId: 'deal2', userId: 'u2', role: 'admin', ip: '', action: 'order.create', resourceType: 'order', resourceId: 'o2' });
  logAuditEvent(store, { dealershipId: 'deal1', userId: 'u1', role: 'admin', ip: '', action: 'invoice.create', resourceType: 'invoice', resourceId: 'i1' });

  const filtered = store.find({ dealershipId: 'deal1' });
  assert.strictEqual(filtered.length, 2);
});

test('audit logs are filterable by userId', () => {
  const store = new AuditStore();
  logAuditEvent(store, { userId: 'user-a', role: 'buyer', ip: '', action: 'order.create', resourceType: 'order', resourceId: 'o1' });
  logAuditEvent(store, { userId: 'user-b', role: 'admin', ip: '', action: 'order.create', resourceType: 'order', resourceId: 'o2' });

  const filtered = store.find({ 'actor.userId': 'user-a' });
  assert.strictEqual(filtered.length, 1);
  assert.strictEqual(filtered[0].actor.userId, 'user-a');
});

test('audit logs are filterable by resource type', () => {
  const store = new AuditStore();
  logAuditEvent(store, { userId: 'u1', role: 'admin', ip: '', action: 'order.create', resourceType: 'order', resourceId: 'o1' });
  logAuditEvent(store, { userId: 'u1', role: 'admin', ip: '', action: 'document.upload', resourceType: 'document', resourceId: 'd1' });
  logAuditEvent(store, { userId: 'u1', role: 'admin', ip: '', action: 'payment.process', resourceType: 'payment', resourceId: 'p1' });

  const filtered = store.find({ 'resource.type': 'document' });
  assert.strictEqual(filtered.length, 1);
});

test('audit actor IP is persisted', () => {
  const store = new AuditStore();
  logAuditEvent(store, { userId: 'u1', role: 'admin', ip: '203.0.113.42', action: 'test', resourceType: 'test', resourceId: 't1' });
  assert.strictEqual(store.logs[0].actor.ip, '203.0.113.42');
});

test('audit requestId is persisted', () => {
  const store = new AuditStore();
  logAuditEvent(store, { userId: 'u1', role: 'admin', ip: '', action: 'test', resourceType: 'test', resourceId: 't1', requestId: 'req-abc-123' });
  assert.strictEqual(store.logs[0].requestId, 'req-abc-123');
});

test('permission override CRUD generates audit records', () => {
  const store = new AuditStore();
  logAuditEvent(store, {
    dealershipId: 'deal1',
    userId: 'admin1',
    role: 'admin',
    ip: '10.0.0.1',
    action: 'permission_override.create',
    resourceType: 'permission_override',
    resourceId: 'po1',
    after: { resource: 'document', actions: ['read'], effect: 'allow', userId: 'buyer1' },
  });

  logAuditEvent(store, {
    dealershipId: 'deal1',
    userId: 'admin1',
    role: 'admin',
    ip: '10.0.0.1',
    action: 'permission_override.delete',
    resourceType: 'permission_override',
    resourceId: 'po1',
    before: { resource: 'document', actions: ['read'], effect: 'allow', userId: 'buyer1' },
  });

  const logs = store.find({ 'resource.type': 'permission_override' });
  assert.strictEqual(logs.length, 2);
  assert.strictEqual(logs[0].action, 'permission_override.create');
  assert.strictEqual(logs[1].action, 'permission_override.delete');
});

console.log(`\nAudit Logging: ${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
