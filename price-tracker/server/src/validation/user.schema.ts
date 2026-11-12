import { z } from 'zod';
import { ALERT_MODES, MARKETPLACES, NOTIFICATION_CHANNELS } from '../config/constants';
import { dropPercent, pagination, phoneNumber, timezone } from './common';

export const updateProfileSchema = z
  .object({
    name: z.string().trim().min(1).max(120).optional(),
    phone: phoneNumber.nullable().optional(),
    timezone: timezone.optional(),
  })
  .refine((data) => Object.keys(data).length > 0, { message: 'Nothing to update' });

export const notificationSettingsSchema = z
  .object({
    channel: z.enum(NOTIFICATION_CHANNELS).optional(),
    alertMode: z.enum(ALERT_MODES).optional(),
    minIntervalMinutes: z.number().int().min(0).max(10080).optional(),
    quietHours: z
      .object({
        enabled: z.boolean(),
        startHour: z.number().int().min(0).max(23),
        endHour: z.number().int().min(0).max(23),
      })
      .optional(),
    alertRules: z
      .object({
        dropPercent: dropPercent.optional(),
        allTimeLow: z.boolean().optional(),
        backInStock: z.boolean().optional(),
      })
      .strict()
      .optional(),
  })
  .refine((data) => Object.keys(data).length > 0, { message: 'Nothing to update' });

export const listAlertsSchema = pagination.extend({
  state: z.enum(['triggered', 'acknowledged', 'reset']).optional(),
  unreadOnly: z
    .enum(['true', 'false'])
    .optional()
    .transform((v) => v === 'true'),
});

export const updateAlertSchema = z
  .object({
    state: z.enum(['acknowledged', 'reset']).optional(),
    read: z.boolean().optional(),
  })
  .refine((data) => Object.keys(data).length > 0, { message: 'Nothing to update' });

/**
 * Connecting a marketplace session.
 *
 * `payload` is an opaque artefact produced by the *user's own* browser after
 * they signed in directly with the marketplace. The server additionally screens
 * it for credential-shaped content before storing it encrypted.
 */
export const connectSessionSchema = z.object({
  marketplace: z.enum(MARKETPLACES),
  payload: z.string().min(1).max(8192),
  label: z.string().trim().max(120).optional(),
  expiresInDays: z.number().int().min(1).max(90).optional(),
});

export const marketplaceParamSchema = z.object({ marketplace: z.enum(MARKETPLACES) });

/** Telegram chat ids: integers, negative for groups and channels. */
const telegramChatId = z.string().regex(/^-?\d{1,20}$/, 'Invalid Telegram chat id');

export const telegramChatParamSchema = z.object({ chatId: telegramChatId });

/** Omit `chatId` to test every linked chat. */
export const telegramTestSchema = z.object({ chatId: telegramChatId.optional() }).strict();
