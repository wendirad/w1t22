const assert = require('assert');

// Simulate trending keyword persistence logic from production code

class InMemoryCache {
  constructor() { this.data = new Map(); }
  get(key) { return this.data.get(key) || null; }
  setex(key, ttl, value) { this.data.set(key, value); }
  del(key) { this.data.delete(key); }
}

class InMemoryDB {
  constructor() { this.snapshots = []; }
  create(snapshot) {
    const record = { ...snapshot, _id: `snap-${this.snapshots.length}`, createdAt: new Date() };
    this.snapshots.push(record);
    return record;
  }
  findLatest() {
    if (this.snapshots.length === 0) return null;
    return [...this.snapshots].sort((a, b) => b.createdAt - a.createdAt)[0];
  }
  findAll(limit) {
    return [...this.snapshots].sort((a, b) => b.createdAt - a.createdAt).slice(0, limit);
  }
}

function simulateUpdateTrending(searchLogs, cache, db) {
  const now = new Date();
  const oneDayAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000);

  // Aggregate queries from last 24 hours
  const counts = {};
  for (const log of searchLogs) {
    if (log.timestamp >= oneDayAgo && log.rawQuery) {
      counts[log.rawQuery] = (counts[log.rawQuery] || 0) + 1;
    }
  }

  const trending = Object.entries(counts)
    .sort(([, a], [, b]) => b - a)
    .slice(0, 20)
    .map(([keyword, count]) => ({ keyword, count }));

  // Persist snapshot to DB
  db.create({ keywords: trending, period: { from: oneDayAgo, to: now } });

  // Cache in Redis
  cache.setex('trending:global', 4200, JSON.stringify(trending));

  return trending;
}

function simulateGetTrending(cache, db) {
  const cached = cache.get('trending:global');
  if (cached) return JSON.parse(cached);

  // Fallback to DB
  const latest = db.findLatest();
  if (latest) {
    cache.setex('trending:global', 4200, JSON.stringify(latest.keywords));
    return latest.keywords;
  }
  return [];
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

console.log('Trending Keyword Persistence Tests:');

test('updateTrending persists snapshot to DB', () => {
  const cache = new InMemoryCache();
  const db = new InMemoryDB();
  const logs = [
    { rawQuery: 'Toyota', timestamp: new Date() },
    { rawQuery: 'Toyota', timestamp: new Date() },
    { rawQuery: 'BMW', timestamp: new Date() },
  ];

  simulateUpdateTrending(logs, cache, db);
  assert.strictEqual(db.snapshots.length, 1);
  assert.strictEqual(db.snapshots[0].keywords.length, 2);
  assert.strictEqual(db.snapshots[0].keywords[0].keyword, 'Toyota');
  assert.strictEqual(db.snapshots[0].keywords[0].count, 2);
});

test('updateTrending also caches in Redis', () => {
  const cache = new InMemoryCache();
  const db = new InMemoryDB();
  const logs = [{ rawQuery: 'Honda', timestamp: new Date() }];

  simulateUpdateTrending(logs, cache, db);
  const cached = cache.get('trending:global');
  assert.ok(cached);
  const parsed = JSON.parse(cached);
  assert.strictEqual(parsed[0].keyword, 'Honda');
});

test('getTrending returns from cache when available', () => {
  const cache = new InMemoryCache();
  const db = new InMemoryDB();
  cache.setex('trending:global', 4200, JSON.stringify([{ keyword: 'Cached', count: 10 }]));

  const result = simulateGetTrending(cache, db);
  assert.strictEqual(result[0].keyword, 'Cached');
});

test('getTrending falls back to DB when cache misses', () => {
  const cache = new InMemoryCache();
  const db = new InMemoryDB();
  db.create({ keywords: [{ keyword: 'FromDB', count: 5 }], period: { from: new Date(), to: new Date() } });

  const result = simulateGetTrending(cache, db);
  assert.strictEqual(result[0].keyword, 'FromDB');
  assert.strictEqual(result[0].count, 5);
});

test('getTrending re-caches after DB fallback', () => {
  const cache = new InMemoryCache();
  const db = new InMemoryDB();
  db.create({ keywords: [{ keyword: 'Recached', count: 3 }], period: { from: new Date(), to: new Date() } });

  simulateGetTrending(cache, db);
  // Now cache should have the data
  const cached = cache.get('trending:global');
  assert.ok(cached);
  const parsed = JSON.parse(cached);
  assert.strictEqual(parsed[0].keyword, 'Recached');
});

test('getTrending returns empty when both cache and DB are empty', () => {
  const cache = new InMemoryCache();
  const db = new InMemoryDB();
  const result = simulateGetTrending(cache, db);
  assert.deepStrictEqual(result, []);
});

test('multiple updates create multiple snapshots', () => {
  const cache = new InMemoryCache();
  const db = new InMemoryDB();

  simulateUpdateTrending([{ rawQuery: 'Ford', timestamp: new Date() }], cache, db);
  simulateUpdateTrending([{ rawQuery: 'Chevy', timestamp: new Date() }], cache, db);
  simulateUpdateTrending([{ rawQuery: 'Toyota', timestamp: new Date() }], cache, db);

  assert.strictEqual(db.snapshots.length, 3);
  const history = db.findAll(24);
  assert.strictEqual(history.length, 3);
});

test('snapshot contains period from/to', () => {
  const cache = new InMemoryCache();
  const db = new InMemoryDB();
  simulateUpdateTrending([{ rawQuery: 'test', timestamp: new Date() }], cache, db);

  const snapshot = db.findLatest();
  assert.ok(snapshot.period.from);
  assert.ok(snapshot.period.to);
  assert.ok(snapshot.period.to > snapshot.period.from);
});

test('old search logs outside 24h window are excluded', () => {
  const cache = new InMemoryCache();
  const db = new InMemoryDB();
  const twoDaysAgo = new Date(Date.now() - 48 * 60 * 60 * 1000);
  const logs = [
    { rawQuery: 'OldQuery', timestamp: twoDaysAgo },
    { rawQuery: 'RecentQuery', timestamp: new Date() },
  ];

  const trending = simulateUpdateTrending(logs, cache, db);
  assert.strictEqual(trending.length, 1);
  assert.strictEqual(trending[0].keyword, 'RecentQuery');
});

console.log(`\nTrending Persistence: ${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
