import type { NextFunction, Request, Response } from 'express';
import { MongoServerError } from 'mongodb';
import { Error as MongooseError } from 'mongoose';
import { logger } from '../config/logger';
import { isProd } from '../config/env';
import { AdapterError, AppError, notFound } from '../utils/errors';
import type { ApiFailure } from '../utils/http';

/** Maps adapter failures onto HTTP semantics. */
function fromAdapterError(err: AdapterError): AppError {
  switch (err.kind) {
    case 'not_found':
      return new AppError(404, 'NOT_FOUND', err.message);
    case 'unsupported':
      return new AppError(400, 'UNSUPPORTED_MARKETPLACE', err.message);
    // Nothing wrong with the request: this deployment has no data source for it.
    case 'not_configured':
      return new AppError(503, 'DATA_SOURCE_NOT_CONFIGURED', err.message);
    case 'blocked':
    case 'temporary_error':
      return new AppError(503, 'UPSTREAM_UNAVAILABLE', err.message);
    case 'unavailable':
    case 'parse_error':
    default:
      return new AppError(502, 'UPSTREAM_UNAVAILABLE', err.message);
  }
}

export function notFoundHandler(req: Request, _res: Response, next: NextFunction): void {
  next(notFound(`No route matches ${req.method} ${req.path}`));
}

export function errorHandler(
  err: unknown,
  req: Request,
  res: Response,
  _next: NextFunction,
): void {
  let appError: AppError;

  if (err instanceof AppError) {
    appError = err;
  } else if (err instanceof AdapterError) {
    appError = fromAdapterError(err);
  } else if (err instanceof MongooseError.CastError) {
    appError = new AppError(400, 'BAD_REQUEST', `Invalid value for ${err.path}`);
  } else if (err instanceof MongooseError.ValidationError) {
    appError = new AppError(422, 'VALIDATION_ERROR', 'Document validation failed', {
      details: Object.values(err.errors).map((e) => ({ path: e.path, message: e.message })),
    });
  } else if (err instanceof MongoServerError && err.code === 11000) {
    appError = new AppError(409, 'CONFLICT', 'That record already exists');
  } else if (err instanceof SyntaxError && 'body' in err) {
    appError = new AppError(400, 'BAD_REQUEST', 'Request body is not valid JSON');
  } else {
    appError = new AppError(500, 'INTERNAL_ERROR', 'Something went wrong', { cause: err });
  }

  const log = req.log ?? logger;
  const payload = {
    err,
    requestId: String(req.id),
    userId: req.auth?.userId,
    statusCode: appError.statusCode,
    code: appError.code,
  };
  if (appError.statusCode >= 500) log.error(payload, appError.message);
  else log.warn(payload, appError.message);

  const body: ApiFailure = {
    success: false,
    error: {
      code: appError.code,
      // 5xx messages are generic in production so internals never leak.
      message: appError.expose || !isProd ? appError.message : 'Something went wrong',
      ...(appError.details ? { details: appError.details } : {}),
    },
    requestId: String(req.id),
  };

  res.status(appError.statusCode).json(body);
}
