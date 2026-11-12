import type { Availability, Marketplace } from '../config/constants';
import { logger } from '../config/logger';
import { AdapterError } from '../utils/errors';
import { cacheKey, readCache, writeCache } from './http/cache';
import type {
  DataSourceMode,
  FetchContext,
  MarketplaceAdapter,
  PriceQuote,
  ProductDataProvider,
  ProductIdentity,
  ProductSnapshot,
} from './types';

/**
 * Shared adapter behaviour: provider selection, caching, and the derived
 * `getCurrentPrice` / `getAvailability` methods.
 *
 * Subclasses only supply URL handling and their ordered provider list, which is
 * what makes swapping "public page" for "official API" a configuration change
 * rather than a code change.
 */
export abstract class BaseAdapter implements MarketplaceAdapter {
  abstract readonly marketplace: Marketplace;
  abstract readonly label: string;
  abstract readonly dataSource: DataSourceMode;

  abstract supports(url: URL): boolean;
  abstract normalizeProductUrl(rawUrl: string): ProductIdentity;

  /** Ordered by preference: official API first, then authorized provider, then public page. */
  protected abstract providers(): ProductDataProvider[];

  protected selectProvider(): ProductDataProvider {
    if (this.dataSource === 'disabled') {
      throw new AdapterError(
        'not_configured',
        `${this.label} price checks are disabled by configuration`,
        { retryable: false },
      );
    }
    const provider = this.providers().find((p) => p.isConfigured());
    if (!provider) {
      throw new AdapterError(
        'not_configured',
        `No data source is configured for ${this.label}. Configure an official API, an authorized provider, or enable the public source.`,
        { retryable: false },
      );
    }
    return provider;
  }

  async getProductDetails(
    identity: ProductIdentity,
    ctx: FetchContext = {},
  ): Promise<ProductSnapshot> {
    const key = cacheKey(this.marketplace, identity.externalProductId);
    const log = logger.child({
      jobId: ctx.jobId,
      marketplace: this.marketplace,
      externalProductId: identity.externalProductId,
    });

    if (!ctx.bypassCache) {
      const cached = await readCache<ProductSnapshot>(key);
      if (cached) {
        const fetchedAt = new Date(cached.fetchedAt);
        log.info(
          {
            ageMs: Date.now() - fetchedAt.getTime(),
            price: cached.price,
            availability: cached.availability,
          },
          'served product snapshot from cache',
        );
        return { ...cached, fetchedAt };
      }
    }

    const provider = this.selectProvider();
    log.info(
      {
        provider: provider.name,
        dataSource: this.dataSource,
        cache: ctx.bypassCache ? 'bypassed' : 'miss',
        url: identity.canonicalUrl,
      },
      'fetching product from provider',
    );

    const startedAt = Date.now();
    const snapshot = await provider.fetchProduct(identity, ctx);
    log.info(
      {
        provider: provider.name,
        durationMs: Date.now() - startedAt,
        title: snapshot.title,
        price: snapshot.price,
        availability: snapshot.availability,
      },
      'provider returned product',
    );

    await writeCache(key, snapshot);
    return snapshot;
  }

  async getCurrentPrice(identity: ProductIdentity, ctx: FetchContext = {}): Promise<PriceQuote> {
    const snapshot = await this.getProductDetails(identity, ctx);
    return {
      price: snapshot.price,
      currency: snapshot.currency,
      availability: snapshot.availability,
      source: snapshot.source,
      fetchedAt: snapshot.fetchedAt,
    };
  }

  async getAvailability(identity: ProductIdentity, ctx: FetchContext = {}): Promise<Availability> {
    const snapshot = await this.getProductDetails(identity, ctx);
    return snapshot.availability;
  }
}
