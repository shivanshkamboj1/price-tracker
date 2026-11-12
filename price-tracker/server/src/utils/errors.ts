/** Machine-readable error codes shared with the frontend. */
export type ErrorCode =
  | 'BAD_REQUEST'
  | 'VALIDATION_ERROR'
  | 'UNAUTHORIZED'
  | 'FORBIDDEN'
  | 'NOT_FOUND'
  | 'CONFLICT'
  | 'RATE_LIMITED'
  | 'UNSUPPORTED_MARKETPLACE'
  | 'DATA_SOURCE_NOT_CONFIGURED'
  | 'UPSTREAM_UNAVAILABLE'
  | 'INTERNAL_ERROR';

export class AppError extends Error {
  readonly statusCode: number;
  readonly code: ErrorCode;
  readonly details?: unknown;
  readonly expose: boolean;

  constructor(
    statusCode: number,
    code: ErrorCode,
    message: string,
    options: { details?: unknown; cause?: unknown } = {},
  ) {
    super(message, { cause: options.cause });
    this.name = 'AppError';
    this.statusCode = statusCode;
    this.code = code;
    this.details = options.details;
    this.expose = statusCode < 500;
    Error.captureStackTrace?.(this, AppError);
  }
}

export const badRequest = (message: string, details?: unknown) =>
  new AppError(400, 'BAD_REQUEST', message, { details });

export const validationError = (message: string, details?: unknown) =>
  new AppError(422, 'VALIDATION_ERROR', message, { details });

export const unauthorized = (message = 'Authentication required') =>
  new AppError(401, 'UNAUTHORIZED', message);

export const forbidden = (message = 'You do not have access to this resource') =>
  new AppError(403, 'FORBIDDEN', message);

export const notFound = (message = 'Resource not found') => new AppError(404, 'NOT_FOUND', message);

export const conflict = (message: string, details?: unknown) =>
  new AppError(409, 'CONFLICT', message, { details });

export const rateLimited = (message = 'Too many requests, please slow down') =>
  new AppError(429, 'RATE_LIMITED', message);

export const internal = (message = 'Something went wrong', cause?: unknown) =>
  new AppError(500, 'INTERNAL_ERROR', message, { cause });

/* ------------------------------------------------------------------ */
/* Marketplace / adapter errors                                        */
/* ------------------------------------------------------------------ */

import type { CheckErrorKind } from '../config/constants';

/**
 * Raised by adapters. `kind` drives the retry ladder and the product status,
 * so it must describe *why* the check failed, not just that it did.
 */
export class AdapterError extends Error {
  readonly kind: CheckErrorKind;
  /** True when a later attempt has a reasonable chance of succeeding. */
  readonly retryable: boolean;
  readonly statusCode?: number;

  constructor(
    kind: CheckErrorKind,
    message: string,
    options: { retryable?: boolean; statusCode?: number; cause?: unknown } = {},
  ) {
    super(message, { cause: options.cause });
    this.name = 'AdapterError';
    this.kind = kind;
    this.retryable = options.retryable ?? kind === 'temporary_error';
    this.statusCode = options.statusCode;
    Error.captureStackTrace?.(this, AdapterError);
  }
}

export const isAppError = (err: unknown): err is AppError => err instanceof AppError;
export const isAdapterError = (err: unknown): err is AdapterError => err instanceof AdapterError;

/** Safe error summary for logs and job records — never includes stack or secrets. */
export function describeError(err: unknown): { name: string; message: string; kind?: string } {
  if (isAdapterError(err)) return { name: err.name, message: err.message, kind: err.kind };
  if (isAppError(err)) return { name: err.name, message: err.message, kind: err.code };
  if (err instanceof Error) return { name: err.name, message: err.message };
  return { name: 'UnknownError', message: String(err) };
}
