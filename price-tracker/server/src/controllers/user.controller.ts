import type { Request, Response } from 'express';
import type { Marketplace } from '../config/constants';
import {
  getProfile,
  updateNotificationSettings,
  updateProfile,
  type NotificationSettingsUpdate,
  type ProfileUpdate,
} from '../services/user.service';
import {
  connectSession,
  disconnectSession,
  listSessions,
} from '../services/marketplaceSession.service';
import {
  cancelTelegramLink,
  completeTelegramLink,
  getTelegramStatus,
  removeTelegramChat,
  sendTelegramTest,
  startTelegramLink,
} from '../services/telegram.service';
import { asyncHandler, sendOk } from '../utils/http';

export const profile = asyncHandler(async (req: Request, res: Response) => {
  const user = await getProfile(req.auth!.userId);
  return sendOk(res, { user: user.toJSON() });
});

export const patchProfile = asyncHandler<unknown, unknown, ProfileUpdate>(async (req, res) => {
  const user = await updateProfile(req.auth!.userId, req.body);
  return sendOk(res, { user: user.toJSON() });
});

export const patchNotificationSettings = asyncHandler<unknown, unknown, NotificationSettingsUpdate>(
  async (req, res) => {
    const user = await updateNotificationSettings(req.auth!.userId, req.body);
    return sendOk(res, { notificationPrefs: user.notificationPrefs });
  },
);

/* -------------------------------- telegram -------------------------------- */

export const telegramStatus = asyncHandler(async (req: Request, res: Response) => {
  return sendOk(res, await getTelegramStatus(req.auth!.userId));
});

export const telegramLink = asyncHandler(async (req: Request, res: Response) => {
  return sendOk(res, await startTelegramLink(req.auth!.userId));
});

export const telegramVerify = asyncHandler(async (req: Request, res: Response) => {
  return sendOk(res, await completeTelegramLink(req.auth!.userId));
});

export const telegramTest = asyncHandler<unknown, unknown, { chatId?: string }>(
  async (req, res) => {
    return sendOk(res, await sendTelegramTest(req.auth!.userId, req.body?.chatId));
  },
);

export const telegramCancelLink = asyncHandler(async (req: Request, res: Response) => {
  await cancelTelegramLink(req.auth!.userId);
  return sendOk(res, { cancelled: true });
});

export const telegramRemoveChat = asyncHandler<{ chatId: string }>(async (req, res) => {
  const chats = await removeTelegramChat(req.auth!.userId, req.params.chatId);
  return sendOk(res, { chats });
});

/* --------------------- optional marketplace sessions --------------------- */

export const sessions = asyncHandler(async (req: Request, res: Response) => {
  return sendOk(res, await listSessions(req.auth!.userId));
});

/**
 * Stores a session artefact the user's own browser produced after signing in
 * directly with the marketplace. The service rejects anything credential-shaped
 * and encrypts what it keeps.
 */
export const connectMarketplaceSession = asyncHandler<
  unknown,
  unknown,
  { marketplace: Marketplace; payload: string; label?: string; expiresInDays?: number }
>(async (req, res) => {
  const session = await connectSession({ userId: req.auth!.userId, ...req.body });
  return sendOk(res, { session });
});

export const disconnectMarketplaceSession = asyncHandler<{ marketplace: Marketplace }>(
  async (req, res) => {
    const session = await disconnectSession(req.auth!.userId, req.params.marketplace);
    return sendOk(res, { session });
  },
);
