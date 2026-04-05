import mongoose, { Schema, Document } from 'mongoose';
import { PermissionEffect } from '../types/enums';

export interface IPermissionOverride extends Document {
  dealershipId: mongoose.Types.ObjectId;
  resource: string;
  resourceId: mongoose.Types.ObjectId | null;
  role: string | null;
  userId: mongoose.Types.ObjectId | null;
  actions: string[];
  effect: PermissionEffect;
  reason: string;
  grantedBy: mongoose.Types.ObjectId;
  expiresAt: Date | null;
  createdAt: Date;
}

const permissionOverrideSchema = new Schema<IPermissionOverride>(
  {
    dealershipId: { type: Schema.Types.ObjectId, ref: 'Dealership', required: true },
    resource: { type: String, required: true },
    resourceId: { type: Schema.Types.ObjectId, default: null },
    role: { type: String, default: null },
    userId: { type: Schema.Types.ObjectId, ref: 'User', default: null },
    actions: { type: [String], required: true },
    effect: {
      type: String,
      enum: Object.values(PermissionEffect),
      required: true,
    },
    reason: { type: String, default: '' },
    grantedBy: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    expiresAt: { type: Date, default: null },
  },
  { timestamps: true }
);

permissionOverrideSchema.index({ dealershipId: 1, resource: 1, resourceId: 1 });

export const PermissionOverride = mongoose.model<IPermissionOverride>(
  'PermissionOverride',
  permissionOverrideSchema
);
