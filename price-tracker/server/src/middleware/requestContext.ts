import { randomUUID } from 'node:crypto';
import type { NextFunction, Request, Response } from 'express';
import pinoHttp from 'pino-http';
import { logger } from '../config/logger';

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      id: string;
      auth?: { userId: string; role: 'user' | 'admin'; tokenVersion: number };
    }
  }
}

export function requestId(req: Request, res: Response, next: NextFunction): void {
  const incoming = req.headers['x-request-id'];
  const id = typeof incoming === 'string' && incoming.length <= 64 ? incoming : randomUUID();
  req.id = id;
  res.setHeader('x-request-id', id);
  next();
}

export const httpLogger = pinoHttp({
  logger,
  genReqId: (req) => (req as Request).id,
  customLogLevel(_req, res, err) {
    if (err || res.statusCode >= 500) return 'error';
    if (res.statusCode >= 400) return 'warn';
    return 'info';
  },
  customProps(req) {
    return { userId: (req as Request).auth?.userId };
  },
  // Only method, url and status are serialised — no headers, no bodies.
  serializers: {
    req(req) {
      return { id: req.id, method: req.method, url: req.url };
    },
    res(res) {
      return { statusCode: res.statusCode };
    },
  },
});
