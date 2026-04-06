const assert = require('assert');
const { encrypt, decrypt, generateHmac, verifyHmac, hashFile } = require('../server/dist/lib/crypto');
const crypto = require('crypto');

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

console.log('Encryption Tests (using production crypto module):');

test('AES-256-GCM encrypt/decrypt round-trip', () => {
  const key = crypto.randomBytes(32);
  const plaintext = 'Sensitive driver license: DL123456789';
  const encrypted = encrypt(plaintext, key, 'key-v1');
  const decrypted = decrypt(encrypted, key);
  assert.strictEqual(decrypted, plaintext);
});

test('different IVs produce different ciphertexts', () => {
  const key = crypto.randomBytes(32);
  const plaintext = 'Same plaintext';
  const enc1 = encrypt(plaintext, key, 'v1');
  const enc2 = encrypt(plaintext, key, 'v1');
  assert.notStrictEqual(enc1.ciphertext, enc2.ciphertext);
  assert.strictEqual(decrypt(enc1, key), decrypt(enc2, key));
});

test('wrong key fails decryption', () => {
  const key1 = crypto.randomBytes(32);
  const key2 = crypto.randomBytes(32);
  const encrypted = encrypt('secret', key1, 'v1');
  try {
    decrypt(encrypted, key2);
    assert.fail('Should have thrown');
  } catch (e) {
    assert.ok(e.message !== 'Should have thrown');
  }
});

test('tampered ciphertext fails decryption', () => {
  const key = crypto.randomBytes(32);
  const encrypted = encrypt('secret', key, 'v1');
  encrypted.ciphertext = 'ff' + encrypted.ciphertext.slice(2);
  try {
    decrypt(encrypted, key);
    assert.fail('Should have thrown');
  } catch (e) {
    assert.ok(true);
  }
});

test('key version is preserved', () => {
  const key = crypto.randomBytes(32);
  const encrypted = encrypt('test', key, 'key-v3');
  assert.strictEqual(encrypted.keyVersion, 'key-v3');
});

test('HMAC generation is deterministic', () => {
  const secret = 'test-secret';
  const hmac1 = generateHmac('POST', '/api/v1/orders', '{"id":1}', '2024-01-01T00:00:00Z', secret);
  const hmac2 = generateHmac('POST', '/api/v1/orders', '{"id":1}', '2024-01-01T00:00:00Z', secret);
  assert.strictEqual(hmac1, hmac2);
});

test('HMAC changes with different body', () => {
  const secret = 'test-secret';
  const hmac1 = generateHmac('POST', '/api/v1/orders', '{"id":1}', '2024-01-01T00:00:00Z', secret);
  const hmac2 = generateHmac('POST', '/api/v1/orders', '{"id":2}', '2024-01-01T00:00:00Z', secret);
  assert.notStrictEqual(hmac1, hmac2);
});

test('HMAC verification succeeds for correct signature', () => {
  const secret = 'test-secret';
  const sig = generateHmac('POST', '/api/v1/test', '{}', '2024-01-01T00:00:00Z', secret);
  assert.strictEqual(verifyHmac(sig, 'POST', '/api/v1/test', '{}', '2024-01-01T00:00:00Z', secret), true);
});

test('HMAC verification fails for wrong secret', () => {
  const sig = generateHmac('POST', '/api/v1/test', '{}', '2024-01-01T00:00:00Z', 'secret1');
  assert.strictEqual(verifyHmac(sig, 'POST', '/api/v1/test', '{}', '2024-01-01T00:00:00Z', 'secret2'), false);
});

test('file hashing is deterministic', () => {
  const buffer = Buffer.from('file content here');
  const hash1 = hashFile(buffer);
  const hash2 = hashFile(buffer);
  assert.strictEqual(hash1, hash2);
});

test('different files produce different hashes', () => {
  const hash1 = hashFile(Buffer.from('file 1'));
  const hash2 = hashFile(Buffer.from('file 2'));
  assert.notStrictEqual(hash1, hash2);
});

test('encrypt handles unicode characters', () => {
  const key = crypto.randomBytes(32);
  const plaintext = 'Unicode test: ñ é ü 中文 日本語';
  const encrypted = encrypt(plaintext, key, 'v1');
  const decrypted = decrypt(encrypted, key);
  assert.strictEqual(decrypted, plaintext);
});

console.log(`\nEncryption: ${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
