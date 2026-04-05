import mongoose, { Schema, Document } from 'mongoose';

export interface IEncryptionKey extends Document {
  keyId: string;
  encryptedKey: string;
  algorithm: string;
  status: 'active' | 'rotated' | 'revoked';
  activatedAt: Date;
  rotatedAt: Date | null;
}

const encryptionKeySchema = new Schema<IEncryptionKey>({
  keyId: { type: String, required: true, unique: true },
  encryptedKey: { type: String, required: true },
  algorithm: { type: String, default: 'aes-256-gcm' },
  status: {
    type: String,
    enum: ['active', 'rotated', 'revoked'],
    default: 'active',
  },
  activatedAt: { type: Date, default: Date.now },
  rotatedAt: { type: Date, default: null },
});

export const EncryptionKey = mongoose.model<IEncryptionKey>('EncryptionKey', encryptionKeySchema);
