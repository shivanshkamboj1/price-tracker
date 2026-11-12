import type { Request, Response } from 'express';
import { env } from '../config/env';
import { redis } from '../config/redis';
import * as productService from '../services/product.service';
import { getHistory, getStats, type HistoryRange } from '../services/history.service';
import { compareProducts, listComparisonGroups } from '../services/dashboard.service';
import { enqueuePriceCheck } from '../queues';
import { resolveProductUrl } from '../adapters/factory';
import { asyncHandler, sendCreated, sendNoContent, sendOk } from '../utils/http';
import { dashboardMoney, historyToDto, productToDto, statsToDto } from '../utils/serialize';
import { rateLimited } from '../utils/errors';
import type { CreateProductBody, UpdateProductBody } from '../validation/product.schema';

export const createProduct = asyncHandler<unknown, unknown, CreateProductBody>(async (req, res) => {
  const userId = req.auth!.userId;
  const product = await productService.createProduct(userId, req.body);

  // The API never fetches from a marketplace itself; the first check is a job.
  await enqueuePriceCheck({
    productId: product._id.toString(),
    userId,
    marketplace: product.marketplace,
    trigger: 'manual',
    bypassCache: true,
  });

  return sendCreated(res, {
    product: productToDto(product),
    message: 'Tracking started. The first price check is queued and usually completes in under a minute.',
  });
});

export const listProducts = asyncHandler(async (req: Request, res: Response) => {
  const query = req.query as unknown as productService.ListProductsQuery;
  const { items, total, page, limit } = await productService.listProducts(req.auth!.userId, query);

  return sendOk(
    res,
    items.map(productToDto),
    200,
    { total, page, limit, pages: Math.max(1, Math.ceil(total / limit)) },
  );
});

export const getProduct = asyncHandler(async (req: Request, res: Response) => {
  const product = await productService.getOwnedProduct(req.auth!.userId, req.params.id!);
  const stats = await getStats(product._id.toString(), 'all');
  return sendOk(res, { product: productToDto(product), stats: statsToDto(stats) });
});

export const updateProduct = asyncHandler<{ id: string }, unknown, UpdateProductBody>(
  async (req, res) => {
    const product = await productService.updateProduct(req.auth!.userId, req.params.id, req.body);
    return sendOk(res, { product: productToDto(product) });
  },
);

export const deleteProduct = asyncHandler(async (req: Request, res: Response) => {
  await productService.deleteProduct(req.auth!.userId, req.params.id!);
  return sendNoContent(res);
});

/**
 * Manual "check now".
 *
 * Two layers of protection sit in front of upstream traffic: the API rate
 * limiter, and a per-user hourly budget tracked in Redis. The request only ever
 * enqueues a job — it never performs the check inline.
 */
export const checkNow = asyncHandler(async (req: Request, res: Response) => {
  const userId = req.auth!.userId;
  const product = await productService.getOwnedProduct(userId, req.params.id!);

  const budgetKey = `manual-check:${userId}:${Math.floor(Date.now() / 3_600_000)}`;
  const used = await redis().incr(budgetKey);
  if (used === 1) await redis().expire(budgetKey, 3600);
  if (used > env.MANUAL_CHECK_LIMIT_PER_HOUR) {
    throw rateLimited(
      `You can request at most ${env.MANUAL_CHECK_LIMIT_PER_HOUR} manual checks per hour. Scheduled checks continue as normal.`,
    );
  }

  const jobId = await enqueuePriceCheck({
    productId: product._id.toString(),
    userId,
    marketplace: product.marketplace,
    trigger: 'manual',
    bypassCache: true,
  });

  return sendOk(res, { queued: true, jobId, remainingThisHour: Math.max(0, env.MANUAL_CHECK_LIMIT_PER_HOUR - used) }, 202);
});

export const getProductHistory = asyncHandler(async (req: Request, res: Response) => {
  const product = await productService.getOwnedProduct(req.auth!.userId, req.params.id!);
  const range = ((req.query as { range?: HistoryRange }).range ?? '30d') as HistoryRange;

  const [points, stats] = await Promise.all([
    getHistory(product._id.toString(), range),
    getStats(product._id.toString(), range),
  ]);

  return sendOk(res, {
    range,
    targetPrice: productToDto(product).targetPrice,
    currency: product.currency,
    points: points.map(historyToDto),
    stats: statsToDto(stats),
  });
});

export const updateProductSettings = asyncHandler<{ id: string }, unknown, UpdateProductBody>(
  async (req, res) => {
    const product = await productService.updateProduct(req.auth!.userId, req.params.id, req.body);
    return sendOk(res, { product: productToDto(product) });
  },
);

export const compare = asyncHandler(async (req: Request, res: Response) => {
  const { ids, group } = req.query as unknown as { ids?: string[]; group?: string };
  const rows = await compareProducts(req.auth!.userId, { ids, group });
  return sendOk(
    res,
    rows.map((row) => ({
      ...row,
      currentPrice: dashboardMoney(row.currentPrice),
      targetPrice: dashboardMoney(row.targetPrice),
      lowestPrice: dashboardMoney(row.lowestPrice),
      highestPrice: dashboardMoney(row.highestPrice),
    })),
  );
});

export const comparisonGroups = asyncHandler(async (req: Request, res: Response) => {
  return sendOk(res, await listComparisonGroups(req.auth!.userId));
});

/**
 * Validates and canonicalises a URL without contacting the marketplace, so the
 * Add Product form can confirm "this is an Amazon India link" as the user types.
 */
export const previewUrl = asyncHandler<unknown, unknown, { productUrl: string }>(
  async (req, res) => {
    const { adapter, identity } = resolveProductUrl(req.body.productUrl);
    return sendOk(res, {
      marketplace: identity.marketplace,
      marketplaceLabel: adapter.label,
      externalProductId: identity.externalProductId,
      canonicalUrl: identity.canonicalUrl,
      dataSource: adapter.dataSource,
    });
  },
);
