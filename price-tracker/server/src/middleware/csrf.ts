import type { NextFunction, Request, Response } from 'express';
import { CSRF_COOKIE } from '../services/token.service';
import { timingSafeEqual } from '../utils/crypto';
import { forbidden } from '../utils/errors';

const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

/**
 * Double-submit CSRF protection.
 *
 * Authentication rides in an HTTP-only cookie, so a cross-site form post would
 * otherwise be authenticated. The SPA reads the non-HttpOnly `pt_csrf` cookie
 * and echoes it in `x-csrf-token`; an attacker's page can send the cookie but
 * cannot read it, so it cannot produce the header.
 */
export function csrfProtection(req: Request, _res: Response, next: NextFunction): void {
  if (SAFE_METHODS.has(req.method)) {
    next();
    return;
  }

  const cookieToken = req.cookies?.[CSRF_COOKIE] as string | undefined;
  const headerToken = req.get('x-csrf-token');

  if (!cookieToken || !headerToken || !timingSafeEqual(cookieToken, headerToken)) {
    next(forbidden('CSRF token missing or invalid'));
    return;
  }
  next();
}
