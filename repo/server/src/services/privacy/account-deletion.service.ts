import { User } from '../../models/user.model';
import { NotFoundError } from '../../lib/errors';
import logger from '../../lib/logger';

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
  user.profile.ssn = '';

  await user.save();

  logger.info({ userId }, 'Account deletion requested - PII removed, 30-day retention hold');

  return {
    status: 'deletion_requested',
    retentionUntil: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
  };
}

export async function purgeExpiredAccounts() {
  const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);

  const result = await User.deleteMany({
    pendingPurge: true,
    deletedAt: { $lte: thirtyDaysAgo },
  });

  if (result.deletedCount > 0) {
    logger.info({ count: result.deletedCount }, 'Expired accounts purged');
  }

  return result.deletedCount;
}
