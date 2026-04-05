import { User } from '../../models/user.model';
import { Order } from '../../models/order.model';
import { Payment } from '../../models/payment.model';
import { Invoice } from '../../models/invoice.model';
import { WalletTransaction } from '../../models/wallet-transaction.model';
import { NotFoundError } from '../../lib/errors';
import logger from '../../lib/logger';

const USER_PURGE_DAYS = 30;
const FINANCIAL_RETENTION_DAYS = 2555; // ~7 years for regulatory compliance

export async function requestAccountDeletion(userId: string) {
  const user = await User.findById(userId);
  if (!user) throw new NotFoundError('User not found');

  user.isActive = false;
  user.deletedAt = new Date();
  user.pendingPurge = true;
  user.profile.firstName = '[REDACTED]';
  user.profile.lastName = '[REDACTED]';
  user.profile.phone = '';
  user.profile.driversLicense = '';
  user.profile.driversLicenseEncrypted = null as any;
  user.profile.ssn = '';
  user.profile.ssnEncrypted = null as any;

  await user.save();

  logger.info({ userId }, 'Account deletion requested - PII removed, 30-day retention hold');

  return {
    status: 'deletion_requested',
    retentionUntil: new Date(Date.now() + USER_PURGE_DAYS * 24 * 60 * 60 * 1000),
    financialRecordsRetainedUntil: new Date(Date.now() + FINANCIAL_RETENTION_DAYS * 24 * 60 * 60 * 1000),
  };
}

export async function purgeExpiredAccounts() {
  const thirtyDaysAgo = new Date(Date.now() - USER_PURGE_DAYS * 24 * 60 * 60 * 1000);

  const usersToPurge = await User.find({
    pendingPurge: true,
    deletedAt: { $lte: thirtyDaysAgo },
  });

  let purgedCount = 0;

  for (const user of usersToPurge) {
    const hasActiveFinancialRecords = await hasRetainedFinancialRecords(user._id.toString());

    if (hasActiveFinancialRecords) {
      // Anonymize the user record but preserve financial references
      await anonymizeForFinancialRetention(user._id.toString());
      logger.info(
        { userId: user._id },
        'User anonymized but retained for financial record compliance'
      );
    } else {
      await User.findByIdAndDelete(user._id);
      purgedCount++;
    }
  }

  if (purgedCount > 0) {
    logger.info({ count: purgedCount }, 'Expired accounts purged');
  }

  return purgedCount;
}

async function hasRetainedFinancialRecords(userId: string): Promise<boolean> {
  const retentionCutoff = new Date(Date.now() - FINANCIAL_RETENTION_DAYS * 24 * 60 * 60 * 1000);

  const [orderCount, paymentCount] = await Promise.all([
    Order.countDocuments({
      buyerId: userId,
      createdAt: { $gt: retentionCutoff },
    }),
    Payment.countDocuments({
      'metadata.userId': userId,
      createdAt: { $gt: retentionCutoff },
    }),
  ]);

  return orderCount > 0 || paymentCount > 0;
}

async function anonymizeForFinancialRetention(userId: string) {
  // Keep the user record but ensure all PII is scrubbed
  // Financial records (orders, invoices, payments, wallet transactions)
  // retain their references to this userId for audit/compliance purposes
  await User.findByIdAndUpdate(userId, {
    email: `deleted-${userId}@redacted.local`,
    refreshToken: null,
    'profile.firstName': '[DELETED]',
    'profile.lastName': '[DELETED]',
    'profile.phone': '',
    'profile.driversLicense': '',
    'profile.driversLicenseEncrypted': null,
    'profile.ssn': '',
    'profile.ssnEncrypted': null,
  });

  logger.info({ userId }, 'User anonymized for financial retention compliance');
}

export async function purgeExpiredFinancialRecords() {
  const retentionCutoff = new Date(Date.now() - FINANCIAL_RETENTION_DAYS * 24 * 60 * 60 * 1000);

  // Only purge financial records older than the retention period
  // for users who have already been marked for deletion
  const deletedUsers = await User.find({
    pendingPurge: true,
    email: { $regex: /^deleted-.*@redacted\.local$/ },
  });

  let purgedCount = 0;

  for (const user of deletedUsers) {
    const userId = user._id.toString();

    const remainingFinancials = await Order.countDocuments({
      buyerId: userId,
      createdAt: { $gt: retentionCutoff },
    });

    if (remainingFinancials === 0) {
      // All financial records are past retention - safe to fully purge
      await Promise.all([
        WalletTransaction.deleteMany({
          accountId: `buyer:${userId}`,
          createdAt: { $lte: retentionCutoff },
        }),
        User.findByIdAndDelete(userId),
      ]);
      purgedCount++;
      logger.info({ userId }, 'Fully purged user after financial retention period');
    }
  }

  return purgedCount;
}
