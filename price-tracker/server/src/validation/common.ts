import { Types } from 'mongoose';
import { z } from 'zod';
import { DELIVERY_CHANNELS } from '../config/constants';
import { isValidTimezone } from '../utils/time';

export const objectId = z
  .string()
  .refine((value) => Types.ObjectId.isValid(value), { message: 'Invalid identifier' });

export const idParam = z.object({ id: objectId });

export const pagination = z.object({
  page: z.coerce.number().int().min(1).max(1000).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
});

/** E.164, e.g. +919876543210. Spaces, dashes and brackets are tolerated and removed. */
export const phoneNumber = z
  .string()
  .trim()
  .transform((value) => value.replace(/[\s()-]/g, ''))
  .pipe(
    z.string().regex(/^\+[1-9]\d{7,14}$/, 'Enter the number in international format, e.g. +919876543210'),
  );

/** A set of delivery channels, each at most once. Empty means "no notifications". */
export const deliveryChannels = z
  .array(z.enum(DELIVERY_CHANNELS))
  .max(DELIVERY_CHANNELS.length)
  .refine((channels) => new Set(channels).size === channels.length, 'Choose each channel once');

/** Percentage-drop alert threshold; 0 switches the rule off. */
export const dropPercent = z
  .number()
  .int()
  .min(0)
  .max(90, 'Use a drop of at most 90%');

export const timezone = z
  .string()
  .trim()
  .max(64)
  .refine(isValidTimezone, { message: 'Unknown timezone' });

/**
 * Passwords: length does most of the work, so the floor is 12 characters and the
 * only composition rule is "not entirely one class". Long passphrases pass.
 */
export const password = z
  .string()
  .min(12, 'Use at least 12 characters')
  .max(200, 'That password is too long')
  .refine((value) => !/^(.)\1+$/.test(value), 'Choose something less repetitive');

export const productUrl = z
  .string()
  .trim()
  .min(10)
  .max(2048)
  .url('Enter the full product URL, including https://');
