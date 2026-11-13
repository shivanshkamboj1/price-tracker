import { clearDatabase, startTestDatabase, stopTestDatabase } from '../helpers/db';
import { BotApiFailure, fakeTelegram, installFakeTelegram } from '../helpers/fakeTelegram';
import { fakeWhatsApp, installFakeWhatsApp, publishLiveState } from '../helpers/fakeWhatsApp';
import { Alert } from '../../src/models/Alert';
import { Product } from '../../src/models/Product';
import { User } from '../../src/models/User';
import { WHATSAPP_ACCOUNT_ID, WhatsAppAccount } from '../../src/models/WhatsApp';
import { deliverAlert, RetryableDeliveryError } from '../../src/services/alertDelivery.service';

installFakeTelegram();
installFakeWhatsApp();

beforeAll(startTestDatabase);
afterAll(stopTestDatabase);
beforeEach(() => {
  fakeTelegram.reset();
  fakeWhatsApp.reset();
});
afterEach(clearDatabase);

const chats = [
  { chatId: '41', chatTitle: 'Asha', linkedAt: new Date() },
  { chatId: '-1002233445566', chatTitle: 'Family deals', linkedAt: new Date() },
];

const recipients = [
  { phone: '+919812345678', name: 'Mum', jid: '919812345678@s.whatsapp.net', addedAt: new Date() },
  { phone: '+919900011122', addedAt: new Date() },
];

async function seedAlert(
  channels: string[] | { legacyChannel: string } = ['telegram'],
  userOverrides: Record<string, unknown> = {},
) {
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
    ...(Array.isArray(channels) ? { channels } : { channel: channels.legacyChannel }),
    message: 'stored copy',
  });
}

/** A linked sending account and a worker holding it. */
async function linkWhatsApp() {
  await WhatsAppAccount.create({ _id: WHATSAPP_ACCOUNT_ID, phone: '+15550001111', linkedAt: new Date() });
  await publishLiveState();
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
    const alert = await seedAlert(['telegram'], { telegramChats: [] });

    const outcome = await deliverAlert(alert.id);

    expect(outcome.status).toBe('skipped');
    expect(outcome.reason).toBe('Telegram: no Telegram chat is connected');
    expect(fakeTelegram.sentTo()).toEqual([]);
  });

  it('does nothing for an alert that is already fully delivered', async () => {
    const alert = await seedAlert();
    await deliverAlert(alert.id);
    fakeTelegram.reset();

    expect(await deliverAlert(alert.id)).toMatchObject({ status: 'skipped', reason: 'already delivered' });
    expect(fakeTelegram.sentTo()).toEqual([]);
  });

  it('still delivers alerts raised before several channels were supported', async () => {
    const alert = await seedAlert({ legacyChannel: 'telegram' });

    expect(await deliverAlert(alert.id)).toMatchObject({ status: 'sent', sent: 2 });
  });
});

describe('deliverAlert to WhatsApp', () => {
  it('sends to every number from the linked account, storing no number', async () => {
    await linkWhatsApp();
    const alert = await seedAlert(['whatsapp'], { whatsappRecipients: recipients });

    const outcome = await deliverAlert(alert.id);

    expect(outcome).toMatchObject({ status: 'sent', sent: 2, failed: 0 });
    // The resolved WhatsApp id when there is one, the number otherwise.
    expect(fakeWhatsApp.sentTo().sort()).toEqual(['+919900011122', '919812345678@s.whatsapp.net']);
    const send = fakeWhatsApp.commands.find((c) => c.type === 'send');
    expect(send).toMatchObject({ text: expect.stringContaining('Price Drop −21%') });

    const saved = await Alert.findById(alert.id);
    const destinations = saved!.deliveries!.map((d) => d.destination);
    expect(destinations.every((d) => d.startsWith('wa:'))).toBe(true);
    expect(destinations.join(' ')).not.toMatch(/9812345678|9900011122/);
  });

  it('skips with a reason when no account is linked to send from', async () => {
    const alert = await seedAlert(['whatsapp'], { whatsappRecipients: recipients });

    const outcome = await deliverAlert(alert.id);

    expect(outcome).toMatchObject({ status: 'skipped' });
    expect(outcome.reason).toBe('WhatsApp: no WhatsApp account is linked to send from');
    expect(fakeWhatsApp.sentTo()).toEqual([]);
  });

  it('retries later when the worker holding WhatsApp is not running', async () => {
    await WhatsAppAccount.create({ _id: WHATSAPP_ACCOUNT_ID, phone: '+15550001111', linkedAt: new Date() });
    const alert = await seedAlert(['whatsapp'], { whatsappRecipients: [recipients[0]] });

    await expect(deliverAlert(alert.id)).rejects.toBeInstanceOf(RetryableDeliveryError);
    expect((await Alert.findById(alert.id))!.status).toBe('failed');
  });
});

describe('deliverAlert on several channels', () => {
  it('sends the same alert on every channel', async () => {
    await linkWhatsApp();
    const alert = await seedAlert(['whatsapp', 'telegram', 'sms'], {
      whatsappRecipients: [recipients[0]],
      phone: '+919876543210',
    });

    const outcome = await deliverAlert(alert.id);

    expect(outcome).toMatchObject({ status: 'sent', sent: 4, failed: 0 });
    expect(fakeWhatsApp.sentTo()).toHaveLength(1);
    expect(fakeTelegram.sentTo()).toHaveLength(2);
    const saved = await Alert.findById(alert.id);
    expect(saved!.deliveries!.map((d) => d.channel).sort()).toEqual([
      'sms',
      'telegram',
      'telegram',
      'whatsapp',
    ]);
  });

  it('retries only the destination that failed, on whichever channel it is', async () => {
    await linkWhatsApp();
    const alert = await seedAlert(['whatsapp', 'telegram'], { whatsappRecipients: [recipients[0]] });
    fakeWhatsApp.failSendTo.set('919812345678@s.whatsapp.net', {
      error: 'WhatsApp is reconnecting. Try again in a moment.',
      retryable: true,
    });

    await expect(deliverAlert(alert.id)).rejects.toBeInstanceOf(RetryableDeliveryError);
    let saved = await Alert.findById(alert.id);
    expect(saved!.status).toBe('sent');
    expect(saved!.failureReason).toBe(
      'Not delivered to Mum on WhatsApp: WhatsApp is reconnecting. Try again in a moment.',
    );

    fakeWhatsApp.reset();
    fakeTelegram.reset();
    expect(await deliverAlert(alert.id)).toMatchObject({ status: 'sent', sent: 3, failed: 0 });
    expect(fakeWhatsApp.sentTo()).toEqual(['919812345678@s.whatsapp.net']);
    expect(fakeTelegram.sentTo()).toEqual([]);
    saved = await Alert.findById(alert.id);
    expect(saved!.failureReason).toBeUndefined();
  });

  it('delivers where it can and names the channels that had nobody to reach', async () => {
    const alert = await seedAlert(['whatsapp', 'telegram', 'call']);

    const outcome = await deliverAlert(alert.id);

    expect(outcome).toMatchObject({ status: 'sent', sent: 2 });
    expect(outcome.reason).toBe(
      'WhatsApp: no WhatsApp account is linked to send from; Phone call: no mobile number is set',
    );
  });

  it('records SMS without the number itself', async () => {
    const alert = await seedAlert(['sms'], { phone: '+919876543210' });

    expect(await deliverAlert(alert.id)).toMatchObject({ status: 'sent', sent: 1 });
    const saved = await Alert.findById(alert.id);
    expect(saved!.deliveries?.map((d) => d.destination)).toEqual(['sms']);
    expect(fakeTelegram.sentTo()).toEqual([]);
  });
});
