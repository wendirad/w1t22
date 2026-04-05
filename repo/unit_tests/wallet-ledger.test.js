const assert = require('assert');

class InMemoryLedger {
  constructor() {
    this.balances = new Map();
    this.transactions = [];
    this.idempotencyKeys = new Set();
  }

  getBalance(accountId) {
    return this.balances.get(accountId) || 0;
  }

  recordTransaction(params) {
    const debitKey = `${params.idempotencyKey}-debit`;
    if (this.idempotencyKeys.has(debitKey)) {
      return this.transactions.filter((t) => t.idempotencyKey.startsWith(params.idempotencyKey));
    }

    const debitBalance = this.getBalance(params.debitAccountId) - params.amount;
    this.balances.set(params.debitAccountId, debitBalance);

    const creditBalance = this.getBalance(params.creditAccountId) + params.amount;
    this.balances.set(params.creditAccountId, creditBalance);

    const debitTx = {
      accountId: params.debitAccountId,
      type: 'debit',
      amount: params.amount,
      balanceAfter: debitBalance,
      idempotencyKey: debitKey,
    };

    const creditTx = {
      accountId: params.creditAccountId,
      type: 'credit',
      amount: params.amount,
      balanceAfter: creditBalance,
      idempotencyKey: `${params.idempotencyKey}-credit`,
    };

    this.transactions.push(debitTx, creditTx);
    this.idempotencyKeys.add(debitKey);
    this.idempotencyKeys.add(`${params.idempotencyKey}-credit`);

    return [debitTx, creditTx];
  }
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

console.log('Wallet Ledger Tests:');

test('initial balance is zero', () => {
  const ledger = new InMemoryLedger();
  assert.strictEqual(ledger.getBalance('buyer:123'), 0);
});

test('double-entry creates debit and credit', () => {
  const ledger = new InMemoryLedger();
  const txs = ledger.recordTransaction({
    debitAccountId: 'buyer:123',
    creditAccountId: 'dealership:456',
    amount: 25000,
    idempotencyKey: 'pay-1',
  });
  assert.strictEqual(txs.length, 2);
  assert.strictEqual(txs[0].type, 'debit');
  assert.strictEqual(txs[1].type, 'credit');
});

test('balances update correctly after transaction', () => {
  const ledger = new InMemoryLedger();
  ledger.recordTransaction({
    debitAccountId: 'buyer:123',
    creditAccountId: 'dealership:456',
    amount: 25000,
    idempotencyKey: 'pay-1',
  });
  assert.strictEqual(ledger.getBalance('buyer:123'), -25000);
  assert.strictEqual(ledger.getBalance('dealership:456'), 25000);
});

test('multiple transactions accumulate', () => {
  const ledger = new InMemoryLedger();
  ledger.recordTransaction({
    debitAccountId: 'buyer:123',
    creditAccountId: 'dealership:456',
    amount: 10000,
    idempotencyKey: 'pay-1',
  });
  ledger.recordTransaction({
    debitAccountId: 'buyer:123',
    creditAccountId: 'dealership:456',
    amount: 15000,
    idempotencyKey: 'pay-2',
  });
  assert.strictEqual(ledger.getBalance('buyer:123'), -25000);
  assert.strictEqual(ledger.getBalance('dealership:456'), 25000);
});

test('idempotency prevents duplicate transactions', () => {
  const ledger = new InMemoryLedger();
  ledger.recordTransaction({
    debitAccountId: 'buyer:123',
    creditAccountId: 'dealership:456',
    amount: 10000,
    idempotencyKey: 'pay-1',
  });
  ledger.recordTransaction({
    debitAccountId: 'buyer:123',
    creditAccountId: 'dealership:456',
    amount: 10000,
    idempotencyKey: 'pay-1',
  });
  assert.strictEqual(ledger.getBalance('buyer:123'), -10000);
  assert.strictEqual(ledger.getBalance('dealership:456'), 10000);
});

test('refund reverses balances', () => {
  const ledger = new InMemoryLedger();
  ledger.recordTransaction({
    debitAccountId: 'buyer:123',
    creditAccountId: 'dealership:456',
    amount: 25000,
    idempotencyKey: 'pay-1',
  });
  ledger.recordTransaction({
    debitAccountId: 'dealership:456',
    creditAccountId: 'buyer:123',
    amount: 25000,
    idempotencyKey: 'refund-1',
  });
  assert.strictEqual(ledger.getBalance('buyer:123'), 0);
  assert.strictEqual(ledger.getBalance('dealership:456'), 0);
});

test('balance after is recorded correctly', () => {
  const ledger = new InMemoryLedger();
  const txs = ledger.recordTransaction({
    debitAccountId: 'buyer:123',
    creditAccountId: 'dealership:456',
    amount: 5000,
    idempotencyKey: 'pay-1',
  });
  assert.strictEqual(txs[0].balanceAfter, -5000);
  assert.strictEqual(txs[1].balanceAfter, 5000);
});

console.log(`\nWallet Ledger: ${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
