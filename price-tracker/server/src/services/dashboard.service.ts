import { Types } from 'mongoose';
import { Product, type IProduct } from '../models/Product';
import { PriceHistory } from '../models/PriceHistory';
import { Alert } from '../models/Alert';
import { DAY_MS } from '../utils/time';

export interface DashboardStats {
  trackedProducts: number;
  activeProducts: number;
  pausedProducts: number;
  erroredProducts: number;
  /** Distinct price decreases recorded in the last 30 days. */
  priceDrops: number;
  alertsTriggered: number;
  unreadAlerts: number;
  belowTarget: number;
  /** Biggest observed drop from a product's highest to its lowest price. */
  bestSaving: { amount: number; currency: string; productId: string; title: string } | null;
  lowestPriceFound: { price: number; currency: string; productId: string; title: string } | null;
  byMarketplace: Array<{ marketplace: string; count: number }>;
  nextCheckAt: Date | null;
}

/**
 * All dashboard numbers for one user, computed with aggregations rather than by
 * loading products into memory. Every pipeline starts from `userId`, so the
 * numbers can only ever describe the caller's own data.
 */
export async function getDashboardStats(userId: string): Promise<DashboardStats> {
  const owner = new Types.ObjectId(userId);
  const notDeleted = { userId: owner, deletedAt: { $exists: false } };
  const since = new Date(Date.now() - 30 * DAY_MS);

  const [
    statusCounts,
    priceDrops,
    alertsTriggered,
    unreadAlerts,
    belowTarget,
    savings,
    lowest,
    byMarketplace,
    nextProduct,
  ] = await Promise.all([
    Product.aggregate<{ _id: string; count: number }>([
      { $match: notDeleted },
      { $group: { _id: '$status', count: { $sum: 1 } } },
    ]),

    countPriceDrops(owner, since),

    Alert.countDocuments({ userId: owner, status: 'sent' }),
    Alert.countDocuments({ userId: owner, readAt: { $exists: false } }),

    Product.countDocuments({
      ...notDeleted,
      currentPrice: { $exists: true, $ne: null },
      $expr: { $lte: ['$currentPrice', '$targetPrice'] },
    }),

    Product.aggregate<{ _id: Types.ObjectId; title: string; currency: string; saving: number }>([
      {
        $match: {
          ...notDeleted,
          lowestPrice: { $exists: true },
          highestPrice: { $exists: true },
        },
      },
      { $project: { title: 1, currency: 1, saving: { $subtract: ['$highestPrice', '$lowestPrice'] } } },
      { $sort: { saving: -1 } },
      { $limit: 1 },
    ]),

    Product.find({ ...notDeleted, lowestPrice: { $exists: true } })
      .sort({ lowestPrice: 1 })
      .limit(1)
      .select('title lowestPrice currency')
      .lean<Array<Pick<IProduct, '_id' | 'title' | 'lowestPrice' | 'currency'>>>(),

    Product.aggregate<{ _id: string; count: number }>([
      { $match: notDeleted },
      { $group: { _id: '$marketplace', count: { $sum: 1 } } },
      { $sort: { count: -1 } },
    ]),

    Product.find({ ...notDeleted, status: 'active' })
      .sort({ nextCheckAt: 1 })
      .limit(1)
      .select('nextCheckAt')
      .lean<Array<Pick<IProduct, 'nextCheckAt'>>>(),
  ]);

  const counts = new Map(statusCounts.map((row) => [row._id, row.count]));
  const total = statusCounts.reduce((sum, row) => sum + row.count, 0);
  const best = savings[0];
  const cheapest = lowest[0];

  return {
    trackedProducts: total,
    activeProducts: counts.get('active') ?? 0,
    pausedProducts: counts.get('paused') ?? 0,
    erroredProducts: (counts.get('error') ?? 0) + (counts.get('unavailable') ?? 0),
    priceDrops,
    alertsTriggered,
    unreadAlerts,
    belowTarget,
    bestSaving:
      best && best.saving > 0
        ? {
            amount: best.saving,
            currency: best.currency,
            productId: best._id.toString(),
            title: best.title,
          }
        : null,
    lowestPriceFound:
      cheapest && cheapest.lowestPrice !== undefined
        ? {
            price: cheapest.lowestPrice,
            currency: cheapest.currency,
            productId: cheapest._id.toString(),
            title: cheapest.title,
          }
        : null,
    byMarketplace: byMarketplace.map((row) => ({ marketplace: row._id, count: row.count })),
    nextCheckAt: nextProduct[0]?.nextCheckAt ?? null,
  };
}

/**
 * Counts recorded price decreases by comparing each history point with the
 * previous point for the same product, using a window function so the work
 * happens in the database.
 */
async function countPriceDrops(userId: Types.ObjectId, since: Date): Promise<number> {
  const [row] = await PriceHistory.aggregate<{ drops: number }>([
    { $match: { userId, checkedAt: { $gte: since } } },
    { $sort: { productId: 1, checkedAt: 1 } },
    {
      $setWindowFields: {
        partitionBy: '$productId',
        sortBy: { checkedAt: 1 },
        output: { previousPrice: { $shift: { output: '$price', by: -1, default: null } } },
      },
    },
    {
      $match: {
        previousPrice: { $ne: null },
        $expr: { $lt: ['$price', '$previousPrice'] },
      },
    },
    { $count: 'drops' },
  ]);
  return row?.drops ?? 0;
}

export interface ComparisonRow {
  productId: string;
  title: string;
  nickname?: string;
  marketplace: string;
  imageUrl?: string;
  productUrl: string;
  currentPrice?: number;
  targetPrice: number;
  lowestPrice?: number;
  highestPrice?: number;
  currency: string;
  availability: string;
  lastCheckedAt?: Date;
  comparisonGroup?: string;
}

/**
 * Comparison is explicit: products are only presented side by side when the user
 * put them in the same comparison group, or asked for specific ids. Two listings
 * are never assumed to be the same product because their titles look alike.
 */
export async function compareProducts(
  userId: string,
  options: { ids?: string[]; group?: string },
): Promise<ComparisonRow[]> {
  const filter: Record<string, unknown> = {
    userId: new Types.ObjectId(userId),
    deletedAt: { $exists: false },
  };

  if (options.ids?.length) {
    filter._id = { $in: options.ids.filter(Types.ObjectId.isValid).map((id) => new Types.ObjectId(id)) };
  } else if (options.group) {
    filter.comparisonGroup = options.group;
  } else {
    return [];
  }

  const products = await Product.find(filter)
    .select(
      'title nickname marketplace imageUrl productUrl currentPrice targetPrice lowestPrice highestPrice currency availability lastCheckedAt comparisonGroup',
    )
    .sort({ currentPrice: 1 })
    .lean<IProduct[]>();

  return products.map((p) => ({
    productId: p._id.toString(),
    title: p.title,
    nickname: p.nickname,
    marketplace: p.marketplace,
    imageUrl: p.imageUrl,
    productUrl: p.productUrl,
    currentPrice: p.currentPrice,
    targetPrice: p.targetPrice,
    lowestPrice: p.lowestPrice,
    highestPrice: p.highestPrice,
    currency: p.currency,
    availability: p.availability,
    lastCheckedAt: p.lastCheckedAt,
    comparisonGroup: p.comparisonGroup,
  }));
}

/** The comparison groups a user has created, with how many products each holds. */
export async function listComparisonGroups(
  userId: string,
): Promise<Array<{ group: string; count: number }>> {
  const rows = await Product.aggregate<{ _id: string; count: number }>([
    {
      $match: {
        userId: new Types.ObjectId(userId),
        deletedAt: { $exists: false },
        comparisonGroup: { $exists: true, $ne: null },
      },
    },
    { $group: { _id: '$comparisonGroup', count: { $sum: 1 } } },
    { $sort: { count: -1 } },
  ]);
  return rows.map((row) => ({ group: row._id, count: row.count }));
}
