import express, { type Express } from 'express';
import cookieParser from 'cookie-parser';
import cors from 'cors';
import helmet from 'helmet';
import mongoose from 'mongoose';
import { corsOrigins, isProd } from './config/env';
import { errorHandler, notFoundHandler } from './middleware/errorHandler';
import { globalLimiter } from './middleware/rateLimit';
import { httpLogger, requestId } from './middleware/requestContext';
import { sanitizeInput } from './middleware/sanitize';
import { apiRouter } from './routes';
import { sendOk } from './utils/http';

export function createApp(): Express {
  const app = express();

  // Required for correct client IPs (and therefore rate limiting) behind a proxy.
  app.set('trust proxy', 1);
  app.disable('x-powered-by');

  app.use(requestId);
  app.use(httpLogger);

  app.use(
    helmet({
      // The API serves JSON only; a restrictive CSP protects error pages.
      contentSecurityPolicy: {
        directives: {
          defaultSrc: ["'none'"],
          frameAncestors: ["'none'"],
          baseUri: ["'none'"],
        },
      },
      crossOriginResourcePolicy: { policy: 'same-site' },
      referrerPolicy: { policy: 'no-referrer' },
      hsts: isProd ? { maxAge: 31_536_000, includeSubDomains: true, preload: true } : false,
    }),
  );

  app.use(
    cors({
      origin(origin, callback) {
        // Same-origin and server-to-server requests arrive without an Origin.
        if (!origin || corsOrigins.includes(origin)) {
          callback(null, true);
          return;
        }
        callback(new Error('Origin not allowed by CORS'));
      },
      credentials: true,
      methods: ['GET', 'POST', 'PATCH', 'DELETE', 'OPTIONS'],
      allowedHeaders: ['Content-Type', 'x-csrf-token', 'x-request-id'],
      exposedHeaders: ['x-request-id'],
      maxAge: 600,
    }),
  );

  app.use(express.json({ limit: '100kb' }));
  app.use(express.urlencoded({ extended: false, limit: '100kb' }));
  app.use(cookieParser());
  app.use(sanitizeInput);
  app.use(globalLimiter);

  // Liveness / readiness. Deliberately unauthenticated and free of internals.
  app.get('/healthz', (_req, res) => {
    const dbUp = mongoose.connection.readyState === 1;
    sendOk(res, { status: dbUp ? 'ok' : 'starting', uptime: Math.round(process.uptime()) });
  });

  app.use('/api', apiRouter);

  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
}
