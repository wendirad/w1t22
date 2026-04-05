const assert = require('assert');

function calculateTax(subtotal, rate) {
  return Math.round(subtotal * rate);
}

function buildInvoice(items, taxRate) {
  let subtotal = 0;
  const lineItems = items.map((item) => {
    const taxAmount = calculateTax(item.price, taxRate);
    subtotal += item.price;
    return {
      description: item.description,
      quantity: 1,
      unitPrice: item.price,
      taxRate,
      taxAmount,
      total: item.price + taxAmount,
    };
  });

  const totalTax = calculateTax(subtotal, taxRate);
  return {
    lineItems,
    subtotal,
    taxBreakdown: [{ jurisdiction: 'Test', rate: taxRate, amount: totalTax }],
    total: subtotal + totalTax,
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

console.log('Tax Calculation Tests:');

test('basic tax calculation', () => {
  assert.strictEqual(calculateTax(10000, 0.089), 890);
});

test('zero tax rate', () => {
  assert.strictEqual(calculateTax(50000, 0), 0);
});

test('rounds to nearest cent', () => {
  const tax = calculateTax(33333, 0.075);
  assert.strictEqual(tax, 2500);
});

test('invoice with single item', () => {
  const invoice = buildInvoice([{ description: '2024 Toyota Camry', price: 2499900 }], 0.089);
  assert.strictEqual(invoice.subtotal, 2499900);
  assert.strictEqual(invoice.taxBreakdown[0].amount, 222491);
  assert.strictEqual(invoice.total, 2499900 + 222491);
});

test('invoice with multiple items', () => {
  const items = [
    { description: '2024 Honda Accord', price: 2899900 },
    { description: 'Inspection Package', price: 29900 },
    { description: 'Extended Warranty', price: 149900 },
  ];
  const invoice = buildInvoice(items, 0.075);
  const expectedSubtotal = 2899900 + 29900 + 149900;
  assert.strictEqual(invoice.subtotal, expectedSubtotal);
  assert.strictEqual(invoice.lineItems.length, 3);
});

test('different state/county rates', () => {
  const georgiaFulton = calculateTax(2500000, 0.089);
  const floridaHillsborough = calculateTax(2500000, 0.075);
  const texas = calculateTax(2500000, 0.0625);
  assert.ok(georgiaFulton > floridaHillsborough);
  assert.ok(floridaHillsborough > texas);
});

test('very large amount', () => {
  const tax = calculateTax(10000000, 0.089);
  assert.strictEqual(tax, 890000);
});

test('very small amount', () => {
  const tax = calculateTax(100, 0.089);
  assert.strictEqual(tax, 9);
});

console.log(`\nTax Calculation: ${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
