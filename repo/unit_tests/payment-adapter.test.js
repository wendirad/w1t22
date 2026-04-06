const assert = require('assert');
const fs = require('fs');
const path = require('path');

// Load .env so config module can initialize
const envPath = path.join(__dirname, '..', '.env');
if (fs.existsSync(envPath)) {
  const envContent = fs.readFileSync(envPath, 'utf8');
  for (const line of envContent.split('\n')) {
    const trimmed = line.trim();
    if (trimmed && !trimmed.startsWith('#')) {
      const eqIdx = trimmed.indexOf('=');
      if (eqIdx > 0) {
        const key = trimmed.slice(0, eqIdx);
        const value = trimmed.slice(eqIdx + 1);
        if (!process.env[key]) process.env[key] = value;
      }
    }
  }
}

const {
  OfflinePaymentAdapter,
  OnlinePaymentAdapter,
  resolveAdapter,
} = require('../server/dist/services/finance/payment-adapter');

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

console.log('Payment Adapter Tests (using production modules):');

test('offline adapter supports cash', () => {
  const adapter = new OfflinePaymentAdapter();
  assert.strictEqual(adapter.supports('cash'), true);
});

test('offline adapter supports cashier_check', () => {
  const adapter = new OfflinePaymentAdapter();
  assert.strictEqual(adapter.supports('cashier_check'), true);
});

test('offline adapter supports in_house_financing', () => {
  const adapter = new OfflinePaymentAdapter();
  assert.strictEqual(adapter.supports('in_house_financing'), true);
});

test('online adapter supports credit_card', () => {
  const adapter = new OnlinePaymentAdapter();
  assert.strictEqual(adapter.supports('credit_card'), true);
});

test('online adapter supports bank_transfer', () => {
  const adapter = new OnlinePaymentAdapter();
  assert.strictEqual(adapter.supports('bank_transfer'), true);
});

test('resolveAdapter returns offline for cash', () => {
  const adapter = resolveAdapter('cash');
  assert.strictEqual(adapter.name, 'offline');
});

test('resolveAdapter rejects online methods when flag is disabled (default)', () => {
  // ENABLE_ONLINE_PAYMENTS is not set, so config.enableOnlinePayments is false
  try {
    resolveAdapter('credit_card');
    assert.fail('Should have thrown - online payments disabled by default');
  } catch (e) {
    assert.ok(e.message.includes('not enabled'), `Expected "not enabled" error, got: ${e.message}`);
  }
});

test('resolveAdapter rejects bank_transfer when flag is disabled', () => {
  try {
    resolveAdapter('bank_transfer');
    assert.fail('Should have thrown');
  } catch (e) {
    assert.ok(e.message.includes('not enabled'));
  }
});

test('unknown method throws error', () => {
  try {
    resolveAdapter('bitcoin');
    assert.fail('Should have thrown');
  } catch (e) {
    assert.ok(e.message.includes('No payment adapter') || e.message.includes('not enabled'));
  }
});

asyncTest('offline adapter charge returns success', async () => {
  const adapter = new OfflinePaymentAdapter();
  const result = await adapter.charge({
    amount: 25000, currency: 'USD', orderId: 'ord1', invoiceId: 'inv1', method: 'cash',
  });
  assert.strictEqual(result.success, true);
  assert.strictEqual(result.status, 'completed');
  assert.ok(result.transactionId.startsWith('offline-'));
});

asyncTest('online adapter charge returns success', async () => {
  const adapter = new OnlinePaymentAdapter();
  const result = await adapter.charge({
    amount: 50000, currency: 'USD', orderId: 'ord2', invoiceId: 'inv2', method: 'credit_card',
  });
  assert.strictEqual(result.success, true);
  assert.ok(result.transactionId.startsWith('online-'));
});

asyncTest('offline adapter refund returns success', async () => {
  const adapter = new OfflinePaymentAdapter();
  const result = await adapter.refund('offline-123', 25000);
  assert.strictEqual(result.success, true);
});

asyncTest('adapter result includes adapterUsed field for payment records', async () => {
  const adapter = resolveAdapter('cash');
  const chargeResult = await adapter.charge({
    amount: 30000, currency: 'USD', orderId: 'ord4', invoiceId: 'inv4', method: 'cash',
  });
  // Simulate payment record
  const paymentRecord = { adapterUsed: adapter.name, status: chargeResult.success ? 'completed' : 'failed' };
  assert.strictEqual(paymentRecord.adapterUsed, 'offline');
});

setTimeout(() => {
  console.log(`\nPayment Adapter: ${passed} passed, ${failed} failed`);
  if (failed > 0) process.exit(1);
}, 100);
