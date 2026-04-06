const assert = require('assert');
const path = require('path');

// Register TypeScript support for direct source imports
try {
  require('ts-node').register({
    transpileOnly: true,
    project: path.join(__dirname, '..', 'server', 'tsconfig.json'),
    compilerOptions: { module: 'commonjs' },
  });
} catch { /* ts-node not available; fall back to dist */ }

// Import the PRODUCTION pure functions from wallet-ledger.service.ts.
// These are the same functions used at runtime for key derivation and
// accounting verification. If production changes the key format or the
// equation check, these tests break.
let walletModule;
try { walletModule = require('../server/src/services/finance/wallet-ledger.service'); } catch { walletModule = require('../server/dist/services/finance/wallet-ledger.service'); }

const { deriveIdempotencyKeys, verifyAccountingEquation } = walletModule;

// The full recordTransaction requires MongoDB. We use a thin in-memory double
// that follows the same contract (field names, key format, accounting rules)
// verified by the production pure functions above.
class LedgerDouble {
  constructor() {
    this.balances = new Map();
    this.transactions = [];
    this.seenKeys = new Set();
  }

  getBalance(accountId) { return this.balances.get(accountId) || 0; }

  recordTransaction(params) {
    const { debitKey, creditKey } = deriveIdempotencyKeys(params.idempotencyKey);

    // Idempotency: same contract as production line 22-24
    if (this.seenKeys.has(debitKey)) {
      return this.transactions.filter((t) => t.idempotencyKey === debitKey || t.idempotencyKey === creditKey);
    }

    const debitBalance = this.getBalance(params.debitAccountId) - params.amount;
    this.balances.set(params.debitAccountId, debitBalance);
    const creditBalance = this.getBalance(params.creditAccountId) + params.amount;
    this.balances.set(params.creditAccountId, creditBalance);

    const debitTx = {
      dealershipId: params.dealershipId, accountId: params.debitAccountId,
      type: 'debit', amount: params.amount, referenceType: params.referenceType,
      referenceId: params.referenceId, balanceAfter: debitBalance,
      description: params.description, idempotencyKey: debitKey,
    };
    const creditTx = {
      dealershipId: params.dealershipId, accountId: params.creditAccountId,
      type: 'credit', amount: params.amount, referenceType: params.referenceType,
      referenceId: params.referenceId, balanceAfter: creditBalance,
      description: params.description, idempotencyKey: creditKey,
    };

    this.transactions.push(debitTx, creditTx);
    this.seenKeys.add(debitKey);
    this.seenKeys.add(creditKey);
    return { debit: debitTx, credit: creditTx };
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

console.log('Wallet Ledger Tests (using production deriveIdempotencyKeys + verifyAccountingEquation):');

// --- Production pure-function tests ---

test('deriveIdempotencyKeys returns correct format', () => {
  const { debitKey, creditKey } = deriveIdempotencyKeys('pay-123');
  assert.strictEqual(debitKey, 'pay-123-debit');
  assert.strictEqual(creditKey, 'pay-123-credit');
});

test('deriveIdempotencyKeys is deterministic', () => {
  const a = deriveIdempotencyKeys('key-1');
  const b = deriveIdempotencyKeys('key-1');
  assert.strictEqual(a.debitKey, b.debitKey);
  assert.strictEqual(a.creditKey, b.creditKey);
});

test('verifyAccountingEquation detects balanced transactions', () => {
  const result = verifyAccountingEquation([
    { type: 'debit', amount: 25000 },
    { type: 'credit', amount: 25000 },
  ]);
  assert.strictEqual(result.balanced, true);
  assert.strictEqual(result.totalDebits, 25000);
  assert.strictEqual(result.totalCredits, 25000);
});

test('verifyAccountingEquation detects imbalanced transactions', () => {
  const result = verifyAccountingEquation([
    { type: 'debit', amount: 25000 },
    { type: 'credit', amount: 20000 },
  ]);
  assert.strictEqual(result.balanced, false);
});

test('verifyAccountingEquation handles multiple entries', () => {
  const result = verifyAccountingEquation([
    { type: 'debit', amount: 10000 },
    { type: 'credit', amount: 10000 },
    { type: 'debit', amount: 5000 },
    { type: 'credit', amount: 5000 },
  ]);
  assert.strictEqual(result.balanced, true);
  assert.strictEqual(result.totalDebits, 15000);
  assert.strictEqual(result.totalCredits, 15000);
});

// --- Double-entry contract tests using LedgerDouble (backed by production key derivation) ---

test('initial balance is zero', () => {
  const ledger = new LedgerDouble();
  assert.strictEqual(ledger.getBalance('buyer:123'), 0);
});

test('recordTransaction creates debit and credit entries', () => {
  const ledger = new LedgerDouble();
  const result = ledger.recordTransaction({
    dealershipId: 'deal1', debitAccountId: 'buyer:123', creditAccountId: 'dealership:456',
    amount: 25000, referenceType: 'payment', referenceId: 'pay-1',
    description: 'Payment', idempotencyKey: 'pay-1',
  });
  assert.strictEqual(result.debit.type, 'debit');
  assert.strictEqual(result.credit.type, 'credit');
  // Verify keys came from the production function
  const { debitKey, creditKey } = deriveIdempotencyKeys('pay-1');
  assert.strictEqual(result.debit.idempotencyKey, debitKey);
  assert.strictEqual(result.credit.idempotencyKey, creditKey);
});

test('debit decreases, credit increases balances', () => {
  const ledger = new LedgerDouble();
  ledger.recordTransaction({
    dealershipId: 'deal1', debitAccountId: 'buyer:123', creditAccountId: 'dealership:456',
    amount: 25000, referenceType: 'payment', referenceId: 'pay-1',
    description: 'Payment', idempotencyKey: 'pay-1',
  });
  assert.strictEqual(ledger.getBalance('buyer:123'), -25000);
  assert.strictEqual(ledger.getBalance('dealership:456'), 25000);
});

test('all transactions satisfy accounting equation', () => {
  const ledger = new LedgerDouble();
  ledger.recordTransaction({
    dealershipId: 'deal1', debitAccountId: 'buyer:123', creditAccountId: 'dealership:456',
    amount: 10000, referenceType: 'payment', referenceId: 'pay-1',
    description: 'Payment 1', idempotencyKey: 'pay-1',
  });
  ledger.recordTransaction({
    dealershipId: 'deal1', debitAccountId: 'buyer:123', creditAccountId: 'dealership:456',
    amount: 15000, referenceType: 'payment', referenceId: 'pay-2',
    description: 'Payment 2', idempotencyKey: 'pay-2',
  });
  const check = verifyAccountingEquation(ledger.transactions);
  assert.strictEqual(check.balanced, true);
  assert.strictEqual(check.totalDebits, 25000);
  assert.strictEqual(check.totalCredits, 25000);
});

test('idempotency prevents duplicate transactions', () => {
  const ledger = new LedgerDouble();
  ledger.recordTransaction({
    dealershipId: 'deal1', debitAccountId: 'buyer:123', creditAccountId: 'dealership:456',
    amount: 10000, referenceType: 'payment', referenceId: 'pay-1',
    description: 'Payment', idempotencyKey: 'pay-1',
  });
  ledger.recordTransaction({
    dealershipId: 'deal1', debitAccountId: 'buyer:123', creditAccountId: 'dealership:456',
    amount: 10000, referenceType: 'payment', referenceId: 'pay-1',
    description: 'Payment', idempotencyKey: 'pay-1',
  });
  assert.strictEqual(ledger.getBalance('buyer:123'), -10000);
  assert.strictEqual(ledger.transactions.length, 2);
});

test('refund reverses balances', () => {
  const ledger = new LedgerDouble();
  ledger.recordTransaction({
    dealershipId: 'deal1', debitAccountId: 'buyer:123', creditAccountId: 'dealership:456',
    amount: 25000, referenceType: 'payment', referenceId: 'pay-1',
    description: 'Payment', idempotencyKey: 'pay-1',
  });
  ledger.recordTransaction({
    dealershipId: 'deal1', debitAccountId: 'dealership:456', creditAccountId: 'buyer:123',
    amount: 25000, referenceType: 'refund', referenceId: 'pay-1',
    description: 'Refund', idempotencyKey: 'refund-pay-1',
  });
  assert.strictEqual(ledger.getBalance('buyer:123'), 0);
  assert.strictEqual(ledger.getBalance('dealership:456'), 0);
  const check = verifyAccountingEquation(ledger.transactions);
  assert.strictEqual(check.balanced, true);
});

test('balanceAfter is recorded per transaction', () => {
  const ledger = new LedgerDouble();
  const result = ledger.recordTransaction({
    dealershipId: 'deal1', debitAccountId: 'buyer:123', creditAccountId: 'dealership:456',
    amount: 5000, referenceType: 'payment', referenceId: 'pay-1',
    description: 'Payment', idempotencyKey: 'pay-1',
  });
  assert.strictEqual(result.debit.balanceAfter, -5000);
  assert.strictEqual(result.credit.balanceAfter, 5000);
});

console.log(`\nWallet Ledger: ${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
