import type { Marketplace } from '../config/constants';
import { AdapterError } from '../utils/errors';
import { AmazonAdapter } from './amazon/AmazonAdapter';
import { FlipkartAdapter } from './flipkart/FlipkartAdapter';
import type { MarketplaceAdapter, ProductIdentity } from './types';

/**
 * The single place that knows which adapters exist.
 *
 * Adding a marketplace (Croma, Myntra, Reliance Digital, Tata Cliq …) means
 * writing one `MarketplaceAdapter` implementation and adding it to this list.
 * The worker, the scheduler and the API stay untouched.
 */
const registry = new Map<Marketplace, MarketplaceAdapter>();

function register(adapter: MarketplaceAdapter): void {
  registry.set(adapter.marketplace, adapter);
}

register(new AmazonAdapter());
register(new FlipkartAdapter());

export function getAdapter(marketplace: Marketplace): MarketplaceAdapter {
  const adapter = registry.get(marketplace);
  if (!adapter) {
    throw new AdapterError('unsupported', `No adapter registered for ${marketplace}`, {
      retryable: false,
    });
  }
  return adapter;
}

export function listAdapters(): MarketplaceAdapter[] {
  return [...registry.values()];
}

/**
 * Marketplace detection is derived from the URL host, never from a value the
 * client sent. A client-supplied `marketplace` field is only ever used to
 * *cross-check* the detected value.
 */
export function detectAdapter(rawUrl: string): MarketplaceAdapter {
  let url: URL;
  try {
    url = new URL(rawUrl.trim());
  } catch {
    throw new AdapterError('unsupported', 'That does not look like a valid URL', {
      retryable: false,
    });
  }

  const adapter = listAdapters().find((candidate) => candidate.supports(url));
  if (!adapter) {
    throw new AdapterError(
      'unsupported',
      `${url.hostname} is not a supported marketplace. Supported: ${listAdapters()
        .map((a) => a.label)
        .join(', ')}.`,
      { retryable: false },
    );
  }
  return adapter;
}

/** Detects the marketplace and canonicalises the URL in one step. */
export function resolveProductUrl(rawUrl: string): {
  adapter: MarketplaceAdapter;
  identity: ProductIdentity;
} {
  const adapter = detectAdapter(rawUrl);
  return { adapter, identity: adapter.normalizeProductUrl(rawUrl) };
}
