import { clearDatabase, startTestDatabase, stopTestDatabase } from '../helpers/db';
import { BotApiFailure, fakeTelegram, installFakeTelegram } from '../helpers/fakeTelegram';
import { Alert } from '../../src/models/Alert';
import { Product } from '../../src/models/Product';
import { User } from '../../src/models/User';
import { deliverAlert, RetryableDeliveryError } from '../../src/services/alertDelivery.service';

installFakeTelegram();

beforeAll(startTestDatabase);
afterAll(stopTestDatabase);
beforeEach(() => fakeTelegram.reset());
afterEach(clearDatabase);

const chats = [
  { chatId: '41', chatTitle: 'Asha', linkedAt: new Date() },
  { chatId: '-1002233445566', chatTitle: 'Family deals', linkedAt: new Date() },
];

async function seedAlert(channel = 'telegram', userOverrides: Record<string, unknown> = {}) {
  const user = await User.create({
    email: `owner${Math.random()}@example.com`,
    name: 'Owner',
    passwordHash: 'placeholder-hash',
    telegramChats: chats,
    ...userOverrides,
  });
  const product = await Product.create({
    userId: user._id,
    marketplace: 'amazon_in',
    productUrl: 'https://www.amazon.in/dp/B0CHWRXH8B',
    externalProductId: 'B0CHWRXH8B',
    title: 'Apple AirPods Pro',
    targetPrice: 2_000_000,
    checkInterval: 360,
    nextCheckAt: new Date(),
  });
  return Alert.create({
    userId: user._id,
    productId: product._id,
    type: 'price_drop',
    reasons: ['price_drop'],
    price: 1_900_000,
    targetPrice: 2_000_000,
    dropFromPrice: 2_400_000,
    channel,
    message: 'stored copy',
  });
}

describe('deliverAlert to Telegram', () => {
  it('sends to every linked chat', async () => {
    const alert = await seedAlert();

    const outcome = await deliverAlert(alert.id);

    expect(outcome).toMatchObject({ status: 'sent', sent: 2, failed: 0 });
    expect(fakeTelegram.sentTo().sort()).toEqual(['-1002233445566', '41']);

    const message = fakeTelegram.calls.find((c) => c.method === 'sendMessage')!.body.text as string;
    expect(message).toContain('Price Drop −21%');

    const saved = await Alert.findById(alert.id);
    expect(saved!.status).toBe('sent');
    expect(saved!.deliveries?.map((d) => d.status)).toEqual(['sent', 'sent']);
  });

  it('retries only the chat that failed, so nobody gets it twice', async () => {
    const alert = await seedAlert();
    fakeTelegram.failFor.set('-1002233445566', new BotApiFailure(429, 'Too Many Requests'));

    await expect(deliverAlert(alert.id)).rejects.toBeInstanceOf(RetryableDeliveryError);

    let saved = await Alert.findById(alert.id);
    // Asha has it, so the alert counts as sent; the group is reported.
    expect(saved!.status).toBe('sent');
    expect(saved!.failureReason).toBe('Not delivered to Family deals: Too Many Requests');

    fakeTelegram.reset();
    const outcome = await deliverAlert(alert.id);

    expect(fakeTelegram.sentTo()).toEqual(['-1002233445566']);
    expect(outcome).toMatchObject({ status: 'sent', sent: 2, failed: 0 });
    saved = await Alert.findById(alert.id);
    expect(saved!.failureReason).toBeUndefined();
  });

  it('does not retry a chat that has blocked the bot', async () => {
    const alert = await seedAlert();
    fakeTelegram.failFor.set('41', new BotApiFailure(403, 'Forbidden: bot was blocked by the user'));

    const outcome = await deliverAlert(alert.id);

    expect(outcome).toMatchObject({ status: 'sent', sent: 1, failed: 1 });
    expect(outcome.reason).toContain('Not delivered to Asha: Forbidden: bot was blocked by the user');
  });

  it('marks the alert failed when no chat received it', async () => {
    const alert = await seedAlert();
    fakeTelegram.failFor.set('41', new BotApiFailure(403, 'Forbidden: bot was blocked by the user'));
    fakeTelegram.failFor.set('-1002233445566', new BotApiFailure(400, 'Bad Request: chat not found'));

    const outcome = await deliverAlert(alert.id);
    expect(outcome.status).toBe('failed');
  });

  it('skips when every chat has been removed', async () => {
    const alert = await seedAlert('telegram', { telegramChats: [] });

    const outcome = await deliverAlert(alert.id);

    expect(outcome.status).toBe('skipped');
    expect(fakeTelegram.sentTo()).toEqual([]);
  });

  it('does nothing for an alert that is already fully delivered', async () => {
    const alert = await seedAlert();
    await deliverAlert(alert.id);
    fakeTelegram.reset();

    expect(await deliverAlert(alert.id)).toMatchObject({ status: 'skipped', reason: 'already delivered' });
    expect(fakeTelegram.sentTo()).toEqual([]);
  });
});

describe('deliverAlert to a phone channel', () => {
  it('sends once and records the destination without the number', async () => {
    const alert = await seedAlert('whatsapp', { phone: '+919876543210' });

    const outcome = await deliverAlert(alert.id);

    expect(outcome).toMatchObject({ status: 'sent', sent: 1 });
    const saved = await Alert.findById(alert.id);
    expect(saved!.deliveries?.map((d) => d.destination)).toEqual(['phone']);
    expect(fakeTelegram.sentTo()).toEqual([]);
  });
});
