import cron from 'node-cron';
import { updateTrendingKeywords } from '../services/search/trending.service';
import { runReconciliation } from '../services/finance/reconciliation.service';
import { purgeExpiredAccounts } from '../services/privacy/account-deletion.service';
import logger from '../lib/logger';

export function startJobs(): void {
  cron.schedule('0 * * * *', async () => {
    try {
      await updateTrendingKeywords();
      logger.info('Trending keywords updated');
    } catch (error: any) {
      logger.error({ error: error.message }, 'Failed to update trending keywords');
    }
  });

  cron.schedule('0 2 * * *', async () => {
    try {
      await runReconciliation();
      logger.info('Nightly reconciliation completed');
    } catch (error: any) {
      logger.error({ error: error.message }, 'Failed to run reconciliation');
    }
  });

  cron.schedule('0 3 * * *', async () => {
    try {
      const count = await purgeExpiredAccounts();
      logger.info({ count }, 'Expired accounts purge completed');
    } catch (error: any) {
      logger.error({ error: error.message }, 'Failed to purge expired accounts');
    }
  });

  logger.info('Scheduled jobs started');
}
