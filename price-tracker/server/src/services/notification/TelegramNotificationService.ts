import { telegramConfigured } from '../../config/env';
import { logger } from '../../config/logger';
import { callTelegram, TelegramApiError } from './telegram';
import { priceAlertTelegram } from './templates';
import type { DeliveryResult, PriceAlertPayload } from './types';

/**
 * Telegram Bot API delivery. `to` is a chat id captured when the user tapped
 * Start on the bot (see telegram.service). Like the Twilio transport, failures
 * come back as `DeliveryResult`s rather than exceptions.
 */
export class TelegramNotificationService {
  readonly name = 'telegram';

  isConfigured(): boolean {
    return telegramConfigured;
  }

  async sendMessage(chatId: string, html: string): Promise<DeliveryResult> {
    if (!this.isConfigured()) {
      return { status: 'skipped', failureReason: 'Telegram is not configured on the server' };
    }

    try {
      const message = await callTelegram<{ message_id: number }>('sendMessage', {
        chat_id: chatId,
        text: html,
        parse_mode: 'HTML',
      });
      logger.info(
        { channel: 'telegram', providerMessageId: message.message_id },
        'notification sent',
      );
      return { status: 'sent', providerMessageId: `tg-${message.message_id}` };
    } catch (err) {
      const reason = err instanceof Error ? err.message : 'Unknown Telegram error';
      const permanent = err instanceof TelegramApiError && err.permanent;
      logger.error({ channel: 'telegram', reason, permanent }, 'notification delivery failed');
      return { status: 'failed', failureReason: reason.slice(0, 500), retryable: !permanent };
    }
  }

  async sendPriceAlert(payload: PriceAlertPayload): Promise<DeliveryResult> {
    return this.sendMessage(payload.to, priceAlertTelegram(payload));
  }
}
