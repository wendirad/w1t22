import mongoose, { Schema, Document } from 'mongoose';
import { PaymentMethod, PaymentStatus } from '../types/enums';

export interface IPayment extends Document {
  dealershipId: mongoose.Types.ObjectId;
  orderId: mongoose.Types.ObjectId;
  invoiceId: mongoose.Types.ObjectId;
  method: PaymentMethod;
  amount: number;
  status: PaymentStatus;
  adapterUsed: string | null;
  metadata: Record<string, any>;
  idempotencyKey: string;
  createdAt: Date;
}

const paymentSchema = new Schema<IPayment>(
  {
    dealershipId: { type: Schema.Types.ObjectId, ref: 'Dealership', required: true },
    orderId: { type: Schema.Types.ObjectId, ref: 'Order', required: true },
    invoiceId: { type: Schema.Types.ObjectId, ref: 'Invoice', required: true },
    method: {
      type: String,
      enum: Object.values(PaymentMethod),
      required: true,
    },
    amount: { type: Number, required: true },
    status: {
      type: String,
      enum: Object.values(PaymentStatus),
      default: PaymentStatus.PENDING,
    },
    adapterUsed: { type: String, default: null },
    metadata: { type: Schema.Types.Mixed, default: {} },
    idempotencyKey: { type: String, required: true },
  },
  { timestamps: true }
);

paymentSchema.index({ orderId: 1 });
paymentSchema.index({ invoiceId: 1 });
paymentSchema.index({ idempotencyKey: 1 }, { unique: true });

export const Payment = mongoose.model<IPayment>('Payment', paymentSchema);
