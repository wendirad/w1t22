import mongoose, { Schema, Document } from 'mongoose';

export interface ICartItem {
  vehicleId: mongoose.Types.ObjectId;
  addOnServices: Array<{
    serviceCode: string;
    name: string;
    price: number;
  }>;
  addedAt: Date;
}

export interface ICart extends Document {
  userId: mongoose.Types.ObjectId;
  dealershipId: mongoose.Types.ObjectId;
  items: ICartItem[];
  updatedAt: Date;
}

const cartSchema = new Schema<ICart>(
  {
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    dealershipId: { type: Schema.Types.ObjectId, ref: 'Dealership', required: true },
    items: [
      {
        vehicleId: { type: Schema.Types.ObjectId, ref: 'Vehicle', required: true },
        addOnServices: [
          {
            serviceCode: { type: String, required: true },
            name: { type: String, required: true },
            price: { type: Number, required: true },
          },
        ],
        addedAt: { type: Date, default: Date.now },
      },
    ],
  },
  { timestamps: true }
);

cartSchema.index({ userId: 1, dealershipId: 1 }, { unique: true });

export const Cart = mongoose.model<ICart>('Cart', cartSchema);
