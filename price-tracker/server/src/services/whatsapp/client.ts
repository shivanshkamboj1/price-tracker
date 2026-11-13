import type { ConnectionState, WASocket } from '@whiskeysockets/baileys';
import { logger } from '../../config/logger';
import {
  forgetWhatsAppAccount,
  WHATSAPP_ACCOUNT_ID,
  WhatsAppAccount,
} from '../../models/WhatsApp';
import { useMongoAuthState, type MongoAuthState } from './authState';
import { loadBaileys, type Baileys } from './baileys';
import {
  jidToPhone,
  phoneDigits,
  toJid,
  writeLiveState,
  type CommandFailure,
  type CommandResults,
  type LinkMethod,
  type WhatsAppAccountInfo,
  type WhatsAppCommand,
  type WhatsAppConnectionStatus,
} from './protocol';

const log = logger.child({ module: 'whatsapp' });
// Baileys logs every protocol frame at debug and is chatty at info.
const baileysLogger = logger.child({ module: 'baileys' }, { level: 'warn' });

/** A QR code or pairing code that nobody used is abandoned after this. */
const LINK_TIMEOUT_MS = 3 * 60_000;
/** Reconnect delays for a linked account whose connection dropped. */
const RECONNECT_DELAYS_MS = [2_000, 5_000, 15_000, 30_000, 60_000];

const notConnected = (account: boolean): CommandFailure =>
  account
    ? { ok: false, error: 'WhatsApp is reconnecting. Try again in a moment.', retryable: true }
    : { ok: false, error: 'No WhatsApp account is linked yet.', retryable: false };

function statusCodeOf(error: unknown): number | undefined {
  return (error as { output?: { statusCode?: number } } | undefined)?.output?.statusCode;
}

function messageOf(err: unknown): string {
  return (err instanceof Error ? err.message : String(err)).slice(0, 300);
}

/**
 * The WhatsApp connection itself. Lives only in the worker that won ownership
 * (see `owner.ts`); everything else talks to it through commands.
 *
 * Linking: a fresh, unregistered session emits QR codes until the phone scans
 * one (or, by phone number, issues a pairing code to type in). WhatsApp then
 * closes the socket with "restart required" and the reopened socket is linked.
 */
export class WhatsAppClient {
  private sock: WASocket | null = null;
  private auth: MongoAuthState | null = null;
  /** Bumped whenever a socket is replaced, so events from an old one are ignored. */
  private generation = 0;
  private stopped = false;

  private status: WhatsAppConnectionStatus = 'not_linked';
  private account: WhatsAppAccountInfo | null = null;
  private link: LinkMethod | null = null;
  private qr: string | null = null;
  private pairingCode: string | null = null;
  private pairingRequested = false;
  private error: string | null = null;
  private restricted = false;

  private reconnectAttempts = 0;
  private reconnectTimer: NodeJS.Timeout | null = null;
  private linkTimer: NodeJS.Timeout | null = null;
  private version: Promise<[number, number, number] | undefined> | null = null;

  /** Connects the linked account, if there is one. */
  async start(): Promise<void> {
    const account = await WhatsAppAccount.findById(WHATSAPP_ACCOUNT_ID).lean();
    if (account) {
      this.account = { phone: account.phone, name: account.name ?? null };
      this.status = 'connecting';
    }
    await this.publish();
    if (account) await this.open().catch((err) => this.onOpenFailed(err));
  }

  /** Closes the connection without unlinking, so the next owner can pick it up. */
  async stop(): Promise<void> {
    this.stopped = true;
    this.clearTimers();
    this.closeSocket();
  }

  async execute(command: WhatsAppCommand): Promise<CommandResults[WhatsAppCommand['type']]> {
    switch (command.type) {
      case 'link':
        return this.startLink(command);
      case 'cancel-link':
        if (this.status === 'linking') await this.forget(null);
        return { ok: true };
      case 'logout':
        return this.logout();
      case 'check':
        return this.check(command.phone);
      case 'send':
        return this.send(command.to, command.text);
    }
  }

  /** Pushes the current state to Redis; also the heartbeat that says "a worker holds WhatsApp". */
  async publish(): Promise<void> {
    await writeLiveState({
      status: this.status,
      qr: this.status === 'linking' ? this.qr : null,
      pairingCode: this.status === 'linking' ? this.pairingCode : null,
      account: this.account,
      error: this.error,
      restricted: this.restricted,
      updatedAt: new Date().toISOString(),
    });
  }

  /* ------------------------------- commands ------------------------------- */

  private async startLink(method: LinkMethod): Promise<CommandResults['link']> {
    if (this.account) {
      return {
        ok: false,
        error: 'A WhatsApp account is already linked. Unlink it before linking another.',
        retryable: false,
      };
    }

    // Start from nothing: a half-finished earlier attempt must not leak into this one.
    this.clearTimers();
    this.closeSocket();
    await this.auth?.clear();
    this.auth = null;
    await forgetWhatsAppAccount();

    this.link = method;
    this.qr = null;
    this.pairingCode = null;
    this.pairingRequested = false;
    this.error = null;
    this.status = 'linking';
    await this.publish();

    try {
      await this.open();
    } catch (err) {
      await this.forget(`Could not reach WhatsApp: ${messageOf(err)}`);
      return { ok: false, error: this.error ?? 'Could not reach WhatsApp', retryable: true };
    }

    this.linkTimer = setTimeout(() => {
      if (this.status === 'linking') {
        void this.forget('The code expired before it was used. Start again.');
      }
    }, LINK_TIMEOUT_MS);
    return { ok: true };
  }

  private async logout(): Promise<CommandResults['logout']> {
    const sock = this.sock;
    // Detach first: the "logged out" close event this triggers is ours, not news.
    this.closeSocket({ end: false });
    if (sock && this.status === 'connected') {
      // Removes this server from the phone's Linked devices. Best effort.
      await sock.logout('Unlinked from the price tracker').catch(() => undefined);
    } else {
      sock?.end(undefined);
    }
    await this.forget(null);
    return { ok: true };
  }

  private async check(phone: string): Promise<CommandResults['check']> {
    if (!this.sock || this.status !== 'connected') return notConnected(Boolean(this.account));
    try {
      const [result] = (await this.sock.onWhatsApp(phoneDigits(phone))) ?? [];
      return { ok: true, exists: Boolean(result?.exists), jid: result?.exists ? result.jid : null };
    } catch (err) {
      return { ok: false, error: `WhatsApp could not look up that number: ${messageOf(err)}`, retryable: true };
    }
  }

  private async send(to: string, text: string): Promise<CommandResults['send']> {
    if (!this.sock || this.status !== 'connected') return notConnected(Boolean(this.account));
    try {
      const message = await this.sock.sendMessage(toJid(to), { text });
      return { ok: true, messageId: message?.key.id ?? null };
    } catch (err) {
      return { ok: false, error: messageOf(err), retryable: true };
    }
  }

  /* ------------------------------ connection ------------------------------ */

  private async waVersion(baileys: Baileys): Promise<[number, number, number] | undefined> {
    // An outdated protocol version gets the connection refused, so ask WhatsApp
    // Web for the current one (falls back to Baileys' bundled version).
    this.version ??= baileys
      .fetchLatestWaWebVersion({ signal: AbortSignal.timeout(5_000) })
      .then(({ version }) => version as [number, number, number])
      .catch(() => undefined);
    return this.version;
  }

  private async open(): Promise<void> {
    if (this.stopped) return;
    this.clearReconnect();
    const baileys = loadBaileys();
    const auth = (this.auth ??= await useMongoAuthState(baileys));
    const version = await this.waVersion(baileys);
    if (this.stopped) return;

    this.closeSocket();
    const generation = this.generation;
    const sock = baileys.makeWASocket({
      auth: {
        creds: auth.state.creds,
        keys: baileys.makeCacheableSignalKeyStore(auth.state.keys, baileysLogger),
      },
      logger: baileysLogger,
      browser: baileys.Browsers.appropriate('Chrome'),
      // Stay "offline" so the phone keeps getting its own notifications.
      markOnlineOnConnect: false,
      syncFullHistory: false,
      shouldSyncHistoryMessage: () => false,
      ...(version ? { version } : {}),
    });
    this.sock = sock;

    sock.ev.on('creds.update', () => {
      if (generation === this.generation) void auth.saveCreds();
    });
    sock.ev.on('connection.update', (update) => {
      if (generation !== this.generation) return;
      this.onConnectionUpdate(sock, update).catch((err) =>
        log.error({ err }, 'whatsapp connection update failed'),
      );
    });
  }

  private async onConnectionUpdate(sock: WASocket, update: Partial<ConnectionState>): Promise<void> {
    if (update.reachoutTimeLock) this.restricted = Boolean(update.reachoutTimeLock.isActive);

    if (update.qr) await this.onQr(sock, update.qr);

    if (update.connection === 'open') await this.onOpen(sock);
    else if (update.connection === 'close') await this.onClose(update);
    else if (update.reachoutTimeLock) await this.publish();
  }

  private async onQr(sock: WASocket, qr: string): Promise<void> {
    if (!this.link) {
      // Stored keys that WhatsApp no longer accepts: there is nothing to resume.
      log.warn('whatsapp asked to link while no link was in progress; forgetting the session');
      await this.forget('WhatsApp no longer accepts this link. Link the account again.');
      return;
    }

    if (this.link.method === 'code') {
      if (!this.pairingRequested) {
        this.pairingRequested = true;
        try {
          this.pairingCode = await sock.requestPairingCode(phoneDigits(this.link.phone));
        } catch (err) {
          log.warn({ reason: messageOf(err) }, 'pairing code request failed');
          this.error = 'WhatsApp did not issue a pairing code. Check the number, or link with the QR code.';
        }
      }
    } else {
      this.qr = qr;
    }
    await this.publish();
  }

  private async onOpen(sock: WASocket): Promise<void> {
    const user = sock.user;
    const pnJid = [user?.phoneNumber, user?.id].find((jid) => jid?.endsWith('@s.whatsapp.net'));
    const phone =
      (pnJid && jidToPhone(pnJid)) ??
      this.account?.phone ??
      (this.link?.method === 'code' ? this.link.phone : 'unknown');
    const name = user?.name ?? user?.notify ?? user?.verifiedName ?? this.account?.name ?? null;
    const linkedNow = this.status === 'linking';

    this.clearTimers();
    this.account = { phone, name };
    this.status = 'connected';
    this.link = null;
    this.qr = null;
    this.pairingCode = null;
    this.error = null;
    this.reconnectAttempts = 0;

    await WhatsAppAccount.updateOne(
      { _id: WHATSAPP_ACCOUNT_ID },
      { $set: { phone, ...(name ? { name } : {}) }, $setOnInsert: { linkedAt: new Date() } },
      { upsert: true },
    );
    await this.publish();
    log.info({ phoneSuffix: phone.slice(-4), linkedNow }, 'whatsapp connected');
  }

  private async onClose(update: Partial<ConnectionState>): Promise<void> {
    const { DisconnectReason } = loadBaileys();
    const code = statusCodeOf(update.lastDisconnect?.error);
    const registered = Boolean(this.auth?.state.creds.registered);
    this.sock = null;
    log.info({ code, registered, status: this.status }, 'whatsapp connection closed');

    if (code === DisconnectReason.restartRequired) {
      // Expected right after the phone confirms a link: reopen with the new keys.
      await this.open().catch((err) => this.onOpenFailed(err));
      return;
    }
    if (code === DisconnectReason.loggedOut) {
      await this.forget(
        'WhatsApp signed this server out (it was removed from Linked devices on the phone). Link it again.',
      );
      return;
    }
    if (code === DisconnectReason.forbidden) {
      await this.forget('WhatsApp refused this account. It may be banned or restricted.');
      return;
    }
    if (!registered) {
      // Linking ended without the phone confirming it: the codes ran out.
      await this.forget(
        this.status === 'linking' ? 'The code expired before it was used. Start again.' : null,
      );
      return;
    }

    if (code === DisconnectReason.connectionReplaced) {
      // Something else connected with these keys. Back off rather than fight over them.
      this.error = 'Another connection using this WhatsApp link took over. Retrying in a minute.';
      this.scheduleReconnect(60_000);
    } else {
      this.error = null;
      this.scheduleReconnect();
    }
    this.status = 'reconnecting';
    await this.publish();
  }

  private async onOpenFailed(err: unknown): Promise<void> {
    log.error({ reason: messageOf(err) }, 'could not open the whatsapp connection');
    if (this.status === 'linking') {
      await this.forget(`Could not reach WhatsApp: ${messageOf(err)}`);
      return;
    }
    this.status = 'reconnecting';
    this.scheduleReconnect();
    await this.publish();
  }

  private scheduleReconnect(delayMs?: number): void {
    if (this.stopped) return;
    this.clearReconnect();
    const delay =
      delayMs ??
      RECONNECT_DELAYS_MS[Math.min(this.reconnectAttempts, RECONNECT_DELAYS_MS.length - 1)]!;
    this.reconnectAttempts += 1;
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      this.open().catch((err) => this.onOpenFailed(err));
    }, delay);
  }

  /** Drops the session completely: keys, account, socket. */
  private async forget(error: string | null): Promise<void> {
    this.clearTimers();
    this.closeSocket();
    await this.auth?.clear();
    this.auth = null;
    await forgetWhatsAppAccount();

    this.status = 'not_linked';
    this.account = null;
    this.link = null;
    this.qr = null;
    this.pairingCode = null;
    this.pairingRequested = false;
    this.restricted = false;
    this.error = error;
    await this.publish();
    if (error) log.warn({ reason: error }, 'whatsapp session cleared');
  }

  private closeSocket(options: { end?: boolean } = {}): void {
    const sock = this.sock;
    this.sock = null;
    this.generation += 1;
    if (sock && options.end !== false) {
      try {
        sock.end(undefined);
      } catch {
        // Already closed.
      }
    }
  }

  private clearReconnect(): void {
    if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
    this.reconnectTimer = null;
  }

  private clearTimers(): void {
    this.clearReconnect();
    if (this.linkTimer) clearTimeout(this.linkTimer);
    this.linkTimer = null;
  }
}
