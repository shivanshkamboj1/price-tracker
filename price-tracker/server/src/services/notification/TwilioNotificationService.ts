import twilio, { type Twilio } from 'twilio';
import { env, twilioConfigured } from '../../config/env';
import { logger } from '../../config/logger';
import { priceAlertSms, priceAlertVoice } from './templates';
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

  async sendSms(message: MessageRequest): Promise<DeliveryResult> {
    const from = env.TWILIO_PHONE_NUMBER;
    if (!this.isConfigured() || !from) {
      logger.warn({ channel: 'sms' }, 'twilio is not configured; notification skipped');
      return { status: 'skipped', failureReason: 'Messaging provider is not configured' };
    }

    try {
      const sent = await this.getClient().messages.create({ from, to: message.to, body: message.body });
      logger.info(
        { channel: 'sms', providerMessageId: sent.sid, toFingerprint: message.to.slice(-4) },
        'notification sent',
      );
      return { status: 'sent', providerMessageId: sent.sid };
    } catch (err) {
      const reason = err instanceof Error ? err.message : 'Unknown messaging error';
      logger.error({ channel: 'sms', err }, 'notification delivery failed');
      return { status: 'failed', failureReason: reason.slice(0, 500) };
    }
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
    return payload.channel === 'call'
      ? this.sendVoiceCall({ to: payload.to, body: priceAlertVoice(payload) })
      : this.sendSms({ to: payload.to, body: priceAlertSms(payload) });
  }
}
