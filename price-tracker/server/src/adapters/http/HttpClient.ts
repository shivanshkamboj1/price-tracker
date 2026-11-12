import { request, type Dispatcher } from 'undici';
import { env } from '../../config/env';
import { logger } from '../../config/logger';
import { AdapterError } from '../../utils/errors';
import { sleep } from '../../utils/time';
import { ACCEPT_ENCODING, readTextBody } from './body';
import { CircuitBreaker } from './circuitBreaker';
import { followRedirects } from './dispatcher';
import { MarketplaceRateLimiter, type RateLimitOptions } from './rateLimiter';
import { checkRobots } from './robots';

/**
 * The single outbound HTTP path used by every adapter.
 *
 * It is deliberately boring and identifiable: one honest User-Agent that names
 * the application and gives the operator's contact address. There is no
 * fingerprint spoofing, no proxy rotation, no header randomisation and no
 * challenge solving. When a marketplace says no, we record that and back off.
 */
export const USER_AGENT = `PriceTrackerBot/1.0 (+${env.CRAWLER_CONTACT})`;

export interface HttpClientOptions {
  marketplace: string;
  rateLimit?: RateLimitOptions;
  timeoutMs?: number;
  maxAttempts?: number;
  /** robots.txt is consulted for public-page sources; official APIs skip it. */
  enforceRobots?: boolean;
}

export interface HttpResponse {
  status: number;
  body: string;
  url: string;
}

/** Markers that mean "a human verification page", not a product page. */
const CHALLENGE_MARKERS = [
  'enter the characters you see below',
  'to discuss automated access to amazon data',
  'captcha',
  'are you a human',
  'unusual traffic from your computer',
];

function classify(status: number, body: string, marketplace: string): AdapterError | null {
  if (status >= 200 && status < 300) {
    const lowered = body.slice(0, 4000).toLowerCase();
    if (CHALLENGE_MARKERS.some((m) => lowered.includes(m))) {
      return new AdapterError(
        'blocked',
        `${marketplace} served a verification challenge instead of product data`,
        { retryable: false, statusCode: status },
      );
    }
    return null;
  }
  if (status === 404 || status === 410) {
    return new AdapterError('not_found', 'Product page no longer exists', {
      retryable: false,
      statusCode: status,
    });
  }
  if (status === 401 || status === 403) {
    return new AdapterError('blocked', `${marketplace} refused the request (${status})`, {
      retryable: false,
      statusCode: status,
    });
  }
  if (status === 429) {
    return new AdapterError('blocked', `${marketplace} asked us to slow down (429)`, {
      retryable: true,
      statusCode: status,
    });
  }
  if (status >= 500) {
    return new AdapterError('temporary_error', `${marketplace} returned ${status}`, {
      retryable: true,
      statusCode: status,
    });
  }
  return new AdapterError('temporary_error', `Unexpected status ${status}`, {
    retryable: false,
    statusCode: status,
  });
}

export class HttpClient {
  private readonly limiter: MarketplaceRateLimiter;
  readonly breaker: CircuitBreaker;

  constructor(private readonly options: HttpClientOptions) {
    this.limiter = new MarketplaceRateLimiter(options.marketplace, options.rateLimit);
    this.breaker = new CircuitBreaker(options.marketplace);
  }

  async get(
    url: string,
    init: { headers?: Record<string, string>; cookie?: string } = {},
  ): Promise<HttpResponse> {
    const maxAttempts = this.options.maxAttempts ?? env.HTTP_MAX_ATTEMPTS;
    const timeout = this.options.timeoutMs ?? env.HTTP_TIMEOUT_MS;

    if (this.options.enforceRobots !== false) {
      const decision = await checkRobots(url, USER_AGENT);
      if (!decision.allowed) {
        throw new AdapterError(
          'blocked',
          decision.reason === 'disallowed'
            ? 'This path is disallowed by the marketplace robots.txt'
            : 'Could not verify the marketplace robots.txt, so the request was not sent',
          { retryable: decision.reason === 'robots_unavailable' },
        );
      }
      if (decision.crawlDelayMs) await sleep(decision.crawlDelayMs);
    }

    let lastError: AdapterError | undefined;

    for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
      await this.breaker.assertClosed();
      await this.limiter.acquire();

      let response: Dispatcher.ResponseData;
      try {
        response = await request(url, {
          method: 'GET',
          headers: {
            'user-agent': USER_AGENT,
            accept: 'text/html,application/xhtml+xml,application/json;q=0.9,*/*;q=0.8',
            'accept-language': 'en-IN,en;q=0.9',
            'accept-encoding': ACCEPT_ENCODING,
            ...(init.cookie ? { cookie: init.cookie } : {}),
            ...init.headers,
          },
          headersTimeout: timeout,
          bodyTimeout: timeout,
          dispatcher: followRedirects(5),
        });
      } catch (err) {
        lastError = new AdapterError('temporary_error', 'Network request failed', {
          retryable: true,
          cause: err,
        });
        await this.breaker.recordFailure();
        if (attempt < maxAttempts) {
          await sleep(this.retryDelay(attempt));
          continue;
        }
        throw lastError;
      }

      const body = await readTextBody(response);
      const failure = classify(response.statusCode, body, this.options.marketplace);

      if (!failure) {
        await this.breaker.recordSuccess();
        return { status: response.statusCode, body, url };
      }

      // A blocked or failing marketplace counts against the circuit; a missing
      // product does not — that is our data being stale, not their service failing.
      if (failure.kind !== 'not_found') await this.breaker.recordFailure();

      logger.warn(
        {
          marketplace: this.options.marketplace,
          status: response.statusCode,
          kind: failure.kind,
          attempt,
        },
        'upstream request rejected',
      );

      if (!failure.retryable || attempt >= maxAttempts) throw failure;
      lastError = failure;
      await sleep(this.retryDelay(attempt, response.headers['retry-after']));
    }

    throw lastError ?? new AdapterError('temporary_error', 'Request failed', { retryable: true });
  }

  /** Exponential backoff with full jitter, honouring Retry-After when present. */
  private retryDelay(attempt: number, retryAfter?: string | string[]): number {
    const header = Array.isArray(retryAfter) ? retryAfter[0] : retryAfter;
    const parsed = header ? Number.parseInt(header, 10) : Number.NaN;
    if (Number.isFinite(parsed) && parsed > 0) {
      return Math.min(parsed * 1000, 60_000);
    }
    const base = Math.min(1000 * 2 ** (attempt - 1), 30_000);
    return Math.floor(base / 2 + Math.random() * (base / 2));
  }
}
