import mongoose, { Schema, Document } from 'mongoose';

export interface IDiscrepancyTicket extends Document {
  reconciliationRunId: mongoose.Types.ObjectId;
  dealershipId: mongoose.Types.ObjectId;
  type: string;
  referenceId: mongoose.Types.ObjectId;
  details: string;
  status: string;
  assignedTo: mongoose.Types.ObjectId | null;
  resolution: string | null;
  resolvedBy: mongoose.Types.ObjectId | null;
  resolvedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

const discrepancyTicketSchema = new Schema<IDiscrepancyTicket>(
  {
    reconciliationRunId: { type: Schema.Types.ObjectId, ref: 'ReconciliationRun', required: true },
    dealershipId: { type: Schema.Types.ObjectId, ref: 'Dealership', required: true },
    type: { type: String, required: true },
    referenceId: { type: Schema.Types.ObjectId, required: true },
    details: { type: String, required: true },
    status: {
      type: String,
      enum: ['open', 'in_review', 'resolved', 'dismissed'],
      default: 'open',
    },
    assignedTo: { type: Schema.Types.ObjectId, ref: 'User', default: null },
    resolution: { type: String, default: null },
    resolvedBy: { type: Schema.Types.ObjectId, ref: 'User', default: null },
    resolvedAt: { type: Date, default: null },
  },
  { timestamps: true }
);

discrepancyTicketSchema.index({ dealershipId: 1, status: 1 });
discrepancyTicketSchema.index({ reconciliationRunId: 1 });
discrepancyTicketSchema.index({ assignedTo: 1, status: 1 });

export const DiscrepancyTicket = mongoose.model<IDiscrepancyTicket>(
  'DiscrepancyTicket',
  discrepancyTicketSchema
);
