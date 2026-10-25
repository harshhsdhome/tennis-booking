import { Request, Response, NextFunction } from 'express';
import { AppError } from '../errors/AppError';

export function errorHandler(
  err: unknown,
  _req: Request,
  res: Response,
  _next: NextFunction
): void {
  if (err instanceof AppError) {
    res.status(err.httpStatus).json({
      error: err.message,
      code: err.code,
      details: err.details ?? {},
    });
    return;
  }

  // Unknown error — log it but never leak internals (NFR-3)
  console.error('[error] Unhandled error:', err);
  res.status(500).json({
    error: 'An unexpected error occurred',
    code: 'INTERNAL_SERVER_ERROR',
    details: {},
  });
}
