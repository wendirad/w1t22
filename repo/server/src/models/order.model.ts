import mongoose, { Schema, Document } from 'mongoose';
import { OrderStatus } from '../types/enums';

export interface IOrderItem {
  vehicleId: mongoose.Types.ObjectId;
  supplierId: string | null;
  warehouseId: string | null;
  turnaroundDays: number;
  addOnServices: Array<{ serviceCode: string; name: string; price: number }>;
  subtotal: number;
}

export interface IOrder extends Document {
  orderNumber: string;
  dealershipId: mongoose.Types.ObjectId;
  buyerId: mongoose.Types.ObjectId;
  parentOrderId: mongoose.Types.ObjectId | null;
  childOrderIds: mongoose.Types.ObjectId[];
  status: OrderStatus;
  items: IOrderItem[];
  totals: {
    subtotal: number;
    tax: number;
    total: number;
  };
  idempotencyKey: string;
  cancelledAt: Date | null;
  cancelReason: string | null;
  createdAt: Date;
  updatedAt: Date;
}

const orderSchema = new Schema<IOrder>(
  {
    orderNumber: { type: String, required: true },
    dealershipId: { type: Schema.Types.ObjectId, ref: 'Dealership', required: true },
    buyerId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    parentOrderId: { type: Schema.Types.ObjectId, ref: 'Order', default: null },
    childOrderIds: [{ type: Schema.Types.ObjectId, ref: 'Order' }],
    status: {
      type: String,
      enum: Object.values(OrderStatus),
      default: OrderStatus.CREATED,
    },
    items: [
      {
        vehicleId: { type: Schema.Types.ObjectId, ref: 'Vehicle', required: true },
        supplierId: { type: String, default: null },
        warehouseId: { type: String, default: null },
        turnaroundDays: { type: Number, default: 3 },
        addOnServices: [
          {
            serviceCode: { type: String },
            name: { type: String },
            price: { type: Number },
          },
        ],
        subtotal: { type: Number, required: true },
      },
    ],
    totals: {
      subtotal: { type: Number, default: 0 },
      tax: { type: Number, default: 0 },
      total: { type: Number, default: 0 },
    },
    idempotencyKey: { type: String, required: true },
    cancelledAt: { type: Date, default: null },
    cancelReason: { type: String, default: null },
  },
  { timestamps: true }
);

orderSchema.index({ dealershipId: 1, status: 1 });
orderSchema.index({ buyerId: 1 });
orderSchema.index({ idempotencyKey: 1 }, { unique: true });
orderSchema.index({ orderNumber: 1, dealershipId: 1 }, { unique: true });

export const Order = mongoose.model<IOrder>('Order', orderSchema);
