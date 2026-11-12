import pino from 'pino';
import { env, isTest } from './env';

/**
 * Structured logging. `redact` is the last line of defence: even when a caller
 * accidentally passes a whole request or config object, credentials never land
 * in the log stream.
 */
export const logger = pino({
  level: isTest ? 'silent' : env.LOG_LEVEL,
  base: { service: process.env.SERVICE_NAME ?? 'api' },
  redact: {
    paths: [
      'password',
      'currentPassword',
      'newPassword',
      'token',
      'accessToken',
      'refreshToken',
      'authorization',
      'cookie',
      'cookies',
      'sessionCookie',
      'encryptedPayload',
      'req.headers.authorization',
      'req.headers.cookie',
      'res.headers["set-cookie"]',
      '*.password',
      '*.token',
      '*.authToken',
      '*.sessionCookie',
      'TWILIO_AUTH_TOKEN',
    ],
    censor: '[redacted]',
  },
  transport: env.LOG_PRETTY
    ? { target: 'pino-pretty', options: { colorize: true, translateTime: 'SYS:HH:MM:ss' } }
    : undefined,
});

export type Logger = typeof logger;
