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
 * Appends a price point unless an identical one already exists inside the
 * dedupe window. A flat price for a week should be one row a day, not one row
 * every fifteen minutes — the chart looks the same and the collection stays small.
 *
 * Returns the created document, or null when the write was skipped.
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

export async function getHistory(
  productId: string,
  range: HistoryRange = '30d',
  limit = 2000,
): Promise<IPriceHistory[]> {
  const filter: Record<string, unknown> = { productId: new Types.ObjectId(productId) };
  if (range !== 'all') {
    filter.checkedAt = { $gte: new Date(Date.now() - RANGE_MS[range]) };
  }
  return PriceHistory.find(filter)
    .sort({ checkedAt: 1 })
    .limit(limit)
    .lean<IPriceHistory[]>();
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
