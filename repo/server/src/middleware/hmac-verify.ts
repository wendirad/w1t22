import { Request, Response, NextFunction } from 'express';
import { verifyHmac } from '../lib/crypto';
import { UnauthorizedError } from '../lib/errors';
import { getRedisClient } from '../config/redis';
import { getSessionSigningKey } from '../services/auth.service';
import config from '../config';

export async function hmacVerify(
  req: Request,
  _res: Response,
  next: NextFunction
): Promise<void> {
  try {
    // HMAC verification requires an authenticated user (must run after authenticate middleware)
    if (!req.user) {
      throw new UnauthorizedError('Authentication required for HMAC verification');
    }

    const signature = req.headers['x-hmac-signature'] as string;
    const timestamp = req.headers['x-timestamp'] as string;

    if (!signature || !timestamp) {
      throw new UnauthorizedError('Missing HMAC signature or timestamp');
    }

    // Guard: signature must be valid hex and correct length for SHA-256 (64 hex chars)
    if (!/^[0-9a-fA-F]{64}$/.test(signature)) {
      throw new UnauthorizedError('Invalid HMAC signature format');
    }

    // Guard: timestamp must be a parseable date
    const requestTime = new Date(timestamp).getTime();
    if (isNaN(requestTime)) {
      throw new UnauthorizedError('Invalid timestamp format');
    }

    const now = Date.now();
    const drift = Math.abs(now - requestTime) / 1000;

    if (drift > config.hmacWindowSeconds) {
      throw new UnauthorizedError('Request timestamp outside acceptable window');
    }

    // Look up the per-session signing key for this user
    const sessionKey = await getSessionSigningKey(req.user.id);
    if (!sessionKey) {
      throw new UnauthorizedError('No active signing session — please re-authenticate');
    }

    // For multipart/form-data (file uploads), body is not JSON-serializable at this point
    // so we sign with empty body — the client must do the same for multipart requests
    const contentType = req.headers['content-type'] || '';
    const isMultipart = contentType.includes('multipart/form-data');
    const rawBody = isMultipart ? '' : (req.body && Object.keys(req.body).length > 0 ? JSON.stringify(req.body) : '');

    const valid = verifyHmac(
      signature,
      req.method,
      req.originalUrl,
      rawBody,
      timestamp,
      sessionKey
    );

    if (!valid) {
      throw new UnauthorizedError('Invalid HMAC signature');
    }

    const redis = getRedisClient();
    const nonceKey = `hmac:nonce:${signature}`;
    const exists = await redis.exists(nonceKey);

    if (exists) {
      throw new UnauthorizedError('Replay detected: request already processed');
    }

    await redis.setex(nonceKey, config.hmacWindowSeconds + 10, '1');

    next();
  } catch (error) {
    // Ensure any unexpected crypto errors surface as 401, not 500
    if (error instanceof UnauthorizedError) {
      next(error);
    } else {
      next(new UnauthorizedError('HMAC verification failed'));
    }
  }
}
