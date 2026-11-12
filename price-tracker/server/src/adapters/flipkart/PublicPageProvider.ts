import { env } from '../../config/env';
import { AdapterError } from '../../utils/errors';
import { detectCurrency, parsePriceToMinor } from '../../utils/money';
import { HttpClient } from '../http/HttpClient';
import { extractMetaProduct, extractStructuredProduct, firstAttr, firstText } from '../parsing';
import type { FetchContext, ProductDataProvider, ProductIdentity, ProductSnapshot } from '../types';

/**
 * Reads the publicly reachable Flipkart product page.
 *
 * Flipkart publishes schema.org JSON-LD on product pages, so structured data is
 * the primary path and CSS selectors are only a fallback. The same politeness
 * rules as every other public source apply (robots.txt, shared rate budget,
 * jitter, circuit breaker) — see `HttpClient`.
 */
const TITLE_SELECTORS = ['span.B_NuCI', 'h1 span', 'h1'];
const PRICE_SELECTORS = ['div._30jeq3._16Jk6d', 'div._30jeq3', 'div._25b18c ._30jeq3'];
const MRP_SELECTORS = ['div._3I9_wc._2p6lqe', 'div._3I9_wc'];
const OUT_OF_STOCK_MARKERS = /sold out|out of stock|currently unavailable|coming soon/i;

export class FlipkartPublicPageProvider implements ProductDataProvider {
  readonly name = 'flipkart-public-page';
  readonly source = 'public_page' as const;

  private readonly http = new HttpClient({
    marketplace: 'flipkart',
    enforceRobots: true,
  });

  isConfigured(): boolean {
    return env.FLIPKART_DATA_SOURCE === 'public';
  }

  async fetchProduct(identity: ProductIdentity, ctx: FetchContext): Promise<ProductSnapshot> {
    const res = await this.http.get(identity.canonicalUrl, { cookie: ctx.userSession });

    const structured = extractStructuredProduct(res.body);
    const meta = extractMetaProduct(res.body);

    const priceText = firstText(res.body, PRICE_SELECTORS);
    const price = structured?.price ?? meta.price ?? parsePriceToMinor(priceText ?? null);

    const title =
      structured?.title ??
      firstText(res.body, TITLE_SELECTORS) ??
      meta.title ??
      identity.externalProductId;

    let availability = structured?.availability ?? meta.availability ?? 'unknown';
    if (availability === 'unknown') {
      const bodyText = res.body.slice(0, 200_000);
      availability = OUT_OF_STOCK_MARKERS.test(bodyText)
        ? 'out_of_stock'
        : price !== null
          ? 'in_stock'
          : 'unknown';
    }

    if (price === null && availability === 'in_stock') {
      throw new AdapterError(
        'parse_error',
        'The product page did not expose a price in a readable form',
        { retryable: false },
      );
    }

    const mrp = parsePriceToMinor(firstText(res.body, MRP_SELECTORS) ?? null);

    return {
      identity,
      title: title.replace(/\s+/g, ' ').trim().slice(0, 512),
      imageUrl:
        structured?.imageUrl ??
        meta.imageUrl ??
        firstAttr(res.body, [
          ['img._396cs4', 'src'],
          ['img._2r_T1I', 'src'],
        ]),
      price,
      currency: structured?.currency ?? meta.currency ?? detectCurrency(priceText ?? '₹'),
      availability,
      source: this.source,
      fetchedAt: new Date(),
      metadata: {
        seller: structured?.seller,
        rating: structured?.rating,
        mrp: mrp ?? undefined,
        discountPercent:
          mrp && price && mrp > price ? Math.round(((mrp - price) / mrp) * 100) : undefined,
        provider: this.name,
      },
    };
  }
}
