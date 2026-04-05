import mongoose, { Schema, Document } from 'mongoose';

export interface IDealership extends Document {
  name: string;
  region: string;
  address: {
    street: string;
    city: string;
    state: string;
    county: string;
    zip: string;
  };
  settings: {
    enabledPaymentMethods: string[];
  };
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}

const dealershipSchema = new Schema<IDealership>(
  {
    name: { type: String, required: true },
    region: { type: String, required: true },
    address: {
      street: { type: String, default: '' },
      city: { type: String, default: '' },
      state: { type: String, default: '' },
      county: { type: String, default: '' },
      zip: { type: String, default: '' },
    },
    settings: {
      enabledPaymentMethods: {
        type: [String],
        default: ['cash', 'cashier_check', 'in_house_financing'],
      },
    },
    isActive: { type: Boolean, default: true },
  },
  { timestamps: true }
);

dealershipSchema.index({ region: 1 });

export const Dealership = mongoose.model<IDealership>('Dealership', dealershipSchema);
