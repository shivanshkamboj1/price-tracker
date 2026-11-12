import { AdapterError } from '../../utils/errors';
import type { ProductIdentity } from '../types';

const ALLOWED_HOSTS = new Set([
  'flipkart.com',
  'www.flipkart.com',
  'm.flipkart.com',
  'dl.flipkart.com',
  'fkrt.it',
  'www.fkrt.it',
]);

/** Flipkart product ids look like `MOBGTAGPTB3VS24W`. */
const PID_PATTERN = /^[A-Z0-9]{10,32}$/;

export function isFlipkartHost(url: URL): boolean {
  return ALLOWED_HOSTS.has(url.hostname.toLowerCase());
}

/** The listing id from a `/product-title/p/itmXXXX` path, upper-cased. */
function itmId(url: URL): string | null {
  const match = /\/p\/(itm[a-z0-9]+)/i.exec(url.pathname);
  return match?.[1] ? match[1].toUpperCase() : null;
}

/**
 * The real `pid` from the query string, if the link carries one.
 *
 * A `pid` that merely repeats the itm id is not one: earlier versions of this
 * file wrote the itm fallback into the URL that way, and Flipkart answers an
 * unknown pid with a generic "All Categories" page instead of the product.
 */
function queryPid(url: URL): string | null {
  const pid = url.searchParams.get('pid')?.toUpperCase();
  if (!pid || !PID_PATTERN.test(pid)) return null;
  return pid === itmId(url) ? null : pid;
}

/** The product's identity: its pid when the link has one, otherwise the itm id. */
export function extractPid(url: URL): string | null {
  return queryPid(url) ?? itmId(url);
}

/**
 * Keeps the human-readable slug (Flipkart needs it) and a real pid, and drops
 * tracking params. The itm fallback identity is never written into the URL.
 */
export function canonicalFlipkartUrl(url: URL): string {
  const canonical = new URL(url.toString());
  canonical.protocol = 'https:';
  canonical.hostname = 'www.flipkart.com';
  canonical.hash = '';

  const pid = queryPid(url);
  canonical.search = pid ? new URLSearchParams({ pid }).toString() : '';

  return canonical.toString();
}

export function normalizeFlipkartUrl(rawUrl: string): ProductIdentity {
  let url: URL;
  try {
    url = new URL(rawUrl.trim());
  } catch {
    throw new AdapterError('unsupported', 'That does not look like a valid URL', {
      retryable: false,
    });
  }

  if (url.protocol !== 'https:' && url.protocol !== 'http:') {
    throw new AdapterError('unsupported', 'Only http(s) product links are supported', {
      retryable: false,
    });
  }
  if (!isFlipkartHost(url)) {
    throw new AdapterError('unsupported', 'This is not a Flipkart product link', {
      retryable: false,
    });
  }

  const pid = extractPid(url);
  if (!pid) {
    throw new AdapterError(
      'not_found',
      'Could not find a product id (pid) in that link. Open the product page and copy the full URL from the address bar.',
      { retryable: false },
    );
  }

  if (!/\/p\//i.test(url.pathname)) {
    throw new AdapterError(
      'unsupported',
      'That looks like a search or listing page rather than a single product',
      { retryable: false },
    );
  }

  return {
    marketplace: 'flipkart',
    externalProductId: pid,
    canonicalUrl: canonicalFlipkartUrl(url),
  };
}
