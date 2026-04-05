const assert = require('assert');

const synonymData = [
  { canonical: 'Chevrolet', aliases: ['Chevy', 'Chev'], field: 'make' },
  { canonical: 'BMW', aliases: ['Bimmer', 'Beemer'], field: 'make' },
  { canonical: 'Mercedes-Benz', aliases: ['Mercedes', 'Merc', 'Benz'], field: 'make' },
  { canonical: 'F-150', aliases: ['F150', 'F 150'], field: 'model' },
  { canonical: 'Corvette', aliases: ['Vette', 'C8'], field: 'model' },
];

function buildSynonymMap(synonyms) {
  const cache = new Map();
  for (const syn of synonyms) {
    if (!cache.has(syn.field)) cache.set(syn.field, new Map());
    const fieldMap = cache.get(syn.field);
    fieldMap.set(syn.canonical.toLowerCase(), syn.aliases.map((a) => a.toLowerCase()));
    for (const alias of syn.aliases) {
      fieldMap.set(alias.toLowerCase(), [syn.canonical.toLowerCase()]);
    }
  }
  return cache;
}

function expandSynonyms(term, field, cache) {
  const fieldMap = cache.get(field);
  if (!fieldMap) return [term];
  const lowerTerm = term.toLowerCase();
  const expansions = fieldMap.get(lowerTerm);
  if (!expansions) return [term];
  return [term, ...expansions];
}

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

console.log('Synonym Expansion Tests:');

test('Chevy expands to Chevrolet', () => {
  const result = expandSynonyms('Chevy', 'make', cache);
  assert.ok(result.includes('Chevy'));
  assert.ok(result.includes('chevrolet'));
});

test('Chevrolet expands to aliases', () => {
  const result = expandSynonyms('Chevrolet', 'make', cache);
  assert.ok(result.includes('Chevrolet'));
  assert.ok(result.includes('chevy'));
  assert.ok(result.includes('chev'));
});

test('Bimmer expands to BMW', () => {
  const result = expandSynonyms('Bimmer', 'make', cache);
  assert.ok(result.includes('Bimmer'));
  assert.ok(result.includes('bmw'));
});

test('BMW expands to aliases', () => {
  const result = expandSynonyms('BMW', 'make', cache);
  assert.ok(result.includes('BMW'));
  assert.ok(result.includes('bimmer'));
  assert.ok(result.includes('beemer'));
});

test('Mercedes expands to Mercedes-Benz', () => {
  const result = expandSynonyms('Mercedes', 'make', cache);
  assert.ok(result.includes('Mercedes'));
  assert.ok(result.includes('mercedes-benz'));
});

test('F150 expands to F-150', () => {
  const result = expandSynonyms('F150', 'model', cache);
  assert.ok(result.includes('F150'));
  assert.ok(result.includes('f-150'));
});

test('Vette expands to Corvette', () => {
  const result = expandSynonyms('Vette', 'model', cache);
  assert.ok(result.includes('Vette'));
  assert.ok(result.includes('corvette'));
});

test('unknown term returns as-is', () => {
  const result = expandSynonyms('Toyota', 'make', cache);
  assert.deepStrictEqual(result, ['Toyota']);
});

test('expansion is case-insensitive', () => {
  const result = expandSynonyms('chevy', 'make', cache);
  assert.ok(result.includes('chevy'));
  assert.ok(result.includes('chevrolet'));
});

test('wrong field returns term as-is', () => {
  const result = expandSynonyms('Chevy', 'model', cache);
  assert.deepStrictEqual(result, ['Chevy']);
});

test('bi-directional: alias to canonical and back', () => {
  const aliasResult = expandSynonyms('Merc', 'make', cache);
  assert.ok(aliasResult.includes('mercedes-benz'));

  const canonicalResult = expandSynonyms('Mercedes-Benz', 'make', cache);
  assert.ok(canonicalResult.includes('mercedes'));
  assert.ok(canonicalResult.includes('merc'));
  assert.ok(canonicalResult.includes('benz'));
});

console.log(`\nSynonym Expansion: ${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
