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
  session?: mongoose.ClientSession;
}) {
  const { debitKey } = deriveIdempotencyKeys(params.idempotencyKey);
  const existing = await WalletTransaction.findOne({ idempotencyKey: debitKey });
  if (existing) return existing;

  // When a caller provides an external session, all writes join that session's
  // transaction so that payment + ledger + invoice are atomic.  When no session
  // is provided (e.g. standalone refund), create a local one.
  const externalSession = params.session;
  const session = externalSession || await mongoose.startSession();

  try {
    let debitTx: any;
    let creditTx: any;

    const work = async () => {
      const { debitKey, creditKey } = deriveIdempotencyKeys(params.idempotencyKey);

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
            idempotencyKey: debitKey,
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
            idempotencyKey: creditKey,
          },
        ],
        { session }
      );
    };

    if (externalSession) {
      // External session: the caller owns the transaction — just run the work.
      await work();
    } else {
      // No external session: wrap in our own transaction.
      await session.withTransaction(work);
    }

    logger.info(
      { debitAccount: params.debitAccountId, creditAccount: params.creditAccountId, amount: params.amount },
      'Ledger transaction recorded'
    );

    return { debit: debitTx[0], credit: creditTx[0] };
  } finally {
    if (!externalSession) {
      await session.endSession();
    }
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
