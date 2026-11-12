import { backoffMinutes, hourInWindow, nextCheckDate } from '../../src/utils/time';
import { decryptString, encryptString, timingSafeEqual } from '../../src/utils/crypto';
import { assertNoCredentials } from '../../src/services/marketplaceSession.service';
import { extractStructuredProduct, normalizeAvailability } from '../../src/adapters/parsing';
import { CircuitBreaker } from '../../src/adapters/http/circuitBreaker';
import { acquireLock, withLock } from '../../src/utils/lock';
import { AdapterError } from '../../src/utils/errors';

describe('retry ladder', () => {
  it('walks 1m, 5m, 15m, 1h, 6h and then holds', () => {
    expect([1, 2, 3, 4, 5, 6, 12].map(backoffMinutes)).toEqual([1, 5, 15, 60, 360, 360, 360]);
  });

  it('never returns a value below one minute', () => {
    expect(backoffMinutes(0)).toBe(1);
    expect(backoffMinutes(-4)).toBe(1);
  });
});

describe('nextCheckDate', () => {
  it('lands close to the interval, with a little jitter', () => {
    const from = new Date('2026-01-01T00:00:00.000Z');
    const next = nextCheckDate(60, from).getTime() - from.getTime();
    expect(next).toBeGreaterThan(57 * 60_000);
    expect(next).toBeLessThan(63 * 60_000);
  });
});

describe('hourInWindow', () => {
  it('handles a window that wraps past midnight', () => {
    expect(hourInWindow(23, 22, 8)).toBe(true);
    expect(hourInWindow(3, 22, 8)).toBe(true);
    expect(hourInWindow(9, 22, 8)).toBe(false);
  });

  it('handles a same-day window', () => {
    expect(hourInWindow(14, 9, 17)).toBe(true);
    expect(hourInWindow(20, 9, 17)).toBe(false);
  });
});

describe('encryption at rest', () => {
  it('round-trips a value', () => {
    const secret = 'session-artefact-value';
    const encrypted = encryptString(secret);
    expect(encrypted).not.toContain(secret);
    expect(decryptString(encrypted)).toBe(secret);
  });

  it('produces different ciphertext each time', () => {
    expect(encryptString('same')).not.toBe(encryptString('same'));
  });

  it('refuses a tampered payload', () => {
    const encrypted = encryptString('value');
    const tampered = `${encrypted.slice(0, -4)}AAAA`;
    expect(() => decryptString(tampered)).toThrow();
  });

  it('compares tokens without leaking length-independent timing', () => {
    expect(timingSafeEqual('abc', 'abc')).toBe(true);
    expect(timingSafeEqual('abc', 'abd')).toBe(false);
    expect(timingSafeEqual('abc', 'abcd')).toBe(false);
  });
});

describe('marketplace session guard', () => {
  it('accepts an opaque session artefact', () => {
    expect(() => assertNoCredentials('session-token=abc123; path=/')).not.toThrow();
  });

  it.each([
    '{"password":"hunter2"}',
    'otp: 123456',
    '{"cvv":"123"}',
    'card_number=4111111111111111',
  ])('rejects credential-shaped payloads (%s)', (payload) => {
    expect(() => assertNoCredentials(payload)).toThrow(/credentials or payment data/);
  });

  it('rejects an oversized payload', () => {
    expect(() => assertNoCredentials('x'.repeat(9000))).toThrow(/larger than expected/);
  });
});

describe('structured data parsing', () => {
  const html = `
    <html><head>
    <script type="application/ld+json">
    {"@context":"https://schema.org","@type":"Product","name":"Apple AirPods Pro (2nd gen)",
     "image":["https://cdn.example/img.jpg"],
     "aggregateRating":{"@type":"AggregateRating","ratingValue":"4.6"},
     "offers":{"@type":"Offer","price":"19999.00","priceCurrency":"INR",
               "availability":"https://schema.org/InStock",
               "seller":{"@type":"Organization","name":"Appario Retail"}}}
    </script></head><body></body></html>`;

  it('reads title, price, currency, availability and seller', () => {
    const product = extractStructuredProduct(html);
    expect(product).toMatchObject({
      title: 'Apple AirPods Pro (2nd gen)',
      price: 1_999_900,
      currency: 'INR',
      availability: 'in_stock',
      seller: 'Appario Retail',
      rating: 4.6,
    });
  });

  it('returns null when the page has no product data', () => {
    expect(extractStructuredProduct('<html><body>nothing here</body></html>')).toBeNull();
  });

  it('ignores malformed JSON-LD instead of throwing', () => {
    expect(
      extractStructuredProduct('<script type="application/ld+json">{ not json </script>'),
    ).toBeNull();
  });

  it('maps availability strings onto the internal enum', () => {
    expect(normalizeAvailability('https://schema.org/OutOfStock')).toBe('out_of_stock');
    expect(normalizeAvailability('InStock')).toBe('in_stock');
    expect(normalizeAvailability(undefined)).toBe('unknown');
  });
});

describe('circuit breaker', () => {
  it('opens after the failure threshold and refuses further requests', async () => {
    const breaker = new CircuitBreaker('test-marketplace', 3, 60_000);

    await breaker.recordFailure();
    await breaker.recordFailure();
    await expect(breaker.assertClosed()).resolves.toBe('closed');

    await breaker.recordFailure();

    // The first call after opening gets the single half-open probe; the next is refused.
    await breaker.assertClosed();
    await expect(breaker.assertClosed()).rejects.toBeInstanceOf(AdapterError);
  });

  it('closes again after a success', async () => {
    const breaker = new CircuitBreaker('test-recovery', 1, 60_000);
    await breaker.recordFailure();
    await breaker.recordSuccess();
    await expect(breaker.assertClosed()).resolves.toBe('closed');
  });
});

describe('distributed lock', () => {
  it('lets only one holder in at a time', async () => {
    const first = await acquireLock('lock:test', 5000);
    const second = await acquireLock('lock:test', 5000);

    expect(first).not.toBeNull();
    expect(second).toBeNull();

    await first!.release();
    expect(await acquireLock('lock:test', 5000)).not.toBeNull();
  });

  it('skips the body when the lock is held elsewhere', async () => {
    const held = await acquireLock('lock:busy', 5000);
    const ran = jest.fn();

    const result = await withLock('lock:busy', 5000, async () => {
      ran();
      return 'done';
    });

    expect(result).toBeUndefined();
    expect(ran).not.toHaveBeenCalled();
    await held!.release();
  });

  it('releases the lock even when the body throws', async () => {
    await expect(
      withLock('lock:throwing', 5000, async () => {
        throw new Error('boom');
      }),
    ).rejects.toThrow('boom');

    expect(await acquireLock('lock:throwing', 5000)).not.toBeNull();
  });
});
