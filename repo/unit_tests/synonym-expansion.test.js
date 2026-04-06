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

// Import the PRODUCTION synonym mapping and expansion functions.
// These are the same functions that the async expandSynonyms() calls at runtime
// after loading synonyms from MongoDB.
let synonymModule;
try { synonymModule = require('../server/src/services/search/synonym.service'); } catch { synonymModule = require('../server/dist/services/search/synonym.service'); }

const { buildSynonymMap, expandSynonymsFromCache } = synonymModule;

// Use the same seed data structure that seeds/index.ts writes to the Synonym collection
const synonymData = [
  { canonical: 'Chevrolet', aliases: ['Chevy', 'Chev'], field: 'make' },
  { canonical: 'BMW', aliases: ['Bimmer', 'Beemer'], field: 'make' },
  { canonical: 'Mercedes-Benz', aliases: ['Mercedes', 'Merc', 'Benz'], field: 'make' },
  { canonical: 'F-150', aliases: ['F150', 'F 150'], field: 'model' },
  { canonical: 'Corvette', aliases: ['Vette', 'C8'], field: 'model' },
];

const cache = buildSynonymMap(synonymData);

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

console.log('Synonym Expansion Tests (using production buildSynonymMap + expandSynonymsFromCache):');

test('Chevy expands to Chevrolet', () => {
  const result = expandSynonymsFromCache('Chevy', 'make', cache);
  assert.ok(result.includes('Chevy'));
  assert.ok(result.includes('chevrolet'));
});

test('Chevrolet expands to aliases', () => {
  const result = expandSynonymsFromCache('Chevrolet', 'make', cache);
  assert.ok(result.includes('Chevrolet'));
  assert.ok(result.includes('chevy'));
  assert.ok(result.includes('chev'));
});

test('Bimmer expands to BMW', () => {
  const result = expandSynonymsFromCache('Bimmer', 'make', cache);
  assert.ok(result.includes('Bimmer'));
  assert.ok(result.includes('bmw'));
});

test('BMW expands to aliases', () => {
  const result = expandSynonymsFromCache('BMW', 'make', cache);
  assert.ok(result.includes('BMW'));
  assert.ok(result.includes('bimmer'));
  assert.ok(result.includes('beemer'));
});

test('Mercedes expands to Mercedes-Benz', () => {
  const result = expandSynonymsFromCache('Mercedes', 'make', cache);
  assert.ok(result.includes('Mercedes'));
  assert.ok(result.includes('mercedes-benz'));
});

test('F150 expands to F-150', () => {
  const result = expandSynonymsFromCache('F150', 'model', cache);
  assert.ok(result.includes('F150'));
  assert.ok(result.includes('f-150'));
});

test('Vette expands to Corvette', () => {
  const result = expandSynonymsFromCache('Vette', 'model', cache);
  assert.ok(result.includes('Vette'));
  assert.ok(result.includes('corvette'));
});

test('unknown term returns as-is', () => {
  const result = expandSynonymsFromCache('Toyota', 'make', cache);
  assert.deepStrictEqual(result, ['Toyota']);
});

test('expansion is case-insensitive', () => {
  const result = expandSynonymsFromCache('chevy', 'make', cache);
  assert.ok(result.includes('chevy'));
  assert.ok(result.includes('chevrolet'));
});

test('wrong field returns term as-is', () => {
  const result = expandSynonymsFromCache('Chevy', 'model', cache);
  assert.deepStrictEqual(result, ['Chevy']);
});

test('bi-directional: alias to canonical and back', () => {
  const aliasResult = expandSynonymsFromCache('Merc', 'make', cache);
  assert.ok(aliasResult.includes('mercedes-benz'));

  const canonicalResult = expandSynonymsFromCache('Mercedes-Benz', 'make', cache);
  assert.ok(canonicalResult.includes('mercedes'));
  assert.ok(canonicalResult.includes('merc'));
  assert.ok(canonicalResult.includes('benz'));
});

console.log(`\nSynonym Expansion: ${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
