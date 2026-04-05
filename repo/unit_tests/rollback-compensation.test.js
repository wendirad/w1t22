const assert = require('assert');

// Simulate rollback and compensation flow from production code

class MockDB {
  constructor() {
    this.vehicles = new Map();
    this.payments = [];
    this.invoices = [];
    this.walletTxs = [];
    this.events = [];
  }
}

function simulateCancelWithCompensation(order, db) {
  const compensationLog = [];

  // 1. Release vehicles back to available
  for (const item of order.items) {
    const vehicle = db.vehicles.get(item.vehicleId);
    if (vehicle) {
      const oldStatus = vehicle.status;
      vehicle.status = 'available';
      compensationLog.push({ type: 'vehicle_released', vehicleId: item.vehicleId, from: oldStatus, to: 'available' });
    }
  }

  // 2. Refund completed payments
  const orderPayments = db.payments.filter((p) => p.orderId === order._id && p.status === 'completed');
  for (const payment of orderPayments) {
    payment.status = 'refunded';
    payment.metadata = { ...payment.metadata, refundReason: 'Order cancelled' };

    // Reverse wallet transactions
    db.walletTxs.push({
      debitAccountId: `dealership:${payment.dealershipId}`,
      creditAccountId: `buyer:${order.buyerId}`,
      amount: payment.amount,
      referenceType: 'refund',
      referenceId: payment._id,
    });

    compensationLog.push({ type: 'payment_refunded', paymentId: payment._id, amount: payment.amount });
  }

  // 3. Void unpaid invoices
  const orderInvoices = db.invoices.filter(
    (i) => i.orderId === order._id && (i.status === 'issued' || i.status === 'draft')
  );
  for (const invoice of orderInvoices) {
    invoice.status = 'voided';
    compensationLog.push({ type: 'invoice_voided', invoiceId: invoice._id });
  }

  // 4. Update order
  order.status = 'cancelled';
  order.cancelledAt = new Date();
  order.cancelReason = 'Cancelled with full compensation';

  db.events.push({
    orderId: order._id,
    fromStatus: 'reserved',
    toStatus: 'cancelled',
    reason: 'Cancelled with full compensation',
  });

  return compensationLog;
}

function simulateTimeoutRollback(order, failedEvent, db) {
  const compensationLog = [];

  // Restore order to pre-transition state
  const originalStatus = order.status;

  // Compensate vehicle status changes from failed transition
  if (failedEvent === 'CANCEL') {
    for (const item of order.items) {
      const vehicle = db.vehicles.get(item.vehicleId);
      if (vehicle && vehicle.status === 'available') {
        vehicle.status = 'reserved';
        compensationLog.push({ type: 'vehicle_re-reserved', vehicleId: item.vehicleId });
      }
    }
  }
  if (failedEvent === 'FULFILL') {
    for (const item of order.items) {
      const vehicle = db.vehicles.get(item.vehicleId);
      if (vehicle && vehicle.status === 'sold') {
        vehicle.status = 'reserved';
        compensationLog.push({ type: 'vehicle_unreserved', vehicleId: item.vehicleId });
      }
    }
  }

  db.events.push({
    orderId: order._id,
    fromStatus: order.status,
    toStatus: originalStatus,
    reason: 'Timeout rollback with compensation',
    rolledBack: true,
    rolledBackAt: new Date(),
  });

  return compensationLog;
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

console.log('Rollback & Compensation Tests:');

test('cancel releases all reserved vehicles to available', () => {
  const db = new MockDB();
  db.vehicles.set('v1', { _id: 'v1', status: 'reserved' });
  db.vehicles.set('v2', { _id: 'v2', status: 'reserved' });

  const order = {
    _id: 'ord1', buyerId: 'buyer1', status: 'reserved',
    items: [{ vehicleId: 'v1' }, { vehicleId: 'v2' }],
  };

  const log = simulateCancelWithCompensation(order, db);
  assert.strictEqual(db.vehicles.get('v1').status, 'available');
  assert.strictEqual(db.vehicles.get('v2').status, 'available');
  assert.ok(log.some((l) => l.type === 'vehicle_released'));
});

test('cancel refunds all completed payments', () => {
  const db = new MockDB();
  db.vehicles.set('v1', { _id: 'v1', status: 'reserved' });
  db.payments.push(
    { _id: 'pay1', orderId: 'ord1', dealershipId: 'deal1', amount: 25000, status: 'completed', metadata: {} },
    { _id: 'pay2', orderId: 'ord1', dealershipId: 'deal1', amount: 5000, status: 'completed', metadata: {} },
  );

  const order = {
    _id: 'ord1', buyerId: 'buyer1', status: 'settled',
    items: [{ vehicleId: 'v1' }],
  };

  const log = simulateCancelWithCompensation(order, db);
  assert.strictEqual(db.payments[0].status, 'refunded');
  assert.strictEqual(db.payments[1].status, 'refunded');
  assert.ok(log.filter((l) => l.type === 'payment_refunded').length === 2);
});

test('cancel creates refund wallet transactions', () => {
  const db = new MockDB();
  db.vehicles.set('v1', { _id: 'v1', status: 'reserved' });
  db.payments.push(
    { _id: 'pay1', orderId: 'ord1', dealershipId: 'deal1', amount: 25000, status: 'completed', metadata: {} },
  );

  const order = {
    _id: 'ord1', buyerId: 'buyer1', status: 'settled',
    items: [{ vehicleId: 'v1' }],
  };

  simulateCancelWithCompensation(order, db);
  assert.strictEqual(db.walletTxs.length, 1);
  assert.strictEqual(db.walletTxs[0].referenceType, 'refund');
  assert.strictEqual(db.walletTxs[0].creditAccountId, 'buyer:buyer1');
  assert.strictEqual(db.walletTxs[0].debitAccountId, 'dealership:deal1');
  assert.strictEqual(db.walletTxs[0].amount, 25000);
});

test('cancel voids unpaid invoices', () => {
  const db = new MockDB();
  db.vehicles.set('v1', { _id: 'v1', status: 'reserved' });
  db.invoices.push(
    { _id: 'inv1', orderId: 'ord1', status: 'issued' },
    { _id: 'inv2', orderId: 'ord1', status: 'draft' },
    { _id: 'inv3', orderId: 'ord1', status: 'paid' }, // Should NOT be voided
  );

  const order = {
    _id: 'ord1', buyerId: 'buyer1', status: 'invoiced',
    items: [{ vehicleId: 'v1' }],
  };

  const log = simulateCancelWithCompensation(order, db);
  assert.strictEqual(db.invoices[0].status, 'voided');
  assert.strictEqual(db.invoices[1].status, 'voided');
  assert.strictEqual(db.invoices[2].status, 'paid'); // Unchanged
  assert.ok(log.filter((l) => l.type === 'invoice_voided').length === 2);
});

test('cancel sets order to cancelled with timestamp', () => {
  const db = new MockDB();
  db.vehicles.set('v1', { _id: 'v1', status: 'reserved' });

  const order = {
    _id: 'ord1', buyerId: 'buyer1', status: 'reserved',
    items: [{ vehicleId: 'v1' }],
  };

  simulateCancelWithCompensation(order, db);
  assert.strictEqual(order.status, 'cancelled');
  assert.ok(order.cancelledAt);
  assert.ok(order.cancelReason.includes('compensation'));
});

test('timeout rollback restores vehicle status after failed CANCEL', () => {
  const db = new MockDB();
  // Simulate: CANCEL partially executed - vehicles were set to available
  db.vehicles.set('v1', { _id: 'v1', status: 'available' });

  const order = {
    _id: 'ord1', status: 'reserved',
    items: [{ vehicleId: 'v1' }],
  };

  const log = simulateTimeoutRollback(order, 'CANCEL', db);
  assert.strictEqual(db.vehicles.get('v1').status, 'reserved');
  assert.ok(log.some((l) => l.type === 'vehicle_re-reserved'));
});

test('timeout rollback restores vehicle status after failed FULFILL', () => {
  const db = new MockDB();
  db.vehicles.set('v1', { _id: 'v1', status: 'sold' });

  const order = {
    _id: 'ord1', status: 'settled',
    items: [{ vehicleId: 'v1' }],
  };

  const log = simulateTimeoutRollback(order, 'FULFILL', db);
  assert.strictEqual(db.vehicles.get('v1').status, 'reserved');
});

test('timeout rollback creates event record with rolledBack flag', () => {
  const db = new MockDB();
  db.vehicles.set('v1', { _id: 'v1', status: 'available' });

  const order = { _id: 'ord1', status: 'reserved', items: [{ vehicleId: 'v1' }] };

  simulateTimeoutRollback(order, 'CANCEL', db);
  assert.strictEqual(db.events.length, 1);
  assert.strictEqual(db.events[0].rolledBack, true);
  assert.ok(db.events[0].rolledBackAt);
  assert.ok(db.events[0].reason.includes('Timeout rollback'));
});

test('system state is consistent after full cancel compensation', () => {
  const db = new MockDB();
  db.vehicles.set('v1', { _id: 'v1', status: 'reserved' });
  db.vehicles.set('v2', { _id: 'v2', status: 'reserved' });
  db.payments.push(
    { _id: 'pay1', orderId: 'ord1', dealershipId: 'deal1', amount: 20000, status: 'completed', metadata: {} },
  );
  db.invoices.push(
    { _id: 'inv1', orderId: 'ord1', status: 'issued' },
  );

  const order = {
    _id: 'ord1', buyerId: 'buyer1', status: 'invoiced',
    items: [{ vehicleId: 'v1' }, { vehicleId: 'v2' }],
  };

  simulateCancelWithCompensation(order, db);

  // All vehicles available
  assert.strictEqual(db.vehicles.get('v1').status, 'available');
  assert.strictEqual(db.vehicles.get('v2').status, 'available');
  // Payment refunded
  assert.strictEqual(db.payments[0].status, 'refunded');
  // Invoice voided
  assert.strictEqual(db.invoices[0].status, 'voided');
  // Order cancelled
  assert.strictEqual(order.status, 'cancelled');
  // Refund wallet transaction exists
  assert.strictEqual(db.walletTxs.length, 1);
  // Cancel event recorded
  assert.strictEqual(db.events.length, 1);
});

console.log(`\nRollback & Compensation: ${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
