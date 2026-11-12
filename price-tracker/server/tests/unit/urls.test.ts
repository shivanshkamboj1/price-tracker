import { normalizeAmazonUrl } from '../../src/adapters/amazon/urls';
import { normalizeFlipkartUrl } from '../../src/adapters/flipkart/urls';
import { detectAdapter, resolveProductUrl } from '../../src/adapters/factory';
import { AdapterError } from '../../src/utils/errors';

describe('Amazon URL normalisation', () => {
  it('extracts the ASIN and drops tracking parameters', () => {
    const identity = normalizeAmazonUrl(
      'https://www.amazon.in/Apple-AirPods-Pro-2nd-Generation/dp/B0CHWRXH8B/ref=sr_1_3?tag=affiliate-21&th=1',
    );

    expect(identity).toEqual({
      marketplace: 'amazon_in',
      externalProductId: 'B0CHWRXH8B',
      canonicalUrl: 'https://www.amazon.in/dp/B0CHWRXH8B',
    });
  });

  it('accepts the /gp/product and mobile forms', () => {
    expect(normalizeAmazonUrl('https://amazon.in/gp/product/B08L5VG843').externalProductId).toBe(
      'B08L5VG843',
    );
    expect(normalizeAmazonUrl('https://www.amazon.in/gp/aw/d/B08L5VG843/').externalProductId).toBe(
      'B08L5VG843',
    );
  });

  it('gives the same identity for two different links to one product', () => {
    const a = normalizeAmazonUrl('https://www.amazon.in/dp/B0CHWRXH8B?tag=one-21');
    const b = normalizeAmazonUrl('https://www.amazon.in/Some-Title/dp/B0CHWRXH8B/ref=xyz');
    expect(a.canonicalUrl).toBe(b.canonicalUrl);
  });

  it('rejects a non-Amazon host', () => {
    expect(() => normalizeAmazonUrl('https://example.com/dp/B0CHWRXH8B')).toThrow(AdapterError);
  });

  it('rejects a link with no product id', () => {
    expect(() => normalizeAmazonUrl('https://www.amazon.in/s?k=airpods')).toThrow(
      /Could not find a product id/,
    );
  });

  it('rejects a malformed URL', () => {
    expect(() => normalizeAmazonUrl('not a url')).toThrow(/valid URL/);
  });
});

describe('Flipkart URL normalisation', () => {
  it('keeps the product slug and the pid, dropping everything else', () => {
    const identity = normalizeFlipkartUrl(
      'https://www.flipkart.com/apple-airpods-pro-2nd-gen/p/itm123abc?pid=ACCGSXYZ12345678&lid=LSTxyz&marketplace=FLIPKART&srno=s_1_1',
    );

    expect(identity.marketplace).toBe('flipkart');
    expect(identity.externalProductId).toBe('ACCGSXYZ12345678');
    expect(identity.canonicalUrl).toBe(
      'https://www.flipkart.com/apple-airpods-pro-2nd-gen/p/itm123abc?pid=ACCGSXYZ12345678',
    );
  });

  it('falls back to the itm id when no pid is present, without writing it into the URL', () => {
    const identity = normalizeFlipkartUrl('https://www.flipkart.com/some-product/p/itmf3a9b8c7d');
    expect(identity.externalProductId).toBe('ITMF3A9B8C7D');
    // Flipkart answers an unknown pid with a generic page, so none is invented.
    expect(identity.canonicalUrl).toBe('https://www.flipkart.com/some-product/p/itmf3a9b8c7d');
  });

  it('drops a pid that only repeats the itm id, as earlier versions stored it', () => {
    const identity = normalizeFlipkartUrl(
      'https://www.flipkart.com/samsung-galaxy-watch-8/p/itm9c75e1ed10471?pid=ITM9C75E1ED10471',
    );
    expect(identity.externalProductId).toBe('ITM9C75E1ED10471');
    expect(identity.canonicalUrl).toBe(
      'https://www.flipkart.com/samsung-galaxy-watch-8/p/itm9c75e1ed10471',
    );
  });

  it('rejects a search or listing page', () => {
    expect(() =>
      normalizeFlipkartUrl('https://www.flipkart.com/search?q=airpods&pid=ACCGSXYZ12345678'),
    ).toThrow(/search or listing page/);
  });
});

describe('marketplace detection', () => {
  it('derives the marketplace from the URL host rather than any client input', () => {
    expect(detectAdapter('https://www.amazon.in/dp/B0CHWRXH8B').marketplace).toBe('amazon_in');
    expect(
      detectAdapter('https://www.flipkart.com/x/p/itm1?pid=ACCGSXYZ12345678').marketplace,
    ).toBe('flipkart');
  });

  it('names the supported marketplaces when the host is unknown', () => {
    expect(() => detectAdapter('https://www.myntra.com/thing/123')).toThrow(
      /not a supported marketplace/,
    );
  });

  it('resolves adapter and identity together', () => {
    const { adapter, identity } = resolveProductUrl('https://www.amazon.in/dp/B0CHWRXH8B');
    expect(adapter.marketplace).toBe('amazon_in');
    expect(identity.externalProductId).toBe('B0CHWRXH8B');
  });
});
