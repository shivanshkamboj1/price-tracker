import { Router } from 'express';
import * as controller from '../controllers/product.controller';
import { requireAuth } from '../middleware/auth';
import { csrfProtection } from '../middleware/csrf';
import { manualCheckLimiter, writeLimiter } from '../middleware/rateLimit';
import { validate } from '../middleware/validate';
import { idParam } from '../validation/common';
import {
  compareQuerySchema,
  createProductSchema,
  historyQuerySchema,
  listProductsSchema,
  previewUrlSchema,
  productSettingsSchema,
  updateProductSchema,
} from '../validation/product.schema';

export const productRouter = Router();

// Every route below is owner-scoped: the service layer always filters by userId.
productRouter.use(requireAuth);

productRouter.get('/', validate({ query: listProductsSchema }), controller.listProducts);

productRouter.post(
  '/',
  writeLimiter,
  csrfProtection,
  validate({ body: createProductSchema }),
  controller.createProduct,
);

productRouter.post(
  '/preview',
  writeLimiter,
  csrfProtection,
  validate({ body: previewUrlSchema }),
  controller.previewUrl,
);

productRouter.get('/compare', validate({ query: compareQuerySchema }), controller.compare);
productRouter.get('/comparison-groups', controller.comparisonGroups);

productRouter.get('/:id', validate({ params: idParam }), controller.getProduct);

productRouter.patch(
  '/:id',
  writeLimiter,
  csrfProtection,
  validate({ params: idParam, body: updateProductSchema }),
  controller.updateProduct,
);

productRouter.patch(
  '/:id/settings',
  writeLimiter,
  csrfProtection,
  validate({ params: idParam, body: productSettingsSchema }),
  controller.updateProductSettings,
);

productRouter.delete(
  '/:id',
  writeLimiter,
  csrfProtection,
  validate({ params: idParam }),
  controller.deleteProduct,
);

productRouter.post(
  '/:id/check',
  manualCheckLimiter,
  csrfProtection,
  validate({ params: idParam }),
  controller.checkNow,
);

productRouter.get(
  '/:id/history',
  validate({ params: idParam, query: historyQuerySchema }),
  controller.getProductHistory,
);
