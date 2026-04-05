import mongoose, { Schema, Document } from 'mongoose';

export interface IConsent extends Document {
  userId: mongoose.Types.ObjectId;
  consentType: string;
  granted: boolean;
  version: string;
  ipAddress: string;
  userAgent: string;
  timestamp: Date;
}

const consentSchema = new Schema<IConsent>({
  userId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
  consentType: { type: String, required: true },
  granted: { type: Boolean, required: true },
  version: { type: String, required: true },
  ipAddress: { type: String, default: '' },
  userAgent: { type: String, default: '' },
  timestamp: { type: Date, default: Date.now },
});

consentSchema.index({ userId: 1, consentType: 1, timestamp: -1 });

export const Consent = mongoose.model<IConsent>('Consent', consentSchema);
