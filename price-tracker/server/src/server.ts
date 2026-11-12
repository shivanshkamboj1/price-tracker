process.env.SERVICE_NAME ??= 'api';

import './config/runtime';

import { createApp } from './app';
import { connectDatabase, disconnectDatabase } from './config/db';
import { closeRedis } from './config/redis';
import { env } from './config/env';
import { logger } from './config/logger';
import { closeQueues } from './queues';

/**
 * API process.
 *
 * Responsibilities: authentication, CRUD, dashboard queries and enqueueing work.
 * It never performs a price check and never contacts a marketplace — that is the
 * worker's job, and keeping the boundary strict is what lets the two scale
 * independently.
 */
async function main(): Promise<void> {
  await connectDatabase();

  const app = createApp();
  const server = app.listen(env.PORT, () => {
    logger.info({ port: env.PORT, env: env.NODE_ENV }, 'api listening');
  });

  const shutdown = async (signal: string): Promise<void> => {
    logger.info({ signal }, 'api shutting down');
    server.close();
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
  logger.fatal({ err }, 'api failed to start');
  process.exit(1);
});
