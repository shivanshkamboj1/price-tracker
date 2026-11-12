import IORedis, { type Redis } from 'ioredis';
import { env } from './env';
import { logger } from './logger';

const clients: Redis[] = [];

function build(name: string, extra: Record<string, unknown> = {}): Redis {
  const client = new IORedis(env.REDIS_URL, {
    // BullMQ requires this to be null; harmless for the shared client too.
    maxRetriesPerRequest: null,
    enableReadyCheck: true,
    connectionName: `price-tracker:${name}`,
    ...extra,
  });
  client.on('error', (err) => logger.error({ err, client: name }, 'redis error'));
  clients.push(client);
  return client;
}

let shared: Redis | undefined;

/** General purpose client: locks, caches, rate limiters, circuit breakers. */
export function redis(): Redis {
  if (!shared) shared = build('shared');
  return shared;
}

/** BullMQ wants a dedicated connection per queue and per worker. */
export function createQueueConnection(name: string): Redis {
  return build(name);
}

export async function closeRedis(): Promise<void> {
  await Promise.allSettled(clients.map((c) => c.quit()));
  clients.length = 0;
  shared = undefined;
}
