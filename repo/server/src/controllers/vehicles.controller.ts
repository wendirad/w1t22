import { Request, Response, NextFunction } from 'express';
import * as vehicleService from '../services/vehicle.service';
import { parsePaginationParams } from '../lib/pagination';

export async function listVehicles(req: Request, res: Response, next: NextFunction) {
  try {
    const pagination = parsePaginationParams(req.query);
    const filters = {
      dealershipId: req.query.dealershipId || req.scope?.dealershipId,
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
    res.json(vehicle);
  } catch (error) {
    next(error);
  }
}

export async function createVehicle(req: Request, res: Response, next: NextFunction) {
  try {
    const vehicle = await vehicleService.createVehicle({
      ...req.body,
      dealershipId: req.body.dealershipId || req.scope?.dealershipId,
    });
    res.status(201).json(vehicle);
  } catch (error) {
    next(error);
  }
}

export async function updateVehicle(req: Request, res: Response, next: NextFunction) {
  try {
    const vehicle = await vehicleService.updateVehicle(req.params.id, req.body);
    res.json(vehicle);
  } catch (error) {
    next(error);
  }
}
