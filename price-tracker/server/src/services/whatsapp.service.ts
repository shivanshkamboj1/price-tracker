import QRCode from 'qrcode';
import { whatsappEnabled } from '../config/env';
import { logger } from '../config/logger';
import {
  MAX_WHATSAPP_RECIPIENTS,
  User,
  type UserDocument,
  type WhatsAppRecipient,
} from '../models/User';
import { forgetWhatsAppAccount, getLinkedWhatsAppAccount } from '../models/WhatsApp';
import { AppError, badRequest, conflict, notFound } from '../utils/errors';
import { whatsappService } from './notification';
import { whatsappBridge, WORKER_OFFLINE } from './whatsapp/bridge';
import {
  readLiveState,
  type CommandFailure,
  type LinkMethod,
  type WhatsAppAccountInfo,
  type WhatsAppConnectionStatus,
} from './whatsapp/protocol';

/**
 * WhatsApp settings, in the order the settings page asks for them:
 *
 * 1. Link the account alerts are sent *from* — a phone's WhatsApp, linked the
 *    way WhatsApp Web is: scan a QR code, or type a pairing code.
 * 2. Add the numbers alerts are sent *to*. Each one is checked against
 *    WhatsApp first, and every number gets every WhatsApp alert.
 *
 * The connection itself lives in the worker (see `whatsapp/owner.ts`); this
 * service only reads its published state and sends it commands.
 */

export interface WhatsAppRecipientDto {
  id: string;
  phone: string;
  name: string | null;
  addedAt: Date;
}

export interface WhatsAppStatus {
  /** False when WHATSAPP_ENABLED=false on the server. */
  enabled: boolean;
  /** False when no worker holds the connection — the worker process is not running. */
  workerOnline: boolean;
  status: WhatsAppConnectionStatus | 'offline';
  linked: boolean;
  account: WhatsAppAccountInfo | null;
  /** A QR code image (data: URL) to scan while linking by QR. */
  qrDataUrl: string | null;
  /** The code to type on the phone while linking by number. */
  pairingCode: string | null;
  error: string | null;
  /** WhatsApp is temporarily stopping the account from messaging new people. */
  restricted: boolean;
  recipients: WhatsAppRecipientDto[];
  maxRecipients: number;
}

const toRecipientDto = (recipient: WhatsAppRecipient): WhatsAppRecipientDto => ({
  id: recipient._id.toString(),
  phone: recipient.phone,
  name: recipient.name ?? null,
  addedAt: recipient.addedAt,
});

function assertEnabled(): void {
  if (!whatsappEnabled) {
    throw badRequest('WhatsApp alerts are turned off on the server (WHATSAPP_ENABLED=false).');
  }
}

/** Turns a failed command into an error the settings page can show as-is. */
function commandError(result: CommandFailure): AppError {
  if (result.error === WORKER_OFFLINE || !result.retryable) return badRequest(result.error);
  return new AppError(503, 'UPSTREAM_UNAVAILABLE', result.error);
}

async function load(userId: string): Promise<UserDocument> {
  const user = await User.findById(userId);
  if (!user) throw notFound('Account not found');
  return user;
}

export async function getWhatsAppStatus(userId: string): Promise<WhatsAppStatus> {
  const user = await load(userId);
  const recipients = (user.whatsappRecipients ?? []).map(toRecipientDto);
  const base = { enabled: whatsappEnabled, recipients, maxRecipients: MAX_WHATSAPP_RECIPIENTS };

  const live = whatsappEnabled ? await readLiveState() : null;
  if (!live) {
    // No worker: say what is stored, so a linked account still shows as linked.
    const stored = await getLinkedWhatsAppAccount();
    return {
      ...base,
      workerOnline: false,
      status: 'offline',
      linked: Boolean(stored),
      account: stored ? { phone: stored.phone, name: stored.name ?? null } : null,
      qrDataUrl: null,
      pairingCode: null,
      error: null,
      restricted: false,
    };
  }

  const qrDataUrl = live.qr
    ? await QRCode.toDataURL(live.qr, { margin: 1, width: 264, errorCorrectionLevel: 'L' }).catch(
        () => null,
      )
    : null;

  return {
    ...base,
    workerOnline: true,
    status: live.status,
    linked: Boolean(live.account) && live.status !== 'linking',
    account: live.account,
    qrDataUrl,
    pairingCode: live.pairingCode,
    error: live.error,
    restricted: live.restricted,
  };
}

/** Starts linking. The QR code or pairing code then appears in the status. */
export async function startWhatsAppLink(link: LinkMethod): Promise<{ started: true }> {
  assertEnabled();
  const result = await whatsappBridge().run({ type: 'link', ...link }, 30_000);
  if (!result.ok) throw commandError(result);
  return { started: true };
}

export async function cancelWhatsAppLink(): Promise<void> {
  if (!whatsappEnabled) return;
  // Nothing to cancel when no worker is running, so the outcome does not matter.
  await whatsappBridge().run({ type: 'cancel-link' });
}

/**
 * Unlinks the sending account and removes this server from the phone's
 * Linked devices. Recipients are kept for the next account.
 */
export async function unlinkWhatsApp(): Promise<{ removedFromPhone: boolean }> {
  const result = whatsappEnabled
    ? await whatsappBridge().run({ type: 'logout' })
    : ({ ok: false, error: 'disabled', retryable: false } as const);
  if (result.ok) return { removedFromPhone: true };

  // No worker to tell WhatsApp: forget the session here. The phone still lists
  // the device until it is removed there (Settings → Linked devices).
  await forgetWhatsAppAccount();
  logger.info('whatsapp session forgotten without a worker; the phone still lists the device');
  return { removedFromPhone: false };
}

export async function addWhatsAppRecipient(
  userId: string,
  input: { phone: string; name?: string },
): Promise<WhatsAppRecipientDto[]> {
  assertEnabled();
  const user = await load(userId);
  const recipients = user.whatsappRecipients ?? [];

  if (recipients.some((recipient) => recipient.phone === input.phone)) {
    throw conflict('That number already gets WhatsApp alerts.');
  }
  if (recipients.length >= MAX_WHATSAPP_RECIPIENTS) {
    throw badRequest(
      `You can send WhatsApp alerts to up to ${MAX_WHATSAPP_RECIPIENTS} numbers. Remove one to add another.`,
    );
  }

  const live = await readLiveState();
  if (!live) throw badRequest(WORKER_OFFLINE);
  if (live.status !== 'connected') {
    throw badRequest('Link the WhatsApp account you send from first, then add numbers.');
  }

  const check = await whatsappBridge().run({ type: 'check', phone: input.phone });
  if (!check.ok) throw commandError(check);
  if (!check.exists) throw badRequest(`${input.phone} does not have a WhatsApp account.`);

  user.whatsappRecipients.push({
    phone: input.phone,
    name: input.name || undefined,
    jid: check.jid ?? undefined,
    addedAt: new Date(),
  } as WhatsAppRecipient);
  await user.save();
  logger.info({ userId, phoneSuffix: input.phone.slice(-4) }, 'whatsapp recipient added');
  return user.whatsappRecipients.map(toRecipientDto);
}

export async function removeWhatsAppRecipient(
  userId: string,
  recipientId: string,
): Promise<WhatsAppRecipientDto[]> {
  const user = await load(userId);
  const before = user.whatsappRecipients.length;
  user.whatsappRecipients = user.whatsappRecipients.filter(
    (recipient) => recipient._id.toString() !== recipientId,
  );
  if (user.whatsappRecipients.length === before) throw notFound('That number is not in the list.');
  await user.save();
  return user.whatsappRecipients.map(toRecipientDto);
}

/** Sends a test message to one number, or to every number when `recipientId` is omitted. */
export async function sendWhatsAppTest(
  userId: string,
  recipientId?: string,
): Promise<{ sent: number; failed: Array<{ recipientId: string; reason: string }> }> {
  assertEnabled();
  const user = await load(userId);
  const recipients = (user.whatsappRecipients ?? []).filter(
    (recipient) => !recipientId || recipient._id.toString() === recipientId,
  );
  if (recipients.length === 0) {
    throw recipientId
      ? notFound('That number is not in the list.')
      : badRequest('Add a number to send WhatsApp alerts to first.');
  }

  const results = await Promise.all(
    recipients.map(async (recipient) => ({
      recipient,
      result: await whatsappService().sendText(
        recipient.jid ?? recipient.phone,
        '🔔 *Test message*\nWhatsApp alerts are working. Price alerts will look like this, with a link to the product.',
      ),
    })),
  );

  const failed = results.filter(({ result }) => result.status !== 'sent');
  if (failed.length === results.length) {
    const { recipient, result } = failed[0]!;
    const reason = result.failureReason ?? 'WhatsApp did not accept the message';
    if (reason === WORKER_OFFLINE || result.retryable === false) throw badRequest(reason);
    throw new AppError(503, 'UPSTREAM_UNAVAILABLE', `${recipient.name ?? recipient.phone}: ${reason}`);
  }

  return {
    sent: results.length - failed.length,
    failed: failed.map(({ recipient, result }) => ({
      recipientId: recipient._id.toString(),
      reason: `${recipient.name ?? recipient.phone}: ${result.failureReason ?? 'not delivered'}`,
    })),
  };
}
