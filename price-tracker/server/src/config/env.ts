import path from 'node:path';
import dotenv from 'dotenv';
import { z } from 'zod';

// The repository keeps one .env at its root; `server/.env` also works and wins
// when both exist. In Docker the values arrive as real environment variables and
// neither file is present.
dotenv.config({
  path: [path.resolve(process.cwd(), '.env'), path.resolve(process.cwd(), '..', '.env')],
});

/**
 * Every secret and tunable enters the process through here.
 * Nothing else in the codebase reads `process.env` directly.
 */
const booleanish = z
  .enum(['true', 'false', '1', '0'])
  .transform((v) => v === 'true' || v === '1');

const envSchema = z
  .object({
    NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
    PORT: z.coerce.number().int().positive().default(4000),

    MONGO_URI: z.string().min(1).default('mongodb://127.0.0.1:27017/price_tracker'),
    REDIS_URL: z.string().min(1).default('redis://127.0.0.1:6379'),

    FRONTEND_URL: z.string().url().default('http://localhost:5173'),
    /** Extra allowed CORS origins, comma separated. */
    EXTRA_CORS_ORIGINS: z.string().optional(),

    /**
     * The single password that unlocks the app. There are no accounts: one
     * password, one owner, one long-lived session cookie per browser.
     */
    APP_ACCESS_PASSWORD: z.string().min(8, 'Use at least 8 characters').default('change-me-please'),
    /** How long a browser stays unlocked after entering the password. */
    SESSION_TTL_DAYS: z.coerce.number().int().positive().default(365),

    JWT_SECRET: z.string().min(32).default('dev-only-jwt-secret-change-me-0123456789abcd'),
    COOKIE_DOMAIN: z.string().optional(),

    /** 32-byte key, hex encoded, used for AES-256-GCM encryption of stored tokens. */
    ENCRYPTION_KEY: z.string().default('0'.repeat(64)),

    TWILIO_ACCOUNT_SID: z.string().optional(),
    TWILIO_AUTH_TOKEN: z.string().optional(),
    TWILIO_PHONE_NUMBER: z.string().optional(),
    TWILIO_WHATSAPP_NUMBER: z.string().optional(),

    /** Token from @BotFather. Enables the Telegram channel; nothing else is needed. */
    TELEGRAM_BOT_TOKEN: z
      .string()
      .regex(/^\d+:[A-Za-z0-9_-]{30,}$/, 'should look like 123456789:AAH…, as issued by @BotFather')
      .optional(),

    LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace']).default('info'),
    LOG_PRETTY: booleanish.default('false'),

    /* ---------------- data acquisition ---------------- */

    /**
     * Per-marketplace data source.
     *   official  -> marketplace / partner API (PA-API, Flipkart Affiliate, ...)
     *   provider  -> authorized third-party product-data provider
     *   public    -> publicly reachable product page, robots-aware, heavily rate limited
     *   disabled  -> adapter refuses to fetch (useful in CI / tests)
     */
    AMAZON_DATA_SOURCE: z.enum(['official', 'provider', 'public', 'disabled']).default('public'),
    FLIPKART_DATA_SOURCE: z.enum(['official', 'provider', 'public', 'disabled']).default('public'),

    AMAZON_PAAPI_ACCESS_KEY: z.string().optional(),
    AMAZON_PAAPI_SECRET_KEY: z.string().optional(),
    AMAZON_PAAPI_PARTNER_TAG: z.string().optional(),
    AMAZON_PAAPI_HOST: z.string().default('webservices.amazon.in'),
    AMAZON_PAAPI_REGION: z.string().default('eu-west-1'),

    FLIPKART_AFFILIATE_ID: z.string().optional(),
    FLIPKART_AFFILIATE_TOKEN: z.string().optional(),

    /** Authorized product-data provider, used when a marketplace source is `provider`. */
    PRODUCT_DATA_PROVIDER_URL: z.string().url().optional(),
    PRODUCT_DATA_PROVIDER_KEY: z.string().optional(),

    /** Contact string advertised in the User-Agent so marketplaces can reach the operator. */
    CRAWLER_CONTACT: z.string().default('price-tracker-operator@example.com'),
    RESPECT_ROBOTS_TXT: booleanish.default('true'),

    HTTP_TIMEOUT_MS: z.coerce.number().int().positive().default(15000),
    HTTP_MAX_ATTEMPTS: z.coerce.number().int().min(1).max(5).default(3),

    /** Cluster-wide ceiling: requests per marketplace per minute. */
    MARKETPLACE_RPM: z.coerce.number().int().min(1).max(120).default(10),
    MARKETPLACE_MIN_GAP_MS: z.coerce.number().int().min(0).default(3000),
    MARKETPLACE_JITTER_MS: z.coerce.number().int().min(0).default(2000),
    /** Per-worker concurrency; the shared rate limiter is the real throttle. */
    WORKER_CONCURRENCY: z.coerce.number().int().min(1).max(20).default(2),

    CIRCUIT_FAILURE_THRESHOLD: z.coerce.number().int().min(1).default(5),
    CIRCUIT_OPEN_MS: z.coerce.number().int().min(1000).default(300000),

    /** Product payload cache TTL — avoids asking a marketplace the same question twice. */
    PRODUCT_CACHE_TTL_SEC: z.coerce.number().int().min(0).default(300),
    /**
     * 0 (default) records every successful check, so the chart is continuous even
     * when the price never moves. Above 0, an unchanged reading is written at most
     * once per this many minutes.
     */
    HISTORY_DEDUPE_WINDOW_MIN: z.coerce.number().int().min(0).default(0),

    SCHEDULER_TICK_MS: z.coerce.number().int().min(5000).default(30000),
    SCHEDULER_BATCH_SIZE: z.coerce.number().int().min(1).max(1000).default(200),
    MIN_CHECK_INTERVAL_MIN: z.coerce.number().int().min(15).default(15),
    MAX_PRODUCTS_PER_USER: z.coerce.number().int().min(1).default(100),
    /** Manual "check now" budget per user per hour. */
    MANUAL_CHECK_LIMIT_PER_HOUR: z.coerce.number().int().min(1).default(20),
  })
  .superRefine((val, ctx) => {
    if (val.NODE_ENV !== 'production') return;
    if (val.JWT_SECRET.startsWith('dev-only')) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['JWT_SECRET'],
        message: 'must be set to a strong value in production',
      });
    }
    if (val.APP_ACCESS_PASSWORD === 'change-me-please') {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['APP_ACCESS_PASSWORD'],
        message: 'must be set to a real password in production',
      });
    }
    if (/^0+$/.test(val.ENCRYPTION_KEY)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['ENCRYPTION_KEY'],
        message: 'must be set to a strong value in production',
      });
    }
  });

export type Env = z.infer<typeof envSchema>;

/**
 * A variable that is present but empty (`COOKIE_DOMAIN=` in a .env file) means
 * "not configured", not "the empty string" — otherwise every commented-out
 * optional in .env.example would fail validation.
 */
const source = Object.fromEntries(
  Object.entries(process.env).filter(([, value]) => value !== undefined && value !== ''),
);

const parsed = envSchema.safeParse(source);
if (!parsed.success) {
  // Only the offending keys are printed — never the values.
  const issues = parsed.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('\n  ');
  throw new Error(`Invalid environment configuration:\n  ${issues}`);
}

export const env: Env = parsed.data;

export const isProd = env.NODE_ENV === 'production';
export const isTest = env.NODE_ENV === 'test';

export const corsOrigins = [
  env.FRONTEND_URL,
  ...(env.EXTRA_CORS_ORIGINS ?? '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean),
];

export const telegramConfigured = Boolean(env.TELEGRAM_BOT_TOKEN);

export const twilioConfigured = Boolean(
  env.TWILIO_ACCOUNT_SID &&
    env.TWILIO_AUTH_TOKEN &&
    (env.TWILIO_PHONE_NUMBER || env.TWILIO_WHATSAPP_NUMBER),
);
