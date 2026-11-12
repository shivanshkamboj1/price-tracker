import * as cheerio from 'cheerio';
import type { Availability } from '../config/constants';
import { parsePriceToMinor } from '../utils/money';

/**
 * Parsing helpers shared by the public-page providers.
 *
 * Structured data (JSON-LD / microdata) is always preferred: it is the
 * marketplace's own published description of the product, it is stable, and it
 * keeps us out of the business of reverse-engineering markup.
 */

export interface StructuredProduct {
  title?: string;
  imageUrl?: string;
  price?: number; // minor units
  currency?: string;
  availability?: Availability;
  seller?: string;
  rating?: number;
}

const IN_STOCK = /instock|in_stock|limitedavailability|onlineonly|preorder/i;
const OUT_OF_STOCK = /outofstock|out_of_stock|soldout|discontinued|backorder/i;

export function normalizeAvailability(value: unknown): Availability {
  if (typeof value !== 'string') return 'unknown';
  if (OUT_OF_STOCK.test(value)) return 'out_of_stock';
  if (IN_STOCK.test(value)) return 'in_stock';
  return 'unknown';
}

type JsonRecord = Record<string, unknown>;

function asRecord(value: unknown): JsonRecord | null {
  return value && typeof value === 'object' && !Array.isArray(value) ? (value as JsonRecord) : null;
}

function flattenGraph(node: unknown, out: JsonRecord[] = []): JsonRecord[] {
  if (Array.isArray(node)) {
    for (const item of node) flattenGraph(item, out);
    return out;
  }
  const record = asRecord(node);
  if (!record) return out;
  out.push(record);
  if ('@graph' in record) flattenGraph(record['@graph'], out);
  return out;
}

function isProductNode(node: JsonRecord): boolean {
  const type = node['@type'];
  const types = Array.isArray(type) ? type : [type];
  return types.some((t) => typeof t === 'string' && t.toLowerCase() === 'product');
}

function firstOffer(node: JsonRecord): JsonRecord | null {
  const offers = node.offers;
  if (Array.isArray(offers)) {
    for (const offer of offers) {
      const rec = asRecord(offer);
      if (rec) return rec;
    }
    return null;
  }
  const rec = asRecord(offers);
  if (rec && Array.isArray(rec.offers)) {
    const nested = asRecord(rec.offers[0]);
    if (nested) return nested;
  }
  return rec;
}

function firstString(value: unknown): string | undefined {
  if (typeof value === 'string') return value;
  if (Array.isArray(value)) {
    for (const item of value) {
      const found = firstString(item);
      if (found) return found;
    }
  }
  const record = asRecord(value);
  if (record && typeof record.url === 'string') return record.url;
  return undefined;
}

/** Reads schema.org Product data out of a page's JSON-LD blocks. */
export function extractStructuredProduct(html: string): StructuredProduct | null {
  const $ = cheerio.load(html);
  const blocks = $('script[type="application/ld+json"]')
    .map((_, el) => $(el).contents().text())
    .get();

  for (const raw of blocks) {
    let parsed: unknown;
    try {
      parsed = JSON.parse(raw.trim());
    } catch {
      continue;
    }

    for (const node of flattenGraph(parsed)) {
      if (!isProductNode(node)) continue;

      const offer = firstOffer(node);
      const price = offer
        ? parsePriceToMinor(
            (offer.price as string | number | undefined) ??
              (asRecord(offer.priceSpecification)?.price as string | number | undefined) ??
              null,
          )
        : null;

      const result: StructuredProduct = {
        title: typeof node.name === 'string' ? node.name.trim() : undefined,
        imageUrl: firstString(node.image),
        currency:
          (typeof offer?.priceCurrency === 'string' ? offer.priceCurrency : undefined) ?? undefined,
        availability: normalizeAvailability(offer?.availability),
        seller: (() => {
          const sellerNode = asRecord(offer?.seller);
          return typeof sellerNode?.name === 'string' ? sellerNode.name : undefined;
        })(),
        rating: (() => {
          const rating = asRecord(node.aggregateRating);
          const value = rating?.ratingValue;
          const numeric = typeof value === 'string' ? Number.parseFloat(value) : value;
          return typeof numeric === 'number' && Number.isFinite(numeric) ? numeric : undefined;
        })(),
      };
      if (price !== null) result.price = price;

      if (result.title || result.price !== undefined) return result;
    }
  }
  return null;
}

/** Open Graph / meta fallbacks — still the page's own declared metadata. */
export function extractMetaProduct(html: string): StructuredProduct {
  const $ = cheerio.load(html);
  const meta = (selector: string): string | undefined => {
    const value = $(selector).attr('content');
    return value?.trim() || undefined;
  };

  const priceText =
    meta('meta[property="product:price:amount"]') ??
    meta('meta[property="og:price:amount"]') ??
    meta('meta[itemprop="price"]');

  const title =
    meta('meta[property="og:title"]') ?? ($('title').first().text().trim() || undefined);

  const price = priceText ? parsePriceToMinor(priceText) : null;

  const result: StructuredProduct = {
    title,
    imageUrl: meta('meta[property="og:image"]'),
    currency:
      meta('meta[property="product:price:currency"]') ?? meta('meta[property="og:price:currency"]'),
    availability: normalizeAvailability(
      meta('meta[property="product:availability"]') ?? meta('meta[itemprop="availability"]'),
    ),
  };
  if (price !== null) result.price = price;
  return result;
}

/** Picks the first non-empty text among a list of CSS selectors. */
export function firstText(html: string, selectors: string[]): string | undefined {
  const $ = cheerio.load(html);
  for (const selector of selectors) {
    const text = $(selector).first().text().trim();
    if (text) return text;
  }
  return undefined;
}

export function firstAttr(
  html: string,
  candidates: Array<[selector: string, attribute: string]>,
): string | undefined {
  const $ = cheerio.load(html);
  for (const [selector, attribute] of candidates) {
    const value = $(selector).first().attr(attribute)?.trim();
    if (value) return value;
  }
  return undefined;
}
