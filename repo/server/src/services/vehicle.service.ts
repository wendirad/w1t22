import { Vehicle, IVehicle } from '../models/vehicle.model';
import { VehicleStatus } from '../types/enums';
import { NotFoundError, BadRequestError } from '../lib/errors';
import { PaginationParams, buildPaginatedResult } from '../lib/pagination';
import logger from '../lib/logger';

interface CreateVehicleInput {
  dealershipId: string;
  vin: string;
  make: string;
  model: string;
  year: number;
  trim?: string;
  mileage: number;
  price: number;
  region: string;
  registrationDate: Date;
  supplierId?: string;
  warehouseId?: string;
  estimatedTurnaround?: number;
  images?: string[];
  description?: string;
}

export async function createVehicle(input: CreateVehicleInput) {
  const vehicle = new Vehicle(input);
  await vehicle.save();
  logger.info({ vehicleId: vehicle._id, vin: vehicle.vin }, 'Vehicle created');
  return vehicle;
}

export async function getVehicleById(id: string) {
  const vehicle = await Vehicle.findById(id).populate('dealershipId');
  if (!vehicle) {
    throw new NotFoundError('Vehicle not found');
  }
  return vehicle;
}

export async function updateVehicle(id: string, updates: Partial<IVehicle>) {
  const vehicle = await Vehicle.findByIdAndUpdate(id, updates, { new: true });
  if (!vehicle) {
    throw new NotFoundError('Vehicle not found');
  }
  return vehicle;
}

export async function updateVehicleScoped(id: string, dealershipId: string | undefined, updates: Partial<IVehicle>) {
  const vehicle = await Vehicle.findOneAndUpdate(
    { _id: id, dealershipId },
    updates,
    { new: true }
  );
  if (!vehicle) {
    throw new NotFoundError('Vehicle not found or does not belong to your dealership');
  }
  return vehicle;
}

export async function listVehicles(
  filters: Record<string, any>,
  pagination: PaginationParams
) {
  const query: any = {};

  if (filters.dealershipId) query.dealershipId = filters.dealershipId;
  if (filters.status) query.status = filters.status;
  else query.status = VehicleStatus.AVAILABLE;
  if (filters.make) query.make = new RegExp(filters.make, 'i');
  if (filters.model) query.model = new RegExp(filters.model, 'i');
  if (filters.year) query.year = filters.year;
  if (filters.minPrice || filters.maxPrice) {
    query.price = {};
    if (filters.minPrice) query.price.$gte = filters.minPrice;
    if (filters.maxPrice) query.price.$lte = filters.maxPrice;
  }
  if (filters.minMileage || filters.maxMileage) {
    query.mileage = {};
    if (filters.minMileage) query.mileage.$gte = filters.minMileage;
    if (filters.maxMileage) query.mileage.$lte = filters.maxMileage;
  }
  if (filters.region) query.region = new RegExp(filters.region, 'i');

  const sort: any = { [pagination.sortBy]: pagination.sortOrder === 'asc' ? 1 : -1 };
  const skip = (pagination.page - 1) * pagination.limit;

  const [data, total] = await Promise.all([
    Vehicle.find(query).sort(sort).skip(skip).limit(pagination.limit),
    Vehicle.countDocuments(query),
  ]);

  return buildPaginatedResult(data, total, pagination);
}

export async function reserveVehicle(vehicleId: string) {
  const vehicle = await Vehicle.findOneAndUpdate(
    { _id: vehicleId, status: VehicleStatus.AVAILABLE },
    { status: VehicleStatus.RESERVED },
    { new: true }
  );
  if (!vehicle) {
    throw new BadRequestError('Vehicle is not available for reservation');
  }
  return vehicle;
}

export async function releaseVehicle(vehicleId: string) {
  await Vehicle.findByIdAndUpdate(vehicleId, { status: VehicleStatus.AVAILABLE });
}

export async function markVehicleSold(vehicleId: string) {
  await Vehicle.findByIdAndUpdate(vehicleId, { status: VehicleStatus.SOLD });
}
