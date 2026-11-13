import { MARKETPLACE_LABEL, type AlertDeliveryStatus, type DeliveryChannel } from '../config/constants';
import { Alert, alertChannels, type AlertDelivery } from '../models/Alert';
import { Product } from '../models/Product';
import { User, type IUser } from '../models/User';
import { getLinkedWhatsAppAccount } from '../models/WhatsApp';
import { fingerprint } from '../utils/crypto';
import { deliverPriceAlert, type PriceAlertPayload } from './notification';

/** Where one copy of an alert goes. `key` is what gets stored; `to` is never persisted. */
interface Destination {
  key: string;
  channel: DeliveryChannel;
  to: string;
  label: string;
}

/** A chosen channel with nobody to send to, and why. */
interface Unreachable {
  channel: DeliveryChannel;
  reason: string;
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

export const CHANNEL_NAME: Record<DeliveryChannel, string> = {
  whatsapp: 'WhatsApp',
  telegram: 'Telegram',
  sms: 'SMS',
  call: 'Phone call',
};

type DeliveryUser = Pick<IUser, 'phone'> & {
  telegramChats?: IUser['telegramChats'];
  whatsappRecipients?: IUser['whatsappRecipients'];
};

function plan(
  channels: DeliveryChannel[],
  user: DeliveryUser,
  whatsappLinked: boolean,
): { destinations: Destination[]; unreachable: Unreachable[] } {
  const destinations: Destination[] = [];
  const unreachable: Unreachable[] = [];

  for (const channel of channels) {
    switch (channel) {
      case 'telegram': {
        const chats = user.telegramChats ?? [];
        if (chats.length === 0) unreachable.push({ channel, reason: 'no Telegram chat is connected' });
        for (const chat of chats) {
          destinations.push({
            key: `tg:${chat.chatId}`,
            channel,
            to: chat.chatId,
            label: chat.chatTitle ?? 'a Telegram chat',
          });
        }
        break;
      }
      case 'whatsapp': {
        const recipients = user.whatsappRecipients ?? [];
        if (!whatsappLinked) {
          unreachable.push({ channel, reason: 'no WhatsApp account is linked to send from' });
        } else if (recipients.length === 0) {
          unreachable.push({ channel, reason: 'no WhatsApp numbers have been added' });
        } else {
          for (const recipient of recipients) {
            destinations.push({
              key: `wa:${fingerprint(recipient.phone)}`,
              channel,
              to: recipient.jid ?? recipient.phone,
              label: recipient.name ? `${recipient.name} on WhatsApp` : `${recipient.phone} on WhatsApp`,
            });
          }
        }
        break;
      }
      default:
        if (user.phone) {
          destinations.push({
            key: channel,
            channel,
            to: user.phone,
            label: channel === 'sms' ? 'your phone by SMS' : 'your phone by call',
          });
        } else {
          unreachable.push({ channel, reason: 'no mobile number is set' });
        }
    }
  }
  return { destinations, unreachable };
}

const plain = (d: AlertDelivery): AlertDelivery => ({
  destination: d.destination,
  channel: d.channel,
  status: d.status,
  providerMessageId: d.providerMessageId,
  failureReason: d.failureReason,
  attemptedAt: d.attemptedAt,
});

/**
 * Delivers one alert to every destination, on every channel, that has not had
 * it yet: each Telegram chat, each WhatsApp number, the phone for SMS or a call.
 *
 * Each destination's outcome is recorded on the alert, so when a retry runs it
 * only messages the ones that failed — nobody gets the same alert twice. The
 * alert counts as `sent` once any destination has it; failures for the rest,
 * and channels with nobody to send to, are listed in `failureReason`.
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

  const channels = alertChannels(alert);
  const whatsappLinked =
    channels.includes('whatsapp') && (user.whatsappRecipients?.length ?? 0) > 0
      ? Boolean(await getLinkedWhatsAppAccount())
      : false;
  const { destinations, unreachable } = plan(channels, user, whatsappLinked);
  const unreachableText = unreachable.map((u) => `${CHANNEL_NAME[u.channel]}: ${u.reason}`);

  if (destinations.length === 0) {
    alert.status = 'skipped';
    alert.failureReason =
      unreachableText.join('; ').slice(0, 512) || 'Notifications are turned off for this alert';
    await alert.save();
    return skipped(alert.failureReason);
  }

  const previous = (alert.deliveries ?? []).map(plain);
  const delivered = new Set(previous.filter((d) => d.status === 'sent').map((d) => d.destination));
  const pending = destinations.filter((d) => !delivered.has(d.key));
  if (pending.length === 0) return skipped('already delivered');

  const base: Omit<PriceAlertPayload, 'to' | 'channel'> = {
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
      result: await deliverPriceAlert({ ...base, channel: destination.channel, to: destination.to }),
    })),
  );

  const attemptedAt = new Date();
  const pendingKeys = new Set(pending.map((d) => d.key));
  const deliveries: AlertDelivery[] = [
    ...previous.filter((d) => !pendingKeys.has(d.destination)),
    ...results.map(({ destination, result }) => ({
      destination: destination.key,
      channel: destination.channel,
      status: result.status,
      providerMessageId: result.providerMessageId,
      failureReason: result.failureReason?.slice(0, 512),
      attemptedAt,
    })),
  ];

  // Summarise over the destinations that exist now; a chat or number removed
  // since the last attempt no longer counts.
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

  const problems = [
    ...(destinations.length === 1 && unreachable.length === 0
      ? failed.map((d) => d.failureReason ?? d.status)
      : failed.map(
          (d) => `Not delivered to ${labels.get(d.destination)}: ${d.failureReason ?? d.status}`,
        )),
    ...unreachableText,
  ];
  alert.failureReason = problems.length ? problems.join('; ').slice(0, 512) : undefined;
  await alert.save();

  const retryable = results.filter(
    ({ result }) => result.status === 'failed' && result.retryable !== false,
  );
  if (retryable.length > 0) {
    throw new RetryableDeliveryError(alert.failureReason ?? 'Notification delivery failed');
  }

  return { status: alert.status, reason: alert.failureReason, sent: sent.length, failed: failed.length };
}
