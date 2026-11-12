import type { Types } from 'mongoose';
import {
  ALERT_TYPES,
  MARKETPLACE_LABEL,
  type AlertMode,
  type AlertType,
  type Availability,
  type DeliveryChannel,
  type NotificationChannel,
  type SmartAlertType,
} from '../config/constants';
import { Alert, type AlertDocument } from '../models/Alert';
import { Product, type IProduct, type ProductDocument } from '../models/Product';
import type { AlertRules, IUser } from '../models/User';
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
  | 'no_destination';

/** Account defaults for users created before smart alerts existed. */
export const DEFAULT_ALERT_RULES: AlertRules = {
  dropPercent: 0,
  allTimeLow: false,
  backInStock: true,
};

const NO_SMART_RULES: AlertRules = { dropPercent: 0, allTimeLow: false, backInStock: false };

export interface AlertDecision {
  shouldAlert: boolean;
  /** Triggers that fired and will be delivered, highest priority first. */
  reasons: AlertType[];
  /** Why nothing is sent. When no smart rule fired, this describes the target rule. */
  reason?: AlertSkipReason;
  /** True when the price climbed back above target and the trigger should re-arm. */
  shouldDisarm: boolean;
  channel: NotificationChannel;
  /** Milliseconds to hold the message for, when quiet hours are in effect. */
  delayMs: number;
  /** Baseline the percentage-drop rule should carry into the next check. */
  dropReferencePrice?: number;
}

export interface AlertInputs {
  price: number | null;
  availability: Availability;
  targetPrice: number;
  alertArmed: boolean;
  lastAlertAt?: Date;
  alertMode: AlertMode;
  channel: NotificationChannel;
  /** Whether the account can be reached on `channel`: a phone number, or a linked Telegram chat. */
  hasDestination: boolean;
  minIntervalMinutes: number;
  quietHours: { enabled: boolean; startHour: number; endHour: number };
  timezone: string;
  now?: Date;

  /** Smart rules in effect. Omitted means only the target price can alert. */
  rules?: AlertRules;
  /** Product state from before this check. */
  previousAvailability?: Availability;
  previousLowestPrice?: number;
  dropReferencePrice?: number;
  lastSmartAlertAt?: Partial<Record<SmartAlertType, Date>>;
}

/** The target-price rule on its own, before delivery is considered. */
function evaluateTarget(
  input: AlertInputs & { price: number },
  now: Date,
): { fired: boolean; reason?: AlertSkipReason; shouldDisarm: boolean } {
  if (input.price > input.targetPrice) {
    // Price is back above target: clear the latch so the next drop alerts again.
    return { fired: false, reason: 'above_target', shouldDisarm: input.alertArmed };
  }
  if (input.availability === 'out_of_stock') {
    return { fired: false, reason: 'out_of_stock', shouldDisarm: false };
  }
  if (input.alertMode === 'once' && input.alertArmed) {
    return { fired: false, reason: 'already_notified', shouldDisarm: false };
  }
  if (input.alertMode === 'always' && input.lastAlertAt) {
    const elapsed = now.getTime() - input.lastAlertAt.getTime();
    if (elapsed < input.minIntervalMinutes * MINUTE_MS) {
      return { fired: false, reason: 'cooling_down', shouldDisarm: false };
    }
  }
  return { fired: true, shouldDisarm: false };
}

function quietHoursDelay(input: AlertInputs, now: Date): number {
  if (!input.quietHours.enabled) return 0;
  const hour = hourInTimezone(now, input.timezone);
  if (!hourInWindow(hour, input.quietHours.startHour, input.quietHours.endHour)) return 0;
  // Hold until the quiet window ends rather than dropping the alert.
  const hoursUntilEnd = (input.quietHours.endHour - hour + 24) % 24 || 24;
  return hoursUntilEnd * 60 * MINUTE_MS - now.getMinutes() * MINUTE_MS;
}

/**
 * Pure decision function — no I/O — so the alerting rules are directly testable.
 *
 * Target price, in one of two modes:
 *   `once`   — one alert per breach; re-arms only after the price goes back above target
 *   `always` — alert on every breach, throttled by `minIntervalMinutes`
 *
 * Smart rules, each edge-triggered and throttled by `minIntervalMinutes`:
 *   all_time_low  — the price is below the lowest price recorded before this check
 *   price_drop    — the price is `dropPercent`% or more below its baseline. The
 *                   baseline is the highest price since the last drop alert, so a
 *                   slow slide still alerts once it adds up to the threshold.
 *   back_in_stock — the listing was out of stock and now is not
 *
 * Every trigger that fires on one check goes out as a single message.
 */
export function evaluateAlert(input: AlertInputs): AlertDecision {
  const now = input.now ?? new Date();
  const base: AlertDecision = {
    shouldAlert: false,
    reasons: [],
    shouldDisarm: false,
    channel: input.channel,
    delayMs: 0,
    dropReferencePrice: input.dropReferencePrice,
  };

  if (input.price === null) return { ...base, reason: 'no_price' };
  const price = input.price;
  const rules = input.rules ?? NO_SMART_RULES;
  const inStock = input.availability !== 'out_of_stock';
  const fired = new Set<AlertType>();

  const coolingDown = (type: SmartAlertType): boolean => {
    const last = input.lastSmartAlertAt?.[type];
    return last !== undefined && now.getTime() - last.getTime() < input.minIntervalMinutes * MINUTE_MS;
  };

  const target = evaluateTarget({ ...input, price }, now);
  if (target.fired) fired.add('target_reached');

  // The first reading has nothing to beat, so it is never a "new" low.
  if (
    rules.allTimeLow &&
    inStock &&
    input.previousLowestPrice !== undefined &&
    price < input.previousLowestPrice &&
    !coolingDown('all_time_low')
  ) {
    fired.add('all_time_low');
  }

  let dropReferencePrice = input.dropReferencePrice;
  if (inStock) {
    if (rules.dropPercent <= 0 || dropReferencePrice === undefined || price > dropReferencePrice) {
      // Rule off: follow the price, so switching it on measures from today.
      // Rule on: the baseline only ratchets upwards until a drop alert resets it.
      dropReferencePrice = price;
    } else if (
      // Integer form of price <= baseline * (1 - percent / 100).
      price * 100 <= dropReferencePrice * (100 - rules.dropPercent) &&
      !coolingDown('price_drop')
    ) {
      fired.add('price_drop');
    }
  }

  if (
    rules.backInStock &&
    input.previousAvailability === 'out_of_stock' &&
    input.availability === 'in_stock' &&
    !coolingDown('back_in_stock')
  ) {
    fired.add('back_in_stock');
  }

  const reasons = ALERT_TYPES.filter((type) => fired.has(type));
  const settled = { ...base, shouldDisarm: target.shouldDisarm, dropReferencePrice };

  if (reasons.length === 0) return { ...settled, reason: target.reason };
  // Undelivered triggers keep their state (latch, baseline) so they fire once
  // a channel is set up, rather than being silently consumed.
  if (input.channel === 'none') return { ...settled, reason: 'channel_disabled' };
  if (!input.hasDestination) return { ...settled, reason: 'no_destination' };

  return {
    shouldAlert: true,
    reasons,
    shouldDisarm: target.shouldDisarm,
    channel: input.channel,
    delayMs: quietHoursDelay(input, now),
    // A delivered drop alert resets the baseline: the next one needs a fresh fall.
    dropReferencePrice: reasons.includes('price_drop') ? price : dropReferencePrice,
  };
}

/**
 * Resolves the effective channel, mode and smart rules: per-product override,
 * else the user's default.
 */
export function resolveAlertSettings(
  product: Pick<IProduct, 'notificationChannel' | 'alertMode' | 'alertRules'>,
  user: Pick<IUser, 'notificationPrefs'>,
): { channel: NotificationChannel; alertMode: AlertMode; rules: AlertRules } {
  // Accounts created before smart alerts have no `alertRules` stored at all.
  const defaults = user.notificationPrefs.alertRules;
  const overrides = product.alertRules;
  return {
    channel: product.notificationChannel ?? user.notificationPrefs.channel,
    alertMode: product.alertMode ?? user.notificationPrefs.alertMode,
    rules: {
      dropPercent:
        overrides?.dropPercent ?? defaults?.dropPercent ?? DEFAULT_ALERT_RULES.dropPercent,
      allTimeLow: overrides?.allTimeLow ?? defaults?.allTimeLow ?? DEFAULT_ALERT_RULES.allTimeLow,
      backInStock:
        overrides?.backInStock ?? defaults?.backInStock ?? DEFAULT_ALERT_RULES.backInStock,
    },
  };
}

/** Whether the account has an address for `channel`. */
export function hasDestinationFor(
  channel: NotificationChannel,
  user: Pick<IUser, 'phone'> & { telegramChats?: IUser['telegramChats'] },
): boolean {
  if (channel === 'none') return false;
  if (channel === 'telegram') return (user.telegramChats?.length ?? 0) > 0;
  return Boolean(user.phone);
}

/** Extra numbers the message needs to explain why it was sent. */
export interface AlertContext {
  reasons: AlertType[];
  dropFromPrice?: number;
  previousLowestPrice?: number;
}

export function renderAlertMessage(
  product: Pick<IProduct, 'title' | 'marketplace' | 'productUrl' | 'targetPrice' | 'lowestPrice' | 'currency'>,
  price: number,
  channel: DeliveryChannel,
  context: AlertContext = { reasons: ['target_reached'] },
): string {
  const payload = {
    to: '',
    channel,
    reasons: context.reasons,
    productTitle: product.title,
    marketplaceLabel: MARKETPLACE_LABEL[product.marketplace],
    currentPrice: price,
    targetPrice: product.targetPrice,
    currency: product.currency,
    productUrl: product.productUrl,
    lowestPrice: product.lowestPrice,
    dropFromPrice: context.dropFromPrice,
    previousLowestPrice: context.previousLowestPrice,
  };
  // The stored copy is plain text; SMS is the only channel that needs the short form.
  return channel === 'sms' ? priceAlertSms(payload) : priceAlertWhatsApp(payload);
}

/** Persists a triggered alert in `pending` state; delivery happens in its own job. */
export async function createPendingAlert(
  product: ProductDocument,
  price: number,
  channel: DeliveryChannel,
  context: AlertContext = { reasons: ['target_reached'] },
): Promise<AlertDocument> {
  return Alert.create({
    userId: product.userId,
    productId: product._id,
    type: context.reasons[0] ?? 'target_reached',
    reasons: context.reasons,
    price,
    targetPrice: product.targetPrice,
    dropFromPrice: context.reasons.includes('price_drop') ? context.dropFromPrice : undefined,
    previousLowestPrice: context.reasons.includes('all_time_low')
      ? context.previousLowestPrice
      : undefined,
    currency: product.currency,
    channel,
    status: 'pending',
    state: 'triggered',
    message: renderAlertMessage(product, price, channel, context),
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
