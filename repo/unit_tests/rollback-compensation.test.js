const assert = require('assert');
const { StateMachine } = require('../server/dist/lib/state-machine');
const { orderStateMachineDefinition } = require('../server/dist/services/order/order-state-machine');

// Uses production state machine for FSM validation + tests the compensation pattern
// used by order.service.ts executeSaga()

class MockDB {
  constructor() {
    this.vehicles = new Map();
    this.payments = [];
    this.invoices = [];
    this.walletTxs = [];
    this.events = [];
  }
}

// Mirrors the SagaStep pattern from production order.service.ts executeSaga()
async function executeSaga(steps, orderId) {
  const completed = [];
  for (const step of steps) {
    try {
      await step.execute();
      completed.push(step);
    } catch (error) {
      // Compensate in reverse order — matches production executeSaga()
      for (let i = completed.length - 1; i >= 0; i--) {
        try {
          await completed[i].compensate();
        } catch { /* log but continue compensation */ }
      }
      throw error;
    }
  }
}

// Builds saga steps matching production order.service.ts CANCEL flow
function buildCancelSagaSteps(order, db) {
  const sagaSteps = [];

  // Step 1: Release vehicles (matches order.service.ts line 188-204)
  const vehicleUpdates = [];
  sagaSteps.push({
    name: 'release_vehicles',
    execute: async () => {
      for (const item of order.items) {
        const vehicle = db.vehicles.get(item.vehicleId);
        if (vehicle) {
          vehicleUpdates.push({ vehicleId: item.vehicleId, prevStatus: vehicle.status });
          vehicle.status = 'available';
        }
      }
    },
    compensate: async () => {
      for (const vu of vehicleUpdates) {
        const v = db.vehicles.get(vu.vehicleId);
        if (v) v.status = vu.prevStatus;
      }
    },
  });

  // Step 2: Refund payments (matches order.service.ts line 208-221)
  const refundedPaymentIds = [];
  sagaSteps.push({
    name: 'refund_payments',
    execute: async () => {
      const orderPayments = db.payments.filter((p) => p.orderId === order._id && p.status === 'completed');
      for (const payment of orderPayments) {
        payment.status = 'refunded';
        payment.metadata = { ...payment.metadata, refundReason: 'Order cancelled' };
        db.walletTxs.push({
          debitAccountId: `dealership:${payment.dealershipId}`,
          creditAccountId: `buyer:${order.buyerId}`,
          amount: payment.amount,
          referenceType: 'refund',
          referenceId: payment._id,
        });
        refundedPaymentIds.push(payment._id);
      }
    },
    compensate: async () => {
      // Payment refunds are financial records - cannot be automatically reversed
      // Matches production: logger.warn({ orderId, refundedPaymentIds }, ...)
    },
  });

  // Step 3: Void invoices (matches order.service.ts line 224-243)
  const voidedInvoices = [];
  sagaSteps.push({
    name: 'void_invoices',
    execute: async () => {
      const orderInvoices = db.invoices.filter(
        (i) => i.orderId === order._id && (i.status === 'issued' || i.status === 'draft')
      );
      for (const invoice of orderInvoices) {
        voidedInvoices.push({ invoiceId: invoice._id, prevStatus: invoice.status });
        invoice.status = 'voided';
      }
    },
    compensate: async () => {
      for (const vi of voidedInvoices) {
        const inv = db.invoices.find((i) => i._id === vi.invoiceId);
        if (inv) inv.status = vi.prevStatus;
      }
    },
  });

  // Step 4: Update order (matches order.service.ts line 246-259)
  const originalStatus = order.status;
  sagaSteps.push({
    name: 'update_order_cancelled',
    execute: async () => {
      order.cancelledAt = new Date();
      order.cancelReason = 'Cancelled with full compensation';
      order.status = 'cancelled';
      db.events.push({
        orderId: order._id,
        fromStatus: originalStatus,
        toStatus: 'cancelled',
        reason: 'Cancelled with full compensation',
      });
    },
    compensate: async () => {
      order.status = originalStatus;
      order.cancelledAt = null;
      order.cancelReason = null;
    },
  });

  return sagaSteps;
}

// Builds saga steps matching production FULFILL flow
function buildFulfillSagaSteps(order, db) {
  const sagaSteps = [];
  const vehicleUpdates = [];

  sagaSteps.push({
    name: 'mark_vehicles_sold',
    execute: async () => {
      for (const item of order.items) {
        const vehicle = db.vehicles.get(item.vehicleId);
        if (vehicle) {
          vehicleUpdates.push({ vehicleId: item.vehicleId, prevStatus: vehicle.status });
          vehicle.status = 'sold';
        }
      }
    },
    compensate: async () => {
      for (const vu of vehicleUpdates) {
        const v = db.vehicles.get(vu.vehicleId);
        if (v) v.status = vu.prevStatus;
      }
    },
  });

  const originalStatus = order.status;
  sagaSteps.push({
    name: 'update_order_status',
    execute: async () => {
      order.status = 'fulfilled';
    },
    compensate: async () => {
      order.status = originalStatus;
    },
  });

  return sagaSteps;
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

async function asyncTest(name, fn) {
  try {
    await fn();
    console.log(`  PASS: ${name}`);
    passed++;
  } catch (e) {
    console.log(`  FAIL: ${name} - ${e.message}`);
    failed++;
  }
}

console.log('Rollback & Compensation Tests (using production state machine):');

// Production state machine validation
test('state machine allows CANCEL from reserved', () => {
  const fsm = new StateMachine(orderStateMachineDefinition, 'reserved');
  assert.strictEqual(fsm.can('CANCEL'), true);
});

test('state machine allows CANCEL from invoiced', () => {
  const fsm = new StateMachine(orderStateMachineDefinition, 'invoiced');
  assert.strictEqual(fsm.can('CANCEL'), true);
});

test('state machine allows CANCEL from settled', () => {
  const fsm = new StateMachine(orderStateMachineDefinition, 'settled');
  assert.strictEqual(fsm.can('CANCEL'), true);
});

test('state machine does not allow CANCEL from fulfilled', () => {
  const fsm = new StateMachine(orderStateMachineDefinition, 'fulfilled');
  assert.strictEqual(fsm.can('CANCEL'), false);
});

test('state machine does not allow CANCEL from cancelled', () => {
  const fsm = new StateMachine(orderStateMachineDefinition, 'cancelled');
  assert.strictEqual(fsm.can('CANCEL'), false);
});

// Saga compensation tests
asyncTest('cancel saga releases all reserved vehicles to available', async () => {
  const db = new MockDB();
  db.vehicles.set('v1', { _id: 'v1', status: 'reserved' });
  db.vehicles.set('v2', { _id: 'v2', status: 'reserved' });
  const order = {
    _id: 'ord1', buyerId: 'buyer1', status: 'reserved',
    items: [{ vehicleId: 'v1' }, { vehicleId: 'v2' }],
  };
  const steps = buildCancelSagaSteps(order, db);
  await executeSaga(steps, order._id);
  assert.strictEqual(db.vehicles.get('v1').status, 'available');
  assert.strictEqual(db.vehicles.get('v2').status, 'available');
});

asyncTest('cancel saga refunds all completed payments', async () => {
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
  const steps = buildCancelSagaSteps(order, db);
  await executeSaga(steps, order._id);
  assert.strictEqual(db.payments[0].status, 'refunded');
  assert.strictEqual(db.payments[1].status, 'refunded');
});

asyncTest('cancel saga creates refund wallet transactions', async () => {
  const db = new MockDB();
  db.vehicles.set('v1', { _id: 'v1', status: 'reserved' });
  db.payments.push(
    { _id: 'pay1', orderId: 'ord1', dealershipId: 'deal1', amount: 25000, status: 'completed', metadata: {} },
  );
  const order = {
    _id: 'ord1', buyerId: 'buyer1', status: 'settled',
    items: [{ vehicleId: 'v1' }],
  };
  const steps = buildCancelSagaSteps(order, db);
  await executeSaga(steps, order._id);
  assert.strictEqual(db.walletTxs.length, 1);
  assert.strictEqual(db.walletTxs[0].referenceType, 'refund');
  assert.strictEqual(db.walletTxs[0].creditAccountId, 'buyer:buyer1');
  assert.strictEqual(db.walletTxs[0].debitAccountId, 'dealership:deal1');
  assert.strictEqual(db.walletTxs[0].amount, 25000);
});

asyncTest('cancel saga voids unpaid invoices', async () => {
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
  const steps = buildCancelSagaSteps(order, db);
  await executeSaga(steps, order._id);
  assert.strictEqual(db.invoices[0].status, 'voided');
  assert.strictEqual(db.invoices[1].status, 'voided');
  assert.strictEqual(db.invoices[2].status, 'paid'); // Unchanged
});

asyncTest('cancel saga sets order to cancelled with timestamp', async () => {
  const db = new MockDB();
  db.vehicles.set('v1', { _id: 'v1', status: 'reserved' });
  const order = {
    _id: 'ord1', buyerId: 'buyer1', status: 'reserved',
    items: [{ vehicleId: 'v1' }],
  };
  const steps = buildCancelSagaSteps(order, db);
  await executeSaga(steps, order._id);
  assert.strictEqual(order.status, 'cancelled');
  assert.ok(order.cancelledAt);
  assert.ok(order.cancelReason.includes('compensation'));
});

asyncTest('saga compensates on failure: vehicles restored after step 2 fails', async () => {
  const db = new MockDB();
  db.vehicles.set('v1', { _id: 'v1', status: 'reserved' });
  const order = {
    _id: 'ord1', buyerId: 'buyer1', status: 'reserved',
    items: [{ vehicleId: 'v1' }],
  };

  // Build custom saga where step 2 fails
  const vehicleUpdates = [];
  const steps = [
    {
      name: 'release_vehicles',
      execute: async () => {
        const v = db.vehicles.get('v1');
        vehicleUpdates.push({ vehicleId: 'v1', prevStatus: v.status });
        v.status = 'available';
      },
      compensate: async () => {
        for (const vu of vehicleUpdates) {
          db.vehicles.get(vu.vehicleId).status = vu.prevStatus;
        }
      },
    },
    {
      name: 'failing_step',
      execute: async () => { throw new Error('Simulated failure'); },
      compensate: async () => {},
    },
  ];

  try {
    await executeSaga(steps, order._id);
    assert.fail('Should have thrown');
  } catch (e) {
    assert.strictEqual(e.message, 'Simulated failure');
  }

  // Vehicle should be restored to original state
  assert.strictEqual(db.vehicles.get('v1').status, 'reserved');
});

asyncTest('fulfill saga compensates on failure: vehicles restored from sold to reserved', async () => {
  const db = new MockDB();
  db.vehicles.set('v1', { _id: 'v1', status: 'reserved' });
  const order = {
    _id: 'ord1', buyerId: 'buyer1', status: 'settled',
    items: [{ vehicleId: 'v1' }],
  };

  // Build fulfill saga but inject failure in step 2
  const vehicleUpdates = [];
  const steps = [
    {
      name: 'mark_vehicles_sold',
      execute: async () => {
        const v = db.vehicles.get('v1');
        vehicleUpdates.push({ vehicleId: 'v1', prevStatus: v.status });
        v.status = 'sold';
      },
      compensate: async () => {
        for (const vu of vehicleUpdates) {
          db.vehicles.get(vu.vehicleId).status = vu.prevStatus;
        }
      },
    },
    {
      name: 'update_order_status',
      execute: async () => { throw new Error('DB write failure'); },
      compensate: async () => {},
    },
  ];

  try {
    await executeSaga(steps, order._id);
    assert.fail('Should have thrown');
  } catch (e) {
    assert.strictEqual(e.message, 'DB write failure');
  }

  // Vehicle should be restored from sold back to reserved
  assert.strictEqual(db.vehicles.get('v1').status, 'reserved');
});

asyncTest('system state is consistent after full cancel compensation', async () => {
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
  const steps = buildCancelSagaSteps(order, db);
  await executeSaga(steps, order._id);
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

setTimeout(() => {
  console.log(`\nRollback & Compensation: ${passed} passed, ${failed} failed`);
  if (failed > 0) process.exit(1);
}, 100);
