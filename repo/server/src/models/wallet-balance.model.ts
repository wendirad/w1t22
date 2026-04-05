import mongoose, { Schema, Document } from 'mongoose';

export interface IWalletBalance extends Document {
  accountId: string;
  dealershipId: mongoose.Types.ObjectId;
  balance: number;
  currency: string;
  updatedAt: Date;
}

const walletBalanceSchema = new Schema<IWalletBalance>(
  {
    accountId: { type: String, required: true, unique: true },
    dealershipId: { type: Schema.Types.ObjectId, ref: 'Dealership', required: true },
    balance: { type: Number, default: 0 },
    currency: { type: String, default: 'USD' },
  },
  { timestamps: true }
);

export const WalletBalance = mongoose.model<IWalletBalance>('WalletBalance', walletBalanceSchema);
