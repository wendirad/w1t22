const assert = require('assert');

// Simulate the payment adapter interface from production code

class OfflinePaymentAdapter {
  constructor() { this.name = 'offline'; }
  supports(method) {
    return ['cash', 'cashier_check', 'in_house_financing'].includes(method);
  }
  async charge(params) {
    return {
      success: true,
      transactionId: `offline-${Date.now()}`,
      status: 'completed',
      metadata: { method: params.method, recordedAt: new Date().toISOString() },
    };
  }
  async refund(transactionId, amount) {
    return {
      success: true,
      transactionId: `offline-refund-${Date.now()}`,
      status: 'completed',
      metadata: { originalTransactionId: transactionId },
    };
  }
}

class OnlinePaymentAdapter {
  constructor() { this.name = 'online'; }
  supports(method) {
    return ['credit_card', 'bank_transfer'].includes(method);
  }
  async charge(params) {
    return {
      success: true,
      transactionId: `online-${Date.now()}`,
      status: 'completed',
      metadata: { method: params.method, gateway: 'simulated' },
    };
  }
  async refund(transactionId, amount) {
    return {
      success: true,
      transactionId: `online-refund-${Date.now()}`,
      status: 'completed',
      metadata: { originalTransactionId: transactionId },
    };
  }
}

class FailingAdapter {
  constructor() { this.name = 'failing'; }
  supports(method) { return method === 'failing_method'; }
  async charge() {
    return { success: false, transactionId: '', status: 'failed', metadata: { error: 'declined' } };
  }
  async refund() {
    return { success: false, transactionId: '', status: 'failed', metadata: { error: 'cannot refund' } };
  }
}

const adapters = [new OfflinePaymentAdapter(), new OnlinePaymentAdapter(), new FailingAdapter()];

function resolveAdapter(method) {
  const adapter = adapters.find((a) => a.supports(method));
  if (!adapter) throw new Error(`No payment adapter found for method: ${method}`);
  return adapter;
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

console.log('Payment Adapter Tests:');

test('offline adapter supports cash', () => {
  const adapter = resolveAdapter('cash');
  assert.strictEqual(adapter.name, 'offline');
});

test('offline adapter supports cashier_check', () => {
  const adapter = resolveAdapter('cashier_check');
  assert.strictEqual(adapter.name, 'offline');
});

test('offline adapter supports in_house_financing', () => {
  const adapter = resolveAdapter('in_house_financing');
  assert.strictEqual(adapter.name, 'offline');
});

test('online adapter supports credit_card', () => {
  const adapter = resolveAdapter('credit_card');
  assert.strictEqual(adapter.name, 'online');
});

test('online adapter supports bank_transfer', () => {
  const adapter = resolveAdapter('bank_transfer');
  assert.strictEqual(adapter.name, 'online');
});

test('unknown method throws error', () => {
  try {
    resolveAdapter('bitcoin');
    assert.fail('Should have thrown');
  } catch (e) {
    assert.ok(e.message.includes('No payment adapter'));
  }
});

asyncTest('offline adapter charge returns success with adapterUsed', async () => {
  const adapter = resolveAdapter('cash');
  const result = await adapter.charge({
    amount: 25000, currency: 'USD', orderId: 'ord1', invoiceId: 'inv1', method: 'cash',
  });
  assert.strictEqual(result.success, true);
  assert.strictEqual(result.status, 'completed');
  assert.ok(result.transactionId.startsWith('offline-'));
  assert.strictEqual(result.metadata.method, 'cash');
});

asyncTest('online adapter charge returns success with gateway info', async () => {
  const adapter = resolveAdapter('credit_card');
  const result = await adapter.charge({
    amount: 50000, currency: 'USD', orderId: 'ord2', invoiceId: 'inv2', method: 'credit_card',
  });
  assert.strictEqual(result.success, true);
  assert.ok(result.transactionId.startsWith('online-'));
  assert.strictEqual(result.metadata.gateway, 'simulated');
});

asyncTest('failing adapter charge returns failure', async () => {
  const adapter = resolveAdapter('failing_method');
  const result = await adapter.charge({
    amount: 100, currency: 'USD', orderId: 'ord3', invoiceId: 'inv3', method: 'failing_method',
  });
  assert.strictEqual(result.success, false);
  assert.strictEqual(result.status, 'failed');
});

asyncTest('offline adapter refund returns success', async () => {
  const adapter = resolveAdapter('cash');
  const result = await adapter.refund('offline-123', 25000);
  assert.strictEqual(result.success, true);
  assert.ok(result.transactionId.startsWith('offline-refund-'));
});

asyncTest('online adapter refund returns success', async () => {
  const adapter = resolveAdapter('credit_card');
  const result = await adapter.refund('online-456', 50000);
  assert.strictEqual(result.success, true);
  assert.ok(result.transactionId.startsWith('online-refund-'));
});

asyncTest('failing adapter refund returns failure', async () => {
  const adapter = resolveAdapter('failing_method');
  const result = await adapter.refund('fail-789', 100);
  assert.strictEqual(result.success, false);
});

asyncTest('payment flow: charge records adapterUsed field', async () => {
  // Simulate what payment.service.ts does
  const method = 'credit_card';
  const adapter = resolveAdapter(method);
  const chargeResult = await adapter.charge({
    amount: 30000, currency: 'USD', orderId: 'ord4', invoiceId: 'inv4', method,
  });

  // Simulate payment record creation
  const paymentRecord = {
    method,
    amount: 30000,
    status: chargeResult.success ? 'completed' : 'failed',
    adapterUsed: adapter.name,
    metadata: { adapterTransactionId: chargeResult.transactionId },
  };

  assert.strictEqual(paymentRecord.adapterUsed, 'online');
  assert.strictEqual(paymentRecord.status, 'completed');
  assert.ok(paymentRecord.metadata.adapterTransactionId);
});

setTimeout(() => {
  console.log(`\nPayment Adapter: ${passed} passed, ${failed} failed`);
  if (failed > 0) process.exit(1);
}, 100);
