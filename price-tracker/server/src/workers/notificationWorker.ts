import { Worker, type Job } from 'bullmq';
import { MARKETPLACE_LABEL, type NotificationChannel } from '../config/constants';
import { logger } from '../config/logger';
import { createQueueConnection } from '../config/redis';
import { Alert } from '../models/Alert';
import { Product } from '../models/Product';
import { User } from '../models/User';
import { QUEUE_NAMES, type NotificationJobData } from '../queues';
import { notificationService } from '../services/notification';

/**
 * Delivery worker.
 *
 * Separate from the price worker on purpose: a Twilio outage must not fail a
 * price check that already succeeded, and delivery retries have their own
 * schedule. Twilio itself is never referenced here — only the
 * `NotificationService` interface.
 */
export function createNotificationWorker(): Worker<NotificationJobData> {
  const worker = new Worker<NotificationJobData>(
    QUEUE_NAMES.notification,
    async (job: Job<NotificationJobData>) => {
      const alert = await Alert.findById(job.data.alertId);
      if (!alert) return { status: 'skipped', reason: 'alert no longer exists' };
      if (alert.status === 'sent') return { status: 'skipped', reason: 'already delivered' };

      const [user, product] = await Promise.all([
        User.findById(alert.userId).lean(),
        Product.findById(alert.productId).lean(),
      ]);

      if (!user || !product) {
        alert.status = 'skipped';
        alert.failureReason = 'User or product no longer exists';
        await alert.save();
        return { status: 'skipped' };
      }

      if (!user.phone || alert.channel === 'none') {
        alert.status = 'skipped';
        alert.failureReason = 'No delivery channel is configured for this account';
        await alert.save();
        return { status: 'skipped' };
      }

      const result = await notificationService().sendPriceAlert({
        to: user.phone,
        channel: alert.channel as Exclude<NotificationChannel, 'none'>,
        productTitle: product.nickname ?? product.title,
        marketplaceLabel: MARKETPLACE_LABEL[product.marketplace],
        currentPrice: alert.price,
        targetPrice: alert.targetPrice,
        currency: alert.currency,
        productUrl: product.productUrl,
        lowestPrice: product.lowestPrice,
      });

      alert.status = result.status;
      alert.providerMessageId = result.providerMessageId;
      alert.failureReason = result.failureReason;
      if (result.status === 'sent') alert.sentAt = new Date();
      await alert.save();

      if (result.status === 'failed') {
        // Throwing lets BullMQ apply its exponential retry policy.
        throw new Error(result.failureReason ?? 'Notification delivery failed');
      }

      return { status: result.status };
    },
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
