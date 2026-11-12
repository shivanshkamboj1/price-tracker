import { Schema, model, type HydratedDocument, type Model, type Types } from 'mongoose';
import {
  CHECK_ERROR_KINDS,
  MARKETPLACES,
  PRICE_SOURCES,
  type CheckErrorKind,
  type Marketplace,
  type PriceSource,
} from '../config/constants';

export type JobResult = 'success' | 'failed' | 'skipped';

/**
 * One row per price-check attempt. Powers the system health page and makes
 * "why did this product stop updating?" answerable without digging through logs.
 */
export interface IJobLog {
  _id: Types.ObjectId;
  jobId: string;
  productId: Types.ObjectId;
  userId: Types.ObjectId;
  marketplace: Marketplace;
  trigger: 'scheduled' | 'manual';
  startedAt: Date;
  completedAt?: Date;
  durationMs?: number;
  result: JobResult;
  source?: PriceSource;
  price?: number;
  errorKind?: CheckErrorKind;
  errorMessage?: string;
  createdAt: Date;
}

export type JobLogDocument = HydratedDocument<IJobLog>;

const jobLogSchema = new Schema<IJobLog>(
  {
    jobId: { type: String, required: true, maxlength: 128 },
    productId: { type: Schema.Types.ObjectId, ref: 'Product', required: true },
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    marketplace: { type: String, enum: MARKETPLACES, required: true },
    trigger: { type: String, enum: ['scheduled', 'manual'], default: 'scheduled' },
    startedAt: { type: Date, required: true },
    completedAt: { type: Date },
    durationMs: { type: Number, min: 0 },
    result: { type: String, enum: ['success', 'failed', 'skipped'], required: true },
    source: { type: String, enum: PRICE_SOURCES },
    price: { type: Number, min: 0 },
    errorKind: { type: String, enum: CHECK_ERROR_KINDS },
    errorMessage: { type: String, maxlength: 512 },
  },
  { timestamps: { createdAt: true, updatedAt: false }, versionKey: false },
);

jobLogSchema.index({ productId: 1, startedAt: -1 });
jobLogSchema.index({ result: 1, startedAt: -1 });
jobLogSchema.index({ marketplace: 1, startedAt: -1 });
// Operational data only — expires after 30 days.
jobLogSchema.index({ createdAt: 1 }, { expireAfterSeconds: 30 * 24 * 60 * 60 });

export const JobLog: Model<IJobLog> = model<IJobLog>('JobLog', jobLogSchema);
