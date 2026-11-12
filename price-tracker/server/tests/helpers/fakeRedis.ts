/**
 * An in-memory stand-in for the Redis client used across the app.
 *
 * It supports exactly the commands this codebase issues (string get/set with
 * NX/PX/EX, counters, expiry and the three Lua scripts), which keeps the test
 * suite free of external services while still exercising the real lock, cache,
 * rate-limit and circuit-breaker code paths.
 */
interface Entry {
  value: string;
  expiresAt?: number;
}

export class FakeRedis {
  private store = new Map<string, Entry>();

  private live(key: string): Entry | undefined {
    const entry = this.store.get(key);
    if (!entry) return undefined;
    if (entry.expiresAt !== undefined && entry.expiresAt <= Date.now()) {
      this.store.delete(key);
      return undefined;
    }
    return entry;
  }

  async get(key: string): Promise<string | null> {
    return this.live(key)?.value ?? null;
  }

  async set(key: string, value: string, ...args: unknown[]): Promise<'OK' | null> {
    const tokens = args.map((a) => String(a).toUpperCase());
    const nx = tokens.includes('NX');
    if (nx && this.live(key)) return null;

    let expiresAt: number | undefined;
    const pxIndex = tokens.indexOf('PX');
    const exIndex = tokens.indexOf('EX');
    if (pxIndex >= 0) expiresAt = Date.now() + Number(args[pxIndex + 1]);
    else if (exIndex >= 0) expiresAt = Date.now() + Number(args[exIndex + 1]) * 1000;

    this.store.set(key, { value: String(value), expiresAt });
    return 'OK';
  }

  async del(...keys: string[]): Promise<number> {
    let removed = 0;
    for (const key of keys) if (this.store.delete(key)) removed += 1;
    return removed;
  }

  async incr(key: string): Promise<number> {
    const current = Number(this.live(key)?.value ?? 0) + 1;
    const existing = this.store.get(key);
    this.store.set(key, { value: String(current), expiresAt: existing?.expiresAt });
    return current;
  }

  async expire(key: string, seconds: number): Promise<number> {
    return this.pexpire(key, seconds * 1000);
  }

  async pexpire(key: string, ms: number): Promise<number> {
    const entry = this.live(key);
    if (!entry) return 0;
    entry.expiresAt = Date.now() + ms;
    return 1;
  }

  async pttl(key: string): Promise<number> {
    const entry = this.live(key);
    if (!entry) return -2;
    return entry.expiresAt === undefined ? -1 : Math.max(0, entry.expiresAt - Date.now());
  }

  async ping(): Promise<string> {
    return 'PONG';
  }

  async quit(): Promise<'OK'> {
    return 'OK';
  }

  async call(...args: string[]): Promise<unknown> {
    const [command, ...rest] = args;
    switch (command?.toLowerCase()) {
      case 'get':
        return this.get(rest[0]!);
      case 'incr':
        return this.incr(rest[0]!);
      default:
        return null;
    }
  }

  /** Recognises the three scripts in `src/utils/lock.ts` and the rate limiter. */
  async eval(script: string, _numKeys: number, ...args: string[]): Promise<unknown> {
    const [key, ...argv] = args;

    if (script.includes('redis.call("del", KEYS[1])')) {
      const current = await this.get(key!);
      if (current === argv[0]) {
        await this.del(key!);
        return 1;
      }
      return 0;
    }

    if (script.includes('local used = redis.call("INCR", key)')) {
      const limit = Number(argv[0]);
      const ttl = Number(argv[1]);
      const used = await this.incr(key!);
      if (used === 1) await this.pexpire(key!, ttl);
      return used > limit ? [0, await this.pttl(key!)] : [1, 0];
    }

    if (script.includes('local gap = tonumber(ARGV[2])')) {
      const now = Number(argv[0]);
      const gap = Number(argv[1]);
      const last = Number((await this.get(key!)) ?? 0);
      const earliest = last + gap;
      if (now >= earliest) {
        await this.set(key!, String(now), 'PX', gap * 4);
        return 0;
      }
      await this.set(key!, String(earliest), 'PX', gap * 4);
      return earliest - now;
    }

    return null;
  }

  reset(): void {
    this.store.clear();
  }
}

export const fakeRedis = new FakeRedis();
