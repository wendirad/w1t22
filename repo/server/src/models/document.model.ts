import mongoose, { Schema, Document } from 'mongoose';
import { DocumentType } from '../types/enums';

export interface IDocument extends Document {
  dealershipId: mongoose.Types.ObjectId;
  orderId: mongoose.Types.ObjectId | null;
  vehicleId: mongoose.Types.ObjectId | null;
  uploadedBy: mongoose.Types.ObjectId;
  type: DocumentType;
  originalFilename: string;
  storagePath: string;
  mimeType: string;
  sizeBytes: number;
  sha256Hash: string;
  quarantined: boolean;
  quarantineReason: string | null;
  sensitiveFlag: boolean;
  permissions: {
    readRoles: string[];
    writeRoles: string[];
    overrides: Array<{
      userId: mongoose.Types.ObjectId;
      actions: string[];
    }>;
  };
  createdAt: Date;
  updatedAt: Date;
}

const documentSchema = new Schema<IDocument>(
  {
    dealershipId: { type: Schema.Types.ObjectId, ref: 'Dealership', required: true },
    orderId: { type: Schema.Types.ObjectId, ref: 'Order', default: null },
    vehicleId: { type: Schema.Types.ObjectId, ref: 'Vehicle', default: null },
    uploadedBy: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    type: {
      type: String,
      enum: Object.values(DocumentType),
      default: DocumentType.OTHER,
    },
    originalFilename: { type: String, required: true },
    storagePath: { type: String, required: true },
    mimeType: { type: String, required: true },
    sizeBytes: { type: Number, required: true },
    sha256Hash: { type: String, required: true },
    quarantined: { type: Boolean, default: false },
    quarantineReason: { type: String, default: null },
    sensitiveFlag: { type: Boolean, default: false },
    permissions: {
      readRoles: { type: [String], default: ['admin', 'dealership_staff', 'finance_reviewer'] },
      writeRoles: { type: [String], default: ['admin', 'dealership_staff'] },
      overrides: [
        {
          userId: { type: Schema.Types.ObjectId, ref: 'User' },
          actions: { type: [String] },
        },
      ],
    },
  },
  { timestamps: true }
);

documentSchema.index({ dealershipId: 1, orderId: 1 });
documentSchema.index({ uploadedBy: 1 });

export const DocumentModel = mongoose.model<IDocument>('Document', documentSchema);
