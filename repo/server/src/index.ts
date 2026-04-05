import app from './app';
import config from './config';
import { connectDatabase } from './config/database';
import { getRedisClient } from './config/redis';
import { runSeeds } from './seeds';
import { startJobs } from './jobs/runner';
import logger from './lib/logger';

async function bootstrap(): Promise<void> {
  await connectDatabase();
  getRedisClient();
  await runSeeds();
  startJobs();

  app.listen(config.port, '0.0.0.0', () => {
    logger.info({ port: config.port }, 'MotorLot DealerOps server running');
  });
}

bootstrap().catch((error) => {
  logger.error({ error }, 'Failed to start server');
  process.exit(1);
});
