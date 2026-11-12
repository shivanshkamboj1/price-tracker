import { brotliDecompressSync, gunzipSync, inflateRawSync, inflateSync } from 'node:zlib';
import type { Dispatcher } from 'undici';
import { logger } from '../../config/logger';

/**
 * What we tell servers we can read. Node 20 has no zstd, so it is not offered —
 * advertising an encoding we cannot decode is how bodies turn into noise.
 */
export const ACCEPT_ENCODING = 'gzip, deflate, br';

function header(value: string | string[] | undefined): string {
  const first = Array.isArray(value) ? value[0] : value;
  return (first ?? '').trim().toLowerCase();
}

function decompress(buffer: Buffer, encoding: string): Buffer {
  switch (encoding) {
    case 'gzip':
    case 'x-gzip':
      return gunzipSync(buffer);
    case 'br':
      return brotliDecompressSync(buffer);
    case 'deflate':
      // Servers disagree about whether "deflate" carries a zlib header.
      try {
        return inflateSync(buffer);
      } catch {
        return inflateRawSync(buffer);
      }
    default:
      return buffer;
  }
}

/**
 * Reads a response body as text, decompressing it first.
 *
 * `undici.request` — unlike `fetch` — hands back the bytes exactly as they
 * arrived and leaves `content-encoding` for the caller to honour. Amazon serves
 * gzip regardless of what we ask for, and reading those bytes as UTF-8 produces
 * mojibake that every CSS selector then misses *silently*: the page looks
 * fetched, the price looks absent, and the product ends up marked unavailable.
 * So decoding lives here, on the one path every adapter shares, rather than in
 * each provider.
 */
export async function readTextBody(res: Dispatcher.ResponseData): Promise<string> {
  const encoding = header(res.headers['content-encoding']);
  const raw = Buffer.from(await res.body.arrayBuffer());
  if (!encoding || encoding === 'identity') return raw.toString('utf8');

  try {
    return decompress(raw, encoding).toString('utf8');
  } catch (err) {
    // Better to hand back what arrived than to fail the whole check: a body that
    // does not match its own header is the server's mistake, and the caller's
    // parse will report it as missing data.
    logger.warn({ err, encoding }, 'could not decompress response body');
    return raw.toString('utf8');
  }
}

/** The same trap, JSON flavour: `res.body.json()` also ignores `content-encoding`. */
export async function readJsonBody<T>(res: Dispatcher.ResponseData): Promise<T> {
  return JSON.parse(await readTextBody(res)) as T;
}
