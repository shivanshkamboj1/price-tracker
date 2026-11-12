import type { IAlert } from '../models/Alert';
import type { IPriceHistory } from '../models/PriceHistory';
import type { IProduct } from '../models/Product';
import type { PriceStats } from '../services/history.service';
import { failureGuidance } from '../services/priceCheck.service';
import { toMajor } from './money';

/**
 * Prices are stored as integer minor units but the API speaks major units
 * (rupees), because that is what users type and read. The conversion happens
 * here, in one place, so no controller has to remember it.
 */
const money = (minor: number | undefined | null): number | null =>
  minor === undefined || minor === null ? null : toMajor(minor);

export interface ProductDto {
  id: string;
  marketplace: string;
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
  /** currentPrice - targetPrice, negative when the target has been beaten. */
  differenceFromTarget: number | null;
  percentFromTarget: number | null;
  isBelowTarget: boolean;
  availability: string;
  status: string;
  checkInterval: number;
  nextCheckAt: string | null;
  lastCheckedAt: string | null;
  lastPriceChangedAt: string | null;
  notificationChannel: string | null;
  alertMode: string | null;
  alertArmed: boolean;
  alertCount: number;
  consecutiveFailures: number;
  errorKind: string | null;
  errorMessage: string | null;
  /** Plain-language next step when checks have stopped. */
  guidance: string | null;
  comparisonGroup: string | null;
  createdAt: string;
  updatedAt: string;
}

export function productToDto(product: IProduct): ProductDto {
  const current = product.currentPrice ?? null;
  const difference = current === null ? null : current - product.targetPrice;

  return {
    id: product._id.toString(),
    marketplace: product.marketplace,
    productUrl: product.productUrl,
    externalProductId: product.externalProductId,
    title: product.title,
    nickname: product.nickname ?? null,
    imageUrl: product.imageUrl ?? null,
    currentPrice: money(current),
    previousPrice: money(product.previousPrice),
    targetPrice: toMajor(product.targetPrice),
    lowestPrice: money(product.lowestPrice),
    highestPrice: money(product.highestPrice),
    currency: product.currency,
    differenceFromTarget: difference === null ? null : toMajor(difference),
    percentFromTarget:
      difference === null || product.targetPrice === 0
        ? null
        : Math.round((difference / product.targetPrice) * 1000) / 10,
    isBelowTarget: current !== null && current <= product.targetPrice,
    availability: product.availability,
    status: product.status,
    checkInterval: product.checkInterval,
    nextCheckAt: product.nextCheckAt?.toISOString() ?? null,
    lastCheckedAt: product.lastCheckedAt?.toISOString() ?? null,
    lastPriceChangedAt: product.lastPriceChangedAt?.toISOString() ?? null,
    notificationChannel: product.notificationChannel ?? null,
    alertMode: product.alertMode ?? null,
    alertArmed: product.alertArmed,
    alertCount: product.alertCount,
    consecutiveFailures: product.consecutiveFailures,
    errorKind: product.lastErrorKind ?? null,
    errorMessage: product.lastErrorMessage ?? null,
    guidance:
      product.status === 'error' || product.consecutiveFailures > 0
        ? (failureGuidance(product.lastErrorKind) ?? null)
        : null,
    comparisonGroup: product.comparisonGroup ?? null,
    createdAt: product.createdAt.toISOString(),
    updatedAt: product.updatedAt.toISOString(),
  };
}

export interface HistoryPointDto {
  price: number;
  currency: string;
  availability: string;
  checkedAt: string;
  source: string;
}

export function historyToDto(point: IPriceHistory): HistoryPointDto {
  return {
    price: toMajor(point.price),
    currency: point.currency,
    availability: point.availability,
    checkedAt: new Date(point.checkedAt).toISOString(),
    source: point.source,
  };
}

export function statsToDto(stats: PriceStats) {
  return {
    points: stats.points,
    lowest: money(stats.lowest),
    highest: money(stats.highest),
    average: money(stats.average),
    first: money(stats.first),
    last: money(stats.last),
    firstAt: stats.firstAt ? new Date(stats.firstAt).toISOString() : null,
    lastAt: stats.lastAt ? new Date(stats.lastAt).toISOString() : null,
  };
}

type PopulatedProduct = Pick<IProduct, 'title' | 'imageUrl' | 'marketplace' | 'productUrl'> & {
  _id: unknown;
};

export function alertToDto(alert: IAlert & { productId: unknown }) {
  const populated =
    alert.productId && typeof alert.productId === 'object' && 'title' in alert.productId
      ? (alert.productId as unknown as PopulatedProduct)
      : null;

  return {
    id: alert._id.toString(),
    productId: populated ? String(populated._id) : String(alert.productId),
    product: populated
      ? {
          title: populated.title,
          imageUrl: populated.imageUrl ?? null,
          marketplace: populated.marketplace,
          productUrl: populated.productUrl,
        }
      : null,
    type: alert.type,
    price: toMajor(alert.price),
    targetPrice: toMajor(alert.targetPrice),
    currency: alert.currency,
    channel: alert.channel,
    status: alert.status,
    state: alert.state,
    message: alert.message,
    failureReason: alert.failureReason ?? null,
    sentAt: alert.sentAt?.toISOString() ?? null,
    readAt: alert.readAt?.toISOString() ?? null,
    createdAt: alert.createdAt.toISOString(),
  };
}

export function dashboardMoney(value: number | null | undefined): number | null {
  return money(value);
}
