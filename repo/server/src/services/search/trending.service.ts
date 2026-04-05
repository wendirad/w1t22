import { SearchLog } from '../../models/search-log.model';
import { getRedisClient } from '../../config/redis';

export async function updateTrendingKeywords(): Promise<void> {
  const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);

  const results = await SearchLog.aggregate([
    { $match: { timestamp: { $gte: oneDayAgo }, rawQuery: { $ne: '' } } },
    { $group: { _id: '$rawQuery', count: { $sum: 1 } } },
    { $sort: { count: -1 } },
    { $limit: 20 },
  ]);

  const trending = results.map((r) => ({ keyword: r._id, count: r.count }));
  const redis = getRedisClient();
  await redis.setex('trending:global', 4200, JSON.stringify(trending));
}

export async function getTrendingKeywords(): Promise<Array<{ keyword: string; count: number }>> {
  const redis = getRedisClient();
  const cached = await redis.get('trending:global');
  if (cached) {
    return JSON.parse(cached);
  }
  return [];
}
