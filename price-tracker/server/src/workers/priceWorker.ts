import { Worker, type Job } from 'bullmq';
import { env } from '../config/env';
import { logger } from '../config/logger';
import { createQueueConnection } from '../config/redis';
import { QUEUE_NAMES, type PriceCheckJobData } from '../queues';
import { runPriceCheck } from '../services/priceCheck.service';
import { logJobLifecycle } from './jobLogging';

/**
 * Price worker.
 *
 * It owns no marketplace knowledge and no alerting rules — it unwraps the job,
 * calls the price-check service and records the outcome. Everything specific to
 * Amazon or Flipkart lives behind the adapter interface, and notifications are
 * handed to their own queue.
 *
 * Scale it with `docker compose up --scale worker=3`; the Redis rate limiter and
 * the per-product lock keep additional replicas polite.
 */
export function createPriceWorker(): Worker<PriceCheckJobData> {
  const worker = new Worker<PriceCheckJobData>(
    QUEUE_NAMES.priceCheck,
    async (job: Job<PriceCheckJobData>) => {
      const { productId, trigger, bypassCache } = job.data;
      const outcome = await runPriceCheck(productId, {
        jobId: job.id ?? `${job.name}:${productId}`,
        trigger,
        bypassCache,
      });
      return outcome;
    },
    {
      connection: createQueueConnection('price-worker'),
      concurrency: env.WORKER_CONCURRENCY,
      // A coarse ceiling per replica; the cluster-wide budget in Redis is the
      // limit that actually protects the marketplace.
      limiter: { max: env.MARKETPLACE_RPM, duration: 60_000 },
    },
  );

  // A failed *check* is handled inside the service and completes the job with
  // `outcome.result: 'failed'`; a failed *job* means the machinery itself broke.
  logJobLifecycle(worker, ({ productId, userId, marketplace, trigger, bypassCache }) => ({
    productId,
    userId,
    marketplace,
    trigger,
    bypassCache,
  }));

  worker.on('error', (err) => logger.error({ err }, 'price worker error'));

  return worker;
}
