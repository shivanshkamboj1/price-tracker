import { env } from '../config/env';
import { logger } from '../config/logger';
import { Product, type IProduct } from '../models/Product';
import { enqueuePriceCheck } from '../queues';
import { lockKeys, withLock } from '../utils/lock';
import { minutesFromNow } from '../utils/time';

export interface TickResult {
  scanned: number;
  enqueued: number;
  skipped: boolean;
}

/**
 * One scheduler pass.
 *
 * Finds active products whose `nextCheckAt` has arrived and enqueues a job for
 * each. It does not check prices itself and it does not know what a marketplace
 * is — it only decides *when* work should happen.
 *
 * Two safeguards against duplicate work:
 *   1. a Redis lock, so only one scheduler instance runs a tick at a time
 *   2. `nextCheckAt` is pushed forward as the product is claimed, so a job is
 *      not re-enqueued while it waits in the queue
 *
 * The worker sets the real `nextCheckAt` when the check finishes.
 */
export async function runSchedulerTick(): Promise<TickResult> {
  const result = await withLock(lockKeys.schedulerTick(), env.SCHEDULER_TICK_MS * 2, async () => {
    const now = new Date();
    const due = await Product.find({
      status: 'active',
      deletedAt: { $exists: false },
      nextCheckAt: { $lte: now },
    })
      .sort({ nextCheckAt: 1 })
      .limit(env.SCHEDULER_BATCH_SIZE)
      .select('_id userId marketplace checkInterval')
      .lean<Array<Pick<IProduct, '_id' | 'userId' | 'marketplace' | 'checkInterval'>>>();

    let enqueued = 0;

    for (const product of due) {
      const productId = product._id.toString();

      // Claim the product first. If enqueueing fails we would rather check late
      // than enqueue the same product on every tick.
      const claimed = await Product.updateOne(
        { _id: product._id, nextCheckAt: { $lte: now }, status: 'active' },
        { $set: { nextCheckAt: minutesFromNow(Math.min(product.checkInterval, 15), now) } },
      );
      if (claimed.modifiedCount === 0) continue;

      try {
        await enqueuePriceCheck({
          productId,
          userId: product.userId.toString(),
          marketplace: product.marketplace,
          trigger: 'scheduled',
        });
        enqueued += 1;
      } catch (err) {
        logger.error({ err, productId }, 'failed to enqueue price check');
      }
    }

    if (enqueued > 0) {
      logger.info({ scanned: due.length, enqueued }, 'scheduler tick enqueued price checks');
    }

    return { scanned: due.length, enqueued, skipped: false };
  });

  return result ?? { scanned: 0, enqueued: 0, skipped: true };
}

/** Starts the periodic loop. Returns a stop function. */
export function startScheduler(): () => void {
  let stopped = false;

  const loop = async (): Promise<void> => {
    while (!stopped) {
      try {
        await runSchedulerTick();
      } catch (err) {
        logger.error({ err }, 'scheduler tick failed');
      }
      await new Promise((resolve) => setTimeout(resolve, env.SCHEDULER_TICK_MS));
    }
  };

  void loop();
  logger.info({ tickMs: env.SCHEDULER_TICK_MS }, 'scheduler started');

  return () => {
    stopped = true;
  };
}
