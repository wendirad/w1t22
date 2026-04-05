const assert = require('assert');

// Simulate order merge logic from production code

function createOrder(id, dealershipId, buyerId, items, status) {
  return {
    _id: id,
    orderNumber: `ORD-${id}`,
    dealershipId,
    buyerId,
    items: items.map((i) => ({ vehicleId: i.vehicleId, subtotal: i.subtotal, addOnServices: i.addOnServices || [] })),
    totals: { subtotal: items.reduce((s, i) => s + i.subtotal, 0), tax: 0, total: items.reduce((s, i) => s + i.subtotal, 0) },
    status,
    parentOrderId: null,
    childOrderIds: [],
    cancelledAt: null,
    cancelReason: null,
  };
}

function mergeOrders(orders, userId) {
  if (orders.length < 2) throw new Error('At least two orders are required for merge');

  const dealershipIds = new Set(orders.map((o) => o.dealershipId));
  if (dealershipIds.size > 1) throw new Error('Cannot merge orders from different dealerships');

  const buyerIds = new Set(orders.map((o) => o.buyerId));
  if (buyerIds.size > 1) throw new Error('Cannot merge orders from different buyers');

  for (const order of orders) {
    if (order.status !== 'created' && order.status !== 'reserved') {
      throw new Error(`Order ${order.orderNumber} is in "${order.status}" status and cannot be merged`);
    }
  }

  const primary = orders[0];
  const others = orders.slice(1);
  const allItems = orders.flatMap((o) => o.items);
  const subtotal = allItems.reduce((sum, item) => sum + item.subtotal, 0);

  primary.items = allItems;
  primary.totals = { subtotal, tax: 0, total: subtotal };
  primary.childOrderIds = [];
  primary.parentOrderId = null;

  const events = [];
  for (const other of others) {
    events.push({
      orderId: other._id,
      fromStatus: other.status,
      toStatus: 'cancelled',
      triggeredBy: userId,
      reason: `Merged into order ${primary.orderNumber}`,
    });
    other.status = 'cancelled';
    other.cancelledAt = new Date();
    other.cancelReason = `Merged into order ${primary.orderNumber}`;
  }

  events.push({
    orderId: primary._id,
    fromStatus: primary.status,
    toStatus: primary.status,
    triggeredBy: userId,
    reason: `Merged orders: ${others.map((o) => o.orderNumber).join(', ')}`,
  });

  return { merged: primary, cancelledOrders: others, events };
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

console.log('Order Merge Tests:');

test('merges two orders into one', () => {
  const order1 = createOrder('1', 'deal1', 'buyer1', [{ vehicleId: 'v1', subtotal: 20000 }], 'created');
  const order2 = createOrder('2', 'deal1', 'buyer1', [{ vehicleId: 'v2', subtotal: 30000 }], 'created');

  const result = mergeOrders([order1, order2], 'user1');
  assert.strictEqual(result.merged.items.length, 2);
  assert.strictEqual(result.merged.totals.subtotal, 50000);
  assert.strictEqual(result.merged.totals.total, 50000);
});

test('source orders are cancelled after merge', () => {
  const order1 = createOrder('1', 'deal1', 'buyer1', [{ vehicleId: 'v1', subtotal: 10000 }], 'created');
  const order2 = createOrder('2', 'deal1', 'buyer1', [{ vehicleId: 'v2', subtotal: 15000 }], 'created');

  const result = mergeOrders([order1, order2], 'user1');
  assert.strictEqual(result.cancelledOrders.length, 1);
  assert.strictEqual(result.cancelledOrders[0].status, 'cancelled');
  assert.ok(result.cancelledOrders[0].cancelReason.includes('Merged'));
});

test('merged order has all items from source orders', () => {
  const order1 = createOrder('1', 'deal1', 'buyer1', [
    { vehicleId: 'v1', subtotal: 10000 },
    { vehicleId: 'v2', subtotal: 12000 },
  ], 'created');
  const order2 = createOrder('2', 'deal1', 'buyer1', [
    { vehicleId: 'v3', subtotal: 15000 },
  ], 'reserved');

  const result = mergeOrders([order1, order2], 'user1');
  assert.strictEqual(result.merged.items.length, 3);
  const vehicleIds = result.merged.items.map((i) => i.vehicleId);
  assert.ok(vehicleIds.includes('v1'));
  assert.ok(vehicleIds.includes('v2'));
  assert.ok(vehicleIds.includes('v3'));
});

test('cannot merge orders from different dealerships', () => {
  const order1 = createOrder('1', 'deal1', 'buyer1', [{ vehicleId: 'v1', subtotal: 10000 }], 'created');
  const order2 = createOrder('2', 'deal2', 'buyer1', [{ vehicleId: 'v2', subtotal: 15000 }], 'created');

  try {
    mergeOrders([order1, order2], 'user1');
    assert.fail('Should have thrown');
  } catch (e) {
    assert.ok(e.message.includes('different dealerships'));
  }
});

test('cannot merge orders from different buyers', () => {
  const order1 = createOrder('1', 'deal1', 'buyer1', [{ vehicleId: 'v1', subtotal: 10000 }], 'created');
  const order2 = createOrder('2', 'deal1', 'buyer2', [{ vehicleId: 'v2', subtotal: 15000 }], 'created');

  try {
    mergeOrders([order1, order2], 'user1');
    assert.fail('Should have thrown');
  } catch (e) {
    assert.ok(e.message.includes('different buyers'));
  }
});

test('cannot merge orders in invoiced/settled/fulfilled status', () => {
  for (const status of ['invoiced', 'settled', 'fulfilled', 'cancelled']) {
    const order1 = createOrder('1', 'deal1', 'buyer1', [{ vehicleId: 'v1', subtotal: 10000 }], 'created');
    const order2 = createOrder('2', 'deal1', 'buyer1', [{ vehicleId: 'v2', subtotal: 15000 }], status);

    try {
      mergeOrders([order1, order2], 'user1');
      assert.fail(`Should have thrown for status: ${status}`);
    } catch (e) {
      assert.ok(e.message.includes('cannot be merged'));
    }
  }
});

test('requires at least two orders', () => {
  const order1 = createOrder('1', 'deal1', 'buyer1', [{ vehicleId: 'v1', subtotal: 10000 }], 'created');
  try {
    mergeOrders([order1], 'user1');
    assert.fail('Should have thrown');
  } catch (e) {
    assert.ok(e.message.includes('At least two'));
  }
});

test('merge creates proper event records', () => {
  const order1 = createOrder('1', 'deal1', 'buyer1', [{ vehicleId: 'v1', subtotal: 10000 }], 'created');
  const order2 = createOrder('2', 'deal1', 'buyer1', [{ vehicleId: 'v2', subtotal: 15000 }], 'created');
  const order3 = createOrder('3', 'deal1', 'buyer1', [{ vehicleId: 'v3', subtotal: 20000 }], 'created');

  const result = mergeOrders([order1, order2, order3], 'user1');
  // One cancel event per source order + one merge event on primary
  assert.strictEqual(result.events.length, 3);
  assert.ok(result.events[0].reason.includes('Merged into'));
  assert.ok(result.events[1].reason.includes('Merged into'));
  assert.ok(result.events[2].reason.includes('Merged orders'));
});

test('primary order retains its order number', () => {
  const order1 = createOrder('1', 'deal1', 'buyer1', [{ vehicleId: 'v1', subtotal: 10000 }], 'created');
  const order2 = createOrder('2', 'deal1', 'buyer1', [{ vehicleId: 'v2', subtotal: 15000 }], 'created');

  const result = mergeOrders([order1, order2], 'user1');
  assert.strictEqual(result.merged.orderNumber, 'ORD-1');
});

console.log(`\nOrder Merge: ${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
