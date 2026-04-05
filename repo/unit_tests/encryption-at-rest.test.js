const assert = require('assert');
const crypto = require('crypto');

const ALGORITHM = 'aes-256-gcm';

function encrypt(plaintext, key, keyVersion) {
  const iv = crypto.randomBytes(16);
  const cipher = crypto.createCipheriv(ALGORITHM, key, iv);
  let ciphertext = cipher.update(plaintext, 'utf8', 'hex');
  ciphertext += cipher.final('hex');
  const tag = cipher.getAuthTag();
  return { ciphertext, iv: iv.toString('hex'), tag: tag.toString('hex'), keyVersion };
}

function decrypt(data, key) {
  const decipher = crypto.createDecipheriv(ALGORITHM, key, Buffer.from(data.iv, 'hex'));
  decipher.setAuthTag(Buffer.from(data.tag, 'hex'));
  let plaintext = decipher.update(data.ciphertext, 'hex', 'utf8');
  plaintext += decipher.final('utf8');
  return plaintext;
}

// Simulate user profile encryption at rest
function encryptSensitiveField(value, key, keyId) {
  if (!value) return { encrypted: null, masked: '' };
  const encrypted = encrypt(value, key, keyId);
  const masked = value.slice(-4).padStart(value.length, '*');
  return { encrypted, masked };
}

function decryptSensitiveField(encryptedData, key) {
  if (!encryptedData) return null;
  return decrypt(encryptedData, key);
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

console.log('Encryption At Rest Tests:');

test('drivers license is stored encrypted, not plaintext', () => {
  const key = crypto.randomBytes(32);
  const keyId = 'key-v1';
  const plainDl = 'DL-12345678';
  const { encrypted, masked } = encryptSensitiveField(plainDl, key, keyId);

  // Encrypted value should not contain plaintext
  assert.ok(encrypted.ciphertext !== plainDl);
  assert.ok(!encrypted.ciphertext.includes('DL-12345678'));
  // Masked should show only last 4 chars
  assert.ok(masked.endsWith('5678'));
  assert.ok(masked.startsWith('*'));
  assert.strictEqual(masked.length, plainDl.length);
});

test('SSN is stored encrypted, not plaintext', () => {
  const key = crypto.randomBytes(32);
  const keyId = 'key-v1';
  const plainSsn = '123-45-6789';
  const { encrypted, masked } = encryptSensitiveField(plainSsn, key, keyId);

  assert.ok(encrypted.ciphertext !== plainSsn);
  assert.ok(!encrypted.ciphertext.includes('123-45-6789'));
  assert.ok(masked.endsWith('6789'));
});

test('decryption of drivers license returns original value', () => {
  const key = crypto.randomBytes(32);
  const keyId = 'key-v1';
  const plainDl = 'DL-12345678';
  const { encrypted } = encryptSensitiveField(plainDl, key, keyId);
  const decrypted = decryptSensitiveField(encrypted, key);
  assert.strictEqual(decrypted, plainDl);
});

test('decryption of SSN returns original value', () => {
  const key = crypto.randomBytes(32);
  const keyId = 'key-v1';
  const plainSsn = '123-45-6789';
  const { encrypted } = encryptSensitiveField(plainSsn, key, keyId);
  const decrypted = decryptSensitiveField(encrypted, key);
  assert.strictEqual(decrypted, plainSsn);
});

test('key version metadata is preserved in encrypted data', () => {
  const key = crypto.randomBytes(32);
  const keyId = 'key-v3-rotated';
  const { encrypted } = encryptSensitiveField('sensitive-data', key, keyId);
  assert.strictEqual(encrypted.keyVersion, keyId);
});

test('different keys produce different ciphertexts for same value', () => {
  const key1 = crypto.randomBytes(32);
  const key2 = crypto.randomBytes(32);
  const plain = 'same-sensitive-value';
  const enc1 = encryptSensitiveField(plain, key1, 'v1');
  const enc2 = encryptSensitiveField(plain, key2, 'v2');
  assert.notStrictEqual(enc1.encrypted.ciphertext, enc2.encrypted.ciphertext);
});

test('decryption with wrong key fails', () => {
  const key1 = crypto.randomBytes(32);
  const key2 = crypto.randomBytes(32);
  const { encrypted } = encryptSensitiveField('secret', key1, 'v1');
  try {
    decryptSensitiveField(encrypted, key2);
    assert.fail('Should have thrown');
  } catch (e) {
    assert.ok(e.message !== 'Should have thrown');
  }
});

test('null/empty values are handled gracefully', () => {
  const key = crypto.randomBytes(32);
  const { encrypted, masked } = encryptSensitiveField('', key, 'v1');
  assert.strictEqual(encrypted, null);
  assert.strictEqual(masked, '');
});

test('document sensitive metadata is encrypted', () => {
  const key = crypto.randomBytes(32);
  const keyId = 'key-v1';
  const filename = 'drivers-license-scan.pdf';
  const storagePath = '/uploads/dealership1/2024-01/abc123-drivers-license-scan.pdf';

  const encFilename = encrypt(filename, key, keyId);
  const encPath = encrypt(storagePath, key, keyId);

  // Verify stored values are not plaintext
  assert.ok(!encFilename.ciphertext.includes('drivers-license'));
  assert.ok(!encPath.ciphertext.includes('/uploads/'));

  // Verify decryption returns originals
  assert.strictEqual(decrypt(encFilename, key), filename);
  assert.strictEqual(decrypt(encPath, key), storagePath);
});

test('key rotation: old key decrypts old data, new key encrypts new data', () => {
  const oldKey = crypto.randomBytes(32);
  const newKey = crypto.randomBytes(32);
  const oldKeyId = 'key-v1';
  const newKeyId = 'key-v2';

  // Encrypt with old key
  const oldEncrypted = encrypt('old-secret', oldKey, oldKeyId);
  assert.strictEqual(oldEncrypted.keyVersion, oldKeyId);

  // Encrypt with new key
  const newEncrypted = encrypt('new-secret', newKey, newKeyId);
  assert.strictEqual(newEncrypted.keyVersion, newKeyId);

  // Old key still decrypts old data
  assert.strictEqual(decrypt(oldEncrypted, oldKey), 'old-secret');
  // New key decrypts new data
  assert.strictEqual(decrypt(newEncrypted, newKey), 'new-secret');

  // Old key cannot decrypt new data
  try {
    decrypt(newEncrypted, oldKey);
    assert.fail('Should have thrown');
  } catch (e) {
    assert.ok(e.message !== 'Should have thrown');
  }
});

console.log(`\nEncryption At Rest: ${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
