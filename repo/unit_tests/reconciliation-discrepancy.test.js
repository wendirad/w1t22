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

// Import the PRODUCTION matching function directly from reconciliation.service.ts.
// This is the same function that reconcileDealership() calls at runtime.
let reconModule, enumsModule;
try { reconModule = require('../server/src/services/finance/reconciliation.service'); } catch { reconModule = require('../server/dist/services/finance/reconciliation.service'); }
try { enumsModule = require('../server/src/types/enums'); } catch { enumsModule = require('../server/dist/types/enums'); }

const { matchOrdersInvoicesPayments } = reconModule;
const { OrderStatus, InvoiceStatus, PaymentStatus } = enumsModule;

// Helpers that produce production-compatible data shapes (toString() on IDs)
function mkOrder(id, orderNumber, total) {
  return { _id: { toString: () => id }, orderNumber, totals: { total }, status: OrderStatus.SETTLED };
}
function mkInvoice(id, orderId, invoiceNumber, total) {
  return { _id: { toString: () => id }, orderId: { toString: () => orderId }, invoiceNumber, total, status: InvoiceStatus.PAID };
}
function mkPayment(id, invoiceId, amount) {
  return { _id: { toString: () => id }, invoiceId: { toString: () => invoiceId }, amount, status: PaymentStatus.COMPLETED };
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

console.log('Reconciliation Discrepancy Tests (using production matchOrdersInvoicesPayments):');

test('matching order/invoice/payment produces no discrepancies', () => {
  const result = matchOrdersInvoicesPayments(
    [mkOrder('o1', 'ORD-1', 25000)],
    [mkInvoice('i1', 'o1', 'INV-1', 25000)],
    [mkPayment('p1', 'i1', 25000)],
  );
  assert.strictEqual(result.matchedCount, 1);
  assert.strictEqual(result.discrepancies.length, 0);
});

test('missing invoice creates missing_invoice discrepancy', () => {
  const result = matchOrdersInvoicesPayments([mkOrder('o1', 'ORD-1', 25000)], [], []);
  assert.strictEqual(result.discrepancies.length, 1);
  assert.strictEqual(result.discrepancies[0].type, 'missing_invoice');
  assert.ok(result.discrepancies[0].details.includes('ORD-1'));
});

test('unpaid invoice creates unpaid_invoice discrepancy', () => {
  const result = matchOrdersInvoicesPayments(
    [mkOrder('o1', 'ORD-1', 25000)],
    [mkInvoice('i1', 'o1', 'INV-1', 25000)],
    [],
  );
  assert.strictEqual(result.discrepancies.length, 1);
  assert.strictEqual(result.discrepancies[0].type, 'unpaid_invoice');
  assert.ok(result.discrepancies[0].details.includes('INV-1'));
});

test('payment amount mismatch creates amount_mismatch discrepancy', () => {
  const result = matchOrdersInvoicesPayments(
    [mkOrder('o1', 'ORD-1', 25000)],
    [mkInvoice('i1', 'o1', 'INV-1', 25000)],
    [mkPayment('p1', 'i1', 20000)],
  );
  assert.strictEqual(result.discrepancies.length, 1);
  assert.strictEqual(result.discrepancies[0].type, 'amount_mismatch');
  assert.ok(result.discrepancies[0].details.includes('20000'));
  assert.ok(result.discrepancies[0].details.includes('25000'));
});

test('order/invoice total mismatch creates order_invoice_mismatch discrepancy', () => {
  const result = matchOrdersInvoicesPayments(
    [mkOrder('o1', 'ORD-1', 25000)],
    [mkInvoice('i1', 'o1', 'INV-1', 26000)],
    [mkPayment('p1', 'i1', 26000)],
  );
  assert.strictEqual(result.discrepancies.length, 1);
  assert.strictEqual(result.discrepancies[0].type, 'order_invoice_mismatch');
});

test('multiple orders produce independent discrepancies', () => {
  const result = matchOrdersInvoicesPayments(
    [mkOrder('o1', 'ORD-1', 10000), mkOrder('o2', 'ORD-2', 20000), mkOrder('o3', 'ORD-3', 30000)],
    [], [],
  );
  assert.strictEqual(result.discrepancies.length, 3);
  assert.ok(result.discrepancies.every((d) => d.type === 'missing_invoice'));
});

test('matched and unmatched orders are counted separately', () => {
  const result = matchOrdersInvoicesPayments(
    [mkOrder('o1', 'ORD-1', 25000), mkOrder('o2', 'ORD-2', 30000)],
    [mkInvoice('i1', 'o1', 'INV-1', 25000)],
    [mkPayment('p1', 'i1', 25000)],
  );
  assert.strictEqual(result.matchedCount, 1);
  assert.strictEqual(result.discrepancies.length, 1);
});

test('multiple payments for one invoice are summed', () => {
  const result = matchOrdersInvoicesPayments(
    [mkOrder('o1', 'ORD-1', 25000)],
    [mkInvoice('i1', 'o1', 'INV-1', 25000)],
    [mkPayment('p1', 'i1', 15000), mkPayment('p2', 'i1', 10000)],
  );
  assert.strictEqual(result.matchedCount, 1);
  assert.strictEqual(result.discrepancies.length, 0);
});

test('discrepancy type strings match all four production values', () => {
  const orders = [
    mkOrder('o1', 'ORD-1', 100),
    mkOrder('o2', 'ORD-2', 200),
    mkOrder('o3', 'ORD-3', 300),
    mkOrder('o4', 'ORD-4', 400),
  ];
  const invoices = [
    mkInvoice('i2', 'o2', 'INV-2', 200),
    mkInvoice('i3', 'o3', 'INV-3', 300),
    mkInvoice('i4', 'o4', 'INV-4', 450),
  ];
  const payments = [mkPayment('p3', 'i3', 250), mkPayment('p4', 'i4', 450)];

  const result = matchOrdersInvoicesPayments(orders, invoices, payments);
  assert.strictEqual(result.discrepancies.length, 4);
  const types = result.discrepancies.map((d) => d.type);
  for (const t of ['missing_invoice', 'unpaid_invoice', 'amount_mismatch', 'order_invoice_mismatch']) {
    assert.ok(types.includes(t), `Missing discrepancy type: ${t}`);
  }
});

console.log(`\nReconciliation Discrepancy: ${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
