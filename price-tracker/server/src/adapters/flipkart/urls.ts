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

export function extractPid(url: URL): string | null {
  const queryPid = url.searchParams.get('pid')?.toUpperCase();
  if (queryPid && PID_PATTERN.test(queryPid)) return queryPid;

  // /product-title/p/itmXXXX?pid=... — the itm id is the fallback identity.
  const itmMatch = /\/p\/(itm[a-z0-9]+)/i.exec(url.pathname);
  if (itmMatch?.[1]) return itmMatch[1].toUpperCase();

  return null;
}

/** Keeps the human-readable slug (Flipkart needs it) and drops tracking params. */
export function canonicalFlipkartUrl(url: URL, pid: string): string {
  const canonical = new URL(url.toString());
  canonical.protocol = 'https:';
  canonical.hostname = 'www.flipkart.com';
  canonical.hash = '';

  const keptPid = canonical.searchParams.get('pid') ?? pid;
  const search = new URLSearchParams();
  if (PID_PATTERN.test(keptPid.toUpperCase())) search.set('pid', keptPid.toUpperCase());
  canonical.search = search.toString();

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
    canonicalUrl: canonicalFlipkartUrl(url, pid),
  };
}
