import mongoose, { Schema, Document } from 'mongoose';

export interface IOrderEvent extends Document {
  orderId: mongoose.Types.ObjectId | null;
  fromStatus: string | null;
  toStatus: string;
  triggeredBy: mongoose.Types.ObjectId | string;
  reason: string;
  metadata: Record<string, any>;
  rolledBack: boolean;
  rolledBackAt: Date | null;
  timestamp: Date;
}

const orderEventSchema = new Schema<IOrderEvent>({
  // orderId may be null for pre-order failure events (e.g. reservation failures
  // where the order was never created).
  orderId: { type: Schema.Types.ObjectId, ref: 'Order', default: null },
  fromStatus: { type: String, default: null },
  toStatus: { type: String, required: true },
  // triggeredBy is a String (not ObjectId) so it can hold both user IDs and the
  // literal 'system' for rollback/compensation events triggered automatically.
  triggeredBy: { type: String, required: true },
  reason: { type: String, default: '' },
  metadata: { type: Schema.Types.Mixed, default: {} },
  rolledBack: { type: Boolean, default: false },
  rolledBackAt: { type: Date, default: null },
  timestamp: { type: Date, default: Date.now },
});

orderEventSchema.index({ orderId: 1, timestamp: 1 });

export const OrderEvent = mongoose.model<IOrderEvent>('OrderEvent', orderEventSchema);
