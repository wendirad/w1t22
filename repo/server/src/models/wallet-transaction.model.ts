import mongoose, { Schema, Document } from 'mongoose';

export interface IWalletTransaction extends Document {
  dealershipId: mongoose.Types.ObjectId;
  accountId: string;
  type: 'debit' | 'credit';
  amount: number;
  currency: string;
  referenceType: 'payment' | 'refund' | 'adjustment' | 'deposit';
  referenceId: mongoose.Types.ObjectId;
  balanceAfter: number;
  description: string;
  idempotencyKey: string;
  createdAt: Date;
}

const walletTransactionSchema = new Schema<IWalletTransaction>(
  {
    dealershipId: { type: Schema.Types.ObjectId, ref: 'Dealership', required: true },
    accountId: { type: String, required: true },
    type: { type: String, enum: ['debit', 'credit'], required: true },
    amount: { type: Number, required: true },
    currency: { type: String, default: 'USD' },
    referenceType: {
      type: String,
      enum: ['payment', 'refund', 'adjustment', 'deposit'],
      required: true,
    },
    referenceId: { type: Schema.Types.ObjectId, required: true },
    balanceAfter: { type: Number, required: true },
    description: { type: String, default: '' },
    idempotencyKey: { type: String, required: true },
  },
  { timestamps: true }
);

walletTransactionSchema.index({ accountId: 1, createdAt: -1 });
walletTransactionSchema.index({ idempotencyKey: 1 }, { unique: true });

export const WalletTransaction = mongoose.model<IWalletTransaction>(
  'WalletTransaction',
  walletTransactionSchema
);
