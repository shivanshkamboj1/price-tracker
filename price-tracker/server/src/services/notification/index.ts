import { twilioConfigured } from '../../config/env';
import { logger } from '../../config/logger';
import { LogNotificationService } from './LogNotificationService';
import { TelegramNotificationService } from './TelegramNotificationService';
import { TwilioNotificationService } from './TwilioNotificationService';
import { WhatsAppNotificationService } from './WhatsAppNotificationService';
import type { DeliveryResult, NotificationService, PriceAlertPayload } from './types';

let instance: NotificationService | undefined;
let telegram: TelegramNotificationService | undefined;
let whatsapp: WhatsAppNotificationService | undefined;

/**
 * Resolves the SMS / call transport once per process: Twilio when it is
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

export function whatsappService(): WhatsAppNotificationService {
  whatsapp ??= new WhatsAppNotificationService();
  return whatsapp;
}

/** Sends a price alert through whichever transport owns its channel. */
export function deliverPriceAlert(payload: PriceAlertPayload): Promise<DeliveryResult> {
  switch (payload.channel) {
    case 'telegram':
      return telegramService().sendPriceAlert(payload);
    case 'whatsapp':
      return whatsappService().sendPriceAlert(payload);
    default:
      return notificationService().sendPriceAlert({ ...payload, channel: payload.channel });
  }
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
