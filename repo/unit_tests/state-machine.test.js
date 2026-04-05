const assert = require('assert');

class StateMachine {
  constructor(definition, currentState) {
    this.definition = definition;
    this.currentState = currentState || definition.initial;
  }

  getState() { return this.currentState; }

  can(event) {
    return this.definition.transitions.some(
      (t) => (Array.isArray(t.from) ? t.from.includes(this.currentState) : t.from === this.currentState) && t.event === event
    );
  }

  getAvailableEvents() {
    return this.definition.transitions
      .filter((t) => Array.isArray(t.from) ? t.from.includes(this.currentState) : t.from === this.currentState)
      .map((t) => t.event);
  }

  async transition(event, context) {
    const transition = this.definition.transitions.find(
      (t) => (Array.isArray(t.from) ? t.from.includes(this.currentState) : t.from === this.currentState) && t.event === event
    );
    if (!transition) throw new Error(`Invalid transition: cannot apply event "${event}" in state "${this.currentState}"`);
    if (transition.guard) {
      const allowed = await transition.guard(context);
      if (!allowed) throw new Error(`Guard rejected transition: "${event}" from "${this.currentState}"`);
    }
    const from = this.currentState;
    this.currentState = transition.to;
    return { from, to: transition.to };
  }
}

const orderDefinition = {
  initial: 'created',
  transitions: [
    { from: 'created', event: 'RESERVE', to: 'reserved' },
    { from: 'created', event: 'CANCEL', to: 'cancelled' },
    { from: 'reserved', event: 'INVOICE', to: 'invoiced' },
    { from: 'reserved', event: 'CANCEL', to: 'cancelled' },
    { from: 'invoiced', event: 'SETTLE', to: 'settled' },
    { from: 'invoiced', event: 'CANCEL', to: 'cancelled' },
    { from: 'settled', event: 'FULFILL', to: 'fulfilled' },
    { from: 'settled', event: 'CANCEL', to: 'cancelled' },
  ],
};

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

console.log('Order State Machine Tests:');

test('should initialize with created state', () => {
  const fsm = new StateMachine(orderDefinition);
  assert.strictEqual(fsm.getState(), 'created');
});

test('should initialize with custom state', () => {
  const fsm = new StateMachine(orderDefinition, 'reserved');
  assert.strictEqual(fsm.getState(), 'reserved');
});

test('should allow valid transitions', () => {
  const fsm = new StateMachine(orderDefinition);
  assert.strictEqual(fsm.can('RESERVE'), true);
  assert.strictEqual(fsm.can('CANCEL'), true);
});

test('should reject invalid transitions', () => {
  const fsm = new StateMachine(orderDefinition);
  assert.strictEqual(fsm.can('INVOICE'), false);
  assert.strictEqual(fsm.can('SETTLE'), false);
  assert.strictEqual(fsm.can('FULFILL'), false);
});

asyncTest('should transition created to reserved', async () => {
  const fsm = new StateMachine(orderDefinition);
  const result = await fsm.transition('RESERVE');
  assert.strictEqual(result.from, 'created');
  assert.strictEqual(result.to, 'reserved');
  assert.strictEqual(fsm.getState(), 'reserved');
});

asyncTest('should follow full happy path', async () => {
  const fsm = new StateMachine(orderDefinition);
  await fsm.transition('RESERVE');
  assert.strictEqual(fsm.getState(), 'reserved');
  await fsm.transition('INVOICE');
  assert.strictEqual(fsm.getState(), 'invoiced');
  await fsm.transition('SETTLE');
  assert.strictEqual(fsm.getState(), 'settled');
  await fsm.transition('FULFILL');
  assert.strictEqual(fsm.getState(), 'fulfilled');
});

asyncTest('should allow cancellation from any active state', async () => {
  for (const state of ['created', 'reserved', 'invoiced', 'settled']) {
    const fsm = new StateMachine(orderDefinition, state);
    const result = await fsm.transition('CANCEL');
    assert.strictEqual(result.to, 'cancelled');
  }
});

asyncTest('should reject transitions from cancelled state', async () => {
  const fsm = new StateMachine(orderDefinition, 'cancelled');
  assert.strictEqual(fsm.can('RESERVE'), false);
  assert.strictEqual(fsm.can('INVOICE'), false);
  assert.strictEqual(fsm.can('SETTLE'), false);
  assert.strictEqual(fsm.can('FULFILL'), false);
});

asyncTest('should reject transitions from fulfilled state', async () => {
  const fsm = new StateMachine(orderDefinition, 'fulfilled');
  assert.strictEqual(fsm.can('CANCEL'), false);
  assert.strictEqual(fsm.can('RESERVE'), false);
});

asyncTest('should throw on invalid transition', async () => {
  const fsm = new StateMachine(orderDefinition, 'created');
  try {
    await fsm.transition('FULFILL');
    assert.fail('Should have thrown');
  } catch (e) {
    assert.ok(e.message.includes('Invalid transition'));
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

test('should list available events', () => {
  const fsm = new StateMachine(orderDefinition, 'reserved');
  const events = fsm.getAvailableEvents();
  assert.ok(events.includes('INVOICE'));
  assert.ok(events.includes('CANCEL'));
  assert.strictEqual(events.length, 2);
});

setTimeout(() => {
  console.log(`\nState Machine: ${passed} passed, ${failed} failed`);
  if (failed > 0) process.exit(1);
}, 100);
