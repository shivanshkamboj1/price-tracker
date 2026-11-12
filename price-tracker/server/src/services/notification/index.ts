import { twilioConfigured } from '../../config/env';
import { logger } from '../../config/logger';
import { LogNotificationService } from './LogNotificationService';
import { TwilioNotificationService } from './TwilioNotificationService';
import type { NotificationService } from './types';

let instance: NotificationService | undefined;

/**
 * Resolves the notification transport once per process: Twilio when it is
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

/** Test seam. */
export function setNotificationService(service: NotificationService | undefined): void {
  instance = service;
}

export * from './types';
export { priceAlertSms, priceAlertWhatsApp } from './templates';
