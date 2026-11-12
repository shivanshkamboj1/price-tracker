import type { NextFunction, Request, RequestHandler, Response } from 'express';

/**
 * Every API response uses one of two shapes:
 *   { success: true,  data, meta? }
 *   { success: false, error: { code, message, details? }, requestId }
 */
export interface ApiSuccess<T> {
  success: true;
  data: T;
  meta?: Record<string, unknown>;
}

export interface ApiFailure {
  success: false;
  error: { code: string; message: string; details?: unknown };
  requestId?: string;
}

export function sendOk<T>(
  res: Response,
  data: T,
  status = 200,
  meta?: Record<string, unknown>,
): Response {
  const body: ApiSuccess<T> = meta ? { success: true, data, meta } : { success: true, data };
  return res.status(status).json(body);
}

export function sendCreated<T>(res: Response, data: T): Response {
  return sendOk(res, data, 201);
}

export function sendNoContent(res: Response): Response {
  return res.status(204).send();
}

/** Wraps an async handler so rejected promises reach the error middleware. */
export function asyncHandler<
  P = Record<string, string>,
  ResBody = unknown,
  ReqBody = unknown,
  ReqQuery = Record<string, unknown>,
>(
  fn: (
    req: Request<P, ResBody, ReqBody, ReqQuery>,
    res: Response,
    next: NextFunction,
  ) => Promise<unknown>,
): RequestHandler<P, ResBody, ReqBody, ReqQuery> {
  return (req, res, next) => {
    void fn(req as never, res, next).catch(next);
  };
}
