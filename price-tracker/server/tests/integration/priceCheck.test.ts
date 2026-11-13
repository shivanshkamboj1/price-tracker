import { clearDatabase, startTestDatabase, stopTestDatabase } from '../helpers/db';
import { Product, type ProductDocument } from '../../src/models/Product';
import { PriceHistory } from '../../src/models/PriceHistory';
import { Alert } from '../../src/models/Alert';
import { JobLog } from '../../src/models/JobLog';
import { User } from '../../src/models/User';
import { WHATSAPP_ACCOUNT_ID, WhatsAppAccount } from '../../src/models/WhatsApp';
import { runPriceCheck } from '../../src/services/priceCheck.service';
import { runSchedulerTick } from '../../src/scheduler/scheduler';
import { enqueueNotification, enqueuePriceCheck } from '../../src/queues';
import { AdapterError } from '../../src/utils/errors';
import * as factory from '../../src/adapters/factory';
import type { ProductSnapshot } from '../../src/adapters/types';

/**
 * The adapter is stubbed so these tests cover the pipeline — product state,
 * history, alerts, job logs and the backoff ladder — without any network access.
 * That separation is exactly what the adapter interface exists for.
 */
const getProductDetails = jest.fn();

jest.spyOn(factory, 'getAdapter').mockReturnValue({
  marketplace: 'amazon_in',
  label: 'Amazon India',
  dataSource: 'public',
  supports: () => true,
  normalizeProductUrl: () => ({
    marketplace: 'amazon_in',
    externalProductId: 'B0CHWRXH8B',
    canonicalUrl: 'https://www.amazon.in/dp/B0CHWRXH8B',
  }),
  getProductDetails,
  getCurrentPrice: jest.fn(),
  getAvailability: jest.fn(),
});

function snapshot(overrides: Partial<ProductSnapshot> = {}): ProductSnapshot {
  return {
    identity: {
      marketplace: 'amazon_in',
      externalProductId: 'B0CHWRXH8B',
      canonicalUrl: 'https://www.amazon.in/dp/B0CHWRXH8B',
    },
    title: 'Apple AirPods Pro (2nd generation)',
    imageUrl: 'https://cdn.example/airpods.jpg',
    price: 2_499_900,
    currency: 'INR',
    availability: 'in_stock',
    source: 'public_page',
    fetchedAt: new Date(),
    ...overrides,
  };
}

async function seed(
  productOverrides: Partial<Record<string, unknown>> = {},
  userOverrides: Partial<Record<string, unknown>> = {},
): Promise<ProductDocument> {
  // SMS by default: the logging transport stands in for Twilio, so alerts can go out.
  const { notificationPrefs, ...rest } = userOverrides;
  const user = await User.create({
    email: `owner${Date.now()}${Math.random()}@example.com`,
    name: 'Owner',
    passwordHash: 'placeholder-hash',
    phone: '+919876543210',
    timezone: 'Asia/Kolkata',
    notificationPrefs: { channels: ['sms'], ...(notificationPrefs as object | undefined) },
    ...rest,
  });

  return Product.create({
    userId: user._id,
    marketplace: 'amazon_in',
    productUrl: 'https://www.amazon.in/dp/B0CHWRXH8B',
    externalProductId: 'B0CHWRXH8B',
    title: 'B0CHWRXH8B',
    targetPrice: 2_000_000, // ₹20,000
    checkInterval: 360,
    nextCheckAt: new Date(),
    status: 'active',
    ...productOverrides,
  });
}

beforeAll(startTestDatabase);
afterAll(stopTestDatabase);
afterEach(async () => {
  await clearDatabase();
  getProductDetails.mockReset();
});

describe('successful check', () => {
  it('updates the product, records history and logs the job', async () => {
    const product = await seed();
    getProductDetails.mockResolvedValue(snapshot());

    const outcome = await runPriceCheck(product._id.toString(), {
      jobId: 'job-1',
      trigger: 'scheduled',
    });

    expect(outcome).toMatchObject({ result: 'success', price: 2_499_900 });

    const updated = await Product.findById(product._id);
    expect(updated).toMatchObject({
      title: 'Apple AirPods Pro (2nd generation)',
      currentPrice: 2_499_900,
      lowestPrice: 2_499_900,
      highestPrice: 2_499_900,
      availability: 'in_stock',
      status: 'active',
      consecutiveFailures: 0,
    });
    expect(updated!.nextCheckAt.getTime()).toBeGreaterThan(Date.now());

    expect(await PriceHistory.countDocuments({ productId: product._id })).toBe(1);

    const log = await JobLog.findOne({ jobId: 'job-1' });
    expect(log).toMatchObject({ result: 'success', marketplace: 'amazon_in', source: 'public_page' });
    expect(log!.durationMs).toBeGreaterThanOrEqual(0);
  });

  it('tracks the lowest and highest prices seen', async () => {
    const product = await seed();

    getProductDetails.mockResolvedValue(snapshot({ price: 2_499_900 }));
    await runPriceCheck(product._id.toString(), { jobId: 'j1', trigger: 'scheduled' });

    getProductDetails.mockResolvedValue(snapshot({ price: 2_199_900 }));
    await runPriceCheck(product._id.toString(), { jobId: 'j2', trigger: 'scheduled' });

    getProductDetails.mockResolvedValue(snapshot({ price: 2_699_900 }));
    await runPriceCheck(product._id.toString(), { jobId: 'j3', trigger: 'scheduled' });

    const updated = await Product.findById(product._id);
    expect(updated).toMatchObject({
      currentPrice: 2_699_900,
      lowestPrice: 2_199_900,
      highestPrice: 2_699_900,
      previousPrice: 2_199_900,
    });
  });

  it('records every check, even when the price is unchanged', async () => {
    const product = await seed();
    getProductDetails.mockResolvedValue(snapshot({ price: 2_499_900 }));

    await runPriceCheck(product._id.toString(), { jobId: 'a', trigger: 'scheduled' });
    await runPriceCheck(product._id.toString(), { jobId: 'b', trigger: 'scheduled' });
    await runPriceCheck(product._id.toString(), { jobId: 'c', trigger: 'scheduled' });

    const rows = await PriceHistory.find({ productId: product._id }).lean();
    expect(rows).toHaveLength(3);
    expect(rows.every((row) => row.price === 2_499_900)).toBe(true);
  });

  it('writes a history row as soon as the price moves', async () => {
    const product = await seed();

    getProductDetails.mockResolvedValue(snapshot({ price: 2_499_900 }));
    await runPriceCheck(product._id.toString(), { jobId: 'a', trigger: 'scheduled' });

    getProductDetails.mockResolvedValue(snapshot({ price: 2_399_900 }));
    await runPriceCheck(product._id.toString(), { jobId: 'b', trigger: 'scheduled' });

    expect(await PriceHistory.countDocuments({ productId: product._id })).toBe(2);
  });
});

describe('alerting', () => {
  it('raises an alert and queues delivery when the target is met', async () => {
    const product = await seed();
    getProductDetails.mockResolvedValue(snapshot({ price: 1_899_900 }));

    const outcome = await runPriceCheck(product._id.toString(), {
      jobId: 'alert-1',
      trigger: 'scheduled',
    });

    expect(outcome).toMatchObject({ result: 'success', alerted: true });

    const alert = await Alert.findOne({ productId: product._id });
    expect(alert).toMatchObject({ type: 'target_reached', status: 'pending', state: 'triggered' });
    expect(alert!.message).toContain('Price Alert');
    expect(enqueueNotification).toHaveBeenCalledWith(
      expect.objectContaining({ alertId: alert!._id.toString() }),
      0,
    );

    const updated = await Product.findById(product._id);
    expect(updated).toMatchObject({ alertArmed: true, alertCount: 1 });
  });

  it('does not alert twice for the same drop in "once" mode', async () => {
    const product = await seed();
    getProductDetails.mockResolvedValue(snapshot({ price: 1_899_900 }));

    await runPriceCheck(product._id.toString(), { jobId: 'a', trigger: 'scheduled' });
    await runPriceCheck(product._id.toString(), { jobId: 'b', trigger: 'scheduled' });

    expect(await Alert.countDocuments({ productId: product._id })).toBe(1);
  });

  it('re-arms once the price rises back above the target', async () => {
    const product = await seed();

    getProductDetails.mockResolvedValue(snapshot({ price: 1_899_900 }));
    await runPriceCheck(product._id.toString(), { jobId: 'a', trigger: 'scheduled' });

    getProductDetails.mockResolvedValue(snapshot({ price: 2_199_900 }));
    await runPriceCheck(product._id.toString(), { jobId: 'b', trigger: 'scheduled' });
    expect((await Product.findById(product._id))!.alertArmed).toBe(false);

    getProductDetails.mockResolvedValue(snapshot({ price: 1_799_900 }));
    await runPriceCheck(product._id.toString(), { jobId: 'c', trigger: 'scheduled' });

    expect(await Alert.countDocuments({ productId: product._id })).toBe(2);
  });

  it('does not alert on a listing that is out of stock', async () => {
    const product = await seed();
    getProductDetails.mockResolvedValue(
      snapshot({ price: 1_500_000, availability: 'out_of_stock' }),
    );

    await runPriceCheck(product._id.toString(), { jobId: 'oos', trigger: 'scheduled' });
    expect(await Alert.countDocuments({ productId: product._id })).toBe(0);
  });

  it('skips delivery when the account has no phone number', async () => {
    const product = await seed({}, { phone: undefined });
    getProductDetails.mockResolvedValue(snapshot({ price: 1_899_900 }));

    const outcome = await runPriceCheck(product._id.toString(), {
      jobId: 'nophone',
      trigger: 'scheduled',
    });

    expect(outcome).toMatchObject({ alerted: false });
    expect(await Alert.countDocuments({ productId: product._id })).toBe(0);
  });
});

describe('smart alerts', () => {
  const check = (product: ProductDocument, jobId: string) =>
    runPriceCheck(product._id.toString(), { jobId, trigger: 'scheduled' });

  it('alerts when an out-of-stock listing comes back (on by default)', async () => {
    const product = await seed({ availability: 'out_of_stock', currentPrice: 2_499_900 });
    getProductDetails.mockResolvedValue(snapshot({ price: 2_499_900, availability: 'in_stock' }));

    const outcome = await check(product, 'restock');

    expect(outcome).toMatchObject({ alerted: true });
    const alert = await Alert.findOne({ productId: product._id });
    expect(alert).toMatchObject({ type: 'back_in_stock', reasons: ['back_in_stock'] });
    expect(alert!.message).toContain('Back in Stock');

    const updated = await Product.findById(product._id);
    expect(updated!.lastSmartAlertAt?.back_in_stock).toBeInstanceOf(Date);
    // The target latch belongs to the target rule and stays untouched.
    expect(updated!.alertArmed).toBe(false);
    expect(updated!.lastAlertAt).toBeUndefined();
  });

  it('alerts on a percentage drop from the account rule, measured from the high', async () => {
    const product = await seed({}, { notificationPrefs: { alertRules: { dropPercent: 10 } } });

    for (const [i, price] of [3_000_000, 2_900_000, 2_650_000].entries()) {
      getProductDetails.mockResolvedValue(snapshot({ price }));
      await check(product, `drop-${i}`);
    }

    const alerts = await Alert.find({ productId: product._id });
    expect(alerts).toHaveLength(1);
    expect(alerts[0]).toMatchObject({
      type: 'price_drop',
      price: 2_650_000,
      dropFromPrice: 3_000_000,
    });
    expect(alerts[0]!.message).toContain('The price fell 12% from ₹30,000.');
    expect((await Product.findById(product._id))!.dropReferencePrice).toBe(2_650_000);
  });

  it('alerts on a new lowest price when the product turns it on', async () => {
    const product = await seed({ alertRules: { allTimeLow: true } });

    getProductDetails.mockResolvedValue(snapshot({ price: 3_000_000 }));
    await check(product, 'low-1');
    expect(await Alert.countDocuments({ productId: product._id })).toBe(0);

    getProductDetails.mockResolvedValue(snapshot({ price: 2_950_000 }));
    await check(product, 'low-2');

    const alert = await Alert.findOne({ productId: product._id });
    expect(alert).toMatchObject({ type: 'all_time_low', previousLowestPrice: 3_000_000 });
  });

  it('sends one combined alert when several triggers fire together', async () => {
    const product = await seed(
      { availability: 'out_of_stock', alertRules: { allTimeLow: true }, lowestPrice: 2_200_000 },
    );
    getProductDetails.mockResolvedValue(snapshot({ price: 1_900_000, availability: 'in_stock' }));

    await check(product, 'combo');

    const alerts = await Alert.find({ productId: product._id });
    expect(alerts).toHaveLength(1);
    expect(alerts[0]!.reasons).toEqual(['target_reached', 'all_time_low', 'back_in_stock']);
  });

  it('routes to Telegram when the account has a linked chat', async () => {
    const product = await seed(
      {},
      {
        phone: undefined,
        notificationPrefs: { channels: ['telegram'] },
        telegramChats: [{ chatId: '5123456789', linkedAt: new Date() }],
      },
    );
    getProductDetails.mockResolvedValue(snapshot({ price: 1_899_900 }));

    await check(product, 'tg');

    expect(await Alert.findOne({ productId: product._id })).toMatchObject({ channels: ['telegram'] });
  });

  it('raises one alert for every chosen channel', async () => {
    const product = await seed(
      {},
      {
        notificationPrefs: { channels: ['telegram', 'sms', 'whatsapp'] },
        telegramChats: [{ chatId: '5123456789', linkedAt: new Date() }],
      },
    );
    getProductDetails.mockResolvedValue(snapshot({ price: 1_899_900 }));

    await check(product, 'multi');

    const alerts = await Alert.find({ productId: product._id });
    expect(alerts).toHaveLength(1);
    expect(alerts[0]!.channels).toEqual(['telegram', 'sms', 'whatsapp']);
  });

  it('follows the product channels over the account ones', async () => {
    const product = await seed(
      { notificationChannels: [] },
      { notificationPrefs: { channels: ['sms'] } },
    );
    getProductDetails.mockResolvedValue(snapshot({ price: 1_899_900 }));

    const outcome = await check(product, 'muted');

    expect(outcome).toMatchObject({ alerted: false });
    expect(await Alert.countDocuments({ productId: product._id })).toBe(0);
  });

  it('holds a WhatsApp-only alert back until an account is linked to send from', async () => {
    const product = await seed(
      {},
      {
        notificationPrefs: { channels: ['whatsapp'] },
        whatsappRecipients: [{ phone: '+919812345678', addedAt: new Date() }],
      },
    );
    getProductDetails.mockResolvedValue(snapshot({ price: 1_899_900 }));

    const unlinked = await check(product, 'wa-unlinked');
    expect(unlinked).toMatchObject({ alerted: false });

    await WhatsAppAccount.create({ _id: WHATSAPP_ACCOUNT_ID, phone: '+15550001111', linkedAt: new Date() });
    const linked = await check(product, 'wa-linked');
    expect(linked).toMatchObject({ alerted: true });
    expect(await Alert.findOne({ productId: product._id })).toMatchObject({ channels: ['whatsapp'] });
  });

  it('holds a Telegram alert back until a chat is linked', async () => {
    const product = await seed({}, { notificationPrefs: { channels: ['telegram'] } });
    getProductDetails.mockResolvedValue(snapshot({ price: 1_899_900 }));

    const outcome = await check(product, 'tg-unlinked');

    expect(outcome).toMatchObject({ alerted: false });
    expect(await Alert.countDocuments({ productId: product._id })).toBe(0);
  });
});

describe('failure handling', () => {
  it('walks the backoff ladder without marking the product broken', async () => {
    const product = await seed();
    getProductDetails.mockRejectedValue(
      new AdapterError('temporary_error', 'Amazon returned 503', { retryable: true }),
    );

    const outcome = await runPriceCheck(product._id.toString(), {
      jobId: 'fail-1',
      trigger: 'scheduled',
    });

    expect(outcome).toMatchObject({ result: 'failed', kind: 'temporary_error' });

    const updated = await Product.findById(product._id);
    expect(updated).toMatchObject({ status: 'active', consecutiveFailures: 1 });
    // First retry is one minute out.
    const delayMinutes = (updated!.nextCheckAt.getTime() - Date.now()) / 60_000;
    expect(delayMinutes).toBeGreaterThan(0);
    expect(delayMinutes).toBeLessThan(2);
  });

  it('stops automatic retries after repeated failures and explains why', async () => {
    const product = await seed({ consecutiveFailures: 5 });
    getProductDetails.mockRejectedValue(
      new AdapterError('blocked', 'Marketplace refused the request', { retryable: false }),
    );

    await runPriceCheck(product._id.toString(), { jobId: 'fail-6', trigger: 'scheduled' });

    const updated = await Product.findById(product._id);
    expect(updated!.status).toBe('error');
    expect(updated!.consecutiveFailures).toBe(6);
    expect(updated!.nextCheckAt.getTime()).toBeGreaterThan(Date.now() + 300 * 86_400_000);
  });

  it('marks a removed listing as an error immediately', async () => {
    const product = await seed();
    getProductDetails.mockRejectedValue(
      new AdapterError('not_found', 'Product page no longer exists', { retryable: false }),
    );

    await runPriceCheck(product._id.toString(), { jobId: 'gone', trigger: 'scheduled' });

    const updated = await Product.findById(product._id);
    expect(updated).toMatchObject({ status: 'error', lastErrorKind: 'not_found' });
  });

  it('records the failure in the job log', async () => {
    const product = await seed();
    getProductDetails.mockRejectedValue(new AdapterError('temporary_error', 'timeout'));

    await runPriceCheck(product._id.toString(), { jobId: 'logged', trigger: 'manual' });

    const log = await JobLog.findOne({ jobId: 'logged' });
    expect(log).toMatchObject({
      result: 'failed',
      errorKind: 'temporary_error',
      errorMessage: 'timeout',
      trigger: 'manual',
    });
  });
});

describe('skipping', () => {
  it('does not check a paused product', async () => {
    const product = await seed({ status: 'paused' });

    const outcome = await runPriceCheck(product._id.toString(), {
      jobId: 'paused',
      trigger: 'scheduled',
    });

    expect(outcome).toMatchObject({ result: 'skipped' });
    expect(getProductDetails).not.toHaveBeenCalled();
  });

  it('does not check a deleted product', async () => {
    const product = await seed({ status: 'deleted', deletedAt: new Date() });
    const outcome = await runPriceCheck(product._id.toString(), {
      jobId: 'deleted',
      trigger: 'scheduled',
    });
    expect(outcome).toMatchObject({ result: 'skipped' });
  });
});

describe('scheduler', () => {
  it('enqueues due products and pushes their next check forward', async () => {
    const due = await seed({ nextCheckAt: new Date(Date.now() - 60_000) });
    await seed({ nextCheckAt: new Date(Date.now() + 3_600_000) });
    await seed({ nextCheckAt: new Date(Date.now() - 60_000), status: 'paused' });

    const result = await runSchedulerTick();

    expect(result).toMatchObject({ scanned: 1, enqueued: 1 });
    expect(enqueuePriceCheck).toHaveBeenCalledWith(
      expect.objectContaining({ productId: due._id.toString(), trigger: 'scheduled' }),
    );

    // Claimed, so a second tick does not enqueue it again.
    const second = await runSchedulerTick();
    expect(second.enqueued).toBe(0);
  });
});
