import type { Request, Response, NextFunction } from 'express';
import { ZodError } from 'zod';
import { isDev } from '../config/index.js';

export class ApiError extends Error {
  constructor(
    public statusCode: number,
    message: string,
    public code?: string
  ) {
    super(message);
    this.name = 'ApiError';
  }

  static badRequest(message: string, code?: string) {
    return new ApiError(400, message, code);
  }

  static unauthorized(message = 'Unauthorized', code?: string) {
    return new ApiError(401, message, code);
  }

  static forbidden(message = 'Forbidden', code?: string) {
    return new ApiError(403, message, code);
  }

  static notFound(message = 'Not found', code?: string) {
    return new ApiError(404, message, code);
  }

  static conflict(message: string, code?: string) {
    return new ApiError(409, message, code);
  }

  static internal(message = 'Internal server error', code?: string) {
    return new ApiError(500, message, code);
  }
}

export function notFoundHandler(_req: Request, _res: Response, next: NextFunction) {
  next(ApiError.notFound('Endpoint not found'));
}

export function errorHandler(
  err: Error,
  _req: Request,
  res: Response,
  _next: NextFunction
) {
  // Log error in development
  if (isDev) {
    console.error(err);
  }

  // Handle Zod validation errors
  if (err instanceof ZodError) {
    res.status(400).json({
      error: 'Validation error',
      code: 'VALIDATION_ERROR',
      details: err.errors.map((e) => ({
        path: e.path.join('.'),
        message: e.message,
      })),
    });
    return;
  }

  // Handle known API errors
  if (err instanceof ApiError) {
    res.status(err.statusCode).json({
      error: err.message,
      code: err.code,
    });
    return;
  }

  // Handle unknown errors
  res.status(500).json({
    error: isDev ? err.message : 'Internal server error',
    code: 'INTERNAL_ERROR',
  });
}
