import { createTestClient, del, patch, post } from '../helpers/api';
import { clearDatabase, startTestDatabase, stopTestDatabase } from '../helpers/db';
import { fakeWhatsApp, installFakeWhatsApp, publishLiveState } from '../helpers/fakeWhatsApp';
import { Product, migrateLegacyProductChannel } from '../../src/models/Product';
import { MAX_WHATSAPP_RECIPIENTS, User, migrateLegacyNotificationChannel } from '../../src/models/User';
import { WHATSAPP_ACCOUNT_ID, WhatsAppAccount, WhatsAppAuthKey } from '../../src/models/WhatsApp';

installFakeWhatsApp();

beforeAll(startTestDatabase);
afterAll(stopTestDatabase);
beforeEach(() => fakeWhatsApp.reset());
afterEach(clearDatabase);

const MUM = '+919812345678';

describe('WhatsApp status', () => {
  it('reports the worker as offline when nothing holds the connection', async () => {
    const client = await createTestClient();

    const response = await client.agent.get('/api/user/whatsapp').expect(200);

    expect(response.body.data).toMatchObject({
      enabled: true,
      workerOnline: false,
      status: 'offline',
      linked: false,
      recipients: [],
      maxRecipients: MAX_WHATSAPP_RECIPIENTS,
    });
  });

  it('still shows a stored account as linked while the worker is down', async () => {
    const client = await createTestClient();
    await WhatsAppAccount.create({ _id: WHATSAPP_ACCOUNT_ID, phone: '+15550001111', linkedAt: new Date() });

    const response = await client.agent.get('/api/user/whatsapp').expect(200);

    expect(response.body.data).toMatchObject({ linked: true, account: { phone: '+15550001111' } });
  });

  it('turns the QR code into an image while linking', async () => {
    const client = await createTestClient();
    await publishLiveState({ status: 'linking', account: null, qr: '2@abc,def,ghi,jkl' });

    const response = await client.agent.get('/api/user/whatsapp').expect(200);

    expect(response.body.data.status).toBe('linking');
    expect(response.body.data.linked).toBe(false);
    expect(response.body.data.qrDataUrl).toMatch(/^data:image\/png;base64,/);
  });
});

describe('linking the sending account', () => {
  it('asks the worker to start a QR link', async () => {
    const client = await createTestClient();
    await publishLiveState({ status: 'not_linked', account: null });

    await post(client, '/api/user/whatsapp/link', { method: 'qr' }).expect(200);

    expect(fakeWhatsApp.commands).toEqual([{ type: 'link', method: 'qr' }]);
  });

  it('passes a cleaned-up number for a pairing-code link', async () => {
    const client = await createTestClient();
    await publishLiveState({ status: 'not_linked', account: null });

    await post(client, '/api/user/whatsapp/link', { method: 'code', phone: '+91 98765-43210' }).expect(200);

    expect(fakeWhatsApp.commands).toEqual([{ type: 'link', method: 'code', phone: '+919876543210' }]);
  });

  it('says how to fix it when the worker is not running', async () => {
    const client = await createTestClient();

    const response = await post(client, '/api/user/whatsapp/link', { method: 'qr' }).expect(400);

    expect(response.body.error.message).toContain('worker');
  });

  it('forgets the session itself when unlinking without a worker', async () => {
    const client = await createTestClient();
    await WhatsAppAccount.create({ _id: WHATSAPP_ACCOUNT_ID, phone: '+15550001111', linkedAt: new Date() });
    await WhatsAppAuthKey.create({ _id: 'creds', value: 'v1.encrypted' });

    const response = await del(client, '/api/user/whatsapp').expect(200);

    expect(response.body.data).toEqual({ removedFromPhone: false });
    expect(await WhatsAppAccount.countDocuments()).toBe(0);
    expect(await WhatsAppAuthKey.countDocuments()).toBe(0);
  });

  it('asks the worker to log out when it is running', async () => {
    const client = await createTestClient();
    await publishLiveState();

    const response = await del(client, '/api/user/whatsapp').expect(200);

    expect(response.body.data).toEqual({ removedFromPhone: true });
    expect(fakeWhatsApp.commands).toEqual([{ type: 'logout' }]);
  });
});

describe('WhatsApp recipients', () => {
  it('only accepts numbers once the sending account is connected', async () => {
    const client = await createTestClient();
    await publishLiveState({ status: 'linking', account: null });
    fakeWhatsApp.registered.add(MUM);

    const response = await post(client, '/api/user/whatsapp/recipients', { phone: MUM }).expect(400);

    expect(response.body.error.message).toContain('Link the WhatsApp account');
  });

  it('checks the number is on WhatsApp and stores what it resolved to', async () => {
    const client = await createTestClient();
    await publishLiveState();
    fakeWhatsApp.registered.add(MUM);

    const response = await post(client, '/api/user/whatsapp/recipients', {
      phone: MUM,
      name: 'Mum',
    }).expect(200);

    expect(response.body.data.recipients).toEqual([
      expect.objectContaining({ phone: MUM, name: 'Mum', id: expect.any(String) }),
    ]);
    const user = await User.findById(client.userId);
    expect(user!.whatsappRecipients[0]!.jid).toBe('919812345678@s.whatsapp.net');
  });

  it('refuses a number without WhatsApp, and the same number twice', async () => {
    const client = await createTestClient();
    await publishLiveState();

    const missing = await post(client, '/api/user/whatsapp/recipients', { phone: MUM }).expect(400);
    expect(missing.body.error.message).toContain('does not have a WhatsApp account');

    fakeWhatsApp.registered.add(MUM);
    await post(client, '/api/user/whatsapp/recipients', { phone: MUM }).expect(200);
    await post(client, '/api/user/whatsapp/recipients', { phone: MUM }).expect(409);
  });

  it('rejects a number that is not in international format', async () => {
    const client = await createTestClient();
    await publishLiveState();
    await post(client, '/api/user/whatsapp/recipients', { phone: '09812345678' }).expect(422);
  });

  it('removes a number', async () => {
    const client = await createTestClient();
    await publishLiveState();
    fakeWhatsApp.registered.add(MUM);
    const added = await post(client, '/api/user/whatsapp/recipients', { phone: MUM }).expect(200);
    const id = added.body.data.recipients[0].id as string;

    const response = await del(client, `/api/user/whatsapp/recipients/${id}`).expect(200);

    expect(response.body.data.recipients).toEqual([]);
    await del(client, `/api/user/whatsapp/recipients/${id}`).expect(404);
  });

  it('sends a test message to each number', async () => {
    const client = await createTestClient();
    await publishLiveState();
    fakeWhatsApp.registered.add(MUM);
    await post(client, '/api/user/whatsapp/recipients', { phone: MUM }).expect(200);

    const response = await post(client, '/api/user/whatsapp/test', {}).expect(200);

    expect(response.body.data).toEqual({ sent: 1, failed: [] });
    expect(fakeWhatsApp.sentTo()).toEqual(['919812345678@s.whatsapp.net']);
  });

  it('reports a test that nobody received', async () => {
    const client = await createTestClient();
    await publishLiveState();
    fakeWhatsApp.registered.add(MUM);
    await post(client, '/api/user/whatsapp/recipients', { phone: MUM }).expect(200);
    fakeWhatsApp.failSendTo.set('919812345678@s.whatsapp.net', {
      error: 'No WhatsApp account is linked yet.',
      retryable: false,
    });

    const response = await post(client, '/api/user/whatsapp/test', {}).expect(400);
    expect(response.body.error.message).toBe('No WhatsApp account is linked yet.');
  });
});

describe('channel summary', () => {
  it('says what each channel needs before it can deliver', async () => {
    const client = await createTestClient();

    const response = await client.agent.get('/api/user/channels').expect(200);
    const byChannel = Object.fromEntries(
      (response.body.data.channels as Array<{ channel: string }>).map((c) => [c.channel, c]),
    );

    expect(byChannel.whatsapp).toMatchObject({
      available: true,
      ready: false,
      detail: 'Link a WhatsApp account first',
    });
    expect(byChannel.telegram).toMatchObject({ available: true, ready: false });
    // No Twilio in the test environment.
    expect(byChannel.sms).toMatchObject({ available: false, detail: 'Needs Twilio on the server' });
  });

  it('marks WhatsApp ready once an account is linked and a number added', async () => {
    const client = await createTestClient();
    await WhatsAppAccount.create({ _id: WHATSAPP_ACCOUNT_ID, phone: '+15550001111', linkedAt: new Date() });
    await User.updateOne(
      { _id: client.userId },
      { $push: { whatsappRecipients: { phone: MUM, addedAt: new Date() } } },
    );

    const response = await client.agent.get('/api/user/channels').expect(200);

    expect(response.body.data.channels[0]).toMatchObject({
      channel: 'whatsapp',
      ready: true,
      detail: '1 number',
    });
  });
});

describe('profile', () => {
  it('no longer takes a name, but still takes a timezone and an SMS number', async () => {
    const client = await createTestClient();

    await patch(client, '/api/user', { name: 'Someone' }).expect(422);
    const response = await patch(client, '/api/user', {
      timezone: 'Europe/London',
      phone: '+44 7700 900123',
    }).expect(200);

    expect(response.body.data.user).toMatchObject({ timezone: 'Europe/London', phone: '+447700900123' });
  });
});

describe('moving single channels to channel lists', () => {
  it('converts account and product channels, keeping "none" as no channels', async () => {
    const owner = await User.create({ email: 'a@example.com', name: 'A', passwordHash: 'x' });
    const muted = await User.create({ email: 'b@example.com', name: 'B', passwordHash: 'x' });
    await User.collection.updateOne(
      { _id: owner._id },
      { $set: { 'notificationPrefs.channel': 'telegram' }, $unset: { 'notificationPrefs.channels': 1 } },
    );
    await User.collection.updateOne(
      { _id: muted._id },
      { $set: { 'notificationPrefs.channel': 'none' }, $unset: { 'notificationPrefs.channels': 1 } },
    );
    const product = await Product.create({
      userId: owner._id,
      marketplace: 'amazon_in',
      productUrl: 'https://www.amazon.in/dp/B0CHWRXH8B',
      externalProductId: 'B0CHWRXH8B',
      title: 'AirPods',
      targetPrice: 100,
      checkInterval: 360,
    });
    await Product.collection.updateOne({ _id: product._id }, { $set: { notificationChannel: 'sms' } });

    expect(await migrateLegacyNotificationChannel()).toBe(2);
    expect(await migrateLegacyNotificationChannel()).toBe(0);
    expect(await migrateLegacyProductChannel()).toBe(1);

    const rawOwner = await User.collection.findOne({ _id: owner._id });
    expect(rawOwner!.notificationPrefs.channels).toEqual(['telegram']);
    expect(rawOwner!.notificationPrefs.channel).toBeUndefined();
    expect((await User.collection.findOne({ _id: muted._id }))!.notificationPrefs.channels).toEqual([]);

    const rawProduct = await Product.collection.findOne({ _id: product._id });
    expect(rawProduct!.notificationChannels).toEqual(['sms']);
    expect(rawProduct!.notificationChannel).toBeUndefined();
  });
});
