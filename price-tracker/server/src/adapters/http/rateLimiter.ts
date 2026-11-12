import { redis } from '../../config/redis';
import { env } from '../../config/env';
import { jitterMs, sleep } from '../../utils/time';
import { AdapterError } from '../../utils/errors';

/**
 * Cluster-wide politeness controls, enforced in Redis so that scaling workers
 * horizontally does not multiply the load we place on a marketplace.
 *
 * Two independent limits:
 *   1. a fixed-window request budget per marketplace per minute
 *   2. a minimum gap between consecutive requests to the same marketplace
 *
 * Callers also add random jitter so the traffic pattern never looks like a
 * metronome.
 */

const BUDGET_SCRIPT = `
local key = KEYS[1]
local limit = tonumber(ARGV[1])
local ttl = tonumber(ARGV[2])
local used = redis.call("INCR", key)
if used == 1 then
  redis.call("PEXPIRE", key, ttl)
end
if used > limit then
  return {0, redis.call("PTTL", key)}
end
return {1, 0}
`;

const GAP_SCRIPT = `
local key = KEYS[1]
local now = tonumber(ARGV[1])
local gap = tonumber(ARGV[2])
local last = tonumber(redis.call("GET", key) or "0")
local earliest = last + gap
if now >= earliest then
  redis.call("SET", key, now, "PX", gap * 4)
  return 0
end
redis.call("SET", key, earliest, "PX", gap * 4)
return earliest - now
`;

export interface RateLimitOptions {
  requestsPerMinute?: number;
  minGapMs?: number;
  jitterSpreadMs?: number;
  /** How long the caller is willing to wait for a slot before giving up. */
  maxWaitMs?: number;
}

export class MarketplaceRateLimiter {
  constructor(
    private readonly marketplace: string,
    private readonly options: RateLimitOptions = {},
  ) {}

  private get rpm(): number {
    return this.options.requestsPerMinute ?? env.MARKETPLACE_RPM;
  }

  private get minGap(): number {
    return this.options.minGapMs ?? env.MARKETPLACE_MIN_GAP_MS;
  }

  private get jitterSpread(): number {
    return this.options.jitterSpreadMs ?? env.MARKETPLACE_JITTER_MS;
  }

  /**
   * Blocks until it is polite to send the next request.
   * Throws a retryable AdapterError when the wait would exceed `maxWaitMs`.
   */
  async acquire(): Promise<void> {
    const client = redis();
    const maxWait = this.options.maxWaitMs ?? 30_000;

    const budgetKey = `rl:budget:${this.marketplace}:${Math.floor(Date.now() / 60_000)}`;
    const [allowed, retryInMs] = (await client.eval(
      BUDGET_SCRIPT,
      1,
      budgetKey,
      String(this.rpm),
      String(70_000),
    )) as [number, number];

    if (allowed !== 1) {
      throw new AdapterError(
        'temporary_error',
        `Rate budget for ${this.marketplace} exhausted; retry in ${Math.ceil(retryInMs / 1000)}s`,
        { retryable: true },
      );
    }

    if (this.minGap > 0) {
      const waitMs = (await client.eval(
        GAP_SCRIPT,
        1,
        `rl:gap:${this.marketplace}`,
        String(Date.now()),
        String(this.minGap),
      )) as number;

      if (waitMs > maxWait) {
        throw new AdapterError(
          'temporary_error',
          `Queue for ${this.marketplace} is busy; retry later`,
          { retryable: true },
        );
      }
      if (waitMs > 0) await sleep(waitMs);
    }

    const jitter = Math.abs(jitterMs(this.jitterSpread));
    if (jitter > 0) await sleep(jitter);
  }
}
