import type { Types } from 'mongoose';
import {
  MARKETPLACE_LABEL,
  type AlertMode,
  type Availability,
  type NotificationChannel,
} from '../config/constants';
import { Alert, type AlertDocument } from '../models/Alert';
import { Product, type IProduct, type ProductDocument } from '../models/Product';
import type { IUser } from '../models/User';
import { priceAlertSms, priceAlertWhatsApp } from './notification/templates';
import { hourInTimezone, hourInWindow, MINUTE_MS } from '../utils/time';
import { notFound } from '../utils/errors';

export type AlertSkipReason =
  | 'no_price'
  | 'above_target'
  | 'out_of_stock'
  | 'already_notified'
  | 'cooling_down'
  | 'channel_disabled'
  | 'no_phone_number';

export interface AlertDecision {
  shouldAlert: boolean;
  reason?: AlertSkipReason;
  /** True when the price climbed back above target and the trigger should re-arm. */
  shouldDisarm: boolean;
  channel: NotificationChannel;
  /** Milliseconds to hold the message for, when quiet hours are in effect. */
  delayMs: number;
}

export interface AlertInputs {
  price: number | null;
  availability: Availability;
  targetPrice: number;
  alertArmed: boolean;
  lastAlertAt?: Date;
  alertMode: AlertMode;
  channel: NotificationChannel;
  hasPhone: boolean;
  minIntervalMinutes: number;
  quietHours: { enabled: boolean; startHour: number; endHour: number };
  timezone: string;
  now?: Date;
}

/**
 * Pure decision function — no I/O — so the alerting rules are directly testable.
 *
 * The two modes the user can pick:
 *   `once`   — one alert per breach; re-arms only after the price goes back above target
 *   `always` — alert on every breach, throttled by `minIntervalMinutes`
 */
export function evaluateAlert(input: AlertInputs): AlertDecision {
  const now = input.now ?? new Date();
  const base = { shouldAlert: false, shouldDisarm: false, channel: input.channel, delayMs: 0 };

  if (input.price === null) return { ...base, reason: 'no_price' };

  if (input.price > input.targetPrice) {
    // Price is back above target: clear the latch so the next drop alerts again.
    return { ...base, reason: 'above_target', shouldDisarm: input.alertArmed };
  }
  if (input.availability === 'out_of_stock') return { ...base, reason: 'out_of_stock' };

  if (input.alertMode === 'once' && input.alertArmed) {
    return { ...base, reason: 'already_notified' };
  }
  if (input.alertMode === 'always' && input.lastAlertAt) {
    const elapsed = now.getTime() - input.lastAlertAt.getTime();
    if (elapsed < input.minIntervalMinutes * MINUTE_MS) {
      return { ...base, reason: 'cooling_down' };
    }
  }

  if (input.channel === 'none') return { ...base, reason: 'channel_disabled' };
  if (!input.hasPhone) return { ...base, reason: 'no_phone_number' };

  let delayMs = 0;
  if (input.quietHours.enabled) {
    const hour = hourInTimezone(now, input.timezone);
    if (hourInWindow(hour, input.quietHours.startHour, input.quietHours.endHour)) {
      // Hold until the quiet window ends rather than dropping the alert.
      const hoursUntilEnd = (input.quietHours.endHour - hour + 24) % 24 || 24;
      delayMs = hoursUntilEnd * 60 * MINUTE_MS - now.getMinutes() * MINUTE_MS;
    }
  }

  return { shouldAlert: true, shouldDisarm: false, channel: input.channel, delayMs };
}

/** Resolves the effective channel and mode: per-product override, else user default. */
export function resolveAlertSettings(
  product: Pick<IProduct, 'notificationChannel' | 'alertMode'>,
  user: Pick<IUser, 'notificationPrefs'>,
): { channel: NotificationChannel; alertMode: AlertMode } {
  return {
    channel: product.notificationChannel ?? user.notificationPrefs.channel,
    alertMode: product.alertMode ?? user.notificationPrefs.alertMode,
  };
}

export function renderAlertMessage(
  product: Pick<IProduct, 'title' | 'marketplace' | 'productUrl' | 'targetPrice' | 'lowestPrice' | 'currency'>,
  price: number,
  channel: Exclude<NotificationChannel, 'none'>,
): string {
  const payload = {
    to: '',
    channel,
    productTitle: product.title,
    marketplaceLabel: MARKETPLACE_LABEL[product.marketplace],
    currentPrice: price,
    targetPrice: product.targetPrice,
    currency: product.currency,
    productUrl: product.productUrl,
    lowestPrice: product.lowestPrice,
  };
  return channel === 'whatsapp' ? priceAlertWhatsApp(payload) : priceAlertSms(payload);
}

/** Persists a triggered alert in `pending` state; delivery happens in its own job. */
export async function createPendingAlert(
  product: ProductDocument,
  price: number,
  channel: Exclude<NotificationChannel, 'none'>,
): Promise<AlertDocument> {
  return Alert.create({
    userId: product.userId,
    productId: product._id,
    type: 'target_reached',
    price,
    targetPrice: product.targetPrice,
    currency: product.currency,
    channel,
    status: 'pending',
    state: 'triggered',
    message: renderAlertMessage(product, price, channel),
  });
}

/* ------------------------- user-facing operations ------------------------- */

export async function listAlerts(
  userId: string,
  options: { page: number; limit: number; state?: string; unreadOnly?: boolean },
): Promise<{ items: unknown[]; total: number; unread: number }> {
  const filter: Record<string, unknown> = { userId };
  if (options.state) filter.state = options.state;
  if (options.unreadOnly) filter.readAt = { $exists: false };

  const [items, total, unread] = await Promise.all([
    Alert.find(filter)
      .sort({ createdAt: -1 })
      .skip((options.page - 1) * options.limit)
      .limit(options.limit)
      .populate('productId', 'title imageUrl marketplace productUrl currency')
      .lean(),
    Alert.countDocuments(filter),
    Alert.countDocuments({ userId, readAt: { $exists: false } }),
  ]);

  return { items, total, unread };
}

export async function updateAlertState(
  userId: string,
  alertId: string,
  patch: { state?: 'acknowledged' | 'reset'; read?: boolean },
): Promise<AlertDocument> {
  const alert = await Alert.findOne({ _id: alertId, userId });
  if (!alert) throw notFound('Alert not found');

  if (patch.state) {
    alert.state = patch.state;
    if (patch.state === 'acknowledged') alert.acknowledgedAt = new Date();
    if (patch.state === 'reset') {
      // Re-arms the product so the next breach notifies again.
      await Product.updateOne({ _id: alert.productId, userId }, { $set: { alertArmed: false } });
    }
  }
  if (patch.read) alert.readAt = alert.readAt ?? new Date();

  await alert.save();
  return alert;
}

export async function markAllRead(userId: string): Promise<number> {
  const result = await Alert.updateMany(
    { userId, readAt: { $exists: false } },
    { $set: { readAt: new Date() } },
  );
  return result.modifiedCount;
}

export async function countTriggered(userId: string | Types.ObjectId): Promise<number> {
  return Alert.countDocuments({ userId, status: 'sent' });
}
