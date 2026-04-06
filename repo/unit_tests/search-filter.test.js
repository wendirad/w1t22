const assert = require('assert');
const path = require('path');
const fs = require('fs');

// Load .env so config module can initialize (required by search.service imports)
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

// Import the PRODUCTION query builder and enum from search.service.ts.
// This is the same function that searchVehicles() uses to construct MongoDB queries.
let searchModule, enumsModule;
try { searchModule = require('../server/src/services/search/search.service'); } catch { searchModule = require('../server/dist/services/search/search.service'); }
try { enumsModule = require('../server/src/types/enums'); } catch { enumsModule = require('../server/dist/types/enums'); }

const { buildSearchQuery } = searchModule;
const { VehicleStatus } = enumsModule;

// In-memory filter that applies a production-built query to test data.
// This tests that the query the production code generates actually selects
// the right documents.
function filterVehicles(vehicles, query) {
  return vehicles.filter((v) => {
    if (query.status && v.status !== query.status) return false;
    if (query.dealershipId && v.dealershipId !== query.dealershipId) return false;
    if (query.make && !v.make.match(query.make)) return false;
    if (query.model && !v.model.match(query.model)) return false;
    if (query.year && v.year !== query.year) return false;
    if (query.price) {
      if (query.price.$gte && v.price < query.price.$gte) return false;
      if (query.price.$lte && v.price > query.price.$lte) return false;
    }
    if (query.mileage) {
      if (query.mileage.$gte && v.mileage < query.mileage.$gte) return false;
      if (query.mileage.$lte && v.mileage > query.mileage.$lte) return false;
    }
    if (query.region && !v.region.match(query.region)) return false;
    if (query.registrationDate) {
      const regDate = new Date(v.registrationDate);
      if (query.registrationDate.$gte && regDate < query.registrationDate.$gte) return false;
      if (query.registrationDate.$lte && regDate > query.registrationDate.$lte) return false;
    }
    return true;
  });
}

const testVehicles = [
  { _id: 'v1', make: 'Toyota', model: 'Camry', year: 2022, price: 25000, mileage: 30000, region: 'Southeast', status: VehicleStatus.AVAILABLE, registrationDate: '2022-03-15', dealershipId: 'd1' },
  { _id: 'v2', make: 'Honda', model: 'Accord', year: 2023, price: 28000, mileage: 15000, region: 'Northeast', status: VehicleStatus.AVAILABLE, registrationDate: '2023-06-01', dealershipId: 'd1' },
  { _id: 'v3', make: 'Ford', model: 'F-150', year: 2021, price: 35000, mileage: 45000, region: 'Southeast', status: VehicleStatus.AVAILABLE, registrationDate: '2021-01-10', dealershipId: 'd2' },
  { _id: 'v4', make: 'BMW', model: '3 Series', year: 2024, price: 48000, mileage: 5000, region: 'West', status: VehicleStatus.RESERVED, registrationDate: '2024-01-20', dealershipId: 'd1' },
];

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

console.log('Search Filter Tests (using production buildSearchQuery):');

test('default query filters for available status', () => {
  const query = buildSearchQuery({});
  assert.strictEqual(query.status, VehicleStatus.AVAILABLE);
});

test('registration date builds Date objects in query', () => {
  const query = buildSearchQuery({ minRegistrationDate: '2022-01-01', maxRegistrationDate: '2023-12-31' });
  assert.ok(query.registrationDate);
  assert.ok(query.registrationDate.$gte instanceof Date);
  assert.ok(query.registrationDate.$lte instanceof Date);
  assert.strictEqual(query.registrationDate.$gte.toISOString().slice(0, 10), '2022-01-01');
  assert.strictEqual(query.registrationDate.$lte.toISOString().slice(0, 10), '2023-12-31');
});

test('min registration date filters older vehicles', () => {
  const query = buildSearchQuery({ minRegistrationDate: '2022-06-01' });
  const results = filterVehicles(testVehicles, query);
  assert.ok(results.every((v) => new Date(v.registrationDate) >= new Date('2022-06-01')));
  assert.ok(results.some((v) => v._id === 'v2'));
  assert.ok(!results.some((v) => v._id === 'v3'));
});

test('max registration date filters newer vehicles', () => {
  const query = buildSearchQuery({ maxRegistrationDate: '2022-06-01' });
  const results = filterVehicles(testVehicles, query);
  assert.ok(results.every((v) => new Date(v.registrationDate) <= new Date('2022-06-01')));
  assert.ok(results.some((v) => v._id === 'v1'));
  assert.ok(results.some((v) => v._id === 'v3'));
});

test('both min and max registration date narrows range', () => {
  const query = buildSearchQuery({ minRegistrationDate: '2022-01-01', maxRegistrationDate: '2023-01-01' });
  const results = filterVehicles(testVehicles, query);
  assert.strictEqual(results.length, 1); // Only v1
  assert.strictEqual(results[0]._id, 'v1');
});

test('empty registration dates are omitted from query', () => {
  const query = buildSearchQuery({ minRegistrationDate: '', maxRegistrationDate: '' });
  assert.strictEqual(query.registrationDate, undefined);
});

test('registration date combined with make filter', () => {
  const query = buildSearchQuery({ make: 'Toyota', minRegistrationDate: '2020-01-01', maxRegistrationDate: '2023-12-31' });
  const results = filterVehicles(testVehicles, query);
  assert.ok(results.every((v) => v.make.match(/^Toyota$/i)));
  assert.strictEqual(results.length, 1); // Only v1
});

test('price range filter builds correct query', () => {
  const query = buildSearchQuery({ minPrice: 25000, maxPrice: 35000 });
  assert.strictEqual(query.price.$gte, 25000);
  assert.strictEqual(query.price.$lte, 35000);
  const results = filterVehicles(testVehicles, query);
  assert.ok(results.every((v) => v.price >= 25000 && v.price <= 35000));
});

test('only available vehicles returned by default', () => {
  const query = buildSearchQuery({});
  const results = filterVehicles(testVehicles, query);
  assert.ok(results.every((v) => v.status === VehicleStatus.AVAILABLE));
  assert.ok(!results.some((v) => v._id === 'v4'));
});

console.log(`\nSearch Filter: ${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
