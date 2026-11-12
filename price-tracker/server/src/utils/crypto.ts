import crypto from 'node:crypto';
import { env } from '../config/env';

const ALGO = 'aes-256-gcm';
const IV_BYTES = 12;

function key(): Buffer {
  const raw = env.ENCRYPTION_KEY.trim();
  const buf = /^[0-9a-fA-F]{64}$/.test(raw) ? Buffer.from(raw, 'hex') : Buffer.from(raw, 'base64');
  if (buf.length !== 32) {
    throw new Error('ENCRYPTION_KEY must decode to exactly 32 bytes (hex or base64)');
  }
  return buf;
}

/**
 * AES-256-GCM. Output is `v1.<iv>.<tag>.<ciphertext>` in base64url so the value
 * is safe to store in Mongo and to move between environments.
 */
export function encryptString(plaintext: string): string {
  const iv = crypto.randomBytes(IV_BYTES);
  const cipher = crypto.createCipheriv(ALGO, key(), iv);
  const enc = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return ['v1', iv.toString('base64url'), tag.toString('base64url'), enc.toString('base64url')].join(
    '.',
  );
}

export function decryptString(payload: string): string {
  const parts = payload.split('.');
  if (parts.length !== 4 || parts[0] !== 'v1') throw new Error('Malformed encrypted payload');
  const [, ivB64, tagB64, dataB64] = parts as [string, string, string, string];
  const decipher = crypto.createDecipheriv(ALGO, key(), Buffer.from(ivB64, 'base64url'));
  decipher.setAuthTag(Buffer.from(tagB64, 'base64url'));
  return Buffer.concat([
    decipher.update(Buffer.from(dataB64, 'base64url')),
    decipher.final(),
  ]).toString('utf8');
}

export function randomToken(bytes = 32): string {
  return crypto.randomBytes(bytes).toString('base64url');
}

/** SHA-256, used for opaque lookups (refresh tokens, CSRF secrets). */
export function sha256(value: string): string {
  return crypto.createHash('sha256').update(value).digest('hex');
}

export function timingSafeEqual(a: string, b: string): boolean {
  const bufA = Buffer.from(a);
  const bufB = Buffer.from(b);
  if (bufA.length !== bufB.length) return false;
  return crypto.timingSafeEqual(bufA, bufB);
}

/** Stable, non-reversible fingerprint used to group log lines without leaking the value. */
export function fingerprint(value: string): string {
  return sha256(value).slice(0, 12);
}
