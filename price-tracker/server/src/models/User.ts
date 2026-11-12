import { Schema, model, type HydratedDocument, type Model, type Types } from 'mongoose';
import {
  ALERT_MODES,
  NOTIFICATION_CHANNELS,
  type AlertMode,
  type NotificationChannel,
} from '../config/constants';

export interface QuietHours {
  enabled: boolean;
  /** Local hours in the user's timezone; the window may wrap past midnight. */
  startHour: number;
  endHour: number;
}

export interface NotificationPreferences {
  channel: NotificationChannel;
  /** `once` = one alert per target breach; `always` = alert on every breach. */
  alertMode: AlertMode;
  quietHours: QuietHours;
  /** Minimum gap between two alerts for the same product, in minutes. */
  minIntervalMinutes: number;
}

export interface IUser {
  _id: Types.ObjectId;
  email: string;
  name: string;
  /** Argon2id hash. Marketplace passwords are never stored here or anywhere else. */
  passwordHash: string;
  phone?: string;
  phoneVerified: boolean;
  timezone: string;
  notificationPrefs: NotificationPreferences;
  role: 'user' | 'admin';
  /** Bumped on password change / "log out everywhere" to invalidate live tokens. */
  tokenVersion: number;
  lastLoginAt?: Date;
  createdAt: Date;
  updatedAt: Date;
}

export type UserDocument = HydratedDocument<IUser>;

const quietHoursSchema = new Schema<QuietHours>(
  {
    enabled: { type: Boolean, default: false },
    startHour: { type: Number, min: 0, max: 23, default: 22 },
    endHour: { type: Number, min: 0, max: 23, default: 8 },
  },
  { _id: false },
);

const notificationPrefsSchema = new Schema<NotificationPreferences>(
  {
    channel: { type: String, enum: NOTIFICATION_CHANNELS, default: 'whatsapp' },
    alertMode: { type: String, enum: ALERT_MODES, default: 'once' },
    quietHours: { type: quietHoursSchema, default: () => ({}) },
    minIntervalMinutes: { type: Number, min: 0, max: 10080, default: 360 },
  },
  { _id: false },
);

const userSchema = new Schema<IUser>(
  {
    email: {
      type: String,
      required: true,
      unique: true,
      lowercase: true,
      trim: true,
      maxlength: 254,
    },
    name: { type: String, required: true, trim: true, maxlength: 120 },
    passwordHash: { type: String, required: true, select: false },
    phone: { type: String, trim: true, maxlength: 20 },
    phoneVerified: { type: Boolean, default: false },
    timezone: { type: String, default: 'Asia/Kolkata' },
    notificationPrefs: { type: notificationPrefsSchema, default: () => ({}) },
    role: { type: String, enum: ['user', 'admin'], default: 'user' },
    tokenVersion: { type: Number, default: 0 },
    lastLoginAt: { type: Date },
  },
  {
    timestamps: true,
    toJSON: {
      transform(_doc, ret: Record<string, unknown>) {
        delete ret.passwordHash;
        delete ret.__v;
        return ret;
      },
    },
  },
);

// The unique index on `email` is declared on the path itself — declaring it a
// second time here would make Mongoose warn about a duplicate index.

export const User: Model<IUser> = model<IUser>('User', userSchema);
