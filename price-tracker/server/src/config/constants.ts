export const MARKETPLACES = ['amazon_in', 'flipkart'] as const;
export type Marketplace = (typeof MARKETPLACES)[number];

export const MARKETPLACE_LABEL: Record<Marketplace, string> = {
  amazon_in: 'Amazon India',
  flipkart: 'Flipkart',
};

export const PRODUCT_STATUSES = ['active', 'paused', 'unavailable', 'error', 'deleted'] as const;
export type ProductStatus = (typeof PRODUCT_STATUSES)[number];

/** Why the last check did not produce a price. Orthogonal to the product status. */
export const CHECK_ERROR_KINDS = [
  'temporary_error',
  'unavailable',
  'blocked',
  'not_found',
  'unsupported',
  /** No usable data source for this marketplace — an operator problem, not a bad link. */
  'not_configured',
  'parse_error',
] as const;
export type CheckErrorKind = (typeof CHECK_ERROR_KINDS)[number];

export const AVAILABILITIES = ['in_stock', 'out_of_stock', 'unknown'] as const;
export type Availability = (typeof AVAILABILITIES)[number];

export const NOTIFICATION_CHANNELS = ['sms', 'whatsapp', 'call', 'telegram', 'none'] as const;
export type NotificationChannel = (typeof NOTIFICATION_CHANNELS)[number];
/** A channel that actually delivers something. */
export type DeliveryChannel = Exclude<NotificationChannel, 'none'>;
/** Channels addressed by phone number (delivered through Twilio). */
export type PhoneChannel = Exclude<DeliveryChannel, 'telegram'>;

/**
 * Listed in priority order: when one check fires several triggers, the first
 * one becomes the alert's headline and the rest are mentioned in the body.
 */
export const ALERT_TYPES = ['target_reached', 'all_time_low', 'price_drop', 'back_in_stock'] as const;
export type AlertType = (typeof ALERT_TYPES)[number];
/** Triggers beyond the target price, each switched on per account or per product. */
export type SmartAlertType = Exclude<AlertType, 'target_reached'>;

/** Choices offered for the percentage-drop alert. 0 means off. */
export const DROP_PERCENT_CHOICES = [0, 5, 10, 15, 20, 25, 30, 40, 50] as const;

export const ALERT_STATES = ['triggered', 'acknowledged', 'reset'] as const;
export type AlertState = (typeof ALERT_STATES)[number];

export const ALERT_DELIVERY_STATUSES = ['pending', 'sent', 'failed', 'skipped'] as const;
export type AlertDeliveryStatus = (typeof ALERT_DELIVERY_STATUSES)[number];

export const ALERT_MODES = ['once', 'always'] as const;
export type AlertMode = (typeof ALERT_MODES)[number];

/** Allowed check intervals in minutes. Nothing more aggressive than 15 minutes. */
export const CHECK_INTERVAL_CHOICES = [15, 30, 60, 180, 360, 720, 1440] as const;

/** Retry ladder after a failed check: 1m, 5m, 15m, 1h, then 6h. */
export const RETRY_BACKOFF_MINUTES = [1, 5, 15, 60, 360] as const;
export const MAX_CONSECUTIVE_FAILURES = 6;

export const PRICE_SOURCES = [
  'official_api',
  'authorized_provider',
  'public_page',
  'manual',
] as const;
export type PriceSource = (typeof PRICE_SOURCES)[number];

export const CURRENCY_DEFAULT = 'INR';
