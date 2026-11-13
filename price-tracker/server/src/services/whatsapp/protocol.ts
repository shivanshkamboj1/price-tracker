import { redis } from '../../config/redis';

/**
 * What the API process and the worker that holds the WhatsApp connection share.
 *
 * Exactly one process may hold a linked WhatsApp session at a time — a second
 * connection with the same keys kicks the first one off — so a single worker
 * owns it (see `owner.ts`). Everyone else:
 *   - reads its live state from one Redis key, refreshed every few seconds, and
 *   - sends it commands through the `whatsapp` queue (see `bridge.ts`).
 */

export type WhatsAppConnectionStatus =
  /** No account is linked. */
  | 'not_linked'
  /** Waiting for the phone to scan the QR code or enter the pairing code. */
  | 'linking'
  /** Linked; opening the connection. */
  | 'connecting'
  | 'connected'
  /** Linked; the connection dropped and is being retried. */
  | 'reconnecting';

export interface WhatsAppAccountInfo {
  phone: string;
  name: string | null;
}

export interface WhatsAppLiveState {
  status: WhatsAppConnectionStatus;
  /** Raw QR payload while linking by QR code. */
  qr: string | null;
  /** Eight-character code while linking by phone number. */
  pairingCode: string | null;
  account: WhatsAppAccountInfo | null;
  /** The last problem worth showing, e.g. "The code expired". */
  error: string | null;
  /** WhatsApp is temporarily stopping this account from messaging new people. */
  restricted: boolean;
  updatedAt: string;
}

const LIVE_STATE_KEY = 'whatsapp:state';
/** The owner refreshes it far more often; a missing key means no worker holds the connection. */
export const LIVE_STATE_TTL_MS = 45_000;

export async function readLiveState(): Promise<WhatsAppLiveState | null> {
  const raw = await redis().get(LIVE_STATE_KEY);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as WhatsAppLiveState;
  } catch {
    return null;
  }
}

export async function writeLiveState(state: WhatsAppLiveState): Promise<void> {
  await redis().set(LIVE_STATE_KEY, JSON.stringify(state), 'PX', LIVE_STATE_TTL_MS);
}

export async function clearLiveState(): Promise<void> {
  await redis().del(LIVE_STATE_KEY);
}

/* -------------------------------- commands -------------------------------- */

export type LinkMethod = { method: 'qr' } | { method: 'code'; phone: string };

export type WhatsAppCommand =
  | ({ type: 'link' } & LinkMethod)
  | { type: 'cancel-link' }
  | { type: 'logout' }
  | { type: 'check'; phone: string }
  | { type: 'send'; to: string; text: string };

export type WhatsAppCommandType = WhatsAppCommand['type'];
export type CommandOf<K extends WhatsAppCommandType> = Extract<WhatsAppCommand, { type: K }>;

export type CommandFailure = {
  ok: false;
  error: string;
  /** False when trying again cannot help (nothing linked, number not on WhatsApp). */
  retryable: boolean;
};

export type CommandResult<T extends object = object> = ({ ok: true } & T) | CommandFailure;

export interface CommandResults {
  link: CommandResult;
  'cancel-link': CommandResult;
  logout: CommandResult;
  check: CommandResult<{ exists: boolean; jid: string | null }>;
  send: CommandResult<{ messageId: string | null }>;
}

/* --------------------------------- numbers -------------------------------- */

/** "+91 98765-43210" -> "919876543210" */
export const phoneDigits = (phone: string): string => phone.replace(/\D/g, '');

/** "919876543210:12@s.whatsapp.net" -> "+919876543210" */
export function jidToPhone(jid: string): string {
  return `+${jid.split('@')[0]!.split(':')[0]}`;
}

/** A WhatsApp id stays as it is; a phone number becomes one. */
export function toJid(to: string): string {
  return to.includes('@') ? to : `${phoneDigits(to)}@s.whatsapp.net`;
}
