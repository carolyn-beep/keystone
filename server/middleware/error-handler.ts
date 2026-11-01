import { Request, Response, NextFunction, RequestHandler } from 'express';

/**
 * Base application error class with status code support
 */
export class AppError extends Error {
  constructor(
    public statusCode: number,
    message: string,
    public code?: string,
    public details?: Record<string, unknown>
  ) {
    super(message);
    this.name = 'AppError';
    Error.captureStackTrace(this, this.constructor);
  }
}

/**
 * 404 Not Found error
 */
export class NotFoundError extends AppError {
  constructor(message = 'Resource not found', code?: string) {
    super(404, message, code);
    this.name = 'NotFoundError';
  }
}

/**
 * 403 Forbidden error
 */
export class ForbiddenError extends AppError {
  constructor(message = 'Access denied', code?: string) {
    super(403, message, code);
    this.name = 'ForbiddenError';
  }
}

/**
 * 400 Bad Request error
 */
export class BadRequestError extends AppError {
  constructor(message = 'Bad request', code?: string, details?: Record<string, unknown>) {
    super(400, message, code, details);
    this.name = 'BadRequestError';
  }
}

/**
 * 409 Conflict error - resource state prevents the request (e.g. a research
 * run is already in progress for the same brainlift).
 */
export class ConflictError extends AppError {
  constructor(message = 'Conflict', code?: string, details?: Record<string, unknown>) {
    super(409, message, code, details);
    this.name = 'ConflictError';
  }
}

/**
 * 429 Too Many Requests error - rate or quota limit reached.
 */
export class RateLimitError extends AppError {
  constructor(message = 'Too many requests', code?: string, details?: Record<string, unknown>) {
    super(429, message, code, details);
    this.name = 'RateLimitError';
  }
}

/**
 * Global error handler middleware
 * Place this after all routes
 */
export function errorHandler(
  err: Error,
  req: Request,
  res: Response,
  next: NextFunction
): void {
  // Log error for debugging (always log full details server-side)
  console.error(`[Error] ${req.method} ${req.path}:`, err);

  // Handle AppError instances (safe to expose - these are intentional user-facing errors)
  if (err instanceof AppError) {
    // The /launch endpoint (and any other handler that throws AppError with
    // a structured `code` + `details`) uses a contract where the response body
    // is `{ error: <code>, message, ...details }`. Spread details at the top
    // level so clients can read `existingRunId`, `limit`, `used`, `issues`
    // without an extra nesting layer.
    const body: Record<string, unknown> = {
      message: err.message,
    };
    if (err.code) body.error = err.code;
    if (err.code) body.code = err.code;
    if (err.details) Object.assign(body, err.details);
    res.status(err.statusCode).json(body);
    return;
  }

  // Handle Zod validation errors (safe to expose validation messages)
  if (err.name === 'ZodError') {
    const zodError = err as any;
    res.status(400).json({
      message: zodError.errors?.[0]?.message || 'Validation error',
      field: zodError.errors?.[0]?.path?.join('.'),
      code: 'VALIDATION_ERROR',
    });
    return;
  }

  // Handle ContentExtractionError (has statusCode property)
  if (err.name === 'ContentExtractionError' && 'statusCode' in err) {
    const extractionError = err as Error & { statusCode: number };
    res.status(extractionError.statusCode).json({
      message: extractionError.message,
      code: 'CONTENT_EXTRACTION_ERROR',
    });
    return;
  }

  // Default to 500 for unknown errors
  // In production, don't expose internal error messages (could leak sensitive info)
  const isProduction = process.env.NODE_ENV === 'production';
  res.status(500).json({
    message: isProduction ? 'Internal server error' : (err.message || 'Internal server error'),
    code: 'INTERNAL_ERROR',
  });
}

/**
 * Wrapper for async route handlers to catch errors automatically
 * Usage: router.get('/path', asyncHandler(async (req, res) => { ... }))
 */
export function asyncHandler(
  fn: (req: Request, res: Response, next: NextFunction) => Promise<any>
): RequestHandler {
  return (req: Request, res: Response, next: NextFunction) => {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
}
