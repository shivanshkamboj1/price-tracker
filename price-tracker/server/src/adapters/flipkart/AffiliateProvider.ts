import { request } from 'undici';
import { env } from '../../config/env';
import { AdapterError } from '../../utils/errors';
import { parsePriceToMinor } from '../../utils/money';
import { readJsonBody } from '../http/body';
import { httpAgent } from '../http/dispatcher';
import type { FetchContext, ProductDataProvider, ProductIdentity, ProductSnapshot } from '../types';

/**
 * Flipkart Affiliate / partner product API.
 *
 * Authenticated with the affiliate id and token issued by Flipkart, sent in
 * their documented headers. Preferred over reading the public page whenever the
 * operator has an approved affiliate account.
 */
const BASE_URL = 'https://affiliate-api.flipkart.net/affiliate/1.0/product.json';

interface FlipkartProductInfo {
  productBaseInfoV1?: {
    productId?: string;
    title?: string;
    imageUrls?: Record<string, string>;
    currentPrice?: { amount?: number; currency?: string };
    maximumRetailPrice?: { amount?: number };
    inStock?: boolean;
    discountPercentage?: number;
    productUrl?: string;
    productFamily?: string[];
  };
  categorySpecificInfoV1?: unknown;
}

export class FlipkartAffiliateProvider implements ProductDataProvider {
  readonly name = 'flipkart-affiliate';
  readonly source = 'official_api' as const;

  isConfigured(): boolean {
    return Boolean(env.FLIPKART_AFFILIATE_ID && env.FLIPKART_AFFILIATE_TOKEN);
  }

  async fetchProduct(identity: ProductIdentity, _ctx: FetchContext): Promise<ProductSnapshot> {
    if (!this.isConfigured()) {
      throw new AdapterError('not_configured', 'Flipkart affiliate credentials are not configured', {
        retryable: false,
      });
    }

    const url = new URL(BASE_URL);
    url.searchParams.set('id', identity.externalProductId);

    let res;
    try {
      res = await request(url, {
        method: 'GET',
        headers: {
          'Fk-Affiliate-Id': env.FLIPKART_AFFILIATE_ID!,
          'Fk-Affiliate-Token': env.FLIPKART_AFFILIATE_TOKEN!,
          accept: 'application/json',
        },
        headersTimeout: env.HTTP_TIMEOUT_MS,
        bodyTimeout: env.HTTP_TIMEOUT_MS,
        dispatcher: httpAgent,
      });
    } catch (err) {
      throw new AdapterError('temporary_error', 'Flipkart affiliate API is unreachable', {
        retryable: true,
        cause: err,
      });
    }

    if (res.statusCode === 404) {
      await res.body.dump().catch(() => undefined);
      throw new AdapterError('not_found', 'Flipkart does not know this product id', {
        retryable: false,
      });
    }
    if (res.statusCode === 401 || res.statusCode === 403) {
      await res.body.dump().catch(() => undefined);
      throw new AdapterError('blocked', 'Flipkart rejected the affiliate credentials', {
        retryable: false,
        statusCode: res.statusCode,
      });
    }
    if (res.statusCode === 429 || res.statusCode >= 500) {
      await res.body.dump().catch(() => undefined);
      throw new AdapterError('temporary_error', `Flipkart returned ${res.statusCode}`, {
        retryable: true,
        statusCode: res.statusCode,
      });
    }

    const payload = await readJsonBody<FlipkartProductInfo>(res);
    const info = payload.productBaseInfoV1;
    if (!info) {
      throw new AdapterError('parse_error', 'Flipkart response did not contain product data', {
        retryable: false,
      });
    }

    const price = parsePriceToMinor(info.currentPrice?.amount ?? null);
    const mrp = parsePriceToMinor(info.maximumRetailPrice?.amount ?? null);

    return {
      identity,
      title: info.title ?? identity.externalProductId,
      imageUrl: info.imageUrls?.['400x400'] ?? Object.values(info.imageUrls ?? {})[0],
      price,
      currency: info.currentPrice?.currency ?? 'INR',
      availability: info.inStock === undefined ? 'unknown' : info.inStock ? 'in_stock' : 'out_of_stock',
      source: this.source,
      fetchedAt: new Date(),
      metadata: {
        mrp: mrp ?? undefined,
        discountPercent: info.discountPercentage,
        provider: this.name,
      },
    };
  }
}
