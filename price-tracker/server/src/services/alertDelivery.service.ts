import { MARKETPLACE_LABEL, type AlertDeliveryStatus, type NotificationChannel } from '../config/constants';
import { Alert, type AlertDelivery } from '../models/Alert';
import { Product } from '../models/Product';
import { User, type IUser } from '../models/User';
import { deliverPriceAlert, type PriceAlertPayload } from './notification';

/** Where one copy of an alert goes. `key` is what gets stored; `to` is never persisted. */
interface Destination {
  key: string;
  to: string;
  label: string;
}

/** Thrown after the alert is saved, so BullMQ retries the destinations that failed. */
export class RetryableDeliveryError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'RetryableDeliveryError';
  }
}

export interface DeliveryOutcome {
  status: AlertDeliveryStatus;
  reason?: string;
  sent: number;
  failed: number;
}

function destinationsFor(
  channel: NotificationChannel,
  user: Pick<IUser, 'phone'> & { telegramChats?: IUser['telegramChats'] },
): Destination[] {
  if (channel === 'none') return [];
  if (channel === 'telegram') {
    return (user.telegramChats ?? []).map((chat) => ({
      key: `tg:${chat.chatId}`,
      to: chat.chatId,
      label: chat.chatTitle ?? 'a Telegram chat',
    }));
  }
  return user.phone ? [{ key: 'phone', to: user.phone, label: 'your phone' }] : [];
}

const plain = (d: AlertDelivery): AlertDelivery => ({
  destination: d.destination,
  status: d.status,
  providerMessageId: d.providerMessageId,
  failureReason: d.failureReason,
  attemptedAt: d.attemptedAt,
});

/**
 * Delivers one alert to every destination of its channel that has not had it yet.
 *
 * Each destination's outcome is recorded on the alert, so when a retry runs it
 * only messages the chats that failed — nobody gets the same alert twice. The
 * alert counts as `sent` once any destination has it; failures for the rest are
 * listed in `failureReason`.
 *
 * Throws `RetryableDeliveryError` (after saving) when a failure might clear up
 * on its own, which hands the retry schedule to BullMQ.
 */
export async function deliverAlert(alertId: string): Promise<DeliveryOutcome> {
  const skipped = (reason: string): DeliveryOutcome => ({ status: 'skipped', reason, sent: 0, failed: 0 });

  const alert = await Alert.findById(alertId);
  if (!alert) return skipped('alert no longer exists');
  // Alerts delivered before per-destination tracking existed have no `deliveries`.
  if (alert.status === 'sent' && !alert.deliveries?.length) return skipped('already delivered');

  const [user, product] = await Promise.all([
    User.findById(alert.userId).lean(),
    Product.findById(alert.productId).lean(),
  ]);

  if (!user || !product) {
    alert.status = 'skipped';
    alert.failureReason = 'User or product no longer exists';
    await alert.save();
    return skipped(alert.failureReason);
  }

  const channel = alert.channel;
  const destinations = destinationsFor(channel, user);
  if (channel === 'none' || destinations.length === 0) {
    alert.status = 'skipped';
    alert.failureReason =
      alert.channel === 'telegram'
        ? 'No Telegram chat is connected to this account'
        : 'No delivery channel is configured for this account';
    await alert.save();
    return skipped(alert.failureReason);
  }

  const previous = (alert.deliveries ?? []).map(plain);
  const delivered = new Set(previous.filter((d) => d.status === 'sent').map((d) => d.destination));
  const pending = destinations.filter((d) => !delivered.has(d.key));
  if (pending.length === 0) return skipped('already delivered');

  const payload: Omit<PriceAlertPayload, 'to'> = {
    channel,
    reasons: alert.reasons?.length ? [...alert.reasons] : [alert.type],
    dropFromPrice: alert.dropFromPrice,
    previousLowestPrice: alert.previousLowestPrice,
    productTitle: product.nickname ?? product.title,
    marketplaceLabel: MARKETPLACE_LABEL[product.marketplace],
    currentPrice: alert.price,
    targetPrice: alert.targetPrice,
    currency: alert.currency,
    productUrl: product.productUrl,
    lowestPrice: product.lowestPrice,
  };

  const results = await Promise.all(
    pending.map(async (destination) => ({
      destination,
      result: await deliverPriceAlert({ ...payload, to: destination.to }),
    })),
  );

  const attemptedAt = new Date();
  const pendingKeys = new Set(pending.map((d) => d.key));
  const deliveries: AlertDelivery[] = [
    ...previous.filter((d) => !pendingKeys.has(d.destination)),
    ...results.map(({ destination, result }) => ({
      destination: destination.key,
      status: result.status,
      providerMessageId: result.providerMessageId,
      failureReason: result.failureReason?.slice(0, 512),
      attemptedAt,
    })),
  ];

  // Summarise over the destinations that exist now; a chat unlinked since the
  // last attempt no longer counts.
  const labels = new Map(destinations.map((d) => [d.key, d.label]));
  const current = deliveries.filter((d) => labels.has(d.destination));
  const sent = current.filter((d) => d.status === 'sent');
  const failed = current.filter((d) => d.status !== 'sent');

  alert.deliveries = deliveries;
  alert.status =
    sent.length > 0 ? 'sent' : failed.every((d) => d.status === 'skipped') ? 'skipped' : 'failed';
  if (sent.length > 0) {
    alert.sentAt ??= attemptedAt;
    alert.providerMessageId = sent[0]!.providerMessageId;
  }
  alert.failureReason =
    failed.length === 0
      ? undefined
      : destinations.length === 1
        ? failed[0]!.failureReason
        : failed
            .map((d) => `Not delivered to ${labels.get(d.destination)}: ${d.failureReason ?? d.status}`)
            .join('; ')
            .slice(0, 512);
  await alert.save();

  const retryable = results.filter(
    ({ result }) => result.status === 'failed' && result.retryable !== false,
  );
  if (retryable.length > 0) {
    throw new RetryableDeliveryError(alert.failureReason ?? 'Notification delivery failed');
  }

  return { status: alert.status, reason: alert.failureReason, sent: sent.length, failed: failed.length };
}
