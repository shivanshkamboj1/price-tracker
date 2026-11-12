import { twilioConfigured } from '../../config/env';
import { logger } from '../../config/logger';
import { LogNotificationService } from './LogNotificationService';
import { TelegramNotificationService } from './TelegramNotificationService';
import { TwilioNotificationService } from './TwilioNotificationService';
import type { DeliveryResult, NotificationService, PriceAlertPayload } from './types';

let instance: NotificationService | undefined;
let telegram: TelegramNotificationService | undefined;

/**
 * Resolves the phone-number transport once per process: Twilio when it is
 * configured, otherwise a logging transport so local development and tests work
 * without credentials.
 */
export function notificationService(): NotificationService {
  if (!instance) {
    instance = twilioConfigured ? new TwilioNotificationService() : new LogNotificationService();
    logger.info({ transport: instance.name }, 'notification transport selected');
  }
  return instance;
}

export function telegramService(): TelegramNotificationService {
  telegram ??= new TelegramNotificationService();
  return telegram;
}

/** Sends a price alert through whichever transport owns its channel. */
export function deliverPriceAlert(payload: PriceAlertPayload): Promise<DeliveryResult> {
  if (payload.channel === 'telegram') return telegramService().sendPriceAlert(payload);
  return notificationService().sendPriceAlert({ ...payload, channel: payload.channel });
}

/** Test seams. */
export function setNotificationService(service: NotificationService | undefined): void {
  instance = service;
}

export function setTelegramService(service: TelegramNotificationService | undefined): void {
  telegram = service;
}

export * from './types';
export { priceAlertSms, priceAlertTelegram, priceAlertWhatsApp } from './templates';
