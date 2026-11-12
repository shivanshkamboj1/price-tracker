/**
 * Prices are stored as integer minor units (paise for INR) so that comparisons
 * and aggregations never suffer floating point drift.
 */
export const MINOR_UNITS_PER_MAJOR = 100;

export function toMinor(major: number): number {
  return Math.round(major * MINOR_UNITS_PER_MAJOR);
}

export function toMajor(minor: number): number {
  return Math.round(minor) / MINOR_UNITS_PER_MAJOR;
}

const CURRENCY_SYMBOLS: Record<string, string> = {
  INR: '₹',
  USD: '$',
  EUR: '€',
};

export function formatMoney(minor: number, currency = 'INR'): string {
  const symbol = CURRENCY_SYMBOLS[currency] ?? `${currency} `;
  const major = toMajor(minor);
  const formatted = new Intl.NumberFormat('en-IN', {
    minimumFractionDigits: Number.isInteger(major) ? 0 : 2,
    maximumFractionDigits: 2,
  }).format(major);
  return `${symbol}${formatted}`;
}

const CURRENCY_HINTS: Array<[RegExp, string]> = [
  [/₹|INR|Rs\.?/i, 'INR'],
  [/\$|USD/i, 'USD'],
  [/€|EUR/i, 'EUR'],
];

export function detectCurrency(text: string, fallback = 'INR'): string {
  for (const [pattern, code] of CURRENCY_HINTS) {
    if (pattern.test(text)) return code;
  }
  return fallback;
}

/**
 * Parses marketplace price strings into minor units.
 * Handles Indian digit grouping (`1,29,999`), thin spaces, NBSP and `Rs.` prefixes.
 * Returns null when the string does not contain a usable number.
 */
export function parsePriceToMinor(input: string | number | null | undefined): number | null {
  if (input === null || input === undefined) return null;
  if (typeof input === 'number') {
    return Number.isFinite(input) ? toMinor(input) : null;
  }

  const cleaned = input
    .replace(/[   ]/g, ' ')
    .replace(/[^\d.,]/g, ' ')
    .trim();
  if (!cleaned) return null;

  // Grab the first number-like token; marketplace pages often include an MRP too.
  const token = cleaned.split(/\s+/).find((t) => /\d/.test(t));
  if (!token) return null;

  let normalized = token.replace(/,/g, '');
  const decimalMatch = token.match(/[.,](\d{1,2})$/);
  if (decimalMatch && token.lastIndexOf('.') > token.lastIndexOf(',')) {
    // Already dot-decimal after comma stripping.
    normalized = token.replace(/,/g, '');
  } else {
    normalized = normalized.replace(/\.(?=\d{3}\b)/g, '');
  }

  const value = Number.parseFloat(normalized);
  if (!Number.isFinite(value) || value <= 0) return null;
  // Guard against parsing a stray identifier as a price.
  if (value > 100_000_000) return null;
  return toMinor(value);
}

export function percentDiff(from: number, to: number): number {
  if (from <= 0) return 0;
  return Math.round(((to - from) / from) * 1000) / 10;
}
