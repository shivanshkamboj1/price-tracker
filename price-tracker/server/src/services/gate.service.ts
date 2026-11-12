import { env } from '../config/env';
import { User, type UserDocument } from '../models/User';
import { timingSafeEqual } from '../utils/crypto';
import { unauthorized } from '../utils/errors';

/**
 * Single-password access gate.
 *
 * This deployment has no accounts. One password, held in `APP_ACCESS_PASSWORD`,
 * unlocks the whole app, and everything belongs to one owner record. The owner
 * still exists as a `User` document so every query keeps its `userId` filter and
 * the data model is unchanged — the difference is that nobody registers, and
 * there is nothing to log in *as*.
 */

/** The owner's identity, cached after the first lookup. */
let ownerId: string | null = null;

/**
 * Returns the single owner, creating it on first run.
 *
 * The *oldest* user wins, so an existing database keeps its products rather than
 * having them stranded under an id nothing points at any more.
 */
export async function getOwner(): Promise<UserDocument> {
  const existing = await User.findOne().sort({ createdAt: 1 });
  if (existing) {
    ownerId = existing._id.toString();
    return existing;
  }

  const created = await User.create({
    email: 'owner@localhost',
    // Unusable by design: the account password is not an authentication path any
    // more, and `APP_ACCESS_PASSWORD` is never written to the database.
    passwordHash: 'disabled',
    name: 'Owner',
    role: 'admin',
  });
  ownerId = created._id.toString();
  return created;
}

/** The owner's id without loading the document, for hot paths. */
export async function getOwnerId(): Promise<string> {
  if (ownerId) return ownerId;
  return (await getOwner())._id.toString();
}

/**
 * Checks the submitted password.
 *
 * Compared in constant time so a wrong guess cannot be narrowed down by timing,
 * and the rate limiter on the route is what makes guessing impractical.
 */
export function verifyAccessPassword(candidate: string): void {
  if (!timingSafeEqual(candidate, env.APP_ACCESS_PASSWORD)) {
    throw unauthorized('That password is not correct');
  }
}
