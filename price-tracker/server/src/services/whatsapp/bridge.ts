import { QueueEvents } from 'bullmq';
import { createQueueConnection } from '../../config/redis';
import { logger } from '../../config/logger';
import { QUEUE_NAMES, whatsappQueue } from '../../queues';
import {
  readLiveState,
  type CommandFailure,
  type CommandOf,
  type CommandResults,
  type WhatsAppCommandType,
} from './protocol';

/**
 * How any process asks the WhatsApp-holding worker to do something and waits
 * for the answer. Failures come back as results, never as exceptions.
 */
export interface WhatsAppBridge {
  run<K extends WhatsAppCommandType>(
    command: CommandOf<K>,
    timeoutMs?: number,
  ): Promise<CommandResults[K]>;
  close(): Promise<void>;
}

export const WORKER_OFFLINE =
  'The worker process that holds the WhatsApp connection is not running. Start it (npm run dev:worker) and try again.';

const offline = (): CommandFailure => ({ ok: false, error: WORKER_OFFLINE, retryable: true });

/** Runs commands through the `whatsapp` BullMQ queue. */
class QueueBridge implements WhatsAppBridge {
  private events: QueueEvents | undefined;
  private ready: Promise<QueueEvents> | undefined;

  private queueEvents(): Promise<QueueEvents> {
    this.ready ??= (async () => {
      const events = new QueueEvents(QUEUE_NAMES.whatsapp, {
        connection: createQueueConnection('whatsapp-events'),
      });
      await events.waitUntilReady();
      this.events = events;
      return events;
    })();
    return this.ready;
  }

  async run<K extends WhatsAppCommandType>(
    command: CommandOf<K>,
    timeoutMs = 20_000,
  ): Promise<CommandResults[K]> {
    // No live state means nobody would pick the job up: fail now, not after the timeout.
    if (!(await readLiveState())) return offline() as CommandResults[K];

    const events = await this.queueEvents();
    const job = await whatsappQueue().add(
      command.type,
      { command, deadline: Date.now() + timeoutMs },
      {
        attempts: 1,
        // Jobs carry message text and numbers: keep them only as long as the reply needs.
        removeOnComplete: { age: 300 },
        removeOnFail: { age: 3600 },
      },
    );

    try {
      return (await job.waitUntilFinished(events, timeoutMs)) as CommandResults[K];
    } catch (err) {
      // Not picked up in time: withdraw it so it cannot run later and double-send.
      await job.remove().catch(() => undefined);
      const message = err instanceof Error ? err.message : String(err);
      logger.warn({ command: command.type, reason: message }, 'whatsapp command did not complete');
      return {
        ok: false,
        error: /timed out/i.test(message)
          ? 'WhatsApp did not answer in time. Try again in a moment.'
          : message.slice(0, 300),
        retryable: true,
      } as CommandResults[K];
    }
  }

  async close(): Promise<void> {
    const events = this.events;
    this.events = undefined;
    this.ready = undefined;
    await events?.close();
  }
}

let instance: WhatsAppBridge | undefined;

export function whatsappBridge(): WhatsAppBridge {
  instance ??= new QueueBridge();
  return instance;
}

export async function closeWhatsAppBridge(): Promise<void> {
  await instance?.close();
}

/** Test seam. */
export function setWhatsAppBridge(bridge: WhatsAppBridge | undefined): void {
  instance = bridge;
}
