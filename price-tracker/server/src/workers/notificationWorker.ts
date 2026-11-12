import { Worker, type Job } from 'bullmq';
import { logger } from '../config/logger';
import { createQueueConnection } from '../config/redis';
import { QUEUE_NAMES, type NotificationJobData } from '../queues';
import { deliverAlert } from '../services/alertDelivery.service';

/**
 * Delivery worker.
 *
 * Separate from the price worker on purpose: a Twilio outage must not fail a
 * price check that already succeeded, and delivery retries have their own
 * schedule. The work itself lives in `deliverAlert`; when it throws, BullMQ
 * retries, and only the destinations that failed are messaged again.
 */
export function createNotificationWorker(): Worker<NotificationJobData> {
  const worker = new Worker<NotificationJobData>(
    QUEUE_NAMES.notification,
    async (job: Job<NotificationJobData>) => deliverAlert(job.data.alertId),
    {
      connection: createQueueConnection('notification-worker'),
      concurrency: 5,
    },
  );

  worker.on('failed', (job, err) => {
    logger.error({ jobId: job?.id, alertId: job?.data?.alertId, err }, 'notification job failed');
  });

  worker.on('error', (err) => logger.error({ err }, 'notification worker error'));

  return worker;
}
