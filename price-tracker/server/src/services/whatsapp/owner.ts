import { Worker } from 'bullmq';
import { createQueueConnection } from '../../config/redis';
import { logger } from '../../config/logger';
import { QUEUE_NAMES, type WhatsAppJobData } from '../../queues';
import { acquireLock, lockKeys, type Lock } from '../../utils/lock';
import { WhatsAppClient } from './client';
import { clearLiveState } from './protocol';

const LOCK_TTL_MS = 30_000;
/** Lock renewal and live-state refresh; well inside both expiries. */
const HEARTBEAT_MS = 10_000;

const log = logger.child({ module: 'whatsapp-owner' });

/**
 * Makes this worker the WhatsApp owner whenever no other worker is.
 *
 * Workers scale out freely, but a linked WhatsApp session tolerates only one
 * connection, so the workers elect one holder through a Redis lock. The holder
 * runs the connection and the `whatsapp` command queue; if it dies, the lock
 * expires and another worker takes over within a heartbeat or two.
 */
export function startWhatsAppOwner(): { stop(): Promise<void> } {
  let lock: Lock | null = null;
  let client: WhatsAppClient | null = null;
  let worker: Worker<WhatsAppJobData> | null = null;
  let stopped = false;
  let busy = false;

  const becomeOwner = async (): Promise<void> => {
    const current = new WhatsAppClient();
    client = current;
    worker = new Worker<WhatsAppJobData>(
      QUEUE_NAMES.whatsapp,
      async (job) => {
        // The sender gave up waiting; running it now could send a message twice.
        if (Date.now() > job.data.deadline) {
          return { ok: false, error: 'Expired before it could run', retryable: true };
        }
        return current.execute(job.data.command);
      },
      { connection: createQueueConnection('whatsapp-worker'), concurrency: 4 },
    );
    worker.on('error', (err) => log.error({ err }, 'whatsapp command worker error'));
    await current.start();
  };

  /** `stillOwner` is false when the lock has already passed on: the state is no longer ours to clear. */
  const resign = async (stillOwner: boolean): Promise<void> => {
    const [oldWorker, oldClient, oldLock] = [worker, client, lock];
    worker = null;
    client = null;
    lock = null;
    await oldWorker?.close().catch(() => undefined);
    await oldClient?.stop().catch(() => undefined);
    if (oldLock && stillOwner) {
      await clearLiveState().catch(() => undefined);
      await oldLock.release().catch(() => undefined);
    }
  };

  const tick = async (): Promise<void> => {
    if (stopped || busy) return;
    busy = true;
    try {
      if (lock) {
        if (!(await lock.extend(LOCK_TTL_MS))) {
          log.warn('lost the whatsapp owner lock; closing the connection here');
          await resign(false);
          return;
        }
        await client?.publish();
      } else {
        lock = await acquireLock(lockKeys.whatsappOwner(), LOCK_TTL_MS);
        if (lock) {
          log.info('this worker now holds the whatsapp connection');
          await becomeOwner();
        }
      }
    } catch (err) {
      log.error({ err }, 'whatsapp owner heartbeat failed');
    } finally {
      busy = false;
    }
  };

  void tick();
  const timer = setInterval(() => void tick(), HEARTBEAT_MS);

  return {
    async stop() {
      stopped = true;
      clearInterval(timer);
      await resign(true);
    },
  };
}
