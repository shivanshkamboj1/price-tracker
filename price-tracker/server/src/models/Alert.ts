import { Schema, model, type HydratedDocument, type Model, type Types } from 'mongoose';
import {
  ALERT_DELIVERY_STATUSES,
  ALERT_STATES,
  ALERT_TYPES,
  CURRENCY_DEFAULT,
  NOTIFICATION_CHANNELS,
  type AlertDeliveryStatus,
  type AlertState,
  type AlertType,
  type NotificationChannel,
} from '../config/constants';

export interface IAlert {
  _id: Types.ObjectId;
  userId: Types.ObjectId;
  productId: Types.ObjectId;
  type: AlertType;
  /** Price that triggered the alert, in minor units. */
  price: number;
  targetPrice: number;
  currency: string;
  channel: NotificationChannel;
  /** Delivery outcome. */
  status: AlertDeliveryStatus;
  /** Lifecycle of the alert itself. */
  state: AlertState;
  message: string;
  /** Twilio message SID — an identifier, never a credential. */
  providerMessageId?: string;
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
    price: { type: Number, required: true, min: 0 },
    targetPrice: { type: Number, required: true, min: 0 },
    currency: { type: String, default: CURRENCY_DEFAULT, maxlength: 3 },
    channel: { type: String, enum: NOTIFICATION_CHANNELS, required: true },
    status: { type: String, enum: ALERT_DELIVERY_STATUSES, default: 'pending' },
    state: { type: String, enum: ALERT_STATES, default: 'triggered' },
    message: { type: String, required: true, maxlength: 2000 },
    providerMessageId: { type: String, maxlength: 128 },
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
