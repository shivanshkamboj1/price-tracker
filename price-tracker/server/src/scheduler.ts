process.env.SERVICE_NAME ??= 'scheduler';

import './config/runtime';

import { connectDatabase, disconnectDatabase } from './config/db';
import { closeRedis } from './config/redis';
import { logger } from './config/logger';
import { closeQueues } from './queues';
import { startScheduler } from './scheduler/scheduler';

/**
 * Scheduler process.
 *
 * Deliberately a separate service from the worker: it must be a singleton (a
 * Redis lock enforces that even if two are running), while workers are scaled
 * out freely. It only decides which products are due.
 */
async function main(): Promise<void> {
  await connectDatabase();
  const stop = startScheduler();

  const shutdown = async (signal: string): Promise<void> => {
    logger.info({ signal }, 'scheduler shutting down');
    stop();
    await Promise.allSettled([closeQueues(), disconnectDatabase(), closeRedis()]);
    process.exit(0);
  };

  process.on('SIGTERM', () => void shutdown('SIGTERM'));
  process.on('SIGINT', () => void shutdown('SIGINT'));
  process.on('unhandledRejection', (reason) => {
    logger.error({ err: reason }, 'unhandled promise rejection');
  });
}

main().catch((err) => {
  logger.fatal({ err }, 'scheduler failed to start');
  process.exit(1);
});
