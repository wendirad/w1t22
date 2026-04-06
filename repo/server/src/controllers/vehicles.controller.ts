import { Request, Response, NextFunction } from 'express';
import * as vehicleService from '../services/vehicle.service';
import { parsePaginationParams } from '../lib/pagination';
import { ForbiddenError } from '../lib/errors';

/** Extract raw ObjectId string from a potentially-populated Mongoose field */
function extractId(field: any): string | undefined {
  if (!field) return undefined;
  if (typeof field === 'string') return field;
  // Populated document — get the _id
  if (field._id) return field._id.toString();
  return field.toString();
}

export async function listVehicles(req: Request, res: Response, next: NextFunction) {
  try {
    const pagination = parsePaginationParams(req.query);
    // Non-admin authenticated users: enforce dealership scope from auth context, ignore query param
    let dealershipId: string | undefined;
    if (req.user && req.user.role !== 'admin') {
      dealershipId = req.user.dealershipId || req.scope?.dealershipId;
    } else {
      dealershipId = (req.scope?.dealershipId || req.query.dealershipId) as string | undefined;
    }
    const filters = {
      dealershipId,
      make: req.query.make,
      model: req.query.model,
      year: req.query.year ? parseInt(req.query.year as string) : undefined,
      minPrice: req.query.minPrice ? parseInt(req.query.minPrice as string) : undefined,
      maxPrice: req.query.maxPrice ? parseInt(req.query.maxPrice as string) : undefined,
      minMileage: req.query.minMileage ? parseInt(req.query.minMileage as string) : undefined,
      maxMileage: req.query.maxMileage ? parseInt(req.query.maxMileage as string) : undefined,
      region: req.query.region,
      status: req.query.status,
    };
    const result = await vehicleService.listVehicles(filters, pagination);
    res.json(result);
  } catch (error) {
    next(error);
  }
}

export async function getVehicle(req: Request, res: Response, next: NextFunction) {
  try {
    const vehicle = await vehicleService.getVehicleById(req.params.id);
    // Enforce tenant ownership for authenticated non-admin users
    if (req.user && req.user.role !== 'admin') {
      const userDealership = req.user.dealershipId || req.scope?.dealershipId;
      const vehicleDealership = extractId(vehicle.dealershipId);
      if (userDealership && vehicleDealership !== userDealership) {
        throw new ForbiddenError('You do not have access to this vehicle');
      }
    }
    res.json(vehicle);
  } catch (error) {
    next(error);
  }
}

export async function createVehicle(req: Request, res: Response, next: NextFunction) {
  try {
    // Non-admin users: always derive dealershipId from auth context, never trust client input
    const dealershipId = req.user!.role === 'admin'
      ? (req.body.dealershipId || req.scope?.dealershipId)
      : (req.user!.dealershipId || req.scope?.dealershipId);
    const vehicle = await vehicleService.createVehicle({
      ...req.body,
      dealershipId,
    });
    res.status(201).json(vehicle);
  } catch (error) {
    next(error);
  }
}

export async function updateVehicle(req: Request, res: Response, next: NextFunction) {
  try {
    // Enforce tenant ownership: fetch vehicle first and verify dealership match
    const existing = await vehicleService.getVehicleById(req.params.id);
    const existingDealershipId = extractId(existing.dealershipId);
    if (req.user!.role !== 'admin') {
      const userDealership = req.user!.dealershipId || req.scope?.dealershipId;
      if (!userDealership || existingDealershipId !== userDealership) {
        throw new ForbiddenError('You do not have permission to modify this vehicle');
      }
    }
    // Prevent non-admin users from changing dealershipId via update
    if (req.user!.role !== 'admin') {
      delete req.body.dealershipId;
    }
    const vehicle = await vehicleService.updateVehicleScoped(
      req.params.id,
      existingDealershipId,
      req.body
    );
    res.json(vehicle);
  } catch (error) {
    next(error);
  }
}
