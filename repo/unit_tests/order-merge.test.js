const assert = require('assert');
const path = require('path');
const fs = require('fs');

// Load .env so config module can initialize (required by order.service imports)
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

// Import the PRODUCTION validation and arithmetic functions directly.
// These are the same functions that mergeOrders() calls at runtime.
let orderServiceModule, enumsModule;
try { orderServiceModule = require('../server/src/services/order/order.service'); } catch { orderServiceModule = require('../server/dist/services/order/order.service'); }
try { enumsModule = require('../server/src/types/enums'); } catch { enumsModule = require('../server/dist/types/enums'); }

const { validateMergeOrders, computeMergedOrder } = orderServiceModule;
const { OrderStatus } = enumsModule;

function createOrder(id, dealershipId, buyerId, items, status) {
  return {
    _id: id,
    orderNumber: `ORD-${id}`,
    dealershipId: { toString: () => dealershipId },
    buyerId: { toString: () => buyerId },
    items: items.map((i) => ({
      vehicleId: i.vehicleId,
      subtotal: i.subtotal,
      addOnServices: i.addOnServices || [],
    })),
    totals: {
      subtotal: items.reduce((s, i) => s + i.subtotal, 0),
      tax: 0,
      total: items.reduce((s, i) => s + i.subtotal, 0),
    },
    status,
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

console.log('Order Merge Tests (using production validateMergeOrders + computeMergedOrder):');

test('validation passes for two CREATED orders in same dealership and buyer', () => {
  const o1 = createOrder('1', 'deal1', 'buyer1', [{ vehicleId: 'v1', subtotal: 20000 }], OrderStatus.CREATED);
  const o2 = createOrder('2', 'deal1', 'buyer1', [{ vehicleId: 'v2', subtotal: 30000 }], OrderStatus.CREATED);
  validateMergeOrders([o1, o2]); // should not throw
});

test('computeMergedOrder computes correct totals', () => {
  const o1 = createOrder('1', 'deal1', 'buyer1', [{ vehicleId: 'v1', subtotal: 20000 }], OrderStatus.CREATED);
  const o2 = createOrder('2', 'deal1', 'buyer1', [{ vehicleId: 'v2', subtotal: 30000 }], OrderStatus.CREATED);
  const result = computeMergedOrder([o1, o2]);
  assert.strictEqual(result.items.length, 2);
  assert.strictEqual(result.totals.subtotal, 50000);
  assert.strictEqual(result.totals.total, 50000);
});

test('computeMergedOrder collects all items from all orders', () => {
  const o1 = createOrder('1', 'deal1', 'buyer1', [{ vehicleId: 'v1', subtotal: 10000 }, { vehicleId: 'v2', subtotal: 12000 }], OrderStatus.CREATED);
  const o2 = createOrder('2', 'deal1', 'buyer1', [{ vehicleId: 'v3', subtotal: 15000 }], OrderStatus.RESERVED);
  const result = computeMergedOrder([o1, o2]);
  assert.strictEqual(result.items.length, 3);
  const vids = result.items.map((i) => i.vehicleId);
  assert.ok(vids.includes('v1'));
  assert.ok(vids.includes('v2'));
  assert.ok(vids.includes('v3'));
});

test('rejects orders from different dealerships (code 400)', () => {
  const o1 = createOrder('1', 'deal1', 'buyer1', [{ vehicleId: 'v1', subtotal: 10000 }], OrderStatus.CREATED);
  const o2 = createOrder('2', 'deal2', 'buyer1', [{ vehicleId: 'v2', subtotal: 15000 }], OrderStatus.CREATED);
  try {
    validateMergeOrders([o1, o2]);
    assert.fail('Should have thrown');
  } catch (e) {
    assert.strictEqual(e.code, 400);
    assert.ok(e.message.includes('different dealerships'));
  }
});

test('rejects orders from different buyers (code 400)', () => {
  const o1 = createOrder('1', 'deal1', 'buyer1', [{ vehicleId: 'v1', subtotal: 10000 }], OrderStatus.CREATED);
  const o2 = createOrder('2', 'deal1', 'buyer2', [{ vehicleId: 'v2', subtotal: 15000 }], OrderStatus.CREATED);
  try {
    validateMergeOrders([o1, o2]);
    assert.fail('Should have thrown');
  } catch (e) {
    assert.strictEqual(e.code, 400);
    assert.ok(e.message.includes('different buyers'));
  }
});

test('rejects orders in non-mergeable statuses', () => {
  for (const status of [OrderStatus.INVOICED, OrderStatus.SETTLED, OrderStatus.FULFILLED, OrderStatus.CANCELLED]) {
    const o1 = createOrder('1', 'deal1', 'buyer1', [{ vehicleId: 'v1', subtotal: 10000 }], OrderStatus.CREATED);
    const o2 = createOrder('2', 'deal1', 'buyer1', [{ vehicleId: 'v2', subtotal: 15000 }], status);
    try {
      validateMergeOrders([o1, o2]);
      assert.fail(`Should have thrown for status: ${status}`);
    } catch (e) {
      assert.strictEqual(e.code, 400);
      assert.ok(e.message.includes('cannot be merged'));
    }
  }
});

test('requires at least two orders (code 400)', () => {
  const o1 = createOrder('1', 'deal1', 'buyer1', [{ vehicleId: 'v1', subtotal: 10000 }], OrderStatus.CREATED);
  try {
    validateMergeOrders([o1]);
    assert.fail('Should have thrown');
  } catch (e) {
    assert.strictEqual(e.code, 400);
    assert.ok(e.message.includes('At least two'));
  }
});

test('RESERVED orders can be merged', () => {
  const o1 = createOrder('1', 'deal1', 'buyer1', [{ vehicleId: 'v1', subtotal: 10000 }], OrderStatus.RESERVED);
  const o2 = createOrder('2', 'deal1', 'buyer1', [{ vehicleId: 'v2', subtotal: 15000 }], OrderStatus.RESERVED);
  validateMergeOrders([o1, o2]); // should not throw
});

test('mixed CREATED and RESERVED can be merged', () => {
  const o1 = createOrder('1', 'deal1', 'buyer1', [{ vehicleId: 'v1', subtotal: 10000 }], OrderStatus.CREATED);
  const o2 = createOrder('2', 'deal1', 'buyer1', [{ vehicleId: 'v2', subtotal: 15000 }], OrderStatus.RESERVED);
  validateMergeOrders([o1, o2]); // should not throw
});

console.log(`\nOrder Merge: ${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
