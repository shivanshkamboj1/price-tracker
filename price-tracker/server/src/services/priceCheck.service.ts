import {
  MAX_CONSECUTIVE_FAILURES,
  type Availability,
  type CheckErrorKind,
} from '../config/constants';
import { logger } from '../config/logger';
import { getAdapter } from '../adapters/factory';
import type { ProductSnapshot } from '../adapters/types';
import { Product, type ProductDocument } from '../models/Product';
import { JobLog } from '../models/JobLog';
import { User } from '../models/User';
import { AdapterError, describeError } from '../utils/errors';
import { backoffMinutes, minutesFromNow, nextCheckDate } from '../utils/time';
import { lockKeys, withLock } from '../utils/lock';
import { enqueueNotification } from '../queues';
import { recordPricePoint } from './history.service';
import {
  createPendingAlert,
  evaluateAlert,
  hasDestinationFor,
  resolveAlertSettings,
} from './alert.service';
import { getDecryptedSession } from './marketplaceSession.service';

export interface CheckOptions {
  jobId: string;
  trigger: 'scheduled' | 'manual';
  bypassCache?: boolean;
}

export type CheckOutcome =
  | { result: 'success'; price: number | null; priceChanged: boolean; alerted: boolean }
  | { result: 'failed'; kind: CheckErrorKind; message: string; consecutiveFailures: number }
  | { result: 'skipped'; reason: string };

/**
 * Runs one price check end to end.
 *
 * This is the only place that knows how a check result maps onto product state,
 * price history and alerts. The worker is a thin shell around it, and the
 * marketplace specifics stay behind the adapter interface.
 */
export async function runPriceCheck(
  productId: string,
  options: CheckOptions,
): Promise<CheckOutcome> {
  // The lock is what makes "the same product is never checked twice at once"
  // true even with several worker replicas.
  const outcome = await withLock(lockKeys.productCheck(productId), 5 * 60_000, () =>
    executeCheck(productId, options),
  );

  return outcome ?? { result: 'skipped', reason: 'another worker is already checking this product' };
}

async function executeCheck(productId: string, options: CheckOptions): Promise<CheckOutcome> {
  const startedAt = new Date();
  const product = await Product.findById(productId);

  if (!product || product.deletedAt) {
    return { result: 'skipped', reason: 'product no longer exists' };
  }
  if (product.status === 'paused') {
    return { result: 'skipped', reason: 'tracking is paused' };
  }

  const log = logger.child({
    jobId: options.jobId,
    productId,
    userId: product.userId.toString(),
    marketplace: product.marketplace,
    trigger: options.trigger,
  });
  log.info({ startedAt }, 'price check started');

  let snapshot: ProductSnapshot | undefined;
  let failure: AdapterError | undefined;

  try {
    const adapter = getAdapter(product.marketplace);
    const userSession = await getDecryptedSession(product.userId.toString(), product.marketplace);

    snapshot = await adapter.getProductDetails(
      {
        marketplace: product.marketplace,
        externalProductId: product.externalProductId,
        canonicalUrl: product.productUrl,
      },
      {
        bypassCache: options.bypassCache ?? options.trigger === 'manual',
        jobId: options.jobId,
        userSession,
      },
    );
  } catch (err) {
    failure =
      err instanceof AdapterError
        ? err
        : new AdapterError('temporary_error', 'Price check failed unexpectedly', {
            retryable: true,
            cause: err,
          });
  }

  const completedAt = new Date();
  const durationMs = completedAt.getTime() - startedAt.getTime();

  if (failure || !snapshot) {
    const kind = failure?.kind ?? 'temporary_error';
    const message = failure?.message ?? 'Price check failed';
    await applyFailure(product, kind, message);

    await JobLog.create({
      jobId: options.jobId,
      productId: product._id,
      userId: product.userId,
      marketplace: product.marketplace,
      trigger: options.trigger,
      startedAt,
      completedAt,
      durationMs,
      result: 'failed',
      errorKind: kind,
      errorMessage: message.slice(0, 512),
    });

    log.warn({ ...describeError(failure), durationMs }, 'price check failed');
    return {
      result: 'failed',
      kind,
      message,
      consecutiveFailures: product.consecutiveFailures,
    };
  }

  const { priceChanged, alerted } = await applySuccess(product, snapshot, options);

  await JobLog.create({
    jobId: options.jobId,
    productId: product._id,
    userId: product.userId,
    marketplace: product.marketplace,
    trigger: options.trigger,
    startedAt,
    completedAt,
    durationMs,
    result: 'success',
    source: snapshot.source,
    price: snapshot.price ?? undefined,
  });

  log.info(
    { durationMs, price: snapshot.price, availability: snapshot.availability, priceChanged, alerted },
    'price check completed',
  );

  return { result: 'success', price: snapshot.price, priceChanged, alerted };
}

async function applySuccess(
  product: ProductDocument,
  snapshot: ProductSnapshot,
  options: CheckOptions,
): Promise<{ priceChanged: boolean; alerted: boolean }> {
  const now = snapshot.fetchedAt;
  const previousPrice = product.currentPrice;
  const price = snapshot.price;
  // Captured before they are overwritten: the smart alerts compare against them.
  const previous = { availability: product.availability, lowestPrice: product.lowestPrice };

  if (snapshot.title) product.title = snapshot.title;
  if (snapshot.imageUrl) product.imageUrl = snapshot.imageUrl;
  product.currency = snapshot.currency || product.currency;
  product.availability = snapshot.availability;
  product.lastCheckedAt = now;
  product.consecutiveFailures = 0;
  product.lastErrorKind = undefined;
  product.lastErrorMessage = undefined;
  product.lastErrorAt = undefined;
  product.status = snapshot.availability === 'out_of_stock' && price === null ? 'unavailable' : 'active';
  product.nextCheckAt = nextCheckDate(product.checkInterval, now);

  let priceChanged = false;

  if (price !== null) {
    priceChanged = previousPrice !== price;
    if (priceChanged) {
      product.previousPrice = previousPrice;
      product.lastPriceChangedAt = now;
    }
    product.currentPrice = price;
    product.lowestPrice = product.lowestPrice === undefined ? price : Math.min(product.lowestPrice, price);
    product.highestPrice =
      product.highestPrice === undefined ? price : Math.max(product.highestPrice, price);

    await recordPricePoint({
      productId: product._id,
      userId: product.userId,
      price,
      currency: product.currency,
      availability: snapshot.availability,
      source: snapshot.source,
      checkedAt: now,
      metadata: { ...snapshot.metadata, jobId: options.jobId },
    });
  }

  const alerted = await maybeRaiseAlert(product, price, snapshot, previous);
  await product.save();
  return { priceChanged, alerted };
}

async function maybeRaiseAlert(
  product: ProductDocument,
  price: number | null,
  snapshot: ProductSnapshot,
  previous: { availability: Availability; lowestPrice?: number },
): Promise<boolean> {
  const user = await User.findById(product.userId).lean();
  if (!user) return false;

  const { channel, alertMode, rules } = resolveAlertSettings(product, user);
  const dropFromPrice = product.dropReferencePrice;

  const decision = evaluateAlert({
    price,
    availability: snapshot.availability,
    targetPrice: product.targetPrice,
    alertArmed: product.alertArmed,
    lastAlertAt: product.lastAlertAt,
    alertMode,
    channel,
    hasDestination: hasDestinationFor(channel, user),
    minIntervalMinutes: user.notificationPrefs.minIntervalMinutes,
    quietHours: user.notificationPrefs.quietHours,
    timezone: user.timezone,
    rules,
    previousAvailability: previous.availability,
    previousLowestPrice: previous.lowestPrice,
    dropReferencePrice: product.dropReferencePrice,
    lastSmartAlertAt: product.lastSmartAlertAt,
  });

  if (decision.shouldDisarm) product.alertArmed = false;
  product.dropReferencePrice = decision.dropReferencePrice;
  if (!decision.shouldAlert || price === null || channel === 'none') return false;

  const alert = await createPendingAlert(product, price, channel, {
    reasons: decision.reasons,
    dropFromPrice,
    previousLowestPrice: previous.lowestPrice,
  });
  await enqueueNotification(
    {
      alertId: alert._id.toString(),
      userId: product.userId.toString(),
      productId: product._id.toString(),
    },
    decision.delayMs,
  );

  const now = new Date();
  // The target latch and its cooldown belong to the target rule only; smart
  // triggers keep their own timestamps so one cannot silence another.
  if (decision.reasons.includes('target_reached')) {
    product.alertArmed = true;
    product.lastAlertAt = now;
  }
  for (const reason of decision.reasons) {
    if (reason !== 'target_reached') product.set(`lastSmartAlertAt.${reason}`, now);
  }
  product.alertCount += 1;
  return true;
}

/**
 * Failure handling: a product is never marked permanently broken on one bad
 * check. Retries walk the ladder 1m → 5m → 15m → 1h → 6h, and only after
 * `MAX_CONSECUTIVE_FAILURES` do automatic retries stop, at which point the user
 * is shown an actionable message and can resume tracking manually.
 */
async function applyFailure(
  product: ProductDocument,
  kind: CheckErrorKind,
  message: string,
): Promise<void> {
  const now = new Date();
  product.consecutiveFailures += 1;
  product.lastErrorKind = kind;
  product.lastErrorMessage = message.slice(0, 512);
  product.lastErrorAt = now;
  product.lastCheckedAt = now;

  // `not_configured` is permanent in the same sense: retrying cannot fix it,
  // only an operator changing configuration can, and that resumes the product.
  const permanent = kind === 'not_found' || kind === 'unsupported' || kind === 'not_configured';
  const exhausted = product.consecutiveFailures >= MAX_CONSECUTIVE_FAILURES;

  if (permanent || exhausted) {
    product.status = 'error';
    // Far enough out that the scheduler ignores it; the user resumes explicitly.
    product.nextCheckAt = minutesFromNow(60 * 24 * 365, now);
  } else if (kind === 'unavailable') {
    product.status = 'unavailable';
    product.nextCheckAt = nextCheckDate(product.checkInterval, now);
  } else {
    product.status = 'active';
    product.nextCheckAt = minutesFromNow(backoffMinutes(product.consecutiveFailures), now);
  }

  await product.save();
}

/** Message shown to the user for a product whose automatic checks have stopped. */
export function failureGuidance(kind?: CheckErrorKind): string | undefined {
  switch (kind) {
    case 'not_found':
      return 'This product page no longer exists. Check the URL or remove the tracker.';
    case 'unsupported':
      return 'This link is no longer supported. Please re-add the product using its product page URL.';
    case 'not_configured':
      return 'Price checks for this marketplace are not set up. The link is fine — an administrator needs to configure a data source before tracking can resume.';
    case 'blocked':
      return 'Unable to retrieve the latest price. Please verify the product URL or reconnect the data source.';
    case 'parse_error':
      return 'The price could not be read from this listing. Configuring an official API or data provider usually fixes this.';
    case 'unavailable':
      return 'The product is currently unavailable on this marketplace.';
    case 'temporary_error':
      return 'The marketplace could not be reached. Checks will resume automatically.';
    default:
      return undefined;
  }
}
