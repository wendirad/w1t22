import crypto from 'crypto';

const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 16;
const TAG_LENGTH = 16;

export interface EncryptedData {
  ciphertext: string;
  iv: string;
  tag: string;
  keyVersion: string;
}

export function encrypt(plaintext: string, key: Buffer, keyVersion: string): EncryptedData {
  const iv = crypto.randomBytes(IV_LENGTH);
  const cipher = crypto.createCipheriv(ALGORITHM, key, iv);
  let ciphertext = cipher.update(plaintext, 'utf8', 'hex');
  ciphertext += cipher.final('hex');
  const tag = cipher.getAuthTag();

  return {
    ciphertext,
    iv: iv.toString('hex'),
    tag: tag.toString('hex'),
    keyVersion,
  };
}

export function decrypt(data: EncryptedData, key: Buffer): string {
  const decipher = crypto.createDecipheriv(
    ALGORITHM,
    key,
    Buffer.from(data.iv, 'hex')
  );
  decipher.setAuthTag(Buffer.from(data.tag, 'hex'));
  let plaintext = decipher.update(data.ciphertext, 'hex', 'utf8');
  plaintext += decipher.final('utf8');
  return plaintext;
}

export function generateHmac(
  method: string,
  path: string,
  body: string,
  timestamp: string,
  secret: string
): string {
  const payload = `${method}\n${path}\n${body}\n${timestamp}`;
  return crypto.createHmac('sha256', secret).update(payload).digest('hex');
}

export function verifyHmac(
  signature: string,
  method: string,
  path: string,
  body: string,
  timestamp: string,
  secret: string
): boolean {
  const expected = generateHmac(method, path, body, timestamp, secret);
  return crypto.timingSafeEqual(
    Buffer.from(signature, 'hex'),
    Buffer.from(expected, 'hex')
  );
}

export function hashFile(buffer: Buffer): string {
  return crypto.createHash('sha256').update(buffer).digest('hex');
}

export function generateKeyPair(): { key: Buffer; keyId: string } {
  return {
    key: crypto.randomBytes(32),
    keyId: crypto.randomUUID(),
  };
}
