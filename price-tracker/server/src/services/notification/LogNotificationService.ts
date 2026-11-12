import { logger } from '../../config/logger';
import { priceAlertSms, priceAlertVoice, priceAlertWhatsApp } from './templates';
import type {
  DeliveryResult,
  MessageRequest,
  NotificationService,
  PriceAlertPayload,
} from './types';

/**
 * Development / test fallback used when Twilio credentials are absent.
 *
 * It records what *would* have been sent — including the rendered message, so
 * templates can be reviewed — but only the last four digits of the destination.
 */
export class LogNotificationService implements NotificationService {
  readonly name = 'log';

  isConfigured(): boolean {
    return true;
  }

  private emit(channel: string, message: MessageRequest): DeliveryResult {
    logger.info(
      { channel, toSuffix: message.to.slice(-4), body: message.body },
      'notification (log transport)',
    );
    return { status: 'sent', providerMessageId: `log-${Date.now()}` };
  }

  async sendSms(message: MessageRequest): Promise<DeliveryResult> {
    return this.emit('sms', message);
  }

  async sendWhatsApp(message: MessageRequest): Promise<DeliveryResult> {
    return this.emit('whatsapp', message);
  }

  async sendVoiceCall(message: MessageRequest): Promise<DeliveryResult> {
    return this.emit('call', message);
  }

  async sendPriceAlert(payload: PriceAlertPayload): Promise<DeliveryResult> {
    const render = {
      whatsapp: priceAlertWhatsApp,
      call: priceAlertVoice,
      sms: priceAlertSms,
    }[payload.channel];
    return this.emit(payload.channel, { to: payload.to, body: render(payload) });
  }
}
