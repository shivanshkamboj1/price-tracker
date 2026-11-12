import type { NotificationChannel } from '../config/constants';
import { User, type AlertRules, type UserDocument } from '../models/User';
import { notFound } from '../utils/errors';

export interface ProfileUpdate {
  name?: string;
  phone?: string | null;
  timezone?: string;
}

export interface NotificationSettingsUpdate {
  channel?: NotificationChannel;
  alertMode?: 'once' | 'always';
  minIntervalMinutes?: number;
  quietHours?: { enabled: boolean; startHour: number; endHour: number };
  alertRules?: Partial<AlertRules>;
}

async function load(userId: string): Promise<UserDocument> {
  const user = await User.findById(userId);
  if (!user) throw notFound('Account not found');
  return user;
}

export async function getProfile(userId: string): Promise<UserDocument> {
  return load(userId);
}

export async function updateProfile(
  userId: string,
  patch: ProfileUpdate,
): Promise<UserDocument> {
  const user = await load(userId);
  if (patch.name !== undefined) user.name = patch.name;
  if (patch.timezone !== undefined) user.timezone = patch.timezone;
  if (patch.phone !== undefined) {
    user.phone = patch.phone ?? undefined;
    // A new number has not been proven to belong to the user yet.
    user.phoneVerified = false;
  }
  await user.save();
  return user;
}

export async function updateNotificationSettings(
  userId: string,
  patch: NotificationSettingsUpdate,
): Promise<UserDocument> {
  const user = await load(userId);
  const prefs = user.notificationPrefs;

  if (patch.channel !== undefined) prefs.channel = patch.channel;
  if (patch.alertMode !== undefined) prefs.alertMode = patch.alertMode;
  if (patch.minIntervalMinutes !== undefined) prefs.minIntervalMinutes = patch.minIntervalMinutes;
  if (patch.quietHours !== undefined) prefs.quietHours = patch.quietHours;
  if (patch.alertRules !== undefined) {
    for (const [key, value] of Object.entries(patch.alertRules)) {
      if (value !== undefined) user.set(`notificationPrefs.alertRules.${key}`, value);
    }
  }

  user.notificationPrefs = prefs;
  user.markModified('notificationPrefs');
  await user.save();
  return user;
}
