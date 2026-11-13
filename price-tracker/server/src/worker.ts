process.env.SERVICE_NAME ??= 'worker';

import './config/runtime';

import { connectDatabase, disconnectDatabase } from './config/db';
import { closeRedis } from './config/redis';
import { env, whatsappEnabled } from './config/env';
import { logger } from './config/logger';
import { closeQueues } from './queues';
import { closeWhatsAppBridge } from './services/whatsapp/bridge';
import { startWhatsAppOwner } from './services/whatsapp/owner';
import { createNotificationWorker } from './workers/notificationWorker';
import { createPriceWorker } from './workers/priceWorker';

/**
 * Worker process. Runs the price-check and notification workers, and — in
 * exactly one worker at a time — the WhatsApp connection.
 *
 * It is stateless and horizontally scalable: run as many replicas as needed
 * without changing any code. Politeness towards marketplaces is enforced in
 * Redis, so replicas share one budget rather than multiplying it.
 */
async function main(): Promise<void> {
  await connectDatabase();

  const priceWorker = createPriceWorker();
  const notificationWorker = createNotificationWorker();
  const whatsappOwner = whatsappEnabled ? startWhatsAppOwner() : null;

  logger.info(
    { concurrency: env.WORKER_CONCURRENCY, marketplaceRpm: env.MARKETPLACE_RPM },
    'workers started',
  );

  const shutdown = async (signal: string): Promise<void> => {
    logger.info({ signal }, 'worker shutting down');
    // `close()` waits for in-flight jobs so a deploy never abandons a check.
    await Promise.allSettled([priceWorker.close(), notificationWorker.close()]);
    // Closes the WhatsApp connection without unlinking, so another worker can take it over.
    await whatsappOwner?.stop();
    await Promise.allSettled([closeWhatsAppBridge(), closeQueues()]);
    await Promise.allSettled([disconnectDatabase(), closeRedis()]);
    process.exit(0);
  };

  process.on('SIGTERM', () => void shutdown('SIGTERM'));
  process.on('SIGINT', () => void shutdown('SIGINT'));
  process.on('unhandledRejection', (reason) => {
    logger.error({ err: reason }, 'unhandled promise rejection');
  });
}

main().catch((err) => {
  logger.fatal({ err }, 'worker failed to start');
  process.exit(1);
});
