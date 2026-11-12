import { RETRY_BACKOFF_MINUTES } from '../config/constants';

export const MINUTE_MS = 60_000;
export const HOUR_MS = 60 * MINUTE_MS;
export const DAY_MS = 24 * HOUR_MS;

export function minutesFromNow(minutes: number, from: Date = new Date()): Date {
  return new Date(from.getTime() + minutes * MINUTE_MS);
}

/** Uniform jitter in `[-spread/2, +spread/2]` milliseconds. */
export function jitterMs(spread: number): number {
  if (spread <= 0) return 0;
  return Math.floor(Math.random() * spread) - Math.floor(spread / 2);
}

export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Retry ladder for failed checks: 1m, 5m, 15m, 1h, 6h, then stays at 6h.
 * `attempt` is 1-based.
 */
export function backoffMinutes(attempt: number): number {
  const index = Math.min(Math.max(attempt, 1), RETRY_BACKOFF_MINUTES.length) - 1;
  return RETRY_BACKOFF_MINUTES[index] ?? RETRY_BACKOFF_MINUTES[RETRY_BACKOFF_MINUTES.length - 1]!;
}

/**
 * Next scheduled check. A little jitter keeps thousands of products from
 * stampeding a marketplace on the same minute boundary.
 */
export function nextCheckDate(intervalMinutes: number, from: Date = new Date()): Date {
  const spread = Math.min(intervalMinutes * MINUTE_MS * 0.05, 5 * MINUTE_MS);
  return new Date(from.getTime() + intervalMinutes * MINUTE_MS + jitterMs(spread));
}

const TZ_CACHE = new Map<string, boolean>();

export function isValidTimezone(tz: string): boolean {
  const cached = TZ_CACHE.get(tz);
  if (cached !== undefined) return cached;
  let valid = true;
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: tz }).format(new Date());
  } catch {
    valid = false;
  }
  TZ_CACHE.set(tz, valid);
  return valid;
}

/** Local hour (0-23) in the given IANA timezone. Used for quiet hours. */
export function hourInTimezone(date: Date, timezone: string): number {
  const formatted = new Intl.DateTimeFormat('en-GB', {
    timeZone: timezone,
    hour: '2-digit',
    hour12: false,
  }).format(date);
  return Number.parseInt(formatted, 10);
}

/**
 * True when `hour` falls inside a possibly wrapping window, e.g. 22 -> 7.
 * Start and end are inclusive/exclusive respectively.
 */
export function hourInWindow(hour: number, startHour: number, endHour: number): boolean {
  if (startHour === endHour) return false;
  return startHour < endHour
    ? hour >= startHour && hour < endHour
    : hour >= startHour || hour < endHour;
}
