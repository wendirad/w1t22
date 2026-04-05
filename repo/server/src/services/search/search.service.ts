import { Vehicle } from '../../models/vehicle.model';
import { SearchLog } from '../../models/search-log.model';
import { VehicleStatus } from '../../types/enums';
import { expandSynonyms } from './synonym.service';
import { getCachedResult, setCachedResult } from './cache.service';
import { getTrendingKeywords } from './trending.service';
import { PaginationParams, buildPaginatedResult } from '../../lib/pagination';

interface SearchParams {
  q?: string;
  make?: string;
  model?: string;
  year?: number;
  minPrice?: number;
  maxPrice?: number;
  minMileage?: number;
  maxMileage?: number;
  region?: string;
  minRegistrationDate?: string;
  maxRegistrationDate?: string;
  dealershipId?: string;
}

export async function searchVehicles(
  params: SearchParams,
  pagination: PaginationParams,
  userId?: string
) {
  const cacheParams = { ...params, ...pagination };
  const cached = await getCachedResult(cacheParams);
  if (cached) {
    return cached;
  }

  const query: any = { status: VehicleStatus.AVAILABLE };

  if (params.dealershipId) query.dealershipId = params.dealershipId;

  let expandedTerms: string[] = [];

  if (params.q) {
    const terms = params.q.trim().toLowerCase().split(/\s+/);
    const allTerms: string[] = [];

    for (const term of terms) {
      const makeExpansions = await expandSynonyms(term, 'make');
      const modelExpansions = await expandSynonyms(term, 'model');
      const unique = [...new Set([...makeExpansions, ...modelExpansions])];
      allTerms.push(...unique);
    }

    expandedTerms = allTerms;

    const regexPatterns = allTerms.map((t) => new RegExp(t, 'i'));
    query.$or = [
      { make: { $in: regexPatterns } },
      { model: { $in: regexPatterns } },
      { description: { $in: regexPatterns } },
    ];
  }

  if (params.make) {
    const makeExpansions = await expandSynonyms(params.make, 'make');
    const regexes = makeExpansions.map((m) => new RegExp(`^${m}$`, 'i'));
    query.make = { $in: regexes };
  }

  if (params.model) {
    const modelExpansions = await expandSynonyms(params.model, 'model');
    const regexes = modelExpansions.map((m) => new RegExp(`^${m}$`, 'i'));
    query.model = { $in: regexes };
  }

  if (params.year) query.year = params.year;

  if (params.minPrice || params.maxPrice) {
    query.price = {};
    if (params.minPrice) query.price.$gte = params.minPrice;
    if (params.maxPrice) query.price.$lte = params.maxPrice;
  }

  if (params.minMileage || params.maxMileage) {
    query.mileage = {};
    if (params.minMileage) query.mileage.$gte = params.minMileage;
    if (params.maxMileage) query.mileage.$lte = params.maxMileage;
  }

  if (params.region) query.region = new RegExp(params.region, 'i');

  if (params.minRegistrationDate || params.maxRegistrationDate) {
    query.registrationDate = {};
    if (params.minRegistrationDate) query.registrationDate.$gte = new Date(params.minRegistrationDate);
    if (params.maxRegistrationDate) query.registrationDate.$lte = new Date(params.maxRegistrationDate);
  }

  const sort: any = { [pagination.sortBy]: pagination.sortOrder === 'asc' ? 1 : -1, _id: 1 };
  const skip = (pagination.page - 1) * pagination.limit;

  const [data, total] = await Promise.all([
    Vehicle.find(query).sort(sort).skip(skip).limit(pagination.limit),
    Vehicle.countDocuments(query),
  ]);

  const trending = await getTrendingKeywords();

  const result = {
    ...buildPaginatedResult(data, total, pagination),
    trending: trending.slice(0, 10),
    expandedTerms,
  };

  await setCachedResult(cacheParams, result);

  SearchLog.create({
    dealershipId: params.dealershipId || null,
    userId: userId || null,
    rawQuery: params.q || '',
    expandedTerms,
    filters: params,
    resultCount: total,
  }).catch(() => {});

  return result;
}
