import mongoose, { Schema, Document } from 'mongoose';

export interface IOrderEvent extends Document {
  orderId: mongoose.Types.ObjectId | null;
  fromStatus: string | null;
  toStatus: string;
  triggeredBy: string;
  actorType: 'user' | 'system';
  reason: string;
  metadata: Record<string, any>;
  rolledBack: boolean;
  rolledBackAt: Date | null;
  timestamp: Date;
}

const orderEventSchema = new Schema<IOrderEvent>({
  // orderId is nullable for pre-order failure events (e.g. reservation failures
  // where the order was never created). Not required — defaults to null.
  orderId: { type: Schema.Types.ObjectId, ref: 'Order', default: null, required: false },
  fromStatus: { type: String, default: null },
  toStatus: { type: String, required: true },
  // triggeredBy holds either a user ID string or 'system' for automated events.
  triggeredBy: { type: String, required: true },
  // actorType distinguishes user-initiated events from system-generated failure/
  // rollback events, enabling reliable querying and auditing of each category.
  actorType: { type: String, enum: ['user', 'system'], default: 'user' },
  reason: { type: String, default: '' },
  metadata: { type: Schema.Types.Mixed, default: {} },
  rolledBack: { type: Boolean, default: false },
  rolledBackAt: { type: Date, default: null },
  timestamp: { type: Date, default: Date.now },
});

orderEventSchema.index({ orderId: 1, timestamp: 1 });
orderEventSchema.index({ actorType: 1, timestamp: -1 });

export const OrderEvent = mongoose.model<IOrderEvent>('OrderEvent', orderEventSchema);
