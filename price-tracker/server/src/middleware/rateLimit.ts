import rateLimit, { type Options } from 'express-rate-limit';
import { RedisStore } from 'rate-limit-redis';
import type { Request } from 'express';
import { redis } from '../config/redis';
import { isTest } from '../config/env';
import { rateLimited } from '../utils/errors';

/**
 * Rate limits are stored in Redis so every API instance shares one budget.
 * Authenticated requests are keyed by user id; anonymous ones by IP.
 */
function store(prefix: string) {
  if (isTest) return undefined;
  return new RedisStore({
    prefix: `rl:api:${prefix}:`,
    sendCommand: (...args: string[]) => redis().call(...(args as [string, ...string[]])) as never,
  });
}

function keyGenerator(req: Request): string {
  return req.auth?.userId ?? req.ip ?? 'unknown';
}

function build(prefix: string, options: Partial<Options>) {
  return rateLimit({
    windowMs: 15 * 60 * 1000,
    standardHeaders: 'draft-7',
    legacyHeaders: false,
    keyGenerator,
    store: store(prefix),
    handler: (_req, _res, next) => next(rateLimited()),
    // Every test shares one loopback address, which would otherwise exhaust the
    // per-IP budgets within a single suite. The middleware still runs.
    skip: () => isTest,
    ...options,
  });
}

/** Broad ceiling for the whole API surface. */
export const globalLimiter = build('global', { windowMs: 60_000, limit: 300 });

/** Credential endpoints: deliberately tight, keyed by IP even when authenticated. */
export const authLimiter = build('auth', {
  windowMs: 15 * 60 * 1000,
  limit: 10,
  keyGenerator: (req: Request) => req.ip ?? 'unknown',
  skipSuccessfulRequests: false,
});

/** Writes: adding and editing products. */
export const writeLimiter = build('write', { windowMs: 60_000, limit: 60 });

/** Manual "check now" — the only endpoint that can generate upstream traffic. */
export const manualCheckLimiter = build('manual-check', {
  windowMs: 60 * 60 * 1000,
  limit: 20,
});
