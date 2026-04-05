const assert = require('assert');

// Simulate search filter binding logic matching VehicleSearchPage and search.service.ts

function buildSearchQuery(filters) {
  const query = { status: 'available' };

  if (filters.dealershipId) query.dealershipId = filters.dealershipId;
  if (filters.make) query.make = { $regex: new RegExp(`^${filters.make}$`, 'i') };
  if (filters.model) query.model = { $regex: new RegExp(`^${filters.model}$`, 'i') };
  if (filters.year) query.year = parseInt(filters.year);

  if (filters.minPrice || filters.maxPrice) {
    query.price = {};
    if (filters.minPrice) query.price.$gte = parseInt(filters.minPrice);
    if (filters.maxPrice) query.price.$lte = parseInt(filters.maxPrice);
  }

  if (filters.minMileage || filters.maxMileage) {
    query.mileage = {};
    if (filters.minMileage) query.mileage.$gte = parseInt(filters.minMileage);
    if (filters.maxMileage) query.mileage.$lte = parseInt(filters.maxMileage);
  }

  if (filters.region) query.region = { $regex: new RegExp(filters.region, 'i') };

  if (filters.minRegistrationDate || filters.maxRegistrationDate) {
    query.registrationDate = {};
    if (filters.minRegistrationDate) query.registrationDate.$gte = new Date(filters.minRegistrationDate);
    if (filters.maxRegistrationDate) query.registrationDate.$lte = new Date(filters.maxRegistrationDate);
  }

  return query;
}

function buildQueryParams(filters) {
  const params = new URLSearchParams();
  Object.entries(filters).forEach(([k, v]) => { if (v) params.set(k, v); });
  return params;
}

function filterVehicles(vehicles, query) {
  return vehicles.filter((v) => {
    if (query.status && v.status !== query.status) return false;
    if (query.dealershipId && v.dealershipId !== query.dealershipId) return false;
    if (query.make && !v.make.match(query.make.$regex)) return false;
    if (query.model && !v.model.match(query.model.$regex)) return false;
    if (query.year && v.year !== query.year) return false;
    if (query.price) {
      if (query.price.$gte && v.price < query.price.$gte) return false;
      if (query.price.$lte && v.price > query.price.$lte) return false;
    }
    if (query.mileage) {
      if (query.mileage.$gte && v.mileage < query.mileage.$gte) return false;
      if (query.mileage.$lte && v.mileage > query.mileage.$lte) return false;
    }
    if (query.registrationDate) {
      const regDate = new Date(v.registrationDate);
      if (query.registrationDate.$gte && regDate < query.registrationDate.$gte) return false;
      if (query.registrationDate.$lte && regDate > query.registrationDate.$lte) return false;
    }
    return true;
  });
}

const testVehicles = [
  { _id: 'v1', make: 'Toyota', model: 'Camry', year: 2022, price: 25000, mileage: 30000, region: 'Southeast', status: 'available', registrationDate: '2022-03-15', dealershipId: 'd1' },
  { _id: 'v2', make: 'Honda', model: 'Accord', year: 2023, price: 28000, mileage: 15000, region: 'Northeast', status: 'available', registrationDate: '2023-06-01', dealershipId: 'd1' },
  { _id: 'v3', make: 'Ford', model: 'F-150', year: 2021, price: 35000, mileage: 45000, region: 'Southeast', status: 'available', registrationDate: '2021-01-10', dealershipId: 'd2' },
  { _id: 'v4', make: 'BMW', model: '3 Series', year: 2024, price: 48000, mileage: 5000, region: 'West', status: 'reserved', registrationDate: '2024-01-20', dealershipId: 'd1' },
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

console.log('Search Filter Tests:');

test('registration date filter is included in query params', () => {
  const filters = {
    make: 'Toyota',
    minRegistrationDate: '2022-01-01',
    maxRegistrationDate: '2023-12-31',
  };
  const params = buildQueryParams(filters);
  assert.strictEqual(params.get('minRegistrationDate'), '2022-01-01');
  assert.strictEqual(params.get('maxRegistrationDate'), '2023-12-31');
  assert.strictEqual(params.get('make'), 'Toyota');
});

test('registration date filter builds correct query', () => {
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
  // v1 (2022-03-15) excluded, v2 (2023-06-01) and v3 (2021-01-10) excluded, v2 included
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
  assert.ok(results.every((v) => {
    const d = new Date(v.registrationDate);
    return d >= new Date('2022-01-01') && d <= new Date('2023-01-01');
  }));
  assert.strictEqual(results.length, 1); // Only v1
});

test('empty registration date filters are omitted from query', () => {
  const query = buildSearchQuery({ minRegistrationDate: '', maxRegistrationDate: '' });
  assert.strictEqual(query.registrationDate, undefined);
});

test('registration date combined with other filters works', () => {
  const query = buildSearchQuery({
    make: 'Toyota',
    minRegistrationDate: '2020-01-01',
    maxRegistrationDate: '2023-12-31',
  });
  const results = filterVehicles(testVehicles, query);
  assert.ok(results.every((v) => v.make.match(/^Toyota$/i)));
  assert.strictEqual(results.length, 1); // Only v1
});

test('empty query params string omits empty values', () => {
  const params = buildQueryParams({
    make: 'Ford',
    minRegistrationDate: '',
    maxRegistrationDate: '2023-12-31',
    region: '',
  });
  assert.strictEqual(params.has('minRegistrationDate'), false);
  assert.strictEqual(params.has('region'), false);
  assert.strictEqual(params.get('make'), 'Ford');
  assert.strictEqual(params.get('maxRegistrationDate'), '2023-12-31');
});

test('only available vehicles are returned by default', () => {
  const query = buildSearchQuery({});
  const results = filterVehicles(testVehicles, query);
  assert.ok(results.every((v) => v.status === 'available'));
  assert.ok(!results.some((v) => v._id === 'v4')); // v4 is reserved
});

console.log(`\nSearch Filter: ${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
