import mongoose, { Schema, Document } from 'mongoose';

export interface ITaxRate extends Document {
  state: string;
  county: string;
  rate: number;
  effectiveDate: Date;
  expiresAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

const taxRateSchema = new Schema<ITaxRate>(
  {
    state: { type: String, required: true },
    county: { type: String, default: '' },
    rate: { type: Number, required: true },
    effectiveDate: { type: Date, required: true },
    expiresAt: { type: Date, default: null },
  },
  { timestamps: true }
);

taxRateSchema.index({ state: 1, county: 1, effectiveDate: -1 });

export const TaxRate = mongoose.model<ITaxRate>('TaxRate', taxRateSchema);
