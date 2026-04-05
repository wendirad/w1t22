import crypto from 'crypto';
import { getRedisClient } from '../../config/redis';
import config from '../../config';

function buildCacheKey(params: Record<string, any>): string {
  const sorted = JSON.stringify(params, Object.keys(params).sort());
  const hash = crypto.createHash('sha256').update(sorted).digest('hex');
  return `search:${hash}`;
}

export async function getCachedResult(params: Record<string, any>): Promise<any | null> {
  const redis = getRedisClient();
  const key = buildCacheKey(params);
  const cached = await redis.get(key);
  if (!cached) return null;
  return JSON.parse(cached);
}

export async function setCachedResult(
  params: Record<string, any>,
  result: any
): Promise<void> {
  const redis = getRedisClient();
  const key = buildCacheKey(params);
  await redis.setex(key, config.cacheTtlSeconds, JSON.stringify(result));
}
