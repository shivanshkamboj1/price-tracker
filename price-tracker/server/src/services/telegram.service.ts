import { randomBytes } from 'node:crypto';
import { telegramConfigured } from '../config/env';
import { logger } from '../config/logger';
import {
  MAX_TELEGRAM_CHATS,
  User,
  type TelegramLinkedChat,
  type UserDocument,
} from '../models/User';
import { AppError, badRequest, notFound } from '../utils/errors';
import { telegramService } from './notification';
import { callTelegram, TelegramApiError } from './notification/telegram';

/**
 * Linking Telegram chats, without a webhook. An account can link several
 * (people, groups or both); every linked chat receives every Telegram alert.
 *
 * 1. `startTelegramLink` stores a short-lived random code and returns the bot's
 *    deep link, `https://t.me/<bot>?start=<code>`.
 * 2. The user opens it and taps Start; Telegram sends the bot `/start <code>`.
 * 3. `completeTelegramLink` (polled by the settings page) reads pending updates
 *    with `getUpdates`, finds the code and stores that chat's id.
 *
 * Polling on demand means nothing has to be publicly reachable and no
 * background loop runs. The code is what ties a chat to this account: anyone
 * can message the bot, but only someone the user handed the link to has the
 * code. Sharing the link is how another person's account gets added.
 */

const LINK_TTL_MS = 15 * 60_000;

interface TelegramChat {
  id: number;
  type: string;
  title?: string;
  username?: string;
  first_name?: string;
  last_name?: string;
}

interface TelegramUpdate {
  update_id: number;
  message?: { text?: string; chat: TelegramChat };
}

export interface TelegramChatDto {
  chatId: string;
  chatTitle: string | null;
  linkedAt: Date;
}

export interface TelegramStatus {
  configured: boolean;
  connected: boolean;
  botUsername: string | null;
  /** Every linked chat; each one receives every Telegram alert. */
  chats: TelegramChatDto[];
  maxChats: number;
}

const toChatDto = (chat: TelegramLinkedChat): TelegramChatDto => ({
  chatId: chat.chatId,
  chatTitle: chat.chatTitle ?? null,
  linkedAt: chat.linkedAt,
});

export interface TelegramLinkStart {
  botUsername: string;
  code: string;
  url: string;
  expiresAt: Date;
}

let cachedBotUsername: string | undefined;

/** Converts Bot API failures into errors the settings page can show as-is. */
function toAppError(err: unknown): AppError {
  if (!(err instanceof TelegramApiError)) {
    return new AppError(502, 'UPSTREAM_UNAVAILABLE', 'Telegram request failed', { cause: err });
  }
  if (err.errorCode === 401 || err.errorCode === 404) {
    return badRequest('Telegram rejected the bot token. Check TELEGRAM_BOT_TOKEN against @BotFather.');
  }
  if (err.errorCode === 409) {
    return badRequest(
      'This bot has a webhook set, which blocks linking. Remove it (Bot API deleteWebhook) and try again.',
    );
  }
  return new AppError(502, 'UPSTREAM_UNAVAILABLE', err.message);
}

async function botUsername(): Promise<string> {
  if (!cachedBotUsername) {
    const me = await callTelegram<{ username: string }>('getMe').catch((err) => {
      throw toAppError(err);
    });
    cachedBotUsername = me.username;
  }
  return cachedBotUsername;
}

function assertConfigured(): void {
  if (!telegramConfigured) {
    throw badRequest('Telegram is not set up on the server. Add TELEGRAM_BOT_TOKEN to .env and restart.');
  }
}

async function load(userId: string, withLink = false): Promise<UserDocument> {
  const query = User.findById(userId);
  if (withLink) query.select('+telegramLink');
  const user = await query;
  if (!user) throw notFound('Account not found');
  return user;
}

function describeChat(chat: TelegramChat): string {
  if (chat.title) return chat.title;
  const name = [chat.first_name, chat.last_name].filter(Boolean).join(' ');
  if (chat.username) return name ? `${name} (@${chat.username})` : `@${chat.username}`;
  return name || 'Telegram chat';
}

export async function getTelegramStatus(userId: string): Promise<TelegramStatus> {
  const user = await load(userId);
  const username = telegramConfigured ? await botUsername().catch(() => null) : null;
  const chats = user.telegramChats ?? [];
  return {
    configured: telegramConfigured,
    connected: chats.length > 0,
    botUsername: username,
    chats: chats.map(toChatDto),
    maxChats: MAX_TELEGRAM_CHATS,
  };
}

export async function startTelegramLink(userId: string): Promise<TelegramLinkStart> {
  assertConfigured();
  const user = await load(userId, true);
  if ((user.telegramChats?.length ?? 0) >= MAX_TELEGRAM_CHATS) {
    throw badRequest(
      `You can connect up to ${MAX_TELEGRAM_CHATS} Telegram chats. Remove one to add another.`,
    );
  }
  const username = await botUsername();

  // Deep-link payloads allow [A-Za-z0-9_-], up to 64 characters.
  const code = randomBytes(12).toString('base64url');
  const expiresAt = new Date(Date.now() + LINK_TTL_MS);
  user.telegramLink = { code, expiresAt };
  await user.save();

  return { botUsername: username, code, url: `https://t.me/${username}?start=${code}`, expiresAt };
}

export interface TelegramLinkResult {
  connected: boolean;
  /** The chat this link added (or refreshed, if it was already connected). */
  chat: TelegramChatDto | null;
}

/**
 * Looks for `/start <code>` among the bot's pending updates and adds the chat
 * that sent it. Returns `connected: false` while nobody has tapped Start yet.
 *
 * Each link adds one chat and is then spent, so connecting several people
 * means one link each — the code is what ties a chat to this account.
 */
export async function completeTelegramLink(userId: string): Promise<TelegramLinkResult> {
  assertConfigured();
  const user = await load(userId, true);
  const pending = user.telegramLink;

  if (!pending) throw badRequest('Start connecting Telegram first.');
  if (pending.expiresAt.getTime() < Date.now()) {
    user.telegramLink = undefined;
    await user.save();
    throw badRequest('That Telegram link has expired. Start again to get a new one.');
  }

  const updates = await callTelegram<TelegramUpdate[]>('getUpdates', {
    timeout: 0,
    allowed_updates: ['message'],
  }).catch((err) => {
    throw toAppError(err);
  });

  const match = updates.find((update) => update.message?.text?.includes(pending.code))?.message;

  const last = updates[updates.length - 1];
  if (last) {
    // Acknowledge what was read so the queue does not grow; best effort.
    await callTelegram('getUpdates', { offset: last.update_id + 1, limit: 1, timeout: 0 }).catch(
      () => undefined,
    );
  }

  if (!match) return { connected: false, chat: null };

  const chatId = String(match.chat.id);
  const chatTitle = describeChat(match.chat).slice(0, 256);
  const existing = user.telegramChats.find((chat) => chat.chatId === chatId);
  const alreadyLinked = Boolean(existing);

  if (existing) {
    // Re-linking the same chat just refreshes its name; it never duplicates.
    existing.chatTitle = chatTitle;
  } else {
    user.telegramChats.push({ chatId, chatTitle, linkedAt: new Date() });
  }
  user.telegramLink = undefined;
  await user.save();
  logger.info({ userId, chatType: match.chat.type, alreadyLinked }, 'telegram chat linked');

  await telegramService().sendMessage(
    chatId,
    alreadyLinked
      ? '✅ <b>Already connected.</b> This chat keeps receiving price alerts.'
      : '✅ <b>Connected.</b> Price alerts from the tracker will arrive in this chat.',
  );

  const linked = user.telegramChats.find((chat) => chat.chatId === chatId)!;
  return { connected: true, chat: toChatDto(linked) };
}

/** Sends a test message to one chat, or to every linked chat when `chatId` is omitted. */
export async function sendTelegramTest(
  userId: string,
  chatId?: string,
): Promise<{ sent: number; failed: Array<{ chatId: string; reason: string }> }> {
  assertConfigured();
  const user = await load(userId);
  const chats = (user.telegramChats ?? []).filter((chat) => !chatId || chat.chatId === chatId);
  if (chats.length === 0) {
    throw chatId ? notFound('That Telegram chat is not connected.') : badRequest('Connect Telegram first.');
  }

  const results = await Promise.all(
    chats.map(async (chat) => ({
      chat,
      result: await telegramService().sendMessage(
        chat.chatId,
        '🔔 <b>Test message</b>\nTelegram alerts are working. Price alerts will look like this, with a link to the product.',
      ),
    })),
  );

  const failed = results.filter(({ result }) => result.status !== 'sent');
  if (failed.length === results.length) {
    // Nothing got through: report the first reason. Permanent failures (bot
    // blocked, chat deleted) are the user's to fix, so say so.
    const { chat, result } = failed[0]!;
    const reason = `${chat.chatTitle ?? 'Telegram chat'}: ${result.failureReason ?? 'Telegram did not accept the message'}`;
    throw result.retryable === false
      ? badRequest(`${reason}. Remove this chat and connect it again.`)
      : new AppError(502, 'UPSTREAM_UNAVAILABLE', reason);
  }

  return {
    sent: results.length - failed.length,
    failed: failed.map(({ chat, result }) => ({
      chatId: chat.chatId,
      reason: `${chat.chatTitle ?? 'Telegram chat'}: ${result.failureReason ?? 'not delivered'}`,
    })),
  };
}

export async function removeTelegramChat(userId: string, chatId: string): Promise<TelegramChatDto[]> {
  const user = await load(userId);
  const before = user.telegramChats.length;
  user.telegramChats = user.telegramChats.filter((chat) => chat.chatId !== chatId);
  if (user.telegramChats.length === before) throw notFound('That Telegram chat is not connected.');
  await user.save();
  return user.telegramChats.map(toChatDto);
}

/** Abandons an unfinished link, so its code stops working straight away. */
export async function cancelTelegramLink(userId: string): Promise<void> {
  await User.updateOne({ _id: userId }, { $unset: { telegramLink: 1 } });
}

/** Test seam: forget the cached bot username. */
export function resetTelegramCache(): void {
  cachedBotUsername = undefined;
}
