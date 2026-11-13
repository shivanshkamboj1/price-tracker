import { Types } from 'mongoose';
import { createTestClient, del, post, type TestClient } from '../helpers/api';
import { clearDatabase, startTestDatabase, stopTestDatabase } from '../helpers/db';
import {
  BotApiFailure,
  FAKE_BOT_USERNAME,
  fakeTelegram,
  installFakeTelegram,
  startMessage,
} from '../helpers/fakeTelegram';
import { MAX_TELEGRAM_CHATS, User, migrateLegacyTelegramChat } from '../../src/models/User';
import { resetTelegramCache } from '../../src/services/telegram.service';

installFakeTelegram();

const asha = { id: 5_123_456_789, type: 'private', first_name: 'Asha', username: 'asha' };
const ravi = { id: 6_000_000_001, type: 'private', first_name: 'Ravi' };
const family = { id: -1_002_233_445_566, type: 'supergroup', title: 'Family deals' };

beforeAll(startTestDatabase);
afterAll(stopTestDatabase);
beforeEach(() => {
  fakeTelegram.reset();
  resetTelegramCache();
});
afterEach(clearDatabase);

async function startLink(client: TestClient): Promise<string> {
  const response = await post(client, '/api/user/telegram/link').expect(200);
  return response.body.data.code as string;
}

/** Runs one full link: new code, the chat sends it, the page polls. */
async function link(client: TestClient, chat: Record<string, unknown>, updateId: number) {
  const code = await startLink(client);
  fakeTelegram.updates = [startMessage(updateId, `/start ${code}`, chat)];
  return post(client, '/api/user/telegram/verify').expect(200);
}

const seedChats = (client: TestClient, chatIds: string[]) =>
  User.updateOne(
    { _id: client.userId },
    {
      $set: {
        telegramChats: chatIds.map((chatId) => ({ chatId, chatTitle: `chat ${chatId}`, linkedAt: new Date() })),
      },
    },
  );

describe('Telegram linking', () => {
  it('reports the bot and that nothing is linked yet', async () => {
    const client = await createTestClient();
    const response = await client.agent.get('/api/user/telegram').expect(200);
    expect(response.body.data).toMatchObject({
      configured: true,
      connected: false,
      botUsername: FAKE_BOT_USERNAME,
      chats: [],
      maxChats: MAX_TELEGRAM_CHATS,
    });
  });

  it('returns a deep link carrying a one-time code', async () => {
    const client = await createTestClient();
    const response = await post(client, '/api/user/telegram/link').expect(200);
    const { code, url } = response.body.data;
    expect(code).toMatch(/^[A-Za-z0-9_-]{16}$/);
    expect(url).toBe(`https://t.me/${FAKE_BOT_USERNAME}?start=${code}`);
  });

  it('links the chat that sends the code, and confirms in that chat', async () => {
    const client = await createTestClient();
    const code = await startLink(client);

    // Not pressed Start yet.
    let response = await post(client, '/api/user/telegram/verify').expect(200);
    expect(response.body.data).toEqual({ connected: false, chat: null });

    fakeTelegram.updates = [
      startMessage(10, '/start wrong-code', { id: 999, type: 'private', first_name: 'Stranger' }),
      startMessage(11, `/start ${code}`, asha),
    ];

    response = await post(client, '/api/user/telegram/verify').expect(200);
    expect(response.body.data).toMatchObject({
      connected: true,
      chat: { chatId: '5123456789', chatTitle: 'Asha (@asha)' },
    });

    const user = await User.findById(client.userId).select('+telegramLink');
    expect(user!.telegramChats).toHaveLength(1);
    expect(user!.telegramLink).toBeUndefined();

    expect(fakeTelegram.sentTo()).toEqual(['5123456789']);
    // Read updates were acknowledged.
    expect(fakeTelegram.calls).toContainEqual({
      method: 'getUpdates',
      body: { offset: 12, limit: 1, timeout: 0 },
    });
  });

  it('links several accounts and groups, one link each', async () => {
    const client = await createTestClient();
    await link(client, asha, 1);
    await link(client, ravi, 2);
    await link(client, family, 3);

    const response = await client.agent.get('/api/user/telegram').expect(200);
    expect(response.body.data.connected).toBe(true);
    expect(response.body.data.chats.map((c: { chatTitle: string }) => c.chatTitle)).toEqual([
      'Asha (@asha)',
      'Ravi',
      'Family deals',
    ]);
  });

  it('does not duplicate a chat that links twice', async () => {
    const client = await createTestClient();
    await link(client, asha, 1);
    const response = await link(client, { ...asha, first_name: 'Asha K' }, 2);

    expect(response.body.data.chat.chatTitle).toBe('Asha K (@asha)');
    expect((await User.findById(client.userId))!.telegramChats).toHaveLength(1);
  });

  it('spends the code once a chat has used it', async () => {
    const client = await createTestClient();
    await link(client, asha, 1);
    await post(client, '/api/user/telegram/verify').expect(400);
  });

  it(`stops at ${MAX_TELEGRAM_CHATS} chats`, async () => {
    const client = await createTestClient();
    await seedChats(
      client,
      Array.from({ length: MAX_TELEGRAM_CHATS }, (_, i) => String(1000 + i)),
    );

    const response = await post(client, '/api/user/telegram/link').expect(400);
    expect(response.body.error.message).toContain(`up to ${MAX_TELEGRAM_CHATS}`);
  });

  it('cancels an open link so its code stops working', async () => {
    const client = await createTestClient();
    await startLink(client);
    await del(client, '/api/user/telegram/link').expect(200);
    await post(client, '/api/user/telegram/verify').expect(400);
  });

  it('never exposes the pending code through the profile', async () => {
    const client = await createTestClient();
    await startLink(client);
    const response = await client.agent.get('/api/user').expect(200);
    expect(response.body.data.user.telegramLink).toBeUndefined();
  });

  it('rejects an expired link', async () => {
    const client = await createTestClient();
    await startLink(client);
    await User.updateOne(
      { _id: client.userId },
      { $set: { 'telegramLink.expiresAt': new Date(Date.now() - 1000) } },
    );

    const response = await post(client, '/api/user/telegram/verify').expect(400);
    expect(response.body.error.message).toMatch(/expired/);
  });
});

describe('managing linked chats', () => {
  it('tests every chat, or just one', async () => {
    const client = await createTestClient();
    await seedChats(client, ['41', '42']);

    let response = await post(client, '/api/user/telegram/test').expect(200);
    expect(response.body.data).toEqual({ sent: 2, failed: [] });
    expect(fakeTelegram.sentTo().sort()).toEqual(['41', '42']);

    fakeTelegram.reset();
    response = await post(client, '/api/user/telegram/test', { chatId: '42' }).expect(200);
    expect(fakeTelegram.sentTo()).toEqual(['42']);
  });

  it('reports which chats a test did not reach', async () => {
    const client = await createTestClient();
    await seedChats(client, ['41', '42']);
    fakeTelegram.failFor.set('42', new BotApiFailure(403, 'Forbidden: bot was blocked by the user'));

    const response = await post(client, '/api/user/telegram/test').expect(200);
    expect(response.body.data.sent).toBe(1);
    expect(response.body.data.failed).toEqual([
      { chatId: '42', reason: 'chat 42: Forbidden: bot was blocked by the user' },
    ]);
  });

  it('explains a blocked bot when nothing gets through', async () => {
    const client = await createTestClient();
    await seedChats(client, ['42']);
    fakeTelegram.failFor.set('42', new BotApiFailure(403, 'Forbidden: bot was blocked by the user'));

    const response = await post(client, '/api/user/telegram/test').expect(400);
    expect(response.body.error.message).toContain('bot was blocked by the user');
  });

  it('removes one chat and leaves the others', async () => {
    const client = await createTestClient();
    await seedChats(client, ['41', '-1002233445566']);

    const response = await del(client, '/api/user/telegram/chats/-1002233445566').expect(200);
    expect(response.body.data.chats.map((c: { chatId: string }) => c.chatId)).toEqual(['41']);

    await del(client, '/api/user/telegram/chats/999').expect(404);
    await del(client, '/api/user/telegram/chats/not-a-number').expect(422);
  });
});

describe('migrateLegacyTelegramChat', () => {
  it('moves a single linked chat into the list, once', async () => {
    const _id = new Types.ObjectId();
    await User.collection.insertOne({
      _id,
      email: 'legacy@example.com',
      name: 'Legacy',
      passwordHash: 'x',
      telegram: { chatId: '77', chatTitle: 'Old link', linkedAt: new Date() },
    });

    expect(await migrateLegacyTelegramChat()).toBe(1);
    expect(await migrateLegacyTelegramChat()).toBe(0);

    const raw = await User.collection.findOne({ _id });
    expect(raw!.telegram).toBeUndefined();
    expect(raw!.telegramChats).toEqual([expect.objectContaining({ chatId: '77', chatTitle: 'Old link' })]);
  });
});

describe('notification settings', () => {
  it('accepts several channels at once and stores smart alert defaults', async () => {
    const client = await createTestClient();

    const response = await post(client, '/api/user/notification-settings', {
      channels: ['telegram', 'whatsapp'],
      alertRules: { dropPercent: 15, allTimeLow: true },
    }).expect(200);

    expect(response.body.data.notificationPrefs).toMatchObject({
      channels: ['telegram', 'whatsapp'],
      alertRules: { dropPercent: 15, allTimeLow: true, backInStock: true },
    });
  });

  it('accepts no channels at all, which turns notifications off', async () => {
    const client = await createTestClient();
    const response = await post(client, '/api/user/notification-settings', { channels: [] }).expect(200);
    expect(response.body.data.notificationPrefs.channels).toEqual([]);
  });

  it('rejects an unknown or repeated channel', async () => {
    const client = await createTestClient();
    await post(client, '/api/user/notification-settings', { channels: ['pigeon'] }).expect(422);
    await post(client, '/api/user/notification-settings', {
      channels: ['telegram', 'telegram'],
    }).expect(422);
  });

  it('rejects an out-of-range drop percentage', async () => {
    const client = await createTestClient();
    await post(client, '/api/user/notification-settings', {
      alertRules: { dropPercent: 95 },
    }).expect(422);
  });
});
