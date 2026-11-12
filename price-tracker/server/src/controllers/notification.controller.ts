import type { Request, Response } from 'express';
import type { IAlert } from '../models/Alert';
import { listAlerts, markAllRead, updateAlertState } from '../services/alert.service';
import { asyncHandler, sendOk } from '../utils/http';
import { alertToDto } from '../utils/serialize';

export const list = asyncHandler(async (req: Request, res: Response) => {
  const query = req.query as unknown as {
    page: number;
    limit: number;
    state?: string;
    unreadOnly?: boolean;
  };

  const { items, total, unread } = await listAlerts(req.auth!.userId, query);

  return sendOk(
    res,
    (items as Array<IAlert & { productId: unknown }>).map(alertToDto),
    200,
    { total, unread, page: query.page, limit: query.limit },
  );
});

export const update = asyncHandler<{ id: string }, unknown, { state?: 'acknowledged' | 'reset'; read?: boolean }>(
  async (req, res) => {
    const alert = await updateAlertState(req.auth!.userId, req.params.id, req.body);
    return sendOk(res, {
      alert: alertToDto(alert.toObject() as IAlert & { productId: unknown }),
    });
  },
);

export const readAll = asyncHandler(async (req: Request, res: Response) => {
  const updated = await markAllRead(req.auth!.userId);
  return sendOk(res, { markedRead: updated });
});
