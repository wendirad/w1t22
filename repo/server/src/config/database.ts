import mongoose from 'mongoose';
import config from './index';
import logger from '../lib/logger';

export async function connectDatabase(): Promise<void> {
  try {
    await mongoose.connect(config.mongodbUri);
    logger.info('Connected to MongoDB');

    // Drop the old compound (email, dealershipId) unique index if it exists.
    // Email is now globally unique; the old index allowed cross-tenant duplicates
    // that broke login determinism. Mongoose will create the new email-only index
    // via ensureIndexes, but the old one must be removed first to avoid conflicts.
    try {
      const db = mongoose.connection.db;
      if (db) {
        const usersCollection = db.collection('users');
        const indexes = await usersCollection.indexes();
        const oldIndex = indexes.find((idx: any) =>
          idx.key && idx.key.email === 1 && idx.key.dealershipId === 1 && idx.unique
        );
        if (oldIndex) {
          await usersCollection.dropIndex(oldIndex.name!);
          logger.info('Dropped legacy (email, dealershipId) compound unique index');
        }
      }
    } catch (indexErr: any) {
      // Non-fatal: index may not exist on fresh databases
      if (!indexErr.message?.includes('index not found')) {
        logger.warn({ error: indexErr.message }, 'Could not drop legacy email index');
      }
    }
  } catch (error) {
    logger.error({ error }, 'Failed to connect to MongoDB');
    process.exit(1);
  }
}

export async function disconnectDatabase(): Promise<void> {
  await mongoose.disconnect();
  logger.info('Disconnected from MongoDB');
}
