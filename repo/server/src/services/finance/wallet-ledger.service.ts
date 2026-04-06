import mongoose from 'mongoose';
import { WalletTransaction } from '../../models/wallet-transaction.model';
import { WalletBalance } from '../../models/wallet-balance.model';
import { ConflictError } from '../../lib/errors';
import logger from '../../lib/logger';

export async function getBalance(accountId: string) {
  const balance = await WalletBalance.findOne({ accountId });
  return balance?.balance || 0;
}

export async function recordTransaction(params: {
  dealershipId: string;
  debitAccountId: string;
  creditAccountId: string;
  amount: number;
  referenceType: 'payment' | 'refund' | 'adjustment' | 'deposit';
  referenceId: string;
  description: string;
  idempotencyKey: string;
}) {
  const existing = await WalletTransaction.findOne({
    idempotencyKey: `${params.idempotencyKey}-debit`,
  });
  if (existing) return existing;

  const session = await mongoose.startSession();

  try {
    let debitTx: any;
    let creditTx: any;

    await session.withTransaction(async () => {
      const debitBalance = await WalletBalance.findOneAndUpdate(
        { accountId: params.debitAccountId },
        {
          $inc: { balance: -params.amount },
          $setOnInsert: {
            dealershipId: params.dealershipId,
            currency: 'USD',
          },
        },
        { new: true, upsert: true, session }
      );

      debitTx = await WalletTransaction.create(
        [
          {
            dealershipId: params.dealershipId,
            accountId: params.debitAccountId,
            type: 'debit',
            amount: params.amount,
            referenceType: params.referenceType,
            referenceId: params.referenceId,
            balanceAfter: debitBalance!.balance,
            description: params.description,
            idempotencyKey: `${params.idempotencyKey}-debit`,
          },
        ],
        { session }
      );

      const creditBalance = await WalletBalance.findOneAndUpdate(
        { accountId: params.creditAccountId },
        {
          $inc: { balance: params.amount },
          $setOnInsert: {
            dealershipId: params.dealershipId,
            currency: 'USD',
          },
        },
        { new: true, upsert: true, session }
      );

      creditTx = await WalletTransaction.create(
        [
          {
            dealershipId: params.dealershipId,
            accountId: params.creditAccountId,
            type: 'credit',
            amount: params.amount,
            referenceType: params.referenceType,
            referenceId: params.referenceId,
            balanceAfter: creditBalance!.balance,
            description: params.description,
            idempotencyKey: `${params.idempotencyKey}-credit`,
          },
        ],
        { session }
      );
    });

    logger.info(
      { debitAccount: params.debitAccountId, creditAccount: params.creditAccountId, amount: params.amount },
      'Ledger transaction recorded'
    );

    return { debit: debitTx[0], credit: creditTx[0] };
  } finally {
    await session.endSession();
  }
}

/**
 * Pure idempotency key derivation — exported so unit tests can verify the
 * exact format without a database. The production recordTransaction uses these
 * keys for debit and credit entries respectively.
 */
export function deriveIdempotencyKeys(baseKey: string): { debitKey: string; creditKey: string } {
  return {
    debitKey: `${baseKey}-debit`,
    creditKey: `${baseKey}-credit`,
  };
}

/**
 * Pure accounting equation check — exported for unit tests.
 * Given a series of transactions, verifies that total debits equal total credits.
 */
export function verifyAccountingEquation(
  transactions: Array<{ type: 'debit' | 'credit'; amount: number }>
): { balanced: boolean; totalDebits: number; totalCredits: number } {
  const totalDebits = transactions.filter((t) => t.type === 'debit').reduce((s, t) => s + t.amount, 0);
  const totalCredits = transactions.filter((t) => t.type === 'credit').reduce((s, t) => s + t.amount, 0);
  return { balanced: totalDebits === totalCredits, totalDebits, totalCredits };
}

export async function getTransactionHistory(
  accountId: string,
  limit: number = 50
) {
  return WalletTransaction.find({ accountId })
    .sort({ createdAt: -1 })
    .limit(limit);
}
