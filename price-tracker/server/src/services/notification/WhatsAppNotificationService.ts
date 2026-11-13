import { logger } from '../../config/logger';
import { whatsappBridge } from '../whatsapp/bridge';
import { priceAlertWhatsApp } from './templates';
import type { DeliveryResult, PriceAlertPayload } from './types';

/**
 * WhatsApp delivery through the linked WhatsApp account. `to` is a recipient's
 * WhatsApp id (or number). The message is handed to the worker that holds the
 * connection; like the other transports, failures come back as results.
 */
export class WhatsAppNotificationService {
  readonly name = 'whatsapp';

  async sendText(to: string, text: string): Promise<DeliveryResult> {
    const result = await whatsappBridge().run({ type: 'send', to, text });
    if (result.ok) {
      logger.info({ channel: 'whatsapp', providerMessageId: result.messageId }, 'notification sent');
      return {
        status: 'sent',
        providerMessageId: result.messageId ? `wa-${result.messageId}` : undefined,
      };
    }
    logger.error(
      { channel: 'whatsapp', reason: result.error, retryable: result.retryable },
      'notification delivery failed',
    );
    return { status: 'failed', failureReason: result.error.slice(0, 500), retryable: result.retryable };
  }

  async sendPriceAlert(payload: PriceAlertPayload): Promise<DeliveryResult> {
    return this.sendText(payload.to, priceAlertWhatsApp(payload));
  }
}
