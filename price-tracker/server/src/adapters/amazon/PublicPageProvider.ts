import { env } from '../../config/env';
import { AdapterError } from '../../utils/errors';
import { detectCurrency, parsePriceToMinor } from '../../utils/money';
import { HttpClient } from '../http/HttpClient';
import { extractMetaProduct, extractStructuredProduct, firstAttr, firstText } from '../parsing';
import type { FetchContext, ProductDataProvider, ProductIdentity, ProductSnapshot } from '../types';

/**
 * Reads the publicly reachable product page.
 *
 * Constraints this provider operates under, all enforced by `HttpClient`:
 *   - robots.txt is checked first and honoured
 *   - one honest, contactable User-Agent, no spoofing or rotation
 *   - a cluster-wide request budget, a minimum gap and random jitter
 *   - a circuit breaker that stops asking after repeated refusals
 *
 * If Amazon answers with a verification challenge the check is recorded as
 * `blocked` and the product backs off. There is no attempt to work around it.
 * Operators who need higher volume should configure PA-API or a licensed
 * provider instead — that is a config change, not a code change.
 */
const PRICE_SELECTORS = [
  '#corePriceDisplay_desktop_feature_div .a-price .a-offscreen',
  '#corePrice_feature_div .a-price .a-offscreen',
  '#priceblock_ourprice',
  '#priceblock_dealprice',
  '.a-price .a-offscreen',
];

const TITLE_SELECTORS = ['#productTitle', 'h1#title', 'h1.a-size-large'];

const AVAILABILITY_SELECTORS = ['#availability span', '#availability', '#outOfStock'];

const MRP_SELECTORS = [
  '.basisPrice .a-price .a-offscreen',
  '#corePriceDisplay_desktop_feature_div .a-text-price .a-offscreen',
  '.priceBlockStrikePriceString',
];

export class AmazonPublicPageProvider implements ProductDataProvider {
  readonly name = 'amazon-public-page';
  readonly source = 'public_page' as const;

  private readonly http = new HttpClient({
    marketplace: 'amazon_in',
    enforceRobots: true,
  });

  isConfigured(): boolean {
    return env.AMAZON_DATA_SOURCE === 'public';
  }

  async fetchProduct(identity: ProductIdentity, ctx: FetchContext): Promise<ProductSnapshot> {
    const res = await this.http.get(identity.canonicalUrl, {
      // Only present when the user explicitly connected their own browser
      // session; the backend never obtains this by asking for credentials.
      cookie: ctx.userSession,
    });

    const structured = extractStructuredProduct(res.body);
    const meta = extractMetaProduct(res.body);

    const priceText = firstText(res.body, PRICE_SELECTORS);
    const price = structured?.price ?? meta.price ?? parsePriceToMinor(priceText ?? null);

    const title =
      firstText(res.body, TITLE_SELECTORS) ??
      structured?.title ??
      meta.title ??
      identity.externalProductId;

    const availabilityText = firstText(res.body, AVAILABILITY_SELECTORS);
    let availability = structured?.availability ?? 'unknown';
    if (availability === 'unknown' && availabilityText) {
      availability = /in stock|usually dispatched|only \d+ left/i.test(availabilityText)
        ? 'in_stock'
        : /unavailable|out of stock|currently unavailable/i.test(availabilityText)
          ? 'out_of_stock'
          : 'unknown';
    }
    if (availability === 'unknown' && meta.availability) availability = meta.availability;
    if (availability === 'unknown') availability = price === null ? 'out_of_stock' : 'in_stock';

    if (price === null && availability === 'in_stock') {
      throw new AdapterError(
        'parse_error',
        'The product page did not expose a price in a readable form',
        { retryable: false },
      );
    }

    const imageUrl =
      structured?.imageUrl ??
      meta.imageUrl ??
      firstAttr(res.body, [
        ['#landingImage', 'src'],
        ['#imgBlkFront', 'src'],
        ['#main-image', 'src'],
      ]);

    const mrp = parsePriceToMinor(firstText(res.body, MRP_SELECTORS) ?? null);

    return {
      identity,
      title: title.replace(/\s+/g, ' ').trim().slice(0, 512),
      imageUrl,
      price,
      currency: structured?.currency ?? meta.currency ?? detectCurrency(priceText ?? '₹'),
      availability,
      source: this.source,
      fetchedAt: new Date(),
      metadata: {
        seller: structured?.seller,
        mrp: mrp ?? undefined,
        rating: structured?.rating,
        discountPercent:
          mrp && price && mrp > price ? Math.round(((mrp - price) / mrp) * 100) : undefined,
        provider: this.name,
      },
    };
  }
}
