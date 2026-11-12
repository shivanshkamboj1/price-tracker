import { Types, type FilterQuery } from 'mongoose';
import { env } from '../config/env';
import {
  CHECK_INTERVAL_CHOICES,
  type AlertMode,
  type Marketplace,
  type NotificationChannel,
  type ProductStatus,
} from '../config/constants';
import { Product, type IProduct, type ProductDocument } from '../models/Product';
import { PriceHistory } from '../models/PriceHistory';
import { Alert } from '../models/Alert';
import { resolveProductUrl } from '../adapters/factory';
import { badRequest, conflict, notFound } from '../utils/errors';
import { toMinor } from '../utils/money';

export interface CreateProductInput {
  productUrl: string;
  targetPrice: number; // major units from the client
  checkInterval: number; // minutes
  nickname?: string;
  notificationChannel?: NotificationChannel;
  alertMode?: AlertMode;
  comparisonGroup?: string;
  /** Optional client hint. Only used to warn about a mismatch — never trusted. */
  marketplace?: Marketplace;
}

export interface UpdateProductInput {
  targetPrice?: number;
  checkInterval?: number;
  nickname?: string | null;
  notificationChannel?: NotificationChannel;
  alertMode?: AlertMode;
  comparisonGroup?: string | null;
  status?: Extract<ProductStatus, 'active' | 'paused'>;
}

export interface ListProductsQuery {
  status?: ProductStatus;
  marketplace?: Marketplace;
  search?: string;
  sort?: 'newest' | 'priceAsc' | 'priceDesc' | 'closestToTarget';
  page: number;
  limit: number;
}

function assertInterval(minutes: number): void {
  if (!CHECK_INTERVAL_CHOICES.includes(minutes as (typeof CHECK_INTERVAL_CHOICES)[number])) {
    throw badRequest(
      `Check interval must be one of: ${CHECK_INTERVAL_CHOICES.join(', ')} minutes`,
    );
  }
  if (minutes < env.MIN_CHECK_INTERVAL_MIN) {
    throw badRequest(`Checks cannot run more often than every ${env.MIN_CHECK_INTERVAL_MIN} minutes`);
  }
}

/** A readable placeholder until the first successful check fills in the real title. */
function provisionalTitle(canonicalUrl: string, externalProductId: string): string {
  try {
    const { pathname } = new URL(canonicalUrl);
    const slug = pathname.split('/').find((part) => part.length > 12 && /[a-z]-[a-z]/i.test(part));
    if (slug) {
      return decodeURIComponent(slug)
        .replace(/-/g, ' ')
        .replace(/\s+/g, ' ')
        .trim()
        .slice(0, 200);
    }
  } catch {
    /* fall through to the id */
  }
  return externalProductId;
}

/**
 * Creates a tracked product.
 *
 * The marketplace is derived from the URL host, never from the request body, and
 * the URL is canonicalised before it is stored. No upstream request happens
 * here: the API server never talks to a marketplace. Instead the product is
 * created in a "pending first check" state and a job is enqueued by the caller.
 */
export async function createProduct(
  userId: string,
  input: CreateProductInput,
): Promise<ProductDocument> {
  assertInterval(input.checkInterval);

  const { adapter, identity } = resolveProductUrl(input.productUrl);

  if (input.marketplace && input.marketplace !== identity.marketplace) {
    throw badRequest(
      `That link points to ${adapter.label}, which does not match the marketplace you selected`,
    );
  }

  const count = await Product.countDocuments({ userId, deletedAt: { $exists: false } });
  if (count >= env.MAX_PRODUCTS_PER_USER) {
    throw conflict(`You can track at most ${env.MAX_PRODUCTS_PER_USER} products`);
  }

  const duplicate = await Product.findOne({
    userId,
    marketplace: identity.marketplace,
    externalProductId: identity.externalProductId,
    deletedAt: { $exists: false },
  });
  if (duplicate) throw conflict('You are already tracking this product');

  return Product.create({
    userId: new Types.ObjectId(userId),
    marketplace: identity.marketplace,
    productUrl: identity.canonicalUrl,
    externalProductId: identity.externalProductId,
    title: provisionalTitle(identity.canonicalUrl, identity.externalProductId),
    nickname: input.nickname,
    targetPrice: toMinor(input.targetPrice),
    checkInterval: input.checkInterval,
    nextCheckAt: new Date(),
    status: 'active',
    availability: 'unknown',
    notificationChannel: input.notificationChannel,
    alertMode: input.alertMode,
    comparisonGroup: input.comparisonGroup,
  });
}

/** Every read goes through here so ownership is always part of the query. */
export async function getOwnedProduct(userId: string, productId: string): Promise<ProductDocument> {
  if (!Types.ObjectId.isValid(productId)) throw notFound('Product not found');
  const product = await Product.findOne({
    _id: productId,
    userId,
    deletedAt: { $exists: false },
  });
  if (!product) throw notFound('Product not found');
  return product;
}

export async function listProducts(
  userId: string,
  query: ListProductsQuery,
): Promise<{ items: IProduct[]; total: number; page: number; limit: number }> {
  const filter: FilterQuery<IProduct> = { userId, deletedAt: { $exists: false } };
  if (query.status) filter.status = query.status;
  if (query.marketplace) filter.marketplace = query.marketplace;
  if (query.search) {
    // Escaped so a user's search string can never act as a regex.
    const escaped = query.search.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    filter.$or = [
      { title: { $regex: escaped, $options: 'i' } },
      { nickname: { $regex: escaped, $options: 'i' } },
    ];
  }

  const sort: Record<string, 1 | -1> =
    query.sort === 'priceAsc'
      ? { currentPrice: 1 }
      : query.sort === 'priceDesc'
        ? { currentPrice: -1 }
        : { createdAt: -1 };

  const [items, total] = await Promise.all([
    Product.find(filter)
      .sort(sort)
      .skip((query.page - 1) * query.limit)
      .limit(query.limit)
      .lean<IProduct[]>(),
    Product.countDocuments(filter),
  ]);

  if (query.sort === 'closestToTarget') {
    items.sort((a, b) => {
      const da = a.currentPrice ? a.currentPrice - a.targetPrice : Number.MAX_SAFE_INTEGER;
      const db = b.currentPrice ? b.currentPrice - b.targetPrice : Number.MAX_SAFE_INTEGER;
      return da - db;
    });
  }

  return { items, total, page: query.page, limit: query.limit };
}

export async function updateProduct(
  userId: string,
  productId: string,
  input: UpdateProductInput,
): Promise<ProductDocument> {
  const product = await getOwnedProduct(userId, productId);

  if (input.targetPrice !== undefined) {
    product.targetPrice = toMinor(input.targetPrice);
    // A new target restarts the alert cycle for "notify once".
    product.alertArmed = false;
  }
  if (input.checkInterval !== undefined) {
    assertInterval(input.checkInterval);
    product.checkInterval = input.checkInterval;
    product.nextCheckAt = new Date(Date.now() + input.checkInterval * 60_000);
  }
  if (input.nickname !== undefined) product.nickname = input.nickname ?? undefined;
  if (input.notificationChannel !== undefined) product.notificationChannel = input.notificationChannel;
  if (input.alertMode !== undefined) product.alertMode = input.alertMode;
  if (input.comparisonGroup !== undefined) {
    product.comparisonGroup = input.comparisonGroup ?? undefined;
  }
  if (input.status !== undefined) {
    product.status = input.status;
    if (input.status === 'active') {
      // Resuming clears the failure ladder and schedules a prompt check.
      product.consecutiveFailures = 0;
      product.nextCheckAt = new Date();
    }
  }

  await product.save();
  return product;
}

/**
 * Soft delete. History and alerts are removed with the product so a deletion is
 * a real deletion from the user's point of view, but the document is retained
 * briefly to keep in-flight jobs from resurrecting it.
 */
export async function deleteProduct(userId: string, productId: string): Promise<void> {
  const product = await getOwnedProduct(userId, productId);
  product.status = 'deleted';
  product.deletedAt = new Date();
  await product.save();
  await Promise.all([
    PriceHistory.deleteMany({ productId: product._id }),
    Alert.deleteMany({ productId: product._id }),
  ]);
}

export async function countActiveProducts(userId: string): Promise<number> {
  return Product.countDocuments({ userId, status: 'active', deletedAt: { $exists: false } });
}
