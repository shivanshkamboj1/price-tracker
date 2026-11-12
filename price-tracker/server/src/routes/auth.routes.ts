import { Router } from 'express';
import * as controller from '../controllers/auth.controller';
import { requireAuth } from '../middleware/auth';
import { csrfProtection } from '../middleware/csrf';
import { authLimiter } from '../middleware/rateLimit';
import { validate } from '../middleware/validate';
import { unlockSchema } from '../validation/auth.schema';

export const authRouter = Router();

// The rate limiter is what makes a single shared password safe to expose: the
// password itself is the only secret, so guessing has to stay expensive.
authRouter.post('/unlock', authLimiter, validate({ body: unlockSchema }), controller.unlock);

authRouter.post('/lock', csrfProtection, controller.lock);

authRouter.get('/me', requireAuth, controller.me);
