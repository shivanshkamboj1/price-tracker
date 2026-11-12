import { Schema, model, type HydratedDocument, type Model, type Types } from 'mongoose';
import { MARKETPLACES, type Marketplace } from '../config/constants';

/**
 * Optional, user-initiated marketplace session.
 *
 * What this record may contain:
 *   - an encrypted, minimal session artefact that the *user's own browser
 *     extension* produced after the user signed in directly with the marketplace
 *   - an OAuth-style token issued by an officially supported mechanism
 *
 * What it must never contain: marketplace passwords, OTPs, CVVs or payment data.
 * The backend never presents a marketplace login form and never proxies
 * marketplace credentials.
 */
export type SessionStatus = 'connected' | 'expired' | 'disconnected' | 'revoked';

export interface IMarketplaceSession {
  _id: Types.ObjectId;
  userId: Types.ObjectId;
  marketplace: Marketplace;
  status: SessionStatus;
  /** AES-256-GCM ciphertext produced by utils/crypto. Never logged, never returned. */
  encryptedPayload?: string;
  /** Human label shown in settings, e.g. "Chrome on Windows". */
  label?: string;
  connectedAt?: Date;
  expiresAt?: Date;
  lastUsedAt?: Date;
  disconnectedAt?: Date;
  createdAt: Date;
  updatedAt: Date;
}

export type MarketplaceSessionDocument = HydratedDocument<IMarketplaceSession>;

const marketplaceSessionSchema = new Schema<IMarketplaceSession>(
  {
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    marketplace: { type: String, enum: MARKETPLACES, required: true },
    status: {
      type: String,
      enum: ['connected', 'expired', 'disconnected', 'revoked'],
      default: 'disconnected',
    },
    encryptedPayload: { type: String, select: false },
    label: { type: String, trim: true, maxlength: 120 },
    connectedAt: { type: Date },
    expiresAt: { type: Date },
    lastUsedAt: { type: Date },
    disconnectedAt: { type: Date },
  },
  {
    timestamps: true,
    toJSON: {
      transform(_doc, ret: Record<string, unknown>) {
        delete ret.encryptedPayload;
        delete ret.__v;
        return ret;
      },
    },
  },
);

marketplaceSessionSchema.index({ userId: 1, marketplace: 1 }, { unique: true });

export const MarketplaceSession: Model<IMarketplaceSession> = model<IMarketplaceSession>(
  'MarketplaceSession',
  marketplaceSessionSchema,
);
