import type { NextFunction, Request, Response } from 'express';

const FORBIDDEN_KEY = /^\$|\./;

/**
 * Strips Mongo operator keys (`$gt`, `$where`, dotted paths) from request input.
 *
 * Zod already discards unknown keys on every validated route; this runs first as
 * defence in depth and covers anything reaching Mongo through another path.
 * Implemented in place rather than via `express-mongo-sanitize`, which mutates
 * the read-only `req.query` getter on newer Express versions.
 */
function scrub(value: unknown, depth = 0): unknown {
  if (depth > 12 || value === null || typeof value !== 'object') return value;

  if (Array.isArray(value)) {
    return value.map((item) => scrub(item, depth + 1));
  }

  const source = value as Record<string, unknown>;
  const cleaned: Record<string, unknown> = {};
  for (const [key, val] of Object.entries(source)) {
    if (FORBIDDEN_KEY.test(key)) continue;
    cleaned[key] = scrub(val, depth + 1);
  }
  return cleaned;
}

export function sanitizeInput(req: Request, _res: Response, next: NextFunction): void {
  if (req.body && typeof req.body === 'object') {
    req.body = scrub(req.body) as Record<string, unknown>;
  }
  if (req.query && typeof req.query === 'object' && Object.keys(req.query).length > 0) {
    Object.defineProperty(req, 'query', {
      value: scrub(req.query),
      configurable: true,
      writable: true,
    });
  }
  if (req.params && typeof req.params === 'object') {
    req.params = scrub(req.params) as Record<string, string>;
  }
  next();
}
