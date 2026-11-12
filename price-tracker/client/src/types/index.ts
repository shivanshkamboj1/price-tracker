export type Marketplace = 'amazon_in' | 'flipkart';
export type ProductStatus = 'active' | 'paused' | 'unavailable' | 'error' | 'deleted';
export type Availability = 'in_stock' | 'out_of_stock' | 'unknown';
export type NotificationChannel = 'sms' | 'whatsapp' | 'call' | 'none';
export type AlertMode = 'once' | 'always';
export type HistoryRange = '24h' | '7d' | '30d' | '3m' | 'all';

export interface ApiEnvelope<T> {
  success: true;
  data: T;
  meta?: Record<string, unknown>;
}

export interface ApiErrorBody {
  success: false;
  error: { code: string; message: string; details?: unknown };
  requestId?: string;
}

export interface QuietHours {
  enabled: boolean;
  startHour: number;
  endHour: number;
}

export interface NotificationPrefs {
  channel: NotificationChannel;
  alertMode: AlertMode;
  minIntervalMinutes: number;
  quietHours: QuietHours;
}

export interface User {
  _id: string;
  email: string;
  name: string;
  phone?: string;
  phoneVerified: boolean;
  timezone: string;
  role: 'user' | 'admin';
  notificationPrefs: NotificationPrefs;
  createdAt: string;
}

/** All money values from the API are in major units (rupees). */
export interface Product {
  id: string;
  marketplace: Marketplace;
  productUrl: string;
  externalProductId: string;
  title: string;
  nickname: string | null;
  imageUrl: string | null;
  currentPrice: number | null;
  previousPrice: number | null;
  targetPrice: number;
  lowestPrice: number | null;
  highestPrice: number | null;
  currency: string;
  differenceFromTarget: number | null;
  percentFromTarget: number | null;
  isBelowTarget: boolean;
  availability: Availability;
  status: ProductStatus;
  checkInterval: number;
  nextCheckAt: string | null;
  lastCheckedAt: string | null;
  lastPriceChangedAt: string | null;
  notificationChannel: NotificationChannel | null;
  alertMode: AlertMode | null;
  alertArmed: boolean;
  alertCount: number;
  consecutiveFailures: number;
  errorKind: string | null;
  errorMessage: string | null;
  guidance: string | null;
  comparisonGroup: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface PricePoint {
  price: number;
  currency: string;
  availability: Availability;
  checkedAt: string;
  source: string;
}

export interface PriceStats {
  points: number;
  lowest: number | null;
  highest: number | null;
  average: number | null;
  first: number | null;
  last: number | null;
  firstAt: string | null;
  lastAt: string | null;
}

export interface HistoryResponse {
  range: HistoryRange;
  targetPrice: number;
  currency: string;
  points: PricePoint[];
  stats: PriceStats;
}

export interface Alert {
  id: string;
  productId: string;
  product: {
    title: string;
    imageUrl: string | null;
    marketplace: Marketplace;
    productUrl: string;
  } | null;
  type: string;
  price: number;
  targetPrice: number;
  currency: string;
  channel: NotificationChannel;
  status: 'pending' | 'sent' | 'failed' | 'skipped';
  state: 'triggered' | 'acknowledged' | 'reset';
  message: string;
  failureReason: string | null;
  sentAt: string | null;
  readAt: string | null;
  createdAt: string;
}

export interface DashboardStats {
  trackedProducts: number;
  activeProducts: number;
  pausedProducts: number;
  erroredProducts: number;
  priceDrops: number;
  alertsTriggered: number;
  unreadAlerts: number;
  belowTarget: number;
  bestSaving: { amount: number; currency: string; productId: string; title: string } | null;
  lowestPriceFound: { price: number; currency: string; productId: string; title: string } | null;
  byMarketplace: Array<{ marketplace: Marketplace; count: number }>;
  nextCheckAt: string | null;
}

export interface ComparisonRow {
  productId: string;
  title: string;
  nickname?: string;
  marketplace: Marketplace;
  imageUrl?: string;
  productUrl: string;
  currentPrice: number | null;
  targetPrice: number;
  lowestPrice: number | null;
  highestPrice: number | null;
  currency: string;
  availability: Availability;
  lastCheckedAt?: string;
  comparisonGroup?: string;
}

export interface UrlPreview {
  marketplace: Marketplace;
  marketplaceLabel: string;
  externalProductId: string;
  canonicalUrl: string;
  dataSource: string;
}

export interface MarketplaceSession {
  _id: string;
  marketplace: Marketplace;
  status: 'connected' | 'expired' | 'disconnected' | 'revoked';
  label?: string;
  connectedAt?: string;
  expiresAt?: string;
  lastUsedAt?: string;
}

export interface SystemHealth {
  status: 'ok' | 'degraded';
  checkedAt: string;
  dependencies: { mongodb: 'up' | 'down'; redis: 'up' | 'down' };
  queues: Array<{
    name: string;
    waiting: number;
    active: number;
    delayed: number;
    completed: number;
    failed: number;
    paused: boolean;
  }>;
  checks24h: {
    total: number;
    success: number;
    failed: number;
    skipped: number;
    successRate: number;
    averageDurationMs: number | null;
  };
  failuresByKind: Array<{ kind: string; count: number }>;
  marketplaces: Array<{
    marketplace: Marketplace;
    label: string;
    dataSource: string;
    circuit: string;
    circuitFailures: number;
    checks24h: number;
    failures24h: number;
  }>;
  notifications24h: { sent: number; failed: number; pending: number; skipped: number };
}

export interface Paged<T> {
  items: T[];
  total: number;
  page: number;
  limit: number;
  pages?: number;
  unread?: number;
}
