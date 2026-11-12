import { request } from 'undici';
import { env } from '../../config/env';
import type { Marketplace } from '../../config/constants';
import { AdapterError } from '../../utils/errors';
import { parsePriceToMinor } from '../../utils/money';
import { readJsonBody } from '../http/body';
import { httpAgent } from '../http/dispatcher';
import { normalizeAvailability } from '../parsing';
import type { FetchContext, ProductDataProvider, ProductIdentity, ProductSnapshot } from '../types';

/**
 * Adapter for a licensed third-party product-data provider.
 *
 * The contract is intentionally small so any commercial catalogue API can be
 * dropped in behind it:
 *
 *   GET {PRODUCT_DATA_PROVIDER_URL}/product?marketplace=…&id=…
 *   Authorization: Bearer {PRODUCT_DATA_PROVIDER_KEY}
 *
 *   -> { title, image, price, currency, availability, seller?, mrp?, rating? }
 *
 * Using a provider is the recommended production setup: it keeps us inside a
 * contractual relationship with a data supplier rather than fetching pages
 * ourselves.
 */
export class AuthorizedProvider implements ProductDataProvider {
  readonly name = 'authorized-provider';
  readonly source = 'authorized_provider' as const;

  constructor(private readonly marketplace: Marketplace) {}

  isConfigured(): boolean {
    return Boolean(env.PRODUCT_DATA_PROVIDER_URL && env.PRODUCT_DATA_PROVIDER_KEY);
  }

  async fetchProduct(identity: ProductIdentity, _ctx: FetchContext): Promise<ProductSnapshot> {
    if (!this.isConfigured()) {
      throw new AdapterError('not_configured', 'Product data provider is not configured', {
        retryable: false,
      });
    }

    const url = new URL('/product', env.PRODUCT_DATA_PROVIDER_URL);
    url.searchParams.set('marketplace', this.marketplace);
    url.searchParams.set('id', identity.externalProductId);

    let res;
    try {
      res = await request(url, {
        method: 'GET',
        headers: {
          authorization: `Bearer ${env.PRODUCT_DATA_PROVIDER_KEY}`,
          accept: 'application/json',
        },
        headersTimeout: env.HTTP_TIMEOUT_MS,
        bodyTimeout: env.HTTP_TIMEOUT_MS,
        dispatcher: httpAgent,
      });
    } catch (err) {
      throw new AdapterError('temporary_error', 'Product data provider is unreachable', {
        retryable: true,
        cause: err,
      });
    }

    if (res.statusCode === 404) {
      await res.body.dump().catch(() => undefined);
      throw new AdapterError('not_found', 'Provider does not know this product', {
        retryable: false,
      });
    }
    if (res.statusCode === 429 || res.statusCode >= 500) {
      await res.body.dump().catch(() => undefined);
      throw new AdapterError('temporary_error', `Provider returned ${res.statusCode}`, {
        retryable: true,
        statusCode: res.statusCode,
      });
    }
    if (res.statusCode >= 400) {
      await res.body.dump().catch(() => undefined);
      throw new AdapterError('blocked', `Provider rejected the request (${res.statusCode})`, {
        retryable: false,
        statusCode: res.statusCode,
      });
    }

    const payload = await readJsonBody<Record<string, unknown>>(res);
    const price = parsePriceToMinor(payload.price as string | number | null | undefined);

    if (!payload.title && price === null) {
      throw new AdapterError('parse_error', 'Provider response did not contain product data', {
        retryable: false,
      });
    }

    return {
      identity,
      title: String(payload.title ?? identity.externalProductId),
      imageUrl: typeof payload.image === 'string' ? payload.image : undefined,
      price,
      currency: typeof payload.currency === 'string' ? payload.currency : 'INR',
      availability: normalizeAvailability(payload.availability),
      source: this.source,
      fetchedAt: new Date(),
      metadata: {
        seller: typeof payload.seller === 'string' ? payload.seller : undefined,
        mrp: parsePriceToMinor(payload.mrp as string | number | null | undefined) ?? undefined,
        rating: typeof payload.rating === 'number' ? payload.rating : undefined,
        provider: this.name,
      },
    };
  }
}
