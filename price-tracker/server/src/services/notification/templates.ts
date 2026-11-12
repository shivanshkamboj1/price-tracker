import { formatMoney, toMajor } from '../../utils/money';
import type { PriceAlertPayload } from './types';

/**
 * WhatsApp allows a longer, formatted message; SMS is billed per segment, so the
 * SMS variant is deliberately terse.
 */
export function priceAlertWhatsApp(payload: PriceAlertPayload): string {
  const lines = [
    'Price Alert 🔔',
    '',
    payload.productTitle,
    '',
    payload.marketplaceLabel,
    `Current price: ${formatMoney(payload.currentPrice, payload.currency)}`,
    `Target price: ${formatMoney(payload.targetPrice, payload.currency)}`,
  ];

  if (payload.lowestPrice !== undefined && payload.lowestPrice < payload.currentPrice) {
    lines.push(`Lowest seen: ${formatMoney(payload.lowestPrice, payload.currency)}`);
  }

  lines.push('', 'The product is now below your target price.', '', `View product: ${payload.productUrl}`);
  return lines.join('\n');
}

/**
 * Spoken text for a voice call. Written for a text-to-speech engine, not a
 * screen: no URL, no currency symbols (TTS reads "₹7,605.00" badly), whole
 * rupees only, and the key numbers repeated because a call cannot be re-read.
 */
export function priceAlertVoice(payload: PriceAlertPayload): string {
  const spoken = (minor: number): string =>
    `${Math.round(toMajor(minor)).toLocaleString('en-IN')} rupees`;

  const title =
    payload.productTitle.length > 80
      ? `${payload.productTitle.slice(0, 80)}`
      : payload.productTitle;

  const line = `Price alert from your price tracker. ${title} on ${payload.marketplaceLabel} is now ${spoken(payload.currentPrice)}, below your target of ${spoken(payload.targetPrice)}.`;

  // Said twice: the first seconds of a call are often missed while answering.
  return `${line} Again. ${line}`;
}

export function priceAlertSms(payload: PriceAlertPayload): string {
  const title =
    payload.productTitle.length > 60
      ? `${payload.productTitle.slice(0, 57)}...`
      : payload.productTitle;
  return [
    `Price alert: ${title}`,
    `${payload.marketplaceLabel} ${formatMoney(payload.currentPrice, payload.currency)} (target ${formatMoney(payload.targetPrice, payload.currency)})`,
    payload.productUrl,
  ].join('\n');
}
