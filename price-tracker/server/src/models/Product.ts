import { Schema, model, type HydratedDocument, type Model, type Types } from 'mongoose';
import {
  ALERT_MODES,
  AVAILABILITIES,
  CHECK_ERROR_KINDS,
  CURRENCY_DEFAULT,
  MARKETPLACES,
  NOTIFICATION_CHANNELS,
  PRODUCT_STATUSES,
  type AlertMode,
  type Availability,
  type CheckErrorKind,
  type Marketplace,
  type NotificationChannel,
  type ProductStatus,
  type SmartAlertType,
} from '../config/constants';

export interface ProductAlertRules {
  dropPercent?: number;
  allTimeLow?: boolean;
  backInStock?: boolean;
}

export interface IProduct {
  _id: Types.ObjectId;
  userId: Types.ObjectId;
  marketplace: Marketplace;
  /** Canonical, normalized URL. Tracking parameters are stripped before storing. */
  productUrl: string;
  /** ASIN for Amazon, PID for Flipkart. Stable identity across URL variants. */
  externalProductId: string;
  title: string;
  nickname?: string;
  imageUrl?: string;

  /** All money fields are integer minor units (paise for INR). */
  currentPrice?: number;
  previousPrice?: number;
  targetPrice: number;
  lowestPrice?: number;
  highestPrice?: number;
  currency: string;

  availability: Availability;
  status: ProductStatus;

  checkInterval: number; // minutes
  nextCheckAt: Date;
  lastCheckedAt?: Date;
  lastPriceChangedAt?: Date;

  /** Per-product overrides; fall back to the user's preferences when unset. */
  notificationChannel?: NotificationChannel;
  alertMode?: AlertMode;

  /** Set when the target is breached, cleared once the price rises above target. */
  alertArmed: boolean;
  lastAlertAt?: Date;
  alertCount: number;

  /** Per-product overrides of the account's smart alert rules; unset = account default. */
  alertRules?: ProductAlertRules;
  /**
   * Baseline for the percentage-drop rule: the highest price since the last drop
   * alert (or since the rule was switched on). Minor units.
   */
  dropReferencePrice?: number;
  /** When each smart trigger last fired, for per-trigger throttling. */
  lastSmartAlertAt?: Partial<Record<SmartAlertType, Date>>;

  consecutiveFailures: number;
  lastErrorKind?: CheckErrorKind;
  lastErrorMessage?: string;
  lastErrorAt?: Date;

  /** Opt-in grouping for cross-marketplace comparison — never inferred from titles. */
  comparisonGroup?: string;

  deletedAt?: Date;
  createdAt: Date;
  updatedAt: Date;
}

export type ProductDocument = HydratedDocument<IProduct>;

const productSchema = new Schema<IProduct>(
  {
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    marketplace: { type: String, enum: MARKETPLACES, required: true },
    productUrl: { type: String, required: true, trim: true, maxlength: 2048 },
    externalProductId: { type: String, required: true, trim: true, maxlength: 128 },
    title: { type: String, required: true, trim: true, maxlength: 512 },
    nickname: { type: String, trim: true, maxlength: 120 },
    imageUrl: { type: String, trim: true, maxlength: 2048 },

    currentPrice: { type: Number, min: 0 },
    previousPrice: { type: Number, min: 0 },
    targetPrice: { type: Number, required: true, min: 1 },
    lowestPrice: { type: Number, min: 0 },
    highestPrice: { type: Number, min: 0 },
    currency: { type: String, default: CURRENCY_DEFAULT, maxlength: 3 },

    availability: { type: String, enum: AVAILABILITIES, default: 'unknown' },
    status: { type: String, enum: PRODUCT_STATUSES, default: 'active' },

    checkInterval: { type: Number, required: true, min: 15, max: 10080 },
    nextCheckAt: { type: Date, required: true, default: () => new Date() },
    lastCheckedAt: { type: Date },
    lastPriceChangedAt: { type: Date },

    notificationChannel: { type: String, enum: NOTIFICATION_CHANNELS },
    alertMode: { type: String, enum: ALERT_MODES },

    alertArmed: { type: Boolean, default: false },
    lastAlertAt: { type: Date },
    alertCount: { type: Number, default: 0 },

    alertRules: {
      type: new Schema<ProductAlertRules>(
        {
          dropPercent: { type: Number, min: 0, max: 90 },
          allTimeLow: { type: Boolean },
          backInStock: { type: Boolean },
        },
        { _id: false },
      ),
    },
    dropReferencePrice: { type: Number, min: 0 },
    lastSmartAlertAt: {
      type: new Schema(
        {
          all_time_low: { type: Date },
          price_drop: { type: Date },
          back_in_stock: { type: Date },
        },
        { _id: false },
      ),
    },

    consecutiveFailures: { type: Number, default: 0 },
    lastErrorKind: { type: String, enum: CHECK_ERROR_KINDS },
    lastErrorMessage: { type: String, maxlength: 512 },
    lastErrorAt: { type: Date },

    comparisonGroup: { type: String, trim: true, maxlength: 64 },

    deletedAt: { type: Date },
  },
  {
    timestamps: true,
    toJSON: {
      transform(_doc, ret: Record<string, unknown>) {
        delete ret.__v;
        return ret;
      },
    },
  },
);

/* ----------------------------- indexes ----------------------------- */

// Dashboard and product list: a user's products, newest first.
productSchema.index({ userId: 1, status: 1, createdAt: -1 });
// The scheduler's hot query: due active products.
productSchema.index({ status: 1, nextCheckAt: 1 });
// Cross-marketplace identity and duplicate detection.
productSchema.index({ marketplace: 1, externalProductId: 1 });
// One tracker per product per user.
productSchema.index(
  { userId: 1, marketplace: 1, externalProductId: 1 },
  { unique: true, partialFilterExpression: { deletedAt: { $exists: false } } },
);
// Comparison groups are scoped to their owner.
productSchema.index({ userId: 1, comparisonGroup: 1 }, { sparse: true });

export const Product: Model<IProduct> = model<IProduct>('Product', productSchema);
