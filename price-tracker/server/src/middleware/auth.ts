import type { NextFunction, Request, Response } from 'express';
import { forbidden, unauthorized } from '../utils/errors';
import { ACCESS_COOKIE, verifyAccessToken } from '../services/token.service';
import { User } from '../models/User';

/**
 * Populates `req.auth` from the HTTP-only access cookie.
 *
 * The token carries the user's `tokenVersion`; a password change or a
 * "sign out everywhere" bumps it, which invalidates live tokens within the
 * short access-token lifetime without a database read per request.
 */
export function requireAuth(req: Request, _res: Response, next: NextFunction): void {
  const token = req.cookies?.[ACCESS_COOKIE] as string | undefined;
  if (!token) {
    next(unauthorized());
    return;
  }
  try {
    const payload = verifyAccessToken(token);
    req.auth = { userId: payload.sub, role: payload.role, tokenVersion: payload.tv };
    next();
  } catch (err) {
    next(err);
  }
}

export function requireRole(role: 'admin') {
  return (req: Request, _res: Response, next: NextFunction): void => {
    if (!req.auth) {
      next(unauthorized());
      return;
    }
    if (req.auth.role !== role) {
      next(forbidden('This area is restricted to administrators'));
      return;
    }
    next();
  };
}

/** Loads the authenticated user document. Throws if the account has gone away. */
export async function currentUser(req: Request) {
  if (!req.auth) throw unauthorized();
  const user = await User.findById(req.auth.userId);
  if (!user) throw unauthorized('Account no longer exists');
  if (user.tokenVersion !== req.auth.tokenVersion) {
    throw unauthorized('Your session is no longer valid, please sign in again');
  }
  return user;
}
