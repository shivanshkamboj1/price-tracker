import twilio, { type Twilio } from 'twilio';
import { env, twilioConfigured } from '../../config/env';
import { logger } from '../../config/logger';
import { priceAlertSms, priceAlertVoice, priceAlertWhatsApp } from './templates';
import type {
  DeliveryResult,
  MessageRequest,
  NotificationService,
  PhoneAlertPayload,
} from './types';

/** TwiML is XML, and product titles contain `&` often enough to matter. */
function escapeXml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

/**
 * Twilio-backed delivery.
 *
 * Credentials live only in the process environment and only on the backend —
 * they are never sent to the browser and never written to a log line. Failures
 * are converted into `DeliveryResult`s rather than thrown, so a messaging outage
 * cannot fail a price check that already succeeded.
 */
export class TwilioNotificationService implements NotificationService {
  readonly name = 'twilio';
  private client: Twilio | null = null;

  isConfigured(): boolean {
    return twilioConfigured;
  }

  private getClient(): Twilio {
    if (!this.client) {
      this.client = twilio(env.TWILIO_ACCOUNT_SID!, env.TWILIO_AUTH_TOKEN!);
    }
    return this.client;
  }

  private async send(
    from: string | undefined,
    to: string,
    body: string,
    channel: 'sms' | 'whatsapp',
  ): Promise<DeliveryResult> {
    if (!this.isConfigured() || !from) {
      logger.warn({ channel }, 'twilio is not configured; notification skipped');
      return { status: 'skipped', failureReason: 'Messaging provider is not configured' };
    }

    try {
      const message = await this.getClient().messages.create({ from, to, body });
      logger.info(
        { channel, providerMessageId: message.sid, toFingerprint: to.slice(-4) },
        'notification sent',
      );
      return { status: 'sent', providerMessageId: message.sid };
    } catch (err) {
      const reason = err instanceof Error ? err.message : 'Unknown messaging error';
      logger.error({ channel, err }, 'notification delivery failed');
      return { status: 'failed', failureReason: reason.slice(0, 500) };
    }
  }

  async sendSms(message: MessageRequest): Promise<DeliveryResult> {
    return this.send(env.TWILIO_PHONE_NUMBER, message.to, message.body, 'sms');
  }

  async sendWhatsApp(message: MessageRequest): Promise<DeliveryResult> {
    const from = env.TWILIO_WHATSAPP_NUMBER
      ? `whatsapp:${env.TWILIO_WHATSAPP_NUMBER.replace(/^whatsapp:/, '')}`
      : undefined;
    const to = `whatsapp:${message.to.replace(/^whatsapp:/, '')}`;
    return this.send(from, to, message.body, 'whatsapp');
  }

  /**
   * Places a call that speaks `body` via TwiML.
   *
   * The TwiML is passed inline rather than through a `Url` webhook, so no public
   * endpoint has to exist for this to work from a laptop or a private network.
   */
  async sendVoiceCall(message: MessageRequest): Promise<DeliveryResult> {
    const from = env.TWILIO_PHONE_NUMBER;
    if (!this.isConfigured() || !from) {
      logger.warn({ channel: 'call' }, 'twilio is not configured; call skipped');
      return { status: 'skipped', failureReason: 'Messaging provider is not configured' };
    }

    try {
      const call = await this.getClient().calls.create({
        from,
        to: message.to,
        twiml: `<Response><Say voice="alice" language="en-IN">${escapeXml(message.body)}</Say></Response>`,
      });
      logger.info(
        { channel: 'call', providerMessageId: call.sid, toFingerprint: message.to.slice(-4) },
        'notification sent',
      );
      return { status: 'sent', providerMessageId: call.sid };
    } catch (err) {
      const reason = err instanceof Error ? err.message : 'Unknown telephony error';
      logger.error({ channel: 'call', err }, 'notification delivery failed');
      return { status: 'failed', failureReason: reason.slice(0, 500) };
    }
  }

  async sendPriceAlert(payload: PhoneAlertPayload): Promise<DeliveryResult> {
    switch (payload.channel) {
      case 'whatsapp':
        return this.sendWhatsApp({ to: payload.to, body: priceAlertWhatsApp(payload) });
      case 'call':
        return this.sendVoiceCall({ to: payload.to, body: priceAlertVoice(payload) });
      default:
        return this.sendSms({ to: payload.to, body: priceAlertSms(payload) });
    }
  }
}
