import { Types } from 'mongoose';
import { env } from '../config/env';
import type { Availability, PriceSource } from '../config/constants';
import { PriceHistory, type IPriceHistory } from '../models/PriceHistory';
import { MINUTE_MS } from '../utils/time';

export type HistoryRange = '24h' | '7d' | '30d' | '3m' | 'all';

const RANGE_MS: Record<Exclude<HistoryRange, 'all'>, number> = {
  '24h': 24 * 60 * MINUTE_MS,
  '7d': 7 * 24 * 60 * MINUTE_MS,
  '30d': 30 * 24 * 60 * MINUTE_MS,
  '3m': 90 * 24 * 60 * MINUTE_MS,
};

export interface RecordPriceInput {
  productId: Types.ObjectId | string;
  userId: Types.ObjectId | string;
  price: number;
  currency: string;
  availability: Availability;
  source: PriceSource;
  checkedAt?: Date;
  metadata?: Record<string, unknown>;
}

/**
 * Appends a price point for a successful check.
 *
 * Every check is recorded by default, including unchanged prices, so the chart
 * shows a continuous line for the whole period a product has been tracked.
 * Setting `HISTORY_DEDUPE_WINDOW_MIN` above zero re-enables thinning: an
 * unchanged reading is then written at most once per window.
 *
 * `created` is false only when dedupe skipped the write; `changed` says whether
 * the price or availability differs from the previous point.
 */
export async function recordPricePoint(
  input: RecordPriceInput,
): Promise<{ created: boolean; changed: boolean }> {
  const checkedAt = input.checkedAt ?? new Date();

  const latest = await PriceHistory.findOne({ productId: input.productId })
    .sort({ checkedAt: -1 })
    .lean<IPriceHistory>();

  const changed =
    !latest || latest.price !== input.price || latest.availability !== input.availability;

  if (!changed) {
    const windowMs = env.HISTORY_DEDUPE_WINDOW_MIN * MINUTE_MS;
    const age = checkedAt.getTime() - new Date(latest.checkedAt).getTime();
    if (windowMs > 0 && age < windowMs) {
      return { created: false, changed: false };
    }
  }

  await PriceHistory.create({
    productId: input.productId,
    userId: input.userId,
    price: input.price,
    currency: input.currency,
    availability: input.availability,
    checkedAt,
    source: input.source,
    metadata: input.metadata,
  });

  return { created: true, changed };
}

/** Most points a single chart request returns; longer ranges are downsampled. */
export const MAX_CHART_POINTS = 1500;

/** Each bucket contributes up to three points: its lowest, highest and latest reading. */
const POINTS_PER_BUCKET = 3;

/**
 * Price points for one product, oldest first.
 *
 * With every check recorded, a long range can hold tens of thousands of rows
 * (a 15-minute interval is ~2,900 a month). Beyond `maxPoints` the range is
 * split into equal time buckets and each bucket keeps its lowest, highest and
 * latest reading. Dips and spikes survive, flat stretches collapse to one or two
 * points, and the final point is always the most recent check.
 */
export async function getHistory(
  productId: string,
  range: HistoryRange = '30d',
  maxPoints = MAX_CHART_POINTS,
): Promise<IPriceHistory[]> {
  const filter: Record<string, unknown> = { productId: new Types.ObjectId(productId) };
  if (range !== 'all') {
    filter.checkedAt = { $gte: new Date(Date.now() - RANGE_MS[range]) };
  }

  const [span] = await PriceHistory.aggregate<{ count: number; from: Date; to: Date }>([
    { $match: filter },
    {
      $group: {
        _id: null,
        count: { $sum: 1 },
        from: { $min: '$checkedAt' },
        to: { $max: '$checkedAt' },
      },
    },
  ]);

  if (!span) return [];

  if (span.count <= maxPoints) {
    return PriceHistory.find(filter, { metadata: 0 })
      .sort({ checkedAt: 1 })
      .lean<IPriceHistory[]>();
  }

  const buckets = Math.max(1, Math.floor(maxPoints / POINTS_PER_BUCKET));
  const from = new Date(span.from).getTime();
  const spanMs = new Date(span.to).getTime() - from;
  const bucketMs = Math.max(1, Math.ceil((spanMs + 1) / buckets));

  const groups = await PriceHistory.aggregate<{
    low: IPriceHistory;
    high: IPriceHistory;
    latest: IPriceHistory;
  }>([
    { $match: filter },
    { $project: { metadata: 0 } },
    {
      $group: {
        _id: {
          $floor: { $divide: [{ $subtract: [{ $toLong: '$checkedAt' }, from] }, bucketMs] },
        },
        low: { $top: { sortBy: { price: 1, checkedAt: 1 }, output: '$$ROOT' } },
        high: { $top: { sortBy: { price: -1, checkedAt: 1 }, output: '$$ROOT' } },
        latest: { $top: { sortBy: { checkedAt: -1 }, output: '$$ROOT' } },
      },
    },
  ]);

  const unique = new Map<string, IPriceHistory>();
  for (const group of groups) {
    for (const point of [group.low, group.high, group.latest]) {
      unique.set(point._id.toString(), point);
    }
  }

  return [...unique.values()].sort(
    (a, b) => new Date(a.checkedAt).getTime() - new Date(b.checkedAt).getTime(),
  );
}

export interface PriceStats {
  points: number;
  lowest: number | null;
  highest: number | null;
  average: number | null;
  first: number | null;
  last: number | null;
  firstAt: Date | null;
  lastAt: Date | null;
}

export async function getStats(productId: string, range: HistoryRange = 'all'): Promise<PriceStats> {
  const match: Record<string, unknown> = { productId: new Types.ObjectId(productId) };
  if (range !== 'all') {
    match.checkedAt = { $gte: new Date(Date.now() - RANGE_MS[range]) };
  }

  const [result] = await PriceHistory.aggregate<{
    points: number;
    lowest: number;
    highest: number;
    average: number;
    first: number;
    last: number;
    firstAt: Date;
    lastAt: Date;
  }>([
    { $match: match },
    { $sort: { checkedAt: 1 } },
    {
      $group: {
        _id: null,
        points: { $sum: 1 },
        lowest: { $min: '$price' },
        highest: { $max: '$price' },
        average: { $avg: '$price' },
        first: { $first: '$price' },
        last: { $last: '$price' },
        firstAt: { $first: '$checkedAt' },
        lastAt: { $last: '$checkedAt' },
      },
    },
  ]);

  if (!result) {
    return {
      points: 0,
      lowest: null,
      highest: null,
      average: null,
      first: null,
      last: null,
      firstAt: null,
      lastAt: null,
    };
  }

  return {
    points: result.points,
    lowest: result.lowest,
    highest: result.highest,
    average: Math.round(result.average),
    first: result.first,
    last: result.last,
    firstAt: result.firstAt,
    lastAt: result.lastAt,
  };
}
