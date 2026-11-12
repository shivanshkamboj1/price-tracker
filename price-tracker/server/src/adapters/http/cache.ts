import { redis } from '../../config/redis';
import { env } from '../../config/env';
import { logger } from '../../config/logger';
import { sha256 } from '../../utils/crypto';

/**
 * Short-lived response cache. Two users tracking the same product, or a manual
 * check moments after a scheduled one, must not turn into two upstream requests.
 */
const PREFIX = 'cache:product:';

export function cacheKey(marketplace: string, externalProductId: string): string {
  return `${PREFIX}${marketplace}:${sha256(externalProductId).slice(0, 24)}`;
}

export async function readCache<T>(key: string): Promise<T | null> {
  try {
    const raw = await redis().get(key);
    if (!raw) return null;
    return JSON.parse(raw) as T;
  } catch (err) {
    logger.debug({ err, key }, 'cache read failed');
    return null;
  }
}

export async function writeCache(
  key: string,
  value: unknown,
  ttlSec = env.PRODUCT_CACHE_TTL_SEC,
): Promise<void> {
  if (ttlSec <= 0) return;
  try {
    await redis().set(key, JSON.stringify(value), 'EX', ttlSec);
  } catch (err) {
    logger.debug({ err, key }, 'cache write failed');
  }
}

export async function invalidateCache(key: string): Promise<void> {
  try {
    await redis().del(key);
  } catch {
    /* cache misses are harmless */
  }
}
