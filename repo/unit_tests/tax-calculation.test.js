const assert = require('assert');
const path = require('path');
const fs = require('fs');

// Load .env so config module can initialize (required by invoice.service imports)
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

// Register TypeScript support for direct source imports
try {
  require('ts-node').register({
    transpileOnly: true,
    project: path.join(__dirname, '..', 'server', 'tsconfig.json'),
    compilerOptions: { module: 'commonjs' },
  });
} catch { /* ts-node not available; fall back to dist */ }

// Import the PRODUCTION tax computation function from invoice.service.ts.
// This is the same function used by calculateTax() and generateInvoicePreview()
// at runtime. If production changes the rounding logic, this test breaks.
let invoiceModule;
try { invoiceModule = require('../server/src/services/finance/invoice.service'); } catch { invoiceModule = require('../server/dist/services/finance/invoice.service'); }

const { computeTaxAmount } = invoiceModule;

// buildInvoice uses the production computeTaxAmount for the arithmetic,
// matching how generateInvoicePreview builds line items.
function buildInvoice(items, taxRate) {
  let subtotal = 0;
  const lineItems = items.map((item) => {
    const taxAmount = computeTaxAmount(item.price, taxRate);
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

  const totalTax = computeTaxAmount(subtotal, taxRate);
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

console.log('Tax Calculation Tests (using production computeTaxAmount):');

test('basic tax calculation', () => {
  assert.strictEqual(computeTaxAmount(10000, 0.089), 890);
});

test('zero tax rate', () => {
  assert.strictEqual(computeTaxAmount(50000, 0), 0);
});

test('rounds to nearest cent', () => {
  const tax = computeTaxAmount(33333, 0.075);
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
  const georgiaFulton = computeTaxAmount(2500000, 0.089);
  const floridaHillsborough = computeTaxAmount(2500000, 0.075);
  const texas = computeTaxAmount(2500000, 0.0625);
  assert.ok(georgiaFulton > floridaHillsborough);
  assert.ok(floridaHillsborough > texas);
});

test('very large amount', () => {
  const tax = computeTaxAmount(10000000, 0.089);
  assert.strictEqual(tax, 890000);
});

test('very small amount', () => {
  const tax = computeTaxAmount(100, 0.089);
  assert.strictEqual(tax, 9);
});

console.log(`\nTax Calculation: ${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
