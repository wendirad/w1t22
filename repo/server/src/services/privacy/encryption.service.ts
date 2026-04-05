import crypto from 'crypto';
import { EncryptionKey } from '../../models/encryption-key.model';
import { encrypt, decrypt, EncryptedData } from '../../lib/crypto';
import config from '../../config';
import logger from '../../lib/logger';

function getMasterKey(): Buffer {
  return Buffer.from(config.masterEncryptionKey, 'hex');
}

export async function getActiveKey(): Promise<{ key: Buffer; keyId: string }> {
  let activeKey = await EncryptionKey.findOne({ status: 'active' });

  if (!activeKey) {
    const dek = crypto.randomBytes(32);
    const masterKey = getMasterKey();
    const iv = crypto.randomBytes(16);
    const cipher = crypto.createCipheriv('aes-256-gcm', masterKey, iv);
    let encrypted = cipher.update(dek.toString('hex'), 'utf8', 'hex');
    encrypted += cipher.final('hex');
    const tag = cipher.getAuthTag().toString('hex');

    activeKey = await EncryptionKey.create({
      keyId: crypto.randomUUID(),
      encryptedKey: `${iv.toString('hex')}:${encrypted}:${tag}`,
      algorithm: 'aes-256-gcm',
      status: 'active',
    });

    logger.info({ keyId: activeKey.keyId }, 'Initial encryption key created');
  }

  const [ivHex, encryptedHex, tagHex] = activeKey.encryptedKey.split(':');
  const masterKey = getMasterKey();
  const decipher = crypto.createDecipheriv(
    'aes-256-gcm',
    masterKey,
    Buffer.from(ivHex, 'hex')
  );
  decipher.setAuthTag(Buffer.from(tagHex, 'hex'));
  let dekHex = decipher.update(encryptedHex, 'hex', 'utf8');
  dekHex += decipher.final('utf8');

  return { key: Buffer.from(dekHex, 'hex'), keyId: activeKey.keyId };
}

export async function getKeyById(keyId: string): Promise<Buffer> {
  const keyRecord = await EncryptionKey.findOne({ keyId });
  if (!keyRecord) throw new Error(`Encryption key ${keyId} not found`);

  const [ivHex, encryptedHex, tagHex] = keyRecord.encryptedKey.split(':');
  const masterKey = getMasterKey();
  const decipher = crypto.createDecipheriv(
    'aes-256-gcm',
    masterKey,
    Buffer.from(ivHex, 'hex')
  );
  decipher.setAuthTag(Buffer.from(tagHex, 'hex'));
  let dekHex = decipher.update(encryptedHex, 'hex', 'utf8');
  dekHex += decipher.final('utf8');

  return Buffer.from(dekHex, 'hex');
}

export async function encryptValue(plaintext: string): Promise<EncryptedData> {
  const { key, keyId } = await getActiveKey();
  return encrypt(plaintext, key, keyId);
}

export async function decryptValue(data: EncryptedData): Promise<string> {
  const key = await getKeyById(data.keyVersion);
  return decrypt(data, key);
}

export async function rotateKey(): Promise<string> {
  await EncryptionKey.updateMany({ status: 'active' }, { status: 'rotated', rotatedAt: new Date() });

  const dek = crypto.randomBytes(32);
  const masterKey = getMasterKey();
  const iv = crypto.randomBytes(16);
  const cipher = crypto.createCipheriv('aes-256-gcm', masterKey, iv);
  let encrypted = cipher.update(dek.toString('hex'), 'utf8', 'hex');
  encrypted += cipher.final('hex');
  const tag = cipher.getAuthTag().toString('hex');

  const newKey = await EncryptionKey.create({
    keyId: crypto.randomUUID(),
    encryptedKey: `${iv.toString('hex')}:${encrypted}:${tag}`,
    algorithm: 'aes-256-gcm',
    status: 'active',
  });

  logger.info({ keyId: newKey.keyId }, 'Encryption key rotated');
  return newKey.keyId;
}
