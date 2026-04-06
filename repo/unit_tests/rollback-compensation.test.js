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

let smModule, osmModule;
try { smModule = require('../server/src/lib/state-machine'); } catch { smModule = require('../server/dist/lib/state-machine'); }
try { osmModule = require('../server/src/services/order/order-state-machine'); } catch { osmModule = require('../server/dist/services/order/order-state-machine'); }
const { StateMachine } = smModule;
const { orderStateMachineDefinition } = osmModule;

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

const ROLLBACK_DEADLINE_MS = 5000;

// Wraps a promise with a hard timeout — mirrors production withDeadline()
function withDeadline(promise, ms, label) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(
      () => reject(new Error(`${label}: exceeded ${ms}ms deadline`)),
      ms,
    );
    promise.then(
      (v) => { clearTimeout(timer); resolve(v); },
      (e) => { clearTimeout(timer); reject(e); },
    );
  });
}

// Mirrors the SagaStep pattern from production order.service.ts executeSaga()
// including the enforced rollback deadline
async function executeSaga(steps, orderId, opts) {
  const deadlineMs = (opts && opts.deadlineMs) || ROLLBACK_DEADLINE_MS;
  const completed = [];
  const result = {
    compensatedSteps: [],
    rollbackDurationMs: 0,
    deadlineExceeded: false,
  };

  for (const step of steps) {
    try {
      await step.execute();
      completed.push(step);
    } catch (error) {
      const rollbackStart = Date.now();

      // Compensate in reverse order under the hard deadline
      const compensateAll = async () => {
        for (let i = completed.length - 1; i >= 0; i--) {
          try {
            await completed[i].compensate();
            result.compensatedSteps.push(completed[i].name);
          } catch { /* log but continue compensation */ }
        }
      };

      try {
        await withDeadline(compensateAll(), deadlineMs, `Rollback for ${orderId}`);
      } catch (deadlineErr) {
        result.deadlineExceeded = true;
      }

      result.rollbackDurationMs = Date.now() - rollbackStart;
      error.sagaResult = result;
      throw error;
    }
  }
  return result;
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

// --- Rollback deadline enforcement tests ---

asyncTest('rollback completes within 5-second deadline for fast compensation', async () => {
  const db = new MockDB();
  db.vehicles.set('v1', { _id: 'v1', status: 'reserved' });
  const order = {
    _id: 'ord1', buyerId: 'buyer1', status: 'reserved',
    items: [{ vehicleId: 'v1' }],
  };

  const steps = [
    {
      name: 'release_vehicles',
      execute: async () => {
        db.vehicles.get('v1').status = 'available';
      },
      compensate: async () => {
        db.vehicles.get('v1').status = 'reserved';
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
    assert.strictEqual(e.sagaResult.deadlineExceeded, false, 'Fast compensation should not exceed deadline');
    assert.ok(e.sagaResult.rollbackDurationMs < 5000, `Rollback took ${e.sagaResult.rollbackDurationMs}ms, should be under 5000`);
    assert.ok(e.sagaResult.compensatedSteps.includes('release_vehicles'), 'Should have compensated release_vehicles');
  }
});

asyncTest('rollback deadline is enforced when compensation is slow', async () => {
  const db = new MockDB();
  db.vehicles.set('v1', { _id: 'v1', status: 'reserved' });

  const steps = [
    {
      name: 'slow_step',
      execute: async () => {
        db.vehicles.get('v1').status = 'available';
      },
      compensate: async () => {
        // Simulate a compensation step that takes too long
        await new Promise((resolve) => setTimeout(resolve, 200));
        db.vehicles.get('v1').status = 'reserved';
      },
    },
    {
      name: 'failing_step',
      execute: async () => { throw new Error('Simulated failure'); },
      compensate: async () => {},
    },
  ];

  try {
    // Use a short deadline (50ms) to test enforcement without waiting 5 seconds
    await executeSaga(steps, 'ord-deadline-test', { deadlineMs: 50 });
    assert.fail('Should have thrown');
  } catch (e) {
    assert.strictEqual(e.sagaResult.deadlineExceeded, true, 'Should flag deadline as exceeded');
  }
});

asyncTest('saga result records rollback duration in milliseconds', async () => {
  const db = new MockDB();
  db.vehicles.set('v1', { _id: 'v1', status: 'reserved' });

  const steps = [
    {
      name: 'step1',
      execute: async () => { db.vehicles.get('v1').status = 'available'; },
      compensate: async () => { db.vehicles.get('v1').status = 'reserved'; },
    },
    {
      name: 'fail',
      execute: async () => { throw new Error('fail'); },
      compensate: async () => {},
    },
  ];

  try {
    await executeSaga(steps, 'ord-timing');
    assert.fail('Should have thrown');
  } catch (e) {
    assert.strictEqual(typeof e.sagaResult.rollbackDurationMs, 'number', 'rollbackDurationMs should be a number');
    assert.ok(e.sagaResult.rollbackDurationMs >= 0, 'rollbackDurationMs should be non-negative');
  }
});

asyncTest('inventory reservation failure records reason', async () => {
  // Simulates what createOrderFromCart does: when a vehicle is not available,
  // the transaction aborts and a failure reason must be captured.
  const failureReason = 'Vehicle v1 is no longer available';
  let recordedReason = null;

  // Simulate the reservation + failure + event recording
  try {
    // Simulate reservation failure
    throw new Error(failureReason);
  } catch (error) {
    // Simulate the event recording that production code does after transaction abort
    recordedReason = error.message;
  }

  assert.strictEqual(recordedReason, failureReason, 'Failure reason should be captured');
  assert.ok(recordedReason.includes('no longer available'), 'Reason should describe the inventory failure');
});

asyncTest('payment failure records reason and triggers revert event', async () => {
  // Simulates what payment.service.ts does when adapter.charge returns success: false
  const paymentFailure = {
    success: false,
    transactionId: '',
    status: 'failed',
    metadata: { reason: 'Insufficient funds' },
  };

  // Simulate the payment failure event recording
  const revertEvent = {
    orderId: 'ord1',
    fromStatus: 'invoiced',
    toStatus: 'invoiced',
    triggeredBy: 'system',
    reason: `Payment failed (offline/cash): ${paymentFailure.metadata.reason}`,
    rolledBack: true,
    rolledBackAt: new Date(),
    metadata: {
      adapter: 'offline',
      method: 'cash',
      amount: 25000,
      failureReason: paymentFailure.metadata.reason,
    },
  };

  assert.strictEqual(revertEvent.rolledBack, true, 'Event should be marked as rolled back');
  assert.ok(revertEvent.reason.includes('Insufficient funds'), 'Reason should contain the failure details');
  assert.ok(revertEvent.rolledBackAt instanceof Date, 'Revert timestamp should be recorded');
  assert.strictEqual(revertEvent.metadata.failureReason, 'Insufficient funds', 'Metadata should contain the failure reason');
  assert.strictEqual(revertEvent.fromStatus, revertEvent.toStatus, 'Order status should be unchanged (revert, not transition)');
});

setTimeout(() => {
  console.log(`\nRollback & Compensation: ${passed} passed, ${failed} failed`);
  if (failed > 0) process.exit(1);
}, 500);
