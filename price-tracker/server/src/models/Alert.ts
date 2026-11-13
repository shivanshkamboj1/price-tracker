import { Schema, model, type HydratedDocument, type Model, type Types } from 'mongoose';
import {
  ALERT_DELIVERY_STATUSES,
  ALERT_STATES,
  ALERT_TYPES,
  CURRENCY_DEFAULT,
  DELIVERY_CHANNELS,
  LEGACY_NOTIFICATION_CHANNELS,
  type AlertDeliveryStatus,
  type AlertState,
  type AlertType,
  type DeliveryChannel,
  type LegacyNotificationChannel,
} from '../config/constants';

export interface AlertDelivery {
  /**
   * `tg:<chatId>` for Telegram, `wa:<fingerprint>` for WhatsApp, `sms` / `call`
   * for Twilio — never a phone number itself. (`phone` on older alerts.)
   */
  destination: string;
  /** Absent on alerts delivered before several channels were supported. */
  channel?: DeliveryChannel;
  status: AlertDeliveryStatus;
  providerMessageId?: string;
  failureReason?: string;
  attemptedAt: Date;
}

export interface IAlert {
  _id: Types.ObjectId;
  userId: Types.ObjectId;
  productId: Types.ObjectId;
  /** The headline trigger — the highest-priority entry of `reasons`. */
  type: AlertType;
  /** Every trigger that fired on this check; one message covers them all. */
  reasons: AlertType[];
  /** Price that triggered the alert, in minor units. */
  price: number;
  targetPrice: number;
  /** For `price_drop`: the price it fell from. Minor units. */
  dropFromPrice?: number;
  /** For `all_time_low`: the previous lowest price. Minor units. */
  previousLowestPrice?: number;
  currency: string;
  /** Every channel this alert goes out on. */
  channels?: DeliveryChannel[];
  /** The single channel of alerts raised before `channels` existed. */
  channel?: LegacyNotificationChannel;
  /** Delivery outcome: `sent` once any destination on any channel has it. */
  status: AlertDeliveryStatus;
  /** Lifecycle of the alert itself. */
  state: AlertState;
  message: string;
  /** Provider message id (Twilio SID or Telegram message id) — never a credential. */
  providerMessageId?: string;
  /**
   * One entry per destination, so a retry only re-sends to the ones that failed.
   * Telegram and WhatsApp can have several each; SMS and call have one.
   */
  deliveries?: AlertDelivery[];
  failureReason?: string;
  sentAt?: Date;
  acknowledgedAt?: Date;
  readAt?: Date;
  createdAt: Date;
  updatedAt: Date;
}

export type AlertDocument = HydratedDocument<IAlert>;

const alertSchema = new Schema<IAlert>(
  {
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    productId: { type: Schema.Types.ObjectId, ref: 'Product', required: true },
    type: { type: String, enum: ALERT_TYPES, required: true },
    reasons: { type: [{ type: String, enum: ALERT_TYPES }], default: undefined },
    price: { type: Number, required: true, min: 0 },
    targetPrice: { type: Number, required: true, min: 0 },
    dropFromPrice: { type: Number, min: 0 },
    previousLowestPrice: { type: Number, min: 0 },
    currency: { type: String, default: CURRENCY_DEFAULT, maxlength: 3 },
    channels: { type: [{ type: String, enum: DELIVERY_CHANNELS }], default: undefined },
    channel: { type: String, enum: LEGACY_NOTIFICATION_CHANNELS },
    status: { type: String, enum: ALERT_DELIVERY_STATUSES, default: 'pending' },
    state: { type: String, enum: ALERT_STATES, default: 'triggered' },
    message: { type: String, required: true, maxlength: 2000 },
    providerMessageId: { type: String, maxlength: 128 },
    deliveries: {
      type: [
        new Schema<AlertDelivery>(
          {
            destination: { type: String, required: true, maxlength: 64 },
            channel: { type: String, enum: DELIVERY_CHANNELS },
            status: { type: String, enum: ALERT_DELIVERY_STATUSES, required: true },
            providerMessageId: { type: String, maxlength: 128 },
            failureReason: { type: String, maxlength: 512 },
            attemptedAt: { type: Date, required: true },
          },
          { _id: false },
        ),
      ],
      default: undefined,
    },
    failureReason: { type: String, maxlength: 512 },
    sentAt: { type: Date },
    acknowledgedAt: { type: Date },
    readAt: { type: Date },
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

alertSchema.index({ userId: 1, createdAt: -1 });
alertSchema.index({ productId: 1, createdAt: -1 });
alertSchema.index({ userId: 1, state: 1, status: 1 });

export const Alert: Model<IAlert> = model<IAlert>('Alert', alertSchema);

/** Channels of an alert, including ones raised before several were supported. */
export function alertChannels(alert: Pick<IAlert, 'channels' | 'channel'>): DeliveryChannel[] {
  if (alert.channels) return alert.channels;
  return alert.channel && alert.channel !== 'none' ? [alert.channel] : [];
}
