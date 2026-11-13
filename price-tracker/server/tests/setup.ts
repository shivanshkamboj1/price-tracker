/**
 * Test bootstrap.
 *
 * Redis and the BullMQ queues are replaced with in-process doubles so the suite
 * runs with no external services, while MongoDB is a real (in-memory) server so
 * indexes, aggregations and validation are genuinely exercised.
 */
// Node 18 does not expose `File` as a global; cheerio's bundled undici expects it.
// Harmless on Node 20+, where the global already exists.
const { File: BufferFile, Blob: BufferBlob } = require('node:buffer');
(globalThis as Record<string, unknown>).File ??= BufferFile;
(globalThis as Record<string, unknown>).Blob ??= BufferBlob;

process.env.NODE_ENV = 'test';
process.env.JWT_SECRET ??= 'test-jwt-secret-value-that-is-long-enough-1234';
process.env.APP_ACCESS_PASSWORD ??= 'test-access-password';
process.env.ENCRYPTION_KEY ??= '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef';
process.env.FRONTEND_URL ??= 'http://localhost:5173';
process.env.AMAZON_DATA_SOURCE ??= 'public';
process.env.FLIPKART_DATA_SOURCE ??= 'public';
process.env.MARKETPLACE_MIN_GAP_MS ??= '0';
process.env.MARKETPLACE_JITTER_MS ??= '0';
// A well-formed but fake token, so the Telegram code paths are configured.
// Tests that reach Telegram mock `fetch`; nothing is sent anywhere.
process.env.TELEGRAM_BOT_TOKEN ??= '123456789:TEST-test_token_not_real_000000000000';

jest.mock('../src/config/redis', () => {
  const { fakeRedis } = require('./helpers/fakeRedis');
  return {
    redis: () => fakeRedis,
    createQueueConnection: () => fakeRedis,
    closeRedis: async () => undefined,
  };
});

jest.mock('../src/queues', () => {
  const actual = jest.requireActual('../src/queues');
  return {
    ...actual,
    priceCheckQueue: jest.fn(),
    notificationQueue: jest.fn(),
    whatsappQueue: jest.fn(),
    enqueuePriceCheck: jest.fn(async () => 'test-job-id'),
    enqueueNotification: jest.fn(async () => 'test-notify-id'),
    closeQueues: jest.fn(async () => undefined),
  };
});

afterEach(() => {
  const { fakeRedis } = require('./helpers/fakeRedis');
  fakeRedis.reset();
});
