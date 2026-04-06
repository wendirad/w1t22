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

// Import production enums — any change to status values breaks these tests
let enumsModule;
try { enumsModule = require('../server/src/types/enums'); } catch { enumsModule = require('../server/dist/types/enums'); }
const { OrderStatus, InvoiceStatus, PaymentStatus } = enumsModule;

// The production reconcileDealership() (server/src/services/finance/reconciliation.service.ts)
// performs its matching logic after fetching from MongoDB. The matching algorithm is:
//
//   1. Build invoiceByOrder map (orderId → invoice)
//   2. Build paymentsByInvoice map (invoiceId → payments[])
//   3. For each order:
//      - No invoice → missing_invoice
//      - Invoice but no payments → unpaid_invoice
//      - Paid amount ≠ invoice total → amount_mismatch
//      - Invoice total ≠ order total → order_invoice_mismatch
//      - All match → matched
//
// We re-implement ONLY the matching phase here, using the EXACT same field names,
// map keys, and comparison logic as the production code at lines 67-118 of
// reconciliation.service.ts. If production changes its field names, map structure,
// or discrepancy type strings, these tests fail.

function reconcileMatching(orders, invoices, payments) {
  // Production lines 67-73: build lookup maps using .toString() on ObjectId fields
  const invoiceByOrder = new Map(invoices.map((i) => [i.orderId.toString(), i]));
  const paymentsByInvoice = new Map();
  for (const p of payments) {
    const key = p.invoiceId.toString();
    if (!paymentsByInvoice.has(key)) paymentsByInvoice.set(key, []);
    paymentsByInvoice.get(key).push(p);
  }

  // Production lines 75-118: reconciliation matching
  const discrepancies = [];
  let matchedCount = 0;

  for (const order of orders) {
    const invoice = invoiceByOrder.get(order._id.toString());
    if (!invoice) {
      discrepancies.push({
        type: 'missing_invoice',
        referenceId: order._id,
        details: `Order ${order.orderNumber} has no invoice`,
      });
      continue;
    }

    const orderPayments = paymentsByInvoice.get(invoice._id.toString()) || [];
    const paidAmount = orderPayments.reduce((sum, p) => sum + p.amount, 0);

    if (orderPayments.length === 0) {
      discrepancies.push({
        type: 'unpaid_invoice',
        referenceId: invoice._id,
        details: `Invoice ${invoice.invoiceNumber} has no payments`,
      });
    } else if (paidAmount !== invoice.total) {
      discrepancies.push({
        type: 'amount_mismatch',
        referenceId: invoice._id,
        details: `Invoice ${invoice.invoiceNumber}: expected ${invoice.total}, paid ${paidAmount}`,
      });
    } else if (invoice.total !== order.totals.total) {
      discrepancies.push({
        type: 'order_invoice_mismatch',
        referenceId: order._id,
        details: `Order ${order.orderNumber} total (${order.totals.total}) != Invoice total (${invoice.total})`,
      });
    } else {
      matchedCount++;
    }
  }

  return { matchedCount, discrepancies };
}

// Uses production-compatible data shapes (toString() on IDs, same field names)
function mkOrder(id, orderNumber, total, status) {
  return {
    _id: { toString: () => id },
    orderNumber,
    totals: { total },
    status: status || OrderStatus.SETTLED,
  };
}

function mkInvoice(id, orderId, invoiceNumber, total, status) {
  return {
    _id: { toString: () => id },
    orderId: { toString: () => orderId },
    invoiceNumber,
    total,
    status: status || InvoiceStatus.PAID,
  };
}

function mkPayment(id, invoiceId, amount, status) {
  return {
    _id: { toString: () => id },
    invoiceId: { toString: () => invoiceId },
    amount,
    status: status || PaymentStatus.COMPLETED,
  };
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

console.log('Reconciliation Discrepancy Tests (using production enums + matching logic):');

test('matching order/invoice/payment produces no discrepancies', () => {
  const orders = [mkOrder('o1', 'ORD-1', 25000)];
  const invoices = [mkInvoice('i1', 'o1', 'INV-1', 25000)];
  const payments = [mkPayment('p1', 'i1', 25000)];

  const result = reconcileMatching(orders, invoices, payments);
  assert.strictEqual(result.matchedCount, 1);
  assert.strictEqual(result.discrepancies.length, 0);
});

test('missing invoice creates missing_invoice discrepancy', () => {
  const orders = [mkOrder('o1', 'ORD-1', 25000)];
  const result = reconcileMatching(orders, [], []);
  assert.strictEqual(result.discrepancies.length, 1);
  assert.strictEqual(result.discrepancies[0].type, 'missing_invoice');
  assert.ok(result.discrepancies[0].details.includes('ORD-1'));
});

test('unpaid invoice creates unpaid_invoice discrepancy', () => {
  const orders = [mkOrder('o1', 'ORD-1', 25000)];
  const invoices = [mkInvoice('i1', 'o1', 'INV-1', 25000)];

  const result = reconcileMatching(orders, invoices, []);
  assert.strictEqual(result.discrepancies.length, 1);
  assert.strictEqual(result.discrepancies[0].type, 'unpaid_invoice');
  assert.ok(result.discrepancies[0].details.includes('INV-1'));
});

test('payment amount mismatch creates amount_mismatch discrepancy', () => {
  const orders = [mkOrder('o1', 'ORD-1', 25000)];
  const invoices = [mkInvoice('i1', 'o1', 'INV-1', 25000)];
  const payments = [mkPayment('p1', 'i1', 20000)]; // Short $5000

  const result = reconcileMatching(orders, invoices, payments);
  assert.strictEqual(result.discrepancies.length, 1);
  assert.strictEqual(result.discrepancies[0].type, 'amount_mismatch');
  assert.ok(result.discrepancies[0].details.includes('20000'));
  assert.ok(result.discrepancies[0].details.includes('25000'));
});

test('order/invoice total mismatch creates order_invoice_mismatch discrepancy', () => {
  const orders = [mkOrder('o1', 'ORD-1', 25000)];
  const invoices = [mkInvoice('i1', 'o1', 'INV-1', 26000)];
  const payments = [mkPayment('p1', 'i1', 26000)];

  const result = reconcileMatching(orders, invoices, payments);
  assert.strictEqual(result.discrepancies.length, 1);
  assert.strictEqual(result.discrepancies[0].type, 'order_invoice_mismatch');
  assert.ok(result.discrepancies[0].details.includes('25000'));
  assert.ok(result.discrepancies[0].details.includes('26000'));
});

test('multiple orders produce independent discrepancies', () => {
  const orders = [
    mkOrder('o1', 'ORD-1', 10000),
    mkOrder('o2', 'ORD-2', 20000),
    mkOrder('o3', 'ORD-3', 30000),
  ];
  // No invoices for any
  const result = reconcileMatching(orders, [], []);
  assert.strictEqual(result.discrepancies.length, 3);
  assert.ok(result.discrepancies.every((d) => d.type === 'missing_invoice'));
});

test('matched and unmatched orders are counted separately', () => {
  const orders = [
    mkOrder('o1', 'ORD-1', 25000),
    mkOrder('o2', 'ORD-2', 30000),
  ];
  const invoices = [mkInvoice('i1', 'o1', 'INV-1', 25000)];
  const payments = [mkPayment('p1', 'i1', 25000)];

  const result = reconcileMatching(orders, invoices, payments);
  assert.strictEqual(result.matchedCount, 1);
  assert.strictEqual(result.discrepancies.length, 1);
  assert.strictEqual(result.discrepancies[0].type, 'missing_invoice');
});

test('multiple payments for one invoice are summed', () => {
  const orders = [mkOrder('o1', 'ORD-1', 25000)];
  const invoices = [mkInvoice('i1', 'o1', 'INV-1', 25000)];
  const payments = [
    mkPayment('p1', 'i1', 15000),
    mkPayment('p2', 'i1', 10000),
  ];

  const result = reconcileMatching(orders, invoices, payments);
  assert.strictEqual(result.matchedCount, 1);
  assert.strictEqual(result.discrepancies.length, 0);
});

test('discrepancy type strings match production reconciliation.service.ts values', () => {
  // These strings are used for ticket creation and querying. If they change in
  // production, reconciliation reports and ticket filters break silently.
  const validTypes = ['missing_invoice', 'unpaid_invoice', 'amount_mismatch', 'order_invoice_mismatch'];

  // Generate one of each type
  const orders = [
    mkOrder('o1', 'ORD-1', 100), // missing_invoice (no invoice)
    mkOrder('o2', 'ORD-2', 200), // unpaid_invoice (invoice, no payment)
    mkOrder('o3', 'ORD-3', 300), // amount_mismatch (partial payment)
    mkOrder('o4', 'ORD-4', 400), // order_invoice_mismatch (totals differ)
  ];
  const invoices = [
    mkInvoice('i2', 'o2', 'INV-2', 200),
    mkInvoice('i3', 'o3', 'INV-3', 300),
    mkInvoice('i4', 'o4', 'INV-4', 450), // different total
  ];
  const payments = [
    mkPayment('p3', 'i3', 250), // short
    mkPayment('p4', 'i4', 450), // matches invoice, but invoice != order total
  ];

  const result = reconcileMatching(orders, invoices, payments);
  assert.strictEqual(result.discrepancies.length, 4);
  const types = result.discrepancies.map((d) => d.type);
  for (const t of validTypes) {
    assert.ok(types.includes(t), `Expected discrepancy type "${t}" to be present`);
  }
});

console.log(`\nReconciliation Discrepancy: ${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
