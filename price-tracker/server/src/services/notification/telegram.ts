import { env } from '../../config/env';

const API_BASE = 'https://api.telegram.org';

/**
 * A failed Bot API call. The message is Telegram's own description (for example
 * "Forbidden: bot was blocked by the user") and never contains the bot token,
 * which only ever appears in the request URL.
 */
export class TelegramApiError extends Error {
  constructor(
    message: string,
    /** Telegram's `error_code`, usually mirroring the HTTP status; undefined for network errors. */
    readonly errorCode?: number,
  ) {
    super(message);
    this.name = 'TelegramApiError';
  }

  /** 400/403/404: bad chat, bot blocked, chat deleted. Retrying cannot help. */
  get permanent(): boolean {
    return this.errorCode === 400 || this.errorCode === 403 || this.errorCode === 404;
  }
}

interface BotApiResponse<T> {
  ok: boolean;
  result?: T;
  description?: string;
  error_code?: number;
}

/** Calls one Bot API method. Throws `TelegramApiError` on any failure. */
export async function callTelegram<T>(
  method: string,
  body: Record<string, unknown> = {},
  timeoutMs = 10_000,
): Promise<T> {
  const token = env.TELEGRAM_BOT_TOKEN;
  if (!token) throw new TelegramApiError('Telegram is not configured: set TELEGRAM_BOT_TOKEN');

  let response: Response;
  try {
    response = await fetch(`${API_BASE}/bot${token}/${method}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(timeoutMs),
    });
  } catch (err) {
    // The underlying error can echo the request URL, which holds the token —
    // so only its class name is kept.
    const kind = err instanceof Error ? err.name : 'network error';
    throw new TelegramApiError(`Could not reach Telegram (${kind})`);
  }

  const payload = (await response.json().catch(() => null)) as BotApiResponse<T> | null;
  if (!payload?.ok) {
    throw new TelegramApiError(
      payload?.description ?? `Telegram returned HTTP ${response.status}`,
      payload?.error_code ?? response.status,
    );
  }
  return payload.result as T;
}

/** Escapes text for Telegram's HTML parse mode. */
export function escapeTelegramHtml(text: string): string {
  return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}
