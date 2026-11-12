import { Schema, model, type HydratedDocument, type Model, type Types } from 'mongoose';
import {
  AVAILABILITIES,
  CURRENCY_DEFAULT,
  PRICE_SOURCES,
  type Availability,
  type PriceSource,
} from '../config/constants';

export interface IPriceHistory {
  _id: Types.ObjectId;
  productId: Types.ObjectId;
  /** Denormalized so history queries can be authorized without a join. */
  userId: Types.ObjectId;
  price: number; // minor units
  currency: string;
  availability: Availability;
  checkedAt: Date;
  source: PriceSource;
  metadata?: {
    seller?: string;
    mrp?: number;
    discountPercent?: number;
    rating?: number;
    jobId?: string;
    [key: string]: unknown;
  };
}

export type PriceHistoryDocument = HydratedDocument<IPriceHistory>;

const priceHistorySchema = new Schema<IPriceHistory>(
  {
    productId: { type: Schema.Types.ObjectId, ref: 'Product', required: true },
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    price: { type: Number, required: true, min: 0 },
    currency: { type: String, default: CURRENCY_DEFAULT, maxlength: 3 },
    availability: { type: String, enum: AVAILABILITIES, default: 'unknown' },
    checkedAt: { type: Date, required: true, default: () => new Date() },
    source: { type: String, enum: PRICE_SOURCES, required: true },
    metadata: { type: Schema.Types.Mixed },
  },
  { versionKey: false },
);

// Chart queries: one product ordered by time.
priceHistorySchema.index({ productId: 1, checkedAt: -1 });
// Ownership-scoped sweeps (stats, exports).
priceHistorySchema.index({ userId: 1, checkedAt: -1 });

export const PriceHistory: Model<IPriceHistory> = model<IPriceHistory>(
  'PriceHistory',
  priceHistorySchema,
);
