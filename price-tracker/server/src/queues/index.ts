import { Queue, type JobsOptions } from 'bullmq';
import { createQueueConnection } from '../config/redis';
import type { Marketplace } from '../config/constants';

export const QUEUE_NAMES = {
  priceCheck: 'price-check',
  notification: 'notification',
} as const;

export interface PriceCheckJobData {
  productId: string;
  userId: string;
  marketplace: Marketplace;
  trigger: 'scheduled' | 'manual';
  /** Manual checks skip the response cache; scheduled ones may use it. */
  bypassCache?: boolean;
  enqueuedAt: string;
}

export interface NotificationJobData {
  alertId: string;
  userId: string;
  productId: string;
}

const queues = new Map<string, Queue>();

function getQueue<T>(name: string): Queue<T> {
  let queue = queues.get(name);
  if (!queue) {
    queue = new Queue(name, {
      connection: createQueueConnection(`queue-${name}`),
      defaultJobOptions: {
        removeOnComplete: { age: 24 * 3600, count: 5000 },
        removeOnFail: { age: 7 * 24 * 3600, count: 5000 },
      },
    });
    queues.set(name, queue);
  }
  return queue as Queue<T>;
}

export const priceCheckQueue = (): Queue<PriceCheckJobData> =>
  getQueue<PriceCheckJobData>(QUEUE_NAMES.priceCheck);

export const notificationQueue = (): Queue<NotificationJobData> =>
  getQueue<NotificationJobData>(QUEUE_NAMES.notification);

/**
 * Enqueues a price check.
 *
 * The job id is derived from the product and a one-minute bucket, so a scheduler
 * tick that overlaps with a manual check (or two schedulers racing) results in a
 * single job rather than two upstream requests. BullMQ silently ignores a job
 * whose id already exists.
 *
 * Separators are `-`, not `:`: BullMQ builds its Redis keys as
 * `bull:<queue>:<jobId>` and rejects a custom id containing a colon.
 */
export async function enqueuePriceCheck(
  data: Omit<PriceCheckJobData, 'enqueuedAt'>,
  options: JobsOptions = {},
): Promise<string> {
  const bucket = Math.floor(Date.now() / 60_000);
  const jobId = `pc-${data.productId}-${data.trigger}-${bucket}`;

  await priceCheckQueue().add(
    'check',
    { ...data, enqueuedAt: new Date().toISOString() },
    {
      jobId,
      // Manual checks jump ahead of the scheduled backlog.
      priority: data.trigger === 'manual' ? 1 : 10,
      attempts: 1, // Retries are owned by the scheduler's backoff ladder, not BullMQ.
      ...options,
    },
  );

  return jobId;
}

export async function enqueueNotification(
  data: NotificationJobData,
  delayMs = 0,
): Promise<string> {
  const jobId = `notify-${data.alertId}`;
  await notificationQueue().add('deliver', data, {
    jobId,
    delay: delayMs,
    attempts: 3,
    backoff: { type: 'exponential', delay: 30_000 },
  });
  return jobId;
}

export async function closeQueues(): Promise<void> {
  await Promise.allSettled([...queues.values()].map((q) => q.close()));
  queues.clear();
}
