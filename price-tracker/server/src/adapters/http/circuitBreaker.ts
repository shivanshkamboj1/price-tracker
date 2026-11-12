import { redis } from '../../config/redis';
import { env } from '../../config/env';
import { logger } from '../../config/logger';
import { AdapterError } from '../../utils/errors';

export type CircuitState = 'closed' | 'open' | 'half_open';

/**
 * Redis-backed circuit breaker, shared by every worker.
 *
 * When a marketplace starts refusing or failing requests we stop asking. That
 * protects them from a retry storm and protects us from burning our rate budget
 * on requests that cannot succeed. After the cooldown a single probe is allowed
 * through (half-open); one success closes the circuit again.
 */
export class CircuitBreaker {
  private readonly failKey: string;
  private readonly openKey: string;
  private readonly probeKey: string;

  constructor(
    private readonly name: string,
    private readonly threshold: number = env.CIRCUIT_FAILURE_THRESHOLD,
    private readonly openMs: number = env.CIRCUIT_OPEN_MS,
  ) {
    this.failKey = `cb:fails:${name}`;
    this.openKey = `cb:open:${name}`;
    this.probeKey = `cb:probe:${name}`;
  }

  async state(): Promise<CircuitState> {
    const client = redis();
    const open = await client.get(this.openKey);
    if (!open) return 'closed';
    // A single probe token is handed out per cooldown window.
    const probe = await client.set(this.probeKey, '1', 'PX', this.openMs, 'NX');
    return probe === 'OK' ? 'half_open' : 'open';
  }

  /** Throws when the circuit is open; otherwise returns the state it let through. */
  async assertClosed(): Promise<CircuitState> {
    const state = await this.state();
    if (state === 'open') {
      const ttl = await redis().pttl(this.openKey);
      throw new AdapterError(
        'blocked',
        `${this.name} is temporarily unavailable (circuit open, ${Math.max(0, Math.ceil(ttl / 1000))}s remaining)`,
        { retryable: true },
      );
    }
    return state;
  }

  async recordSuccess(): Promise<void> {
    const client = redis();
    await client.del(this.failKey, this.openKey, this.probeKey);
  }

  async recordFailure(): Promise<void> {
    const client = redis();
    const fails = await client.incr(this.failKey);
    if (fails === 1) await client.pexpire(this.failKey, this.openMs);
    if (fails >= this.threshold) {
      await client.set(this.openKey, String(Date.now()), 'PX', this.openMs);
      logger.warn(
        { circuit: this.name, failures: fails, openForMs: this.openMs },
        'circuit breaker opened',
      );
    }
  }

  async snapshot(): Promise<{ name: string; state: CircuitState; failures: number }> {
    const client = redis();
    const [open, fails] = await Promise.all([client.get(this.openKey), client.get(this.failKey)]);
    return {
      name: this.name,
      state: open ? 'open' : 'closed',
      failures: Number(fails ?? 0),
    };
  }
}
