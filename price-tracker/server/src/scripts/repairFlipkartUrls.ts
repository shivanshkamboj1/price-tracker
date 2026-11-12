process.env.SERVICE_NAME ??= 'repair-flipkart-urls';

import '../config/runtime';

import { normalizeFlipkartUrl } from '../adapters/flipkart/urls';
import { connectDatabase, disconnectDatabase } from '../config/db';
import { logger } from '../config/logger';
import { Product } from '../models/Product';

/**
 * Rewrites stored Flipkart product URLs with the current normaliser.
 *
 * Earlier versions turned a link without a `pid` into `?pid=ITM…` (the listing
 * id). Flipkart answers that with a generic "All Categories" page, so those
 * products never got a price. Price checks fetch the stored URL as-is, so the
 * fix to the normaliser alone does not reach them.
 *
 * Only the URL changes; `externalProductId` is the same either way. Safe to run
 * more than once — rows that are already canonical are left alone.
 *
 *   node dist/scripts/repairFlipkartUrls.js
 */
async function main(): Promise<void> {
  await connectDatabase();

  const products = await Product.find({ marketplace: 'flipkart' })
    .select('_id productUrl')
    .lean();

  let repaired = 0;
  for (const product of products) {
    const productId = product._id.toString();

    let canonicalUrl: string;
    try {
      ({ canonicalUrl } = normalizeFlipkartUrl(product.productUrl));
    } catch (err) {
      logger.warn({ productId, productUrl: product.productUrl, err }, 'skipped: stored URL does not normalise');
      continue;
    }
    if (canonicalUrl === product.productUrl) continue;

    await Product.updateOne({ _id: product._id }, { $set: { productUrl: canonicalUrl } });
    logger.info({ productId, from: product.productUrl, to: canonicalUrl }, 'product URL repaired');
    repaired += 1;
  }

  logger.info({ checked: products.length, repaired }, 'flipkart URL repair finished');
  await disconnectDatabase();
}

main().catch((err) => {
  logger.fatal({ err }, 'flipkart URL repair failed');
  process.exit(1);
});
