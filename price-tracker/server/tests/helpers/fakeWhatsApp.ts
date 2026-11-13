import { setWhatsAppBridge, WORKER_OFFLINE, type WhatsAppBridge } from '../../src/services/whatsapp/bridge';
import {
  phoneDigits,
  readLiveState,
  writeLiveState,
  type CommandFailure,
  type WhatsAppCommand,
  type WhatsAppLiveState,
} from '../../src/services/whatsapp/protocol';

/**
 * A stand-in for the worker that holds the WhatsApp connection, so linking,
 * recipients and delivery can be tested without Baileys or a phone.
 *
 * Like the real bridge, it answers "worker offline" unless a live state has
 * been published (see `publishLiveState`).
 */
export const fakeWhatsApp = {
  commands: [] as WhatsAppCommand[],
  /** E.164 numbers that "have WhatsApp". */
  registered: new Set<string>(),
  /** `send` failures, keyed by the `to` the message was addressed to. */
  failSendTo: new Map<string, Omit<CommandFailure, 'ok'>>(),
  reset() {
    this.commands = [];
    this.registered = new Set();
    this.failSendTo = new Map();
  },
  /** Addresses that were sent a message, in order. */
  sentTo(): string[] {
    return this.commands.flatMap((c) => (c.type === 'send' ? [c.to] : []));
  },
};

let messageId = 0;

class FakeBridge implements WhatsAppBridge {
  async run(command: WhatsAppCommand): Promise<never> {
    const answer = async (): Promise<unknown> => {
      if (!(await readLiveState())) return { ok: false, error: WORKER_OFFLINE, retryable: true };
      fakeWhatsApp.commands.push(command);
      switch (command.type) {
        case 'check': {
          const exists = fakeWhatsApp.registered.has(command.phone);
          return { ok: true, exists, jid: exists ? `${phoneDigits(command.phone)}@s.whatsapp.net` : null };
        }
        case 'send': {
          const failure = fakeWhatsApp.failSendTo.get(command.to);
          return failure ? { ok: false, ...failure } : { ok: true, messageId: `MSG${++messageId}` };
        }
        default:
          return { ok: true };
      }
    };
    return (await answer()) as never;
  }

  async close(): Promise<void> {}
}

export function installFakeWhatsApp(): void {
  setWhatsAppBridge(new FakeBridge());
}

/** Publishes the worker's live state, which is what makes the bridge "online". */
export async function publishLiveState(state: Partial<WhatsAppLiveState> = {}): Promise<void> {
  await writeLiveState({
    status: 'connected',
    qr: null,
    pairingCode: null,
    account: { phone: '+15550001111', name: 'Deals bot' },
    error: null,
    restricted: false,
    updatedAt: new Date().toISOString(),
    ...state,
  });
}
