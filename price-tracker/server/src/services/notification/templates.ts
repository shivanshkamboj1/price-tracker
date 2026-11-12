import type { AlertType } from '../../config/constants';
import { formatMoney, toMajor } from '../../utils/money';
import { escapeTelegramHtml } from './telegram';
import type { PriceAlertPayload } from './types';

/* ------------------------------ shared pieces ----------------------------- */

function reasonsOf(payload: PriceAlertPayload): AlertType[] {
  return payload.reasons.length > 0 ? payload.reasons : ['target_reached'];
}

/** Whole-percent fall from `dropFromPrice`, or null when there is no baseline. */
export function dropPercentOf(payload: Pick<PriceAlertPayload, 'dropFromPrice' | 'currentPrice'>): number | null {
  if (!payload.dropFromPrice || payload.dropFromPrice <= payload.currentPrice) return null;
  return Math.round(((payload.dropFromPrice - payload.currentPrice) / payload.dropFromPrice) * 100);
}

const money = (payload: PriceAlertPayload, minor: number): string =>
  formatMoney(minor, payload.currency);

function headline(payload: PriceAlertPayload): string {
  switch (reasonsOf(payload)[0]) {
    case 'all_time_low':
      return 'Lowest Price Ever 📉';
    case 'price_drop': {
      const percent = dropPercentOf(payload);
      return percent ? `Price Drop −${percent}% 📉` : 'Price Drop 📉';
    }
    case 'back_in_stock':
      return 'Back in Stock ✅';
    default:
      return 'Price Alert 🔔';
  }
}

/** One sentence per trigger, in priority order. */
function explanations(payload: PriceAlertPayload): string[] {
  return reasonsOf(payload).map((reason) => {
    switch (reason) {
      case 'all_time_low':
        return payload.previousLowestPrice !== undefined
          ? `This is the lowest price recorded. The previous low was ${money(payload, payload.previousLowestPrice)}.`
          : 'This is the lowest price recorded.';
      case 'price_drop': {
        const percent = dropPercentOf(payload);
        return percent && payload.dropFromPrice
          ? `The price fell ${percent}% from ${money(payload, payload.dropFromPrice)}.`
          : 'The price has dropped.';
      }
      case 'back_in_stock':
        return 'It is back in stock.';
      default:
        return 'The product is now below your target price.';
    }
  });
}

function truncate(text: string, max: number): string {
  return text.length > max ? `${text.slice(0, max - 3)}...` : text;
}

/* -------------------------------- channels -------------------------------- */

/**
 * WhatsApp allows a longer, formatted message; SMS is billed per segment, so the
 * SMS variant is deliberately terse.
 */
export function priceAlertWhatsApp(payload: PriceAlertPayload): string {
  const lines = [
    headline(payload),
    '',
    payload.productTitle,
    '',
    payload.marketplaceLabel,
    `Current price: ${money(payload, payload.currentPrice)}`,
    `Target price: ${money(payload, payload.targetPrice)}`,
  ];

  if (payload.lowestPrice !== undefined && payload.lowestPrice < payload.currentPrice) {
    lines.push(`Lowest seen: ${money(payload, payload.lowestPrice)}`);
  }

  lines.push('', ...explanations(payload), '', `View product: ${payload.productUrl}`);
  return lines.join('\n');
}

/** Telegram HTML: bold headline and price, title linked to the product page. */
export function priceAlertTelegram(payload: PriceAlertPayload): string {
  const lines = [
    `<b>${escapeTelegramHtml(headline(payload))}</b>`,
    '',
    `<a href="${escapeTelegramHtml(payload.productUrl)}">${escapeTelegramHtml(payload.productTitle)}</a>`,
    escapeTelegramHtml(payload.marketplaceLabel),
    '',
    `Current price: <b>${escapeTelegramHtml(money(payload, payload.currentPrice))}</b>`,
    `Target price: ${escapeTelegramHtml(money(payload, payload.targetPrice))}`,
  ];

  if (payload.lowestPrice !== undefined && payload.lowestPrice < payload.currentPrice) {
    lines.push(`Lowest seen: ${escapeTelegramHtml(money(payload, payload.lowestPrice))}`);
  }

  lines.push('', ...explanations(payload).map(escapeTelegramHtml));
  return lines.join('\n');
}

/**
 * Spoken text for a voice call. Written for a text-to-speech engine, not a
 * screen: no URL, no currency symbols (TTS reads "₹7,605.00" badly), whole
 * rupees only, and the key sentence repeated because a call cannot be re-read.
 */
export function priceAlertVoice(payload: PriceAlertPayload): string {
  const spoken = (minor: number): string =>
    `${Math.round(toMajor(minor)).toLocaleString('en-IN')} rupees`;

  const subject = `${truncate(payload.productTitle, 80)} on ${payload.marketplaceLabel}`;
  const percent = dropPercentOf(payload);
  const [primary, ...others] = reasonsOf(payload);

  const lead = {
    target_reached: `${subject} is now ${spoken(payload.currentPrice)}, below your target of ${spoken(payload.targetPrice)}.`,
    all_time_low: `${subject} is now ${spoken(payload.currentPrice)}, the lowest price recorded.`,
    price_drop: percent
      ? `${subject} dropped ${percent} percent to ${spoken(payload.currentPrice)}.`
      : `${subject} dropped to ${spoken(payload.currentPrice)}.`,
    back_in_stock: `${subject} is back in stock at ${spoken(payload.currentPrice)}.`,
  }[primary ?? 'target_reached'];

  const extra = others.map(
    (reason) =>
      ({
        target_reached: 'That is below your target.',
        all_time_low: 'That is the lowest price recorded.',
        price_drop: percent ? `That is ${percent} percent lower than before.` : 'The price has dropped.',
        back_in_stock: 'It is back in stock.',
      })[reason],
  );

  const line = ['Price alert from your price tracker.', lead, ...extra].join(' ');
  // Said twice: the first seconds of a call are often missed while answering.
  return `${line} Again. ${line}`;
}

export function priceAlertSms(payload: PriceAlertPayload): string {
  const percent = dropPercentOf(payload);
  const label = {
    target_reached: 'Price alert',
    all_time_low: 'Lowest price ever',
    price_drop: percent ? `Price down ${percent}%` : 'Price drop',
    back_in_stock: 'Back in stock',
  }[reasonsOf(payload)[0] ?? 'target_reached'];

  return [
    `${label}: ${truncate(payload.productTitle, 60)}`,
    `${payload.marketplaceLabel} ${money(payload, payload.currentPrice)} (target ${money(payload, payload.targetPrice)})`,
    payload.productUrl,
  ].join('\n');
}
