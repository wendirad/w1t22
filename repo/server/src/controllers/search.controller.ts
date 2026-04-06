import { Request, Response, NextFunction } from 'express';
import { searchVehicles } from '../services/search/search.service';
import { getTrendingKeywords } from '../services/search/trending.service';
import { parsePaginationParams } from '../lib/pagination';

export async function search(req: Request, res: Response, next: NextFunction) {
  try {
    const pagination = parsePaginationParams(req.query);
    // Enforce dealership scope: non-admin authenticated users always use their own dealership,
    // ignoring any client-provided dealershipId to prevent cross-tenant data access
    let dealershipId: string | undefined;
    if (req.user && req.user.role !== 'admin') {
      dealershipId = req.user.dealershipId || req.scope?.dealershipId;
    } else {
      dealershipId = req.scope?.dealershipId || req.query.dealershipId as string;
    }

    const params = {
      q: req.query.q as string,
      make: req.query.make as string,
      model: req.query.model as string,
      year: req.query.year ? parseInt(req.query.year as string) : undefined,
      minPrice: req.query.minPrice ? parseInt(req.query.minPrice as string) : undefined,
      maxPrice: req.query.maxPrice ? parseInt(req.query.maxPrice as string) : undefined,
      minMileage: req.query.minMileage ? parseInt(req.query.minMileage as string) : undefined,
      maxMileage: req.query.maxMileage ? parseInt(req.query.maxMileage as string) : undefined,
      region: req.query.region as string,
      minRegistrationDate: req.query.minRegistrationDate as string,
      maxRegistrationDate: req.query.maxRegistrationDate as string,
      dealershipId,
    };

    const result = await searchVehicles(params, pagination, req.user?.id);
    res.json(result);
  } catch (error) {
    next(error);
  }
}

export async function trending(req: Request, res: Response, next: NextFunction) {
  try {
    const keywords = await getTrendingKeywords();
    res.json({ trending: keywords });
  } catch (error) {
    next(error);
  }
}
