import { SearchLog } from '../../models/search-log.model';
import { TrendingSnapshot } from '../../models/trending-snapshot.model';
import { getRedisClient } from '../../config/redis';
import logger from '../../lib/logger';

export async function updateTrendingKeywords(): Promise<void> {
  const now = new Date();
  const oneDayAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000);

  const results = await SearchLog.aggregate([
    { $match: { timestamp: { $gte: oneDayAgo }, rawQuery: { $ne: '' } } },
    { $group: { _id: '$rawQuery', count: { $sum: 1 } } },
    { $sort: { count: -1 } },
    { $limit: 20 },
  ]);

  const trending = results.map((r) => ({ keyword: r._id, count: r.count }));

  // Persist snapshot to database
  await TrendingSnapshot.create({
    keywords: trending,
    period: { from: oneDayAgo, to: now },
  });

  // Cache in Redis for fast reads
  const redis = getRedisClient();
  await redis.setex('trending:global', 4200, JSON.stringify(trending));

  logger.info({ keywordCount: trending.length }, 'Trending keywords updated and persisted');
}

export async function getTrendingKeywords(): Promise<Array<{ keyword: string; count: number }>> {
  const redis = getRedisClient();
  const cached = await redis.get('trending:global');
  if (cached) {
    return JSON.parse(cached);
  }

  // Fallback to latest persisted snapshot
  const latest = await TrendingSnapshot.findOne().sort({ createdAt: -1 });
  if (latest) {
    // Re-cache for future reads
    await redis.setex('trending:global', 4200, JSON.stringify(latest.keywords));
    return latest.keywords;
  }

  return [];
}

export async function getTrendingHistory(limit: number = 24) {
  return TrendingSnapshot.find().sort({ createdAt: -1 }).limit(limit);
}
