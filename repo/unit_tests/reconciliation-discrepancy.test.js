const assert = require('assert');

// Simulate reconciliation discrepancy workflow from production code

function reconcile(orders, invoices, payments) {
  const invoiceByOrder = new Map(invoices.map((i) => [i.orderId, i]));
  const paymentsByInvoice = new Map();
  for (const p of payments) {
    if (!paymentsByInvoice.has(p.invoiceId)) paymentsByInvoice.set(p.invoiceId, []);
    paymentsByInvoice.get(p.invoiceId).push(p);
  }

  const discrepancies = [];
  let matchedCount = 0;

  for (const order of orders) {
    const invoice = invoiceByOrder.get(order._id);
    if (!invoice) {
      discrepancies.push({ type: 'missing_invoice', referenceId: order._id, details: `Order ${order.orderNumber} has no invoice` });
      continue;
    }
    const orderPayments = paymentsByInvoice.get(invoice._id) || [];
    const paidAmount = orderPayments.reduce((sum, p) => sum + p.amount, 0);

    if (orderPayments.length === 0) {
      discrepancies.push({ type: 'unpaid_invoice', referenceId: invoice._id, details: `Invoice ${invoice.invoiceNumber} has no payments` });
    } else if (paidAmount !== invoice.total) {
      discrepancies.push({ type: 'amount_mismatch', referenceId: invoice._id, details: `expected ${invoice.total}, paid ${paidAmount}` });
    } else if (invoice.total !== order.totals.total) {
      discrepancies.push({ type: 'order_invoice_mismatch', referenceId: order._id, details: `Order total ${order.totals.total} != Invoice total ${invoice.total}` });
    } else {
      matchedCount++;
    }
  }

  return { matchedCount, discrepancies };
}

function createTickets(reconciliationRunId, dealershipId, discrepancies) {
  return discrepancies.map((d) => ({
    _id: `ticket-${Math.random().toString(36).slice(2, 8)}`,
    reconciliationRunId,
    dealershipId,
    type: d.type,
    referenceId: d.referenceId,
    details: d.details,
    status: 'open',
    assignedTo: null,
    resolution: null,
    resolvedBy: null,
    resolvedAt: null,
  }));
}

function resolveTicket(ticket, resolution, userId) {
  ticket.status = 'resolved';
  ticket.resolution = resolution;
  ticket.resolvedBy = userId;
  ticket.resolvedAt = new Date();
  return ticket;
}

function assignTicket(ticket, userId) {
  ticket.assignedTo = userId;
  ticket.status = 'in_review';
  return ticket;
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

console.log('Reconciliation Discrepancy Tests:');

test('matching order/invoice/payment produces no discrepancies', () => {
  const orders = [{ _id: 'o1', orderNumber: 'ORD-1', totals: { total: 25000 } }];
  const invoices = [{ _id: 'i1', orderId: 'o1', invoiceNumber: 'INV-1', total: 25000 }];
  const payments = [{ _id: 'p1', invoiceId: 'i1', amount: 25000 }];

  const result = reconcile(orders, invoices, payments);
  assert.strictEqual(result.matchedCount, 1);
  assert.strictEqual(result.discrepancies.length, 0);
});

test('missing invoice creates discrepancy', () => {
  const orders = [{ _id: 'o1', orderNumber: 'ORD-1', totals: { total: 25000 } }];
  const result = reconcile(orders, [], []);
  assert.strictEqual(result.discrepancies.length, 1);
  assert.strictEqual(result.discrepancies[0].type, 'missing_invoice');
});

test('unpaid invoice creates discrepancy', () => {
  const orders = [{ _id: 'o1', orderNumber: 'ORD-1', totals: { total: 25000 } }];
  const invoices = [{ _id: 'i1', orderId: 'o1', invoiceNumber: 'INV-1', total: 25000 }];

  const result = reconcile(orders, invoices, []);
  assert.strictEqual(result.discrepancies.length, 1);
  assert.strictEqual(result.discrepancies[0].type, 'unpaid_invoice');
});

test('payment amount mismatch creates discrepancy', () => {
  const orders = [{ _id: 'o1', orderNumber: 'ORD-1', totals: { total: 25000 } }];
  const invoices = [{ _id: 'i1', orderId: 'o1', invoiceNumber: 'INV-1', total: 25000 }];
  const payments = [{ _id: 'p1', invoiceId: 'i1', amount: 20000 }]; // Short $5000

  const result = reconcile(orders, invoices, payments);
  assert.strictEqual(result.discrepancies.length, 1);
  assert.strictEqual(result.discrepancies[0].type, 'amount_mismatch');
  assert.ok(result.discrepancies[0].details.includes('20000'));
});

test('order/invoice total mismatch creates discrepancy', () => {
  const orders = [{ _id: 'o1', orderNumber: 'ORD-1', totals: { total: 25000 } }];
  const invoices = [{ _id: 'i1', orderId: 'o1', invoiceNumber: 'INV-1', total: 26000 }]; // Different total
  const payments = [{ _id: 'p1', invoiceId: 'i1', amount: 26000 }];

  const result = reconcile(orders, invoices, payments);
  assert.strictEqual(result.discrepancies.length, 1);
  assert.strictEqual(result.discrepancies[0].type, 'order_invoice_mismatch');
});

test('discrepancies create actionable tickets', () => {
  const orders = [
    { _id: 'o1', orderNumber: 'ORD-1', totals: { total: 25000 } },
    { _id: 'o2', orderNumber: 'ORD-2', totals: { total: 30000 } },
  ];
  const invoices = [{ _id: 'i1', orderId: 'o1', invoiceNumber: 'INV-1', total: 25000 }];

  const result = reconcile(orders, invoices, []);
  const tickets = createTickets('run-1', 'deal-1', result.discrepancies);

  assert.strictEqual(tickets.length, result.discrepancies.length);
  for (const ticket of tickets) {
    assert.strictEqual(ticket.status, 'open');
    assert.strictEqual(ticket.reconciliationRunId, 'run-1');
    assert.strictEqual(ticket.dealershipId, 'deal-1');
    assert.ok(ticket._id);
    assert.ok(ticket.type);
    assert.ok(ticket.details);
  }
});

test('ticket can be assigned for review', () => {
  const ticket = createTickets('run-1', 'deal-1', [
    { type: 'missing_invoice', referenceId: 'o1', details: 'test' },
  ])[0];

  assignTicket(ticket, 'reviewer1');
  assert.strictEqual(ticket.status, 'in_review');
  assert.strictEqual(ticket.assignedTo, 'reviewer1');
});

test('ticket can be resolved with resolution note', () => {
  const ticket = createTickets('run-1', 'deal-1', [
    { type: 'unpaid_invoice', referenceId: 'i1', details: 'test' },
  ])[0];

  resolveTicket(ticket, 'Invoice was generated after reconciliation window', 'resolver1');
  assert.strictEqual(ticket.status, 'resolved');
  assert.strictEqual(ticket.resolution, 'Invoice was generated after reconciliation window');
  assert.strictEqual(ticket.resolvedBy, 'resolver1');
  assert.ok(ticket.resolvedAt);
});

test('multiple discrepancies from same run create separate tickets', () => {
  const orders = [
    { _id: 'o1', orderNumber: 'ORD-1', totals: { total: 10000 } },
    { _id: 'o2', orderNumber: 'ORD-2', totals: { total: 20000 } },
    { _id: 'o3', orderNumber: 'ORD-3', totals: { total: 30000 } },
  ];
  // No invoices for any
  const result = reconcile(orders, [], []);
  const tickets = createTickets('run-2', 'deal-2', result.discrepancies);

  assert.strictEqual(tickets.length, 3);
  assert.ok(tickets.every((t) => t.type === 'missing_invoice'));
  const refIds = tickets.map((t) => t.referenceId);
  assert.ok(refIds.includes('o1'));
  assert.ok(refIds.includes('o2'));
  assert.ok(refIds.includes('o3'));
});

console.log(`\nReconciliation Discrepancy: ${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
