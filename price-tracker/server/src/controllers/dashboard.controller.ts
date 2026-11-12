import type { Request, Response } from 'express';
import { getDashboardStats } from '../services/dashboard.service';
import { getSystemHealth, recentFailures } from '../services/health.service';
import { Product } from '../models/Product';
import { asyncHandler, sendOk } from '../utils/http';
import { dashboardMoney, productToDto } from '../utils/serialize';
import type { IProduct } from '../models/Product';

export const stats = asyncHandler(async (req: Request, res: Response) => {
  const raw = await getDashboardStats(req.auth!.userId);

  return sendOk(res, {
    ...raw,
    bestSaving: raw.bestSaving
      ? { ...raw.bestSaving, amount: dashboardMoney(raw.bestSaving.amount) }
      : null,
    lowestPriceFound: raw.lowestPriceFound
      ? { ...raw.lowestPriceFound, price: dashboardMoney(raw.lowestPriceFound.price) }
      : null,
  });
});

/** Products closest to (or already below) their target — the dashboard's lead list. */
export const highlights = asyncHandler(async (req: Request, res: Response) => {
  const products = await Product.find({
    userId: req.auth!.userId,
    deletedAt: { $exists: false },
    currentPrice: { $exists: true },
  })
    .sort({ updatedAt: -1 })
    .limit(50)
    .lean<IProduct[]>();

  const withDistance = products
    .map((product) => ({
      product,
      distance:
        product.currentPrice === undefined
          ? Number.MAX_SAFE_INTEGER
          : product.currentPrice - product.targetPrice,
    }))
    .sort((a, b) => a.distance - b.distance)
    .slice(0, 6);

  return sendOk(res, withDistance.map((row) => productToDto(row.product)));
});

export const health = asyncHandler(async (_req: Request, res: Response) => {
  return sendOk(res, await getSystemHealth());
});

export const myFailures = asyncHandler(async (req: Request, res: Response) => {
  return sendOk(res, await recentFailures(req.auth!.userId));
});
