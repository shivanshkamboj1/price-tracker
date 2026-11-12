import jwt, { type SignOptions } from 'jsonwebtoken';
import type { Response } from 'express';
import { env, isProd } from '../config/env';
import type { IUser } from '../models/User';
import { randomToken } from '../utils/crypto';
import { unauthorized } from '../utils/errors';
import { DAY_MS } from '../utils/time';

export const ACCESS_COOKIE = 'pt_access';
export const CSRF_COOKIE = 'pt_csrf';

export interface AccessTokenPayload {
  sub: string;
  role: 'user' | 'admin';
  tv: number;
}

const baseCookie = {
  httpOnly: true,
  secure: isProd,
  sameSite: 'lax' as const,
  ...(env.COOKIE_DOMAIN ? { domain: env.COOKIE_DOMAIN } : {}),
};

const sessionMaxAge = () => env.SESSION_TTL_DAYS * DAY_MS;

/**
 * Signs the session token.
 *
 * There is no refresh token: with a single password gate there is nothing to
 * re-authenticate against, so the session cookie is simply long-lived and
 * `tokenVersion` remains the lever that invalidates every live session at once.
 */
export function signSessionToken(user: Pick<IUser, '_id' | 'role' | 'tokenVersion'>): string {
  const payload: AccessTokenPayload = {
    sub: user._id.toString(),
    role: user.role,
    tv: user.tokenVersion,
  };
  const options: SignOptions = {
    expiresIn: `${env.SESSION_TTL_DAYS}d`,
    issuer: 'price-tracker',
    audience: 'price-tracker-api',
  };
  return jwt.sign(payload, env.JWT_SECRET, options);
}

export function verifyAccessToken(token: string): AccessTokenPayload {
  try {
    return jwt.verify(token, env.JWT_SECRET, {
      issuer: 'price-tracker',
      audience: 'price-tracker-api',
    }) as AccessTokenPayload;
  } catch {
    throw unauthorized('Your session has expired, please enter the password again');
  }
}

/* --------------------------- cookie plumbing --------------------------- */

export function setAuthCookies(
  res: Response,
  tokens: { accessToken: string; csrfToken: string },
): void {
  res.cookie(ACCESS_COOKIE, tokens.accessToken, { ...baseCookie, maxAge: sessionMaxAge() });
  // Readable by the SPA on purpose: it is echoed back in the x-csrf-token header.
  res.cookie(CSRF_COOKIE, tokens.csrfToken, {
    ...baseCookie,
    httpOnly: false,
    maxAge: sessionMaxAge(),
  });
}

export function clearAuthCookies(res: Response): void {
  res.clearCookie(ACCESS_COOKIE, baseCookie);
  res.clearCookie(CSRF_COOKIE, { ...baseCookie, httpOnly: false });
}

export function newCsrfToken(): string {
  return randomToken(24);
}
