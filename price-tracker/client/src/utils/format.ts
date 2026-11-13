import type { AlertRuleOverrides, AlertRules, AlertType, DeliveryChannel } from '../types';

const SYMBOLS: Record<string, string> = { INR: '₹', USD: '$', EUR: '€' };

/** Indian digit grouping, no decimals unless the value actually has paise. */
export function formatMoney(value: number | null | undefined, currency = 'INR'): string {
  if (value === null || value === undefined) return '—';
  const symbol = SYMBOLS[currency] ?? `${currency} `;
  const hasPaise = Math.abs(value % 1) > 0.001;
  return `${symbol}${new Intl.NumberFormat('en-IN', {
    minimumFractionDigits: hasPaise ? 2 : 0,
    maximumFractionDigits: 2,
  }).format(value)}`;
}

/** Compact form for tight spaces: ₹1.2L, ₹45.9K. */
export function formatMoneyCompact(value: number | null | undefined, currency = 'INR'): string {
  if (value === null || value === undefined) return '—';
  const symbol = SYMBOLS[currency] ?? `${currency} `;
  const abs = Math.abs(value);
  if (abs >= 10_000_000) return `${symbol}${(value / 10_000_000).toFixed(2)}Cr`;
  if (abs >= 100_000) return `${symbol}${(value / 100_000).toFixed(2)}L`;
  if (abs >= 1000) return `${symbol}${(value / 1000).toFixed(1)}K`;
  return formatMoney(value, currency);
}

export function formatPercent(value: number | null | undefined): string {
  if (value === null || value === undefined) return '—';
  return `${value > 0 ? '+' : ''}${value.toFixed(1)}%`;
}

const RELATIVE = new Intl.RelativeTimeFormat('en', { numeric: 'auto' });

const UNITS: Array<[Intl.RelativeTimeFormatUnit, number]> = [
  ['year', 365 * 24 * 3600_000],
  ['month', 30 * 24 * 3600_000],
  ['day', 24 * 3600_000],
  ['hour', 3600_000],
  ['minute', 60_000],
];

/** "3 hours ago" / "in 12 minutes". */
export function relativeTime(iso: string | null | undefined): string {
  if (!iso) return 'never';
  const diff = new Date(iso).getTime() - Date.now();
  const abs = Math.abs(diff);
  if (abs < 45_000) return diff < 0 ? 'just now' : 'in a moment';

  for (const [unit, ms] of UNITS) {
    if (abs >= ms) return RELATIVE.format(Math.round(diff / ms), unit);
  }
  return RELATIVE.format(Math.round(diff / 60_000), 'minute');
}

export function formatDateTime(iso: string | null | undefined): string {
  if (!iso) return '—';
  return new Intl.DateTimeFormat('en-IN', {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(new Date(iso));
}

export function formatDate(iso: string | null | undefined): string {
  if (!iso) return '—';
  return new Intl.DateTimeFormat('en-IN', { day: 'numeric', month: 'short' }).format(new Date(iso));
}

const INTERVAL_LABELS: Record<number, string> = {
  15: 'Every 15 minutes',
  30: 'Every 30 minutes',
  60: 'Hourly',
  180: 'Every 3 hours',
  360: 'Every 6 hours',
  720: 'Every 12 hours',
  1440: 'Daily',
};

export function intervalLabel(minutes: number): string {
  return INTERVAL_LABELS[minutes] ?? `Every ${minutes} minutes`;
}

export const CHECK_INTERVALS = [15, 30, 60, 180, 360, 720, 1440] as const;

export const MARKETPLACE_LABELS: Record<string, string> = {
  amazon_in: 'Amazon India',
  flipkart: 'Flipkart',
};

export const AVAILABILITY_LABELS: Record<string, string> = {
  in_stock: 'In stock',
  out_of_stock: 'Out of stock',
  unknown: 'Unknown',
};

export const DELIVERY_CHANNELS: DeliveryChannel[] = ['whatsapp', 'telegram', 'sms', 'call'];

export const CHANNEL_LABELS: Record<DeliveryChannel, string> = {
  whatsapp: 'WhatsApp',
  telegram: 'Telegram',
  sms: 'SMS',
  call: 'Phone call',
};

/** "WhatsApp and Telegram", or "no channels". */
export function describeChannels(channels: DeliveryChannel[]): string {
  const labels = channels.map((channel) => CHANNEL_LABELS[channel] ?? channel);
  if (labels.length === 0) return 'no channels';
  if (labels.length === 1) return labels[0]!;
  return `${labels.slice(0, -1).join(', ')} and ${labels[labels.length - 1]}`;
}

/** Mirrors the server's account defaults for users who have never saved any. */
export const DEFAULT_ALERT_RULES: AlertRules = { dropPercent: 0, allTimeLow: false, backInStock: true };

export const DROP_PERCENT_CHOICES = [5, 10, 15, 20, 25, 30, 40, 50] as const;

export const ALERT_TYPE_LABELS: Record<AlertType, string> = {
  target_reached: 'Target reached',
  all_time_low: 'Lowest ever',
  price_drop: 'Price drop',
  back_in_stock: 'Back in stock',
};

/** Account defaults merged with a product's overrides — what the server will apply. */
export function effectiveAlertRules(
  defaults: AlertRules | undefined,
  overrides: AlertRuleOverrides | undefined,
): AlertRules {
  const base = { ...DEFAULT_ALERT_RULES, ...defaults };
  return {
    dropPercent: overrides?.dropPercent ?? base.dropPercent,
    allTimeLow: overrides?.allTimeLow ?? base.allTimeLow,
    backInStock: overrides?.backInStock ?? base.backInStock,
  };
}

/** "10% drop · lowest ever · back in stock", or null when every smart rule is off. */
export function describeAlertRules(rules: AlertRules): string | null {
  const parts = [
    rules.dropPercent > 0 ? `${rules.dropPercent}% drop` : null,
    rules.allTimeLow ? 'lowest price ever' : null,
    rules.backInStock ? 'back in stock' : null,
  ].filter(Boolean);
  return parts.length ? parts.join(' · ') : null;
}

export const STATUS_LABELS: Record<string, string> = {
  active: 'Tracking',
  paused: 'Paused',
  unavailable: 'Unavailable',
  error: 'Needs attention',
  deleted: 'Deleted',
};

export function initials(name: string): string {
  return name
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? '')
    .join('');
}
