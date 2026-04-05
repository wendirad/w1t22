import mongoose, { Schema, Document } from 'mongoose';

export interface IReconciliationRun extends Document {
  dealershipId: mongoose.Types.ObjectId;
  ranAt: Date;
  period: { from: Date; to: Date };
  matchedCount: number;
  unmatchedOrders: mongoose.Types.ObjectId[];
  unmatchedInvoices: mongoose.Types.ObjectId[];
  unmatchedSettlements: mongoose.Types.ObjectId[];
  discrepancies: Array<{
    type: string;
    referenceId: mongoose.Types.ObjectId;
    details: string;
  }>;
  status: string;
}

const reconciliationRunSchema = new Schema<IReconciliationRun>(
  {
    dealershipId: { type: Schema.Types.ObjectId, ref: 'Dealership', required: true },
    ranAt: { type: Date, default: Date.now },
    period: {
      from: { type: Date, required: true },
      to: { type: Date, required: true },
    },
    matchedCount: { type: Number, default: 0 },
    unmatchedOrders: [{ type: Schema.Types.ObjectId, ref: 'Order' }],
    unmatchedInvoices: [{ type: Schema.Types.ObjectId, ref: 'Invoice' }],
    unmatchedSettlements: [{ type: Schema.Types.ObjectId, ref: 'Payment' }],
    discrepancies: [
      {
        type: { type: String },
        referenceId: { type: Schema.Types.ObjectId },
        details: { type: String },
      },
    ],
    status: {
      type: String,
      enum: ['completed', 'completed_with_discrepancies', 'failed'],
      default: 'completed',
    },
  },
  { timestamps: true }
);

reconciliationRunSchema.index({ dealershipId: 1, ranAt: -1 });

export const ReconciliationRun = mongoose.model<IReconciliationRun>(
  'ReconciliationRun',
  reconciliationRunSchema
);
