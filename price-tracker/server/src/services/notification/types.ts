import type { NotificationChannel } from '../../config/constants';

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
}

export interface PriceAlertPayload {
  to: string;
  channel: Exclude<NotificationChannel, 'none'>;
  productTitle: string;
  marketplaceLabel: string;
  currentPrice: number; // minor units
  targetPrice: number;
  currency: string;
  productUrl: string;
  lowestPrice?: number;
}

/**
 * The application's outbound messaging surface.
 *
 * Nothing outside this folder knows that Twilio exists: the worker asks for a
 * price alert to be delivered and gets back a `DeliveryResult`. Swapping the
 * provider, or adding email, means adding one implementation here.
 */
export interface NotificationService {
  readonly name: string;
  isConfigured(): boolean;
  sendSms(message: MessageRequest): Promise<DeliveryResult>;
  sendWhatsApp(message: MessageRequest): Promise<DeliveryResult>;
  /** Places a voice call and speaks `body`. Use for alerts that must interrupt. */
  sendVoiceCall(message: MessageRequest): Promise<DeliveryResult>;
  sendPriceAlert(payload: PriceAlertPayload): Promise<DeliveryResult>;
}
