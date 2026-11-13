import { randomUUID } from 'node:crypto';
import { redis } from '../config/redis';

/**
 * Minimal Redis lock: SET key token NX PX ttl, released with a compare-and-delete
 * script so a slow holder can never release someone else's lock.
 *
 * It guarantees "no two workers check the same product at the same time" which is
 * all the price pipeline needs — every write is also idempotent on its own.
 */
const RELEASE_SCRIPT = `
if redis.call("get", KEYS[1]) == ARGV[1] then
  return redis.call("del", KEYS[1])
else
  return 0
end`;

const EXTEND_SCRIPT = `
if redis.call("get", KEYS[1]) == ARGV[1] then
  return redis.call("pexpire", KEYS[1], ARGV[2])
else
  return 0
end`;

export interface Lock {
  key: string;
  token: string;
  release(): Promise<boolean>;
  /** Pushes the expiry out by `ttlMs`. False when the lock has already been lost. */
  extend(ttlMs: number): Promise<boolean>;
}

export async function acquireLock(key: string, ttlMs: number): Promise<Lock | null> {
  const token = randomUUID();
  const client = redis();
  const result = await client.set(key, token, 'PX', ttlMs, 'NX');
  if (result !== 'OK') return null;

  return {
    key,
    token,
    async release() {
      const released = await client.eval(RELEASE_SCRIPT, 1, key, token);
      return released === 1;
    },
    async extend(ms: number) {
      const extended = await client.eval(EXTEND_SCRIPT, 1, key, token, ms);
      return extended === 1;
    },
  };
}

/** Runs `fn` under a lock. Returns `undefined` when the lock was already held. */
export async function withLock<T>(
  key: string,
  ttlMs: number,
  fn: () => Promise<T>,
): Promise<T | undefined> {
  const lock = await acquireLock(key, ttlMs);
  if (!lock) return undefined;
  try {
    return await fn();
  } finally {
    await lock.release().catch(() => undefined);
  }
}

export const lockKeys = {
  productCheck: (productId: string) => `lock:product-check:${productId}`,
  schedulerTick: () => 'lock:scheduler:tick',
  whatsappOwner: () => 'lock:whatsapp:owner',
};
