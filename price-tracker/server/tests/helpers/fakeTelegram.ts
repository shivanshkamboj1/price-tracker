/**
 * A stand-in for the Telegram Bot API behind `fetch`, so linking and delivery
 * can be tested end to end without network access.
 */
export const FAKE_BOT_USERNAME = 'pricewatch_test_bot';

export class BotApiFailure {
  constructor(
    readonly code: number,
    readonly description: string,
  ) {}
}

export interface BotApiCall {
  method: string;
  body: Record<string, unknown>;
}

interface FakeTelegramState {
  calls: BotApiCall[];
  /** Returned by `getUpdates` until acknowledged with an `offset`. */
  updates: unknown[];
  /** `sendMessage` failures, keyed by chat id. */
  failFor: Map<string, BotApiFailure>;
}

export const fakeTelegram: FakeTelegramState & {
  reset(): void;
  sentTo(): string[];
} = {
  calls: [],
  updates: [],
  failFor: new Map(),
  reset() {
    this.calls = [];
    this.updates = [];
    this.failFor = new Map();
  },
  /** Chat ids that received a message, in order. */
  sentTo() {
    return this.calls.filter((c) => c.method === 'sendMessage').map((c) => String(c.body.chat_id));
  },
};

let messageId = 100;

function respond(method: string, body: Record<string, unknown>): unknown {
  switch (method) {
    case 'getMe':
      return { id: 1, is_bot: true, username: FAKE_BOT_USERNAME };
    case 'getUpdates':
      // An `offset` acknowledges everything before it, as the real API does.
      if (typeof body.offset === 'number') {
        fakeTelegram.updates = fakeTelegram.updates.filter(
          (u) => (u as { update_id: number }).update_id >= (body.offset as number),
        );
        return [];
      }
      return fakeTelegram.updates;
    case 'sendMessage':
      return fakeTelegram.failFor.get(String(body.chat_id)) ?? { message_id: ++messageId };
    default:
      return new BotApiFailure(404, 'Not Found');
  }
}

export function installFakeTelegram(): void {
  jest.spyOn(global, 'fetch').mockImplementation(async (input, init) => {
    const method = String(input).split('/').pop() ?? '';
    const body = init?.body ? (JSON.parse(String(init.body)) as Record<string, unknown>) : {};
    fakeTelegram.calls.push({ method, body });

    const result = respond(method, body);
    if (result instanceof BotApiFailure) {
      return new Response(
        JSON.stringify({ ok: false, error_code: result.code, description: result.description }),
        { status: result.code },
      );
    }
    return new Response(JSON.stringify({ ok: true, result }), { status: 200 });
  });
}

/** A `/start` message as Telegram delivers it in `getUpdates`. */
export function startMessage(updateId: number, text: string, chat: Record<string, unknown>) {
  return { update_id: updateId, message: { message_id: updateId, text, chat } };
}
