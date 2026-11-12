import { z } from 'zod';
import {
  ALERT_MODES,
  CHECK_INTERVAL_CHOICES,
  MARKETPLACES,
  NOTIFICATION_CHANNELS,
  PRODUCT_STATUSES,
} from '../config/constants';
import { objectId, pagination, productUrl } from './common';

const targetPrice = z
  .number({ invalid_type_error: 'Enter a target price' })
  .positive('Target price must be greater than zero')
  .max(10_000_000, 'That target price looks too large')
  // Two decimal places: prices are stored as integer minor units.
  .refine((v) => Number.isFinite(v) && Math.round(v * 100) === Number((v * 100).toFixed(0)), {
    message: 'Use at most two decimal places',
  });

const checkInterval = z
  .number()
  .int()
  .refine(
    (v) => (CHECK_INTERVAL_CHOICES as readonly number[]).includes(v),
    `Choose one of: ${CHECK_INTERVAL_CHOICES.join(', ')} minutes`,
  );

export const createProductSchema = z.object({
  productUrl,
  targetPrice,
  checkInterval: checkInterval.default(360),
  nickname: z.string().trim().max(120).optional(),
  notificationChannel: z.enum(NOTIFICATION_CHANNELS).optional(),
  alertMode: z.enum(ALERT_MODES).optional(),
  comparisonGroup: z.string().trim().max(64).optional(),
  /**
   * Accepted but never trusted: the server detects the marketplace from the URL
   * and rejects the request if the client's claim disagrees.
   */
  marketplace: z.enum(MARKETPLACES).optional(),
});

export const updateProductSchema = z
  .object({
    targetPrice: targetPrice.optional(),
    checkInterval: checkInterval.optional(),
    nickname: z.string().trim().max(120).nullable().optional(),
    notificationChannel: z.enum(NOTIFICATION_CHANNELS).optional(),
    alertMode: z.enum(ALERT_MODES).optional(),
    comparisonGroup: z.string().trim().max(64).nullable().optional(),
    status: z.enum(['active', 'paused']).optional(),
  })
  .refine((data) => Object.keys(data).length > 0, { message: 'Nothing to update' });

export const productSettingsSchema = z
  .object({
    checkInterval: checkInterval.optional(),
    notificationChannel: z.enum(NOTIFICATION_CHANNELS).optional(),
    alertMode: z.enum(ALERT_MODES).optional(),
    comparisonGroup: z.string().trim().max(64).nullable().optional(),
  })
  .refine((data) => Object.keys(data).length > 0, { message: 'Nothing to update' });

export const listProductsSchema = pagination.extend({
  status: z.enum(PRODUCT_STATUSES).optional(),
  marketplace: z.enum(MARKETPLACES).optional(),
  search: z.string().trim().max(120).optional(),
  sort: z.enum(['newest', 'priceAsc', 'priceDesc', 'closestToTarget']).default('newest'),
});

export const historyQuerySchema = z.object({
  range: z.enum(['24h', '7d', '30d', '3m', 'all']).default('30d'),
});

export const compareQuerySchema = z.object({
  ids: z
    .string()
    .optional()
    .transform((value) => (value ? value.split(',').map((s) => s.trim()).filter(Boolean) : undefined))
    .refine((ids) => !ids || ids.length <= 6, 'Compare at most six products at a time'),
  group: z.string().trim().max(64).optional(),
});

export const previewUrlSchema = z.object({ productUrl });

export type CreateProductBody = z.infer<typeof createProductSchema>;
export type UpdateProductBody = z.infer<typeof updateProductSchema>;
export type ListProductsQuery = z.infer<typeof listProductsSchema>;
export { objectId };
