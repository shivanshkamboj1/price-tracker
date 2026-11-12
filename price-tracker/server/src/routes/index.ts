import { Router } from 'express';
import * as dashboard from '../controllers/dashboard.controller';
import * as notifications from '../controllers/notification.controller';
import * as user from '../controllers/user.controller';
import { requireAuth, requireRole } from '../middleware/auth';
import { csrfProtection } from '../middleware/csrf';
import { writeLimiter } from '../middleware/rateLimit';
import { validate } from '../middleware/validate';
import { idParam } from '../validation/common';
import {
  connectSessionSchema,
  listAlertsSchema,
  marketplaceParamSchema,
  notificationSettingsSchema,
  telegramChatParamSchema,
  telegramTestSchema,
  updateAlertSchema,
  updateProfileSchema,
} from '../validation/user.schema';
import { authRouter } from './auth.routes';
import { productRouter } from './product.routes';

export const apiRouter = Router();

apiRouter.use('/auth', authRouter);
apiRouter.use('/products', productRouter);

/* ------------------------------ notifications ----------------------------- */

const notificationRouter = Router();
notificationRouter.use(requireAuth);
notificationRouter.get('/', validate({ query: listAlertsSchema }), notifications.list);
notificationRouter.patch(
  '/read-all',
  csrfProtection,
  notifications.readAll,
);
notificationRouter.patch(
  '/:id',
  csrfProtection,
  validate({ params: idParam, body: updateAlertSchema }),
  notifications.update,
);
apiRouter.use('/notifications', notificationRouter);

/* ---------------------------------- user ---------------------------------- */

const userRouter = Router();
userRouter.use(requireAuth);
userRouter.get('/', user.profile);
userRouter.patch(
  '/',
  writeLimiter,
  csrfProtection,
  validate({ body: updateProfileSchema }),
  user.patchProfile,
);
userRouter.post(
  '/notification-settings',
  writeLimiter,
  csrfProtection,
  validate({ body: notificationSettingsSchema }),
  user.patchNotificationSettings,
);
userRouter.get('/telegram', user.telegramStatus);
userRouter.post('/telegram/link', writeLimiter, csrfProtection, user.telegramLink);
userRouter.delete('/telegram/link', csrfProtection, user.telegramCancelLink);
// Polled every few seconds while the user taps Start, so only the global limiter applies.
userRouter.post('/telegram/verify', csrfProtection, user.telegramVerify);
userRouter.post(
  '/telegram/test',
  writeLimiter,
  csrfProtection,
  validate({ body: telegramTestSchema }),
  user.telegramTest,
);
userRouter.delete(
  '/telegram/chats/:chatId',
  csrfProtection,
  validate({ params: telegramChatParamSchema }),
  user.telegramRemoveChat,
);
userRouter.get('/marketplace-sessions', user.sessions);
userRouter.post(
  '/marketplace-sessions',
  writeLimiter,
  csrfProtection,
  validate({ body: connectSessionSchema }),
  user.connectMarketplaceSession,
);
userRouter.delete(
  '/marketplace-sessions/:marketplace',
  csrfProtection,
  validate({ params: marketplaceParamSchema }),
  user.disconnectMarketplaceSession,
);
apiRouter.use('/user', userRouter);

/* -------------------------------- dashboard ------------------------------- */

const dashboardRouter = Router();
dashboardRouter.use(requireAuth);
dashboardRouter.get('/stats', dashboard.stats);
dashboardRouter.get('/highlights', dashboard.highlights);
dashboardRouter.get('/failures', dashboard.myFailures);
apiRouter.use('/dashboard', dashboardRouter);

/* --------------------------------- system --------------------------------- */

const systemRouter = Router();
// Operational data: administrators only.
systemRouter.get('/health', requireAuth, requireRole('admin'), dashboard.health);
apiRouter.use('/system', systemRouter);
