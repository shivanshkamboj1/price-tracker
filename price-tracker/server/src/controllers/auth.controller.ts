import type { Request, Response } from 'express';
import { getOwner, verifyAccessPassword } from '../services/gate.service';
import { getProfile } from '../services/user.service';
import {
  clearAuthCookies,
  newCsrfToken,
  setAuthCookies,
  signSessionToken,
} from '../services/token.service';
import { asyncHandler, sendOk } from '../utils/http';
import type { UnlockInput } from '../validation/auth.schema';

/**
 * Exchanges the access password for a long-lived session cookie.
 *
 * On success the browser is unlocked until the cookie expires, so this runs once
 * per browser rather than once per visit.
 */
export const unlock = asyncHandler<unknown, unknown, UnlockInput>(async (req, res) => {
  verifyAccessPassword(req.body.password);

  const owner = await getOwner();
  const csrfToken = newCsrfToken();
  setAuthCookies(res, { accessToken: signSessionToken(owner), csrfToken });

  return sendOk(res, { user: owner.toJSON(), csrfToken });
});

/** Forgets this browser's session. The password is unchanged. */
export const lock = asyncHandler(async (_req: Request, res: Response) => {
  clearAuthCookies(res);
  return sendOk(res, { locked: true });
});

export const me = asyncHandler(async (req: Request, res: Response) => {
  const user = await getProfile(req.auth!.userId);
  return sendOk(res, { user: user.toJSON() });
});
