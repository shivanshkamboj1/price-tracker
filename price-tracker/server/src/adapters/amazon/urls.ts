import { AdapterError } from '../../utils/errors';
import type { ProductIdentity } from '../types';

/** Amazon India storefronts we accept. Other locales are a separate adapter. */
const ALLOWED_HOSTS = new Set([
  'amazon.in',
  'www.amazon.in',
  'm.amazon.in',
  'amzn.in',
  'www.amzn.in',
]);

const ASIN_PATTERN = /^[A-Z0-9]{10}$/;

const PATH_PATTERNS = [
  /\/dp\/([A-Z0-9]{10})(?:[/?]|$)/i,
  /\/gp\/product\/([A-Z0-9]{10})(?:[/?]|$)/i,
  /\/gp\/aw\/d\/([A-Z0-9]{10})(?:[/?]|$)/i,
  /\/product\/([A-Z0-9]{10})(?:[/?]|$)/i,
  /\/-\/[^/]+\/dp\/([A-Z0-9]{10})(?:[/?]|$)/i,
];

export function isAmazonHost(url: URL): boolean {
  return ALLOWED_HOSTS.has(url.hostname.toLowerCase());
}

export function extractAsin(url: URL): string | null {
  for (const pattern of PATH_PATTERNS) {
    const match = pattern.exec(url.pathname);
    const asin = match?.[1]?.toUpperCase();
    if (asin && ASIN_PATTERN.test(asin)) return asin;
  }
  const queryAsin = (url.searchParams.get('asin') ?? url.searchParams.get('ASIN'))?.toUpperCase();
  if (queryAsin && ASIN_PATTERN.test(queryAsin)) return queryAsin;
  return null;
}

export function canonicalAmazonUrl(asin: string): string {
  return `https://www.amazon.in/dp/${asin}`;
}

/**
 * Validates a user-supplied Amazon URL and reduces it to `/dp/<ASIN>`.
 * Every affiliate tag, session id and referrer parameter is dropped, so the
 * same product added twice from different links is recognised as one product.
 */
export function normalizeAmazonUrl(rawUrl: string): ProductIdentity {
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
  if (!isAmazonHost(url)) {
    throw new AdapterError('unsupported', 'This is not an Amazon India product link', {
      retryable: false,
    });
  }

  const asin = extractAsin(url);
  if (!asin) {
    throw new AdapterError(
      'not_found',
      'Could not find a product id (ASIN) in that link. Open the product page and copy the URL from the address bar.',
      { retryable: false },
    );
  }

  return {
    marketplace: 'amazon_in',
    externalProductId: asin,
    canonicalUrl: canonicalAmazonUrl(asin),
  };
}
