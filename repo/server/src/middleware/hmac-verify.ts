import { Request, Response, NextFunction } from 'express';
import { verifyHmac } from '../lib/crypto';
import { UnauthorizedError, ConflictError } from '../lib/errors';
import { getRedisClient } from '../config/redis';
import config from '../config';
import logger from '../lib/logger';

export async function hmacVerify(
  req: Request,
  _res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const signature = req.headers['x-hmac-signature'] as string;
    const timestamp = req.headers['x-timestamp'] as string;

    if (!signature || !timestamp) {
      throw new UnauthorizedError('Missing HMAC signature or timestamp');
    }

    const now = Date.now();
    const requestTime = new Date(timestamp).getTime();
    const drift = Math.abs(now - requestTime) / 1000;

    if (drift > config.hmacWindowSeconds) {
      throw new UnauthorizedError('Request timestamp outside acceptable window');
    }

    const rawBody = req.body && Object.keys(req.body).length > 0 ? JSON.stringify(req.body) : '';

    const valid = verifyHmac(
      signature,
      req.method,
      req.originalUrl,
      rawBody,
      timestamp,
      config.hmacSecret
    );

    if (!valid) {
      throw new UnauthorizedError('Invalid HMAC signature');
    }

    const redis = getRedisClient();
    const nonceKey = `hmac:nonce:${signature}`;
    const exists = await redis.exists(nonceKey);

    if (exists) {
      throw new ConflictError('Replay detected: request already processed');
    }

    await redis.setex(nonceKey, config.hmacWindowSeconds + 10, '1');

    next();
  } catch (error) {
    next(error);
  }
}
