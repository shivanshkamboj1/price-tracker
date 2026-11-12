import { Types } from 'mongoose';
import { clearDatabase, startTestDatabase, stopTestDatabase } from '../helpers/db';
import { PriceHistory } from '../../src/models/PriceHistory';
import { getHistory, getStats } from '../../src/services/history.service';

beforeAll(startTestDatabase);
afterEach(clearDatabase);
afterAll(stopTestDatabase);

const MINUTE = 60_000;

async function seedSeries(prices: number[], stepMinutes = 15) {
  const productId = new Types.ObjectId();
  const userId = new Types.ObjectId();
  const start = Date.now() - prices.length * stepMinutes * MINUTE;

  await PriceHistory.insertMany(
    prices.map((price, i) => ({
      productId,
      userId,
      price,
      currency: 'INR',
      availability: 'in_stock',
      source: 'public_page',
      checkedAt: new Date(start + i * stepMinutes * MINUTE),
      metadata: { jobId: `job-${i}` },
    })),
  );

  return productId.toString();
}

describe('getHistory', () => {
  it('returns every point, oldest first, when the range is small', async () => {
    const id = await seedSeries([100, 100, 100, 90, 90]);

    const points = await getHistory(id, 'all');

    expect(points.map((p) => p.price)).toEqual([100, 100, 100, 90, 90]);
    expect(points[0]!.metadata).toBeUndefined();
  });

  it('downsamples long ranges while keeping dips, spikes and the latest check', async () => {
    const prices = Array.from({ length: 5000 }, () => 100_000);
    prices[1234] = 54_321; // a brief dip
    prices[3900] = 199_999; // a brief spike
    prices[4999] = 120_000; // the most recent check

    const id = await seedSeries(prices);
    const all = await PriceHistory.find({ productId: id }).sort({ checkedAt: 1 }).lean();

    const points = await getHistory(id, 'all', 300);

    expect(points.length).toBeLessThanOrEqual(300);
    expect(points.length).toBeGreaterThan(50);

    const values = points.map((p) => p.price);
    expect(values).toContain(54_321);
    expect(values).toContain(199_999);

    const times = points.map((p) => new Date(p.checkedAt).getTime());
    expect(times).toEqual([...times].sort((a, b) => a - b));
    expect(times[0]).toBe(new Date(all[0]!.checkedAt).getTime());
    expect(points[points.length - 1]!.price).toBe(120_000);
    expect(times[times.length - 1]).toBe(new Date(all[all.length - 1]!.checkedAt).getTime());

    // Stats still see every stored row, not the sampled ones.
    const stats = await getStats(id, 'all');
    expect(stats.points).toBe(5000);
  });

  it('returns nothing for a product with no history', async () => {
    expect(await getHistory(new Types.ObjectId().toString(), 'all')).toEqual([]);
  });
});
