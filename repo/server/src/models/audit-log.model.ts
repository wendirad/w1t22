import mongoose, { Schema, Document } from 'mongoose';

export interface IAuditLog extends Document {
  dealershipId: mongoose.Types.ObjectId | null;
  actor: {
    userId: mongoose.Types.ObjectId;
    role: string;
    ip: string;
  };
  action: string;
  resource: {
    type: string;
    id: mongoose.Types.ObjectId;
  };
  before: Record<string, any> | null;
  after: Record<string, any> | null;
  requestId: string;
  timestamp: Date;
}

const auditLogSchema = new Schema<IAuditLog>({
  dealershipId: { type: Schema.Types.ObjectId, ref: 'Dealership', default: null },
  actor: {
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    role: { type: String, required: true },
    ip: { type: String, default: '' },
  },
  action: { type: String, required: true },
  resource: {
    type: { type: String, required: true },
    id: { type: Schema.Types.ObjectId, required: true },
  },
  before: { type: Schema.Types.Mixed, default: null },
  after: { type: Schema.Types.Mixed, default: null },
  requestId: { type: String, default: '' },
  timestamp: { type: Date, default: Date.now },
});

auditLogSchema.index({ 'resource.type': 1, 'resource.id': 1, timestamp: -1 });
auditLogSchema.index({ 'actor.userId': 1, timestamp: -1 });
auditLogSchema.index({ dealershipId: 1, timestamp: -1 });

export const AuditLog = mongoose.model<IAuditLog>('AuditLog', auditLogSchema);
