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

/** Triggers beyond the target price. Account defaults; products may override each one. */
export interface AlertRules {
  /** Alert when the price falls at least this many percent. 0 = off. */
  dropPercent: number;
  /** Alert when the price goes below the lowest price ever recorded. */
  allTimeLow: boolean;
  /** Alert when an out-of-stock listing comes back. */
  backInStock: boolean;
}

export interface NotificationPreferences {
  channel: NotificationChannel;
  /** `once` = one alert per target breach; `always` = alert on every breach. */
  alertMode: AlertMode;
  quietHours: QuietHours;
  /** Minimum gap between two alerts for the same product, in minutes. */
  minIntervalMinutes: number;
  alertRules: AlertRules;
}

/** Most Telegram chats one account can send alerts to. */
export const MAX_TELEGRAM_CHATS = 10;

/** A chat that receives Telegram alerts, captured when someone taps Start on the bot. */
export interface TelegramLinkedChat {
  /** Telegram chat ids exceed 2^31 and are negative for groups, so they are kept as strings. */
  chatId: string;
  chatTitle?: string;
  linkedAt: Date;
}

/** A pending link: the code is embedded in the bot's deep link and expires quickly. */
export interface TelegramPendingLink {
  code: string;
  expiresAt: Date;
}

export interface IUser {
  _id: Types.ObjectId;
  email: string;
  name: string;
  /** Argon2id hash. Marketplace passwords are never stored here or anywhere else. */
  passwordHash: string;
  phone?: string;
  phoneVerified: boolean;
  /** Every chat here receives each Telegram alert: people, groups, or both. */
  telegramChats: TelegramLinkedChat[];
  telegramLink?: TelegramPendingLink;
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

const alertRulesSchema = new Schema<AlertRules>(
  {
    dropPercent: { type: Number, min: 0, max: 90, default: 0 },
    allTimeLow: { type: Boolean, default: false },
    // Low-noise by nature: it can only fire after the listing was out of stock.
    backInStock: { type: Boolean, default: true },
  },
  { _id: false },
);

const notificationPrefsSchema = new Schema<NotificationPreferences>(
  {
    channel: { type: String, enum: NOTIFICATION_CHANNELS, default: 'whatsapp' },
    alertMode: { type: String, enum: ALERT_MODES, default: 'once' },
    quietHours: { type: quietHoursSchema, default: () => ({}) },
    minIntervalMinutes: { type: Number, min: 0, max: 10080, default: 360 },
    alertRules: { type: alertRulesSchema, default: () => ({}) },
  },
  { _id: false },
);

const telegramChatSchema = new Schema<TelegramLinkedChat>(
  {
    chatId: { type: String, required: true, maxlength: 32 },
    chatTitle: { type: String, maxlength: 256 },
    linkedAt: { type: Date, required: true },
  },
  { _id: false },
);

const telegramLinkSchema = new Schema<TelegramPendingLink>(
  {
    code: { type: String, required: true, maxlength: 64 },
    expiresAt: { type: Date, required: true },
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
    telegramChats: {
      type: [telegramChatSchema],
      default: [],
      validate: {
        validator: (chats: TelegramLinkedChat[]) => chats.length <= MAX_TELEGRAM_CHATS,
        message: `At most ${MAX_TELEGRAM_CHATS} Telegram chats can be connected`,
      },
    },
    telegramLink: { type: telegramLinkSchema, select: false },
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
        delete ret.telegramLink;
        delete ret.__v;
        return ret;
      },
    },
  },
);

// The unique index on `email` is declared on the path itself — declaring it a
// second time here would make Mongoose warn about a duplicate index.

export const User: Model<IUser> = model<IUser>('User', userSchema);

/**
 * One-off data fix: accounts that linked a chat before several were supported
 * stored it in a single `telegram` field. Moves it into `telegramChats`.
 * Idempotent, and a no-op once no document has the old field.
 */
export async function migrateLegacyTelegramChat(): Promise<number> {
  const result = await User.collection.updateMany({ telegram: { $type: 'object' } }, [
    {
      $set: {
        telegramChats: {
          $concatArrays: [
            {
              $filter: {
                input: { $ifNull: ['$telegramChats', []] },
                cond: { $ne: ['$$this.chatId', '$telegram.chatId'] },
              },
            },
            ['$telegram'],
          ],
        },
      },
    },
    { $unset: 'telegram' },
  ]);
  return result.modifiedCount;
}
