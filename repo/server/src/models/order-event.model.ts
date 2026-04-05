import mongoose, { Schema, Document } from 'mongoose';

export interface IOrderEvent extends Document {
  orderId: mongoose.Types.ObjectId;
  fromStatus: string | null;
  toStatus: string;
  triggeredBy: mongoose.Types.ObjectId;
  reason: string;
  metadata: Record<string, any>;
  rolledBack: boolean;
  rolledBackAt: Date | null;
  timestamp: Date;
}

const orderEventSchema = new Schema<IOrderEvent>({
  orderId: { type: Schema.Types.ObjectId, ref: 'Order', required: true },
  fromStatus: { type: String, default: null },
  toStatus: { type: String, required: true },
  triggeredBy: { type: Schema.Types.ObjectId, ref: 'User', required: true },
  reason: { type: String, default: '' },
  metadata: { type: Schema.Types.Mixed, default: {} },
  rolledBack: { type: Boolean, default: false },
  rolledBackAt: { type: Date, default: null },
  timestamp: { type: Date, default: Date.now },
});

orderEventSchema.index({ orderId: 1, timestamp: 1 });

export const OrderEvent = mongoose.model<IOrderEvent>('OrderEvent', orderEventSchema);
