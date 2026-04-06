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

// Import the PRODUCTION StateMachine class and order definition —
// not a local reimplementation. If the production code changes its
// interface, transitions, or guard behavior, these tests break.
let smModule, osmModule, enumsModule;
try { smModule = require('../server/src/lib/state-machine'); } catch { smModule = require('../server/dist/lib/state-machine'); }
try { osmModule = require('../server/src/services/order/order-state-machine'); } catch { osmModule = require('../server/dist/services/order/order-state-machine'); }
try { enumsModule = require('../server/src/types/enums'); } catch { enumsModule = require('../server/dist/types/enums'); }

const { StateMachine } = smModule;
const { orderStateMachineDefinition, createOrderStateMachine } = osmModule;
const { OrderStatus, OrderEvent } = enumsModule;

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

console.log('Order State Machine Tests (using production StateMachine + orderStateMachineDefinition):');

// --- Tests using the production StateMachine class directly ---

test('should initialize with created state', () => {
  const fsm = new StateMachine(orderStateMachineDefinition);
  assert.strictEqual(fsm.getState(), OrderStatus.CREATED);
});

test('should initialize with custom state', () => {
  const fsm = new StateMachine(orderStateMachineDefinition, OrderStatus.RESERVED);
  assert.strictEqual(fsm.getState(), OrderStatus.RESERVED);
});

test('should allow valid transitions from created', () => {
  const fsm = new StateMachine(orderStateMachineDefinition);
  assert.strictEqual(fsm.can(OrderEvent.RESERVE), true);
  assert.strictEqual(fsm.can(OrderEvent.CANCEL), true);
});

test('should reject invalid transitions from created', () => {
  const fsm = new StateMachine(orderStateMachineDefinition);
  assert.strictEqual(fsm.can(OrderEvent.INVOICE), false);
  assert.strictEqual(fsm.can(OrderEvent.SETTLE), false);
  assert.strictEqual(fsm.can(OrderEvent.FULFILL), false);
});

test('should list available events for reserved', () => {
  const fsm = new StateMachine(orderStateMachineDefinition, OrderStatus.RESERVED);
  const events = fsm.getAvailableEvents();
  assert.ok(events.includes(OrderEvent.INVOICE));
  assert.ok(events.includes(OrderEvent.CANCEL));
  assert.strictEqual(events.length, 2);
});

test('should reject transitions from cancelled state', () => {
  const fsm = new StateMachine(orderStateMachineDefinition, OrderStatus.CANCELLED);
  assert.strictEqual(fsm.can(OrderEvent.RESERVE), false);
  assert.strictEqual(fsm.can(OrderEvent.INVOICE), false);
  assert.strictEqual(fsm.can(OrderEvent.SETTLE), false);
  assert.strictEqual(fsm.can(OrderEvent.FULFILL), false);
  assert.strictEqual(fsm.can(OrderEvent.CANCEL), false);
});

test('should reject transitions from fulfilled state', () => {
  const fsm = new StateMachine(orderStateMachineDefinition, OrderStatus.FULFILLED);
  assert.strictEqual(fsm.can(OrderEvent.CANCEL), false);
  assert.strictEqual(fsm.can(OrderEvent.RESERVE), false);
});

asyncTest('should transition created to reserved', async () => {
  const fsm = createOrderStateMachine(OrderStatus.CREATED);
  const result = await fsm.transition(OrderEvent.RESERVE);
  assert.strictEqual(result.from, OrderStatus.CREATED);
  assert.strictEqual(result.to, OrderStatus.RESERVED);
  assert.strictEqual(fsm.getState(), OrderStatus.RESERVED);
});

asyncTest('should throw on invalid transition', async () => {
  const fsm = createOrderStateMachine(OrderStatus.CREATED);
  try {
    await fsm.transition(OrderEvent.FULFILL);
    assert.fail('Should have thrown');
  } catch (e) {
    assert.ok(e.message.includes('Invalid transition'));
  }
});

asyncTest('should follow full happy path', async () => {
  const fsm = createOrderStateMachine();
  await fsm.transition(OrderEvent.RESERVE);
  assert.strictEqual(fsm.getState(), OrderStatus.RESERVED);
  await fsm.transition(OrderEvent.INVOICE);
  assert.strictEqual(fsm.getState(), OrderStatus.INVOICED);
  await fsm.transition(OrderEvent.SETTLE);
  assert.strictEqual(fsm.getState(), OrderStatus.SETTLED);
  await fsm.transition(OrderEvent.FULFILL);
  assert.strictEqual(fsm.getState(), OrderStatus.FULFILLED);
});

asyncTest('should allow cancellation from any active state', async () => {
  for (const state of [OrderStatus.CREATED, OrderStatus.RESERVED, OrderStatus.INVOICED, OrderStatus.SETTLED]) {
    const fsm = createOrderStateMachine(state);
    const result = await fsm.transition(OrderEvent.CANCEL);
    assert.strictEqual(result.to, OrderStatus.CANCELLED);
  }
});

asyncTest('should respect guards', async () => {
  const guarded = {
    initial: 'a',
    transitions: [
      { from: 'a', event: 'GO', to: 'b', guard: (ctx) => ctx.allowed },
    ],
  };
  const fsm = new StateMachine(guarded);
  try {
    await fsm.transition('GO', { allowed: false });
    assert.fail('Should have thrown');
  } catch (e) {
    assert.ok(e.message.includes('Guard rejected'));
  }

  const fsm2 = new StateMachine(guarded);
  const result = await fsm2.transition('GO', { allowed: true });
  assert.strictEqual(result.to, 'b');
});

setTimeout(() => {
  console.log(`\nState Machine: ${passed} passed, ${failed} failed`);
  if (failed > 0) process.exit(1);
}, 100);
