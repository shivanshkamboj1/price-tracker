import type { Availability, Marketplace, PriceSource } from '../config/constants';

/** Stable identity of a product on one marketplace. */
export interface ProductIdentity {
  marketplace: Marketplace;
  /** ASIN for Amazon, PID for Flipkart. */
  externalProductId: string;
  /** Canonical URL with tracking parameters removed. */
  canonicalUrl: string;
}

export interface ProductSnapshot {
  identity: ProductIdentity;
  title: string;
  imageUrl?: string;
  /** Integer minor units (paise). `null` when the marketplace shows no price. */
  price: number | null;
  currency: string;
  availability: Availability;
  source: PriceSource;
  fetchedAt: Date;
  metadata?: {
    seller?: string;
    mrp?: number;
    discountPercent?: number;
    rating?: number;
    [key: string]: unknown;
  };
}

export interface PriceQuote {
  price: number | null;
  currency: string;
  availability: Availability;
  source: PriceSource;
  fetchedAt: Date;
}

export type DataSourceMode = 'official' | 'provider' | 'public' | 'disabled';

/** Context passed down to providers so they can honour per-request settings. */
export interface FetchContext {
  /** Skip the cache — used by the user-triggered "Check now" action. */
  bypassCache?: boolean;
  /** Correlates provider logs with the job that caused them. */
  jobId?: string;
  /**
   * Opaque, decrypted session artefact supplied by the user's own browser
   * session, when they explicitly connected one. Never a password.
   */
  userSession?: string;
}

/**
 * The only surface the worker is allowed to know about.
 *
 * Adding Croma / Myntra / Tata Cliq later means writing one more implementation
 * and registering it in the factory — nothing else in the system changes.
 */
export interface MarketplaceAdapter {
  readonly marketplace: Marketplace;
  /** Human-readable label used in logs and the health page. */
  readonly label: string;
  /** Where this adapter currently gets its data from. */
  readonly dataSource: DataSourceMode;

  /** True when the adapter recognises the host of `url`. */
  supports(url: URL): boolean;

  /**
   * Validates and canonicalises a user-supplied URL.
   * Throws `AdapterError('unsupported' | 'not_found')` when the URL is unusable.
   */
  normalizeProductUrl(rawUrl: string): ProductIdentity;

  getProductDetails(identity: ProductIdentity, ctx?: FetchContext): Promise<ProductSnapshot>;
  getCurrentPrice(identity: ProductIdentity, ctx?: FetchContext): Promise<PriceQuote>;
  getAvailability(identity: ProductIdentity, ctx?: FetchContext): Promise<Availability>;
}

/**
 * A concrete way of obtaining product data for one marketplace: an official API,
 * an authorized data provider, or the public product page. Adapters hold an
 * ordered list of these and use the first configured one.
 */
export interface ProductDataProvider {
  readonly name: string;
  readonly source: PriceSource;
  /** False when required credentials or endpoints are missing. */
  isConfigured(): boolean;
  fetchProduct(identity: ProductIdentity, ctx: FetchContext): Promise<ProductSnapshot>;
}
