import type { Marketplace } from '../config/constants';
import { logger } from '../config/logger';
import { MarketplaceSession, type IMarketplaceSession } from '../models/MarketplaceSession';
import { decryptString, encryptString } from '../utils/crypto';
import { badRequest, notFound } from '../utils/errors';
import { DAY_MS } from '../utils/time';

/**
 * Optional marketplace sessions.
 *
 * The design constraint, in full:
 *
 *   - The user signs in **directly with the marketplace**, in their own browser.
 *     This application never renders a marketplace login form and never asks for
 *     a marketplace password.
 *   - A user-controlled companion (browser extension or local profile) may hand
 *     us a minimal session artefact afterwards. That artefact is encrypted with
 *     AES-256-GCM before it touches the database and is never returned to any
 *     client or written to a log.
 *   - Passwords, OTPs, CVVs and payment details are rejected outright — see
 *     `assertNoCredentials` below.
 *   - Everything in the product works without this. It exists only for accounts
 *     whose pricing genuinely differs when signed in.
 */

const FORBIDDEN_MARKERS = [
  /"?password"?\s*[:=]/i,
  /"?passwd"?\s*[:=]/i,
  /"?otp"?\s*[:=]/i,
  /"?cvv"?\s*[:=]/i,
  /"?card(_?number)?"?\s*[:=]/i,
  /"?upi(_?pin)?"?\s*[:=]/i,
  /\b\d{13,19}\b/, // bare card-number-shaped digits
];

/** Rejects anything that looks like a credential rather than a session artefact. */
export function assertNoCredentials(payload: string): void {
  for (const marker of FORBIDDEN_MARKERS) {
    if (marker.test(payload)) {
      throw badRequest(
        'That payload looks like it contains credentials or payment data. Only a marketplace session artefact may be stored, never passwords, OTPs or card details.',
      );
    }
  }
  if (payload.length > 8192) {
    throw badRequest('Session artefact is larger than expected; only minimal session data is accepted');
  }
}

export interface ConnectSessionInput {
  userId: string;
  marketplace: Marketplace;
  /** Opaque session artefact produced by the user's own browser session. */
  payload: string;
  label?: string;
  expiresInDays?: number;
}

export async function connectSession(input: ConnectSessionInput): Promise<IMarketplaceSession> {
  assertNoCredentials(input.payload);

  const expiresAt = new Date(Date.now() + (input.expiresInDays ?? 14) * DAY_MS);

  const session = await MarketplaceSession.findOneAndUpdate(
    { userId: input.userId, marketplace: input.marketplace },
    {
      $set: {
        status: 'connected',
        encryptedPayload: encryptString(input.payload),
        label: input.label,
        connectedAt: new Date(),
        expiresAt,
        disconnectedAt: undefined,
      },
    },
    { upsert: true, new: true, setDefaultsOnInsert: true },
  );

  logger.info(
    { userId: input.userId, marketplace: input.marketplace },
    'marketplace session connected',
  );
  return session.toJSON() as IMarketplaceSession;
}

export async function listSessions(userId: string): Promise<IMarketplaceSession[]> {
  return MarketplaceSession.find({ userId }).lean<IMarketplaceSession[]>();
}

export async function disconnectSession(
  userId: string,
  marketplace: Marketplace,
): Promise<IMarketplaceSession> {
  const session = await MarketplaceSession.findOneAndUpdate(
    { userId, marketplace },
    {
      $set: { status: 'disconnected', disconnectedAt: new Date() },
      // The artefact is erased, not just flagged.
      $unset: { encryptedPayload: '', expiresAt: '' },
    },
    { new: true },
  );
  if (!session) throw notFound('No session is connected for that marketplace');

  logger.info({ userId, marketplace }, 'marketplace session disconnected');
  return session.toJSON() as IMarketplaceSession;
}

/**
 * Returns the decrypted artefact for a worker to use, or undefined when there is
 * none. Expired sessions are marked and ignored rather than used.
 */
export async function getDecryptedSession(
  userId: string,
  marketplace: Marketplace,
): Promise<string | undefined> {
  const session = await MarketplaceSession.findOne({
    userId,
    marketplace,
    status: 'connected',
  }).select('+encryptedPayload');

  if (!session?.encryptedPayload) return undefined;

  if (session.expiresAt && session.expiresAt.getTime() < Date.now()) {
    session.status = 'expired';
    session.encryptedPayload = undefined;
    await session.save();
    logger.info({ userId, marketplace }, 'marketplace session expired');
    return undefined;
  }

  try {
    const value = decryptString(session.encryptedPayload);
    session.lastUsedAt = new Date();
    await session.save();
    return value;
  } catch (err) {
    logger.error({ err, userId, marketplace }, 'failed to decrypt marketplace session');
    return undefined;
  }
}
