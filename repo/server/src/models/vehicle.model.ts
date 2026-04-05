import mongoose, { Schema, Document } from 'mongoose';
import { VehicleStatus } from '../types/enums';

export interface IVehicle {
  dealershipId: mongoose.Types.ObjectId;
  vin: string;
  make: string;
  model: string;
  year: number;
  trim: string;
  mileage: number;
  price: number;
  region: string;
  registrationDate: Date;
  status: VehicleStatus;
  supplierId: string | null;
  warehouseId: string | null;
  estimatedTurnaround: number;
  images: string[];
  description: string;
  createdAt: Date;
  updatedAt: Date;
}

const vehicleSchema = new Schema<IVehicle>(
  {
    dealershipId: { type: Schema.Types.ObjectId, ref: 'Dealership', required: true },
    vin: { type: String, required: true, unique: true, uppercase: true },
    make: { type: String, required: true },
    model: { type: String, required: true },
    year: { type: Number, required: true },
    trim: { type: String, default: '' },
    mileage: { type: Number, required: true },
    price: { type: Number, required: true },
    region: { type: String, required: true },
    registrationDate: { type: Date, required: true },
    status: {
      type: String,
      enum: Object.values(VehicleStatus),
      default: VehicleStatus.AVAILABLE,
    },
    supplierId: { type: String, default: null },
    warehouseId: { type: String, default: null },
    estimatedTurnaround: { type: Number, default: 3 },
    images: { type: [String], default: [] },
    description: { type: String, default: '' },
  },
  { timestamps: true }
);

vehicleSchema.index({ dealershipId: 1, status: 1 });
vehicleSchema.index({ make: 1, model: 1, year: 1 });
vehicleSchema.index({ price: 1 });
vehicleSchema.index({ mileage: 1 });
vehicleSchema.index({ make: 'text', model: 'text', description: 'text' });

export const Vehicle = mongoose.model<IVehicle>('Vehicle', vehicleSchema);
