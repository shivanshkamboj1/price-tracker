import type { NextFunction, Request, Response } from 'express';
import { ZodError, type ZodTypeAny, type z } from 'zod';
import { validationError } from '../utils/errors';

export interface RequestSchemas {
  body?: ZodTypeAny;
  query?: ZodTypeAny;
  params?: ZodTypeAny;
}

function formatIssues(error: ZodError): Array<{ path: string; message: string }> {
  return error.issues.map((issue) => ({
    path: issue.path.join('.') || '(root)',
    message: issue.message,
  }));
}

/**
 * Validates and *replaces* the request parts with their parsed values, so
 * handlers only ever see data that matched the schema. Unknown keys are
 * stripped by Zod, which also removes any operator-shaped input before it can
 * reach Mongo.
 */
export function validate(schemas: RequestSchemas) {
  return (req: Request, _res: Response, next: NextFunction): void => {
    try {
      if (schemas.params) req.params = schemas.params.parse(req.params);
      if (schemas.query) {
        const parsed = schemas.query.parse(req.query);
        // Express 4 exposes `query` as a plain property; assigning is safe.
        Object.defineProperty(req, 'query', { value: parsed, configurable: true, writable: true });
      }
      if (schemas.body) req.body = schemas.body.parse(req.body);
      next();
    } catch (err) {
      if (err instanceof ZodError) {
        next(validationError('Request validation failed', formatIssues(err)));
        return;
      }
      next(err);
    }
  };
}

export type Infer<T extends ZodTypeAny> = z.infer<T>;
