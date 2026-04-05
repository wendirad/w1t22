import mongoose, { Schema, Document } from 'mongoose';
import bcrypt from 'bcryptjs';
import { Role } from '../types/enums';

export interface IUser extends Document {
  email: string;
  passwordHash: string;
  role: Role;
  dealershipId: mongoose.Types.ObjectId | null;
  profile: {
    firstName: string;
    lastName: string;
    phone: string;
    driversLicense?: string;
    driversLicenseEncrypted?: Record<string, any> | null;
    ssn?: string;
    ssnEncrypted?: Record<string, any> | null;
  };
  isActive: boolean;
  deletedAt: Date | null;
  pendingPurge: boolean;
  consentVersion: string;
  refreshToken?: string;
  createdAt: Date;
  updatedAt: Date;
  comparePassword(password: string): Promise<boolean>;
}

const userSchema = new Schema<IUser>(
  {
    email: { type: String, required: true, lowercase: true, trim: true },
    passwordHash: { type: String, required: true },
    role: {
      type: String,
      enum: Object.values(Role),
      default: Role.BUYER,
    },
    dealershipId: { type: Schema.Types.ObjectId, ref: 'Dealership', default: null },
    profile: {
      firstName: { type: String, required: true },
      lastName: { type: String, required: true },
      phone: { type: String, default: '' },
      driversLicense: { type: String, default: '' },
      driversLicenseEncrypted: { type: Schema.Types.Mixed, default: null },
      ssn: { type: String, default: '' },
      ssnEncrypted: { type: Schema.Types.Mixed, default: null },
    },
    isActive: { type: Boolean, default: true },
    deletedAt: { type: Date, default: null },
    pendingPurge: { type: Boolean, default: false },
    consentVersion: { type: String, default: '1.0' },
    refreshToken: { type: String },
  },
  { timestamps: true }
);

userSchema.index({ email: 1, dealershipId: 1 }, { unique: true });
userSchema.index({ dealershipId: 1, role: 1 });

userSchema.pre('save', async function (next) {
  if (this.isModified('passwordHash') && !this.passwordHash.startsWith('$2')) {
    this.passwordHash = await bcrypt.hash(this.passwordHash, 12);
  }
  next();
});

userSchema.methods.comparePassword = async function (password: string): Promise<boolean> {
  return bcrypt.compare(password, this.passwordHash);
};

userSchema.set('toJSON', {
  transform(_doc: any, ret: any) {
    delete ret.passwordHash;
    delete ret.refreshToken;
    delete ret.__v;
    return ret;
  },
});

export const User = mongoose.model<IUser>('User', userSchema);
