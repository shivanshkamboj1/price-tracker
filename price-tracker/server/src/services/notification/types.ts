import type { AlertType, DeliveryChannel, PhoneChannel } from '../../config/constants';

export interface MessageRequest {
  /** E.164 destination, e.g. +919876543210. */
  to: string;
  body: string;
}

export interface DeliveryResult {
  status: 'sent' | 'failed' | 'skipped';
  /** Provider message identifier (a Twilio SID) — an id, never a credential. */
  providerMessageId?: string;
  failureReason?: string;
  /** False when retrying cannot succeed (bot blocked, chat gone). Defaults to retryable. */
  retryable?: boolean;
}

export interface PriceAlertPayload {
  /** Phone number for SMS / call; WhatsApp id or number for WhatsApp; chat id for Telegram. */
  to: string;
  channel: DeliveryChannel;
  /** Triggers that fired, highest priority first. Empty is read as `target_reached`. */
  reasons: AlertType[];
  productTitle: string;
  marketplaceLabel: string;
  currentPrice: number; // minor units
  targetPrice: number;
  currency: string;
  productUrl: string;
  lowestPrice?: number;
  /** For `price_drop`: the price it fell from. */
  dropFromPrice?: number;
  /** For `all_time_low`: the previous lowest price. */
  previousLowestPrice?: number;
}

export type PhoneAlertPayload = PriceAlertPayload & { channel: PhoneChannel };

/**
 * SMS and voice calls to the account's phone (Twilio, or the logging stand-in).
 *
 * Nothing outside this folder knows that Twilio exists: the worker asks for a
 * price alert to be delivered and gets back a `DeliveryResult`. Telegram and
 * WhatsApp are separate transports; `deliverPriceAlert` routes by channel.
 */
export interface NotificationService {
  readonly name: string;
  isConfigured(): boolean;
  sendSms(message: MessageRequest): Promise<DeliveryResult>;
  /** Places a voice call and speaks `body`. Use for alerts that must interrupt. */
  sendVoiceCall(message: MessageRequest): Promise<DeliveryResult>;
  sendPriceAlert(payload: PhoneAlertPayload): Promise<DeliveryResult>;
}
