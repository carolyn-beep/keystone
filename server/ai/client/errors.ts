/**
 * Unified AI Client — Error Types
 *
 * Error class hierarchy supporting retry decision-making.
 * RetryableError signals retry is appropriate.
 * NonRetryableError signals do not retry.
 */

export class AIClientError extends Error {
  readonly model: string;

  constructor(message: string, model: string) {
    super(message);
    this.name = 'AIClientError';
    this.model = model;
  }
}

export class RetryableError extends AIClientError {
  readonly statusCode: number;

  constructor(message: string, model: string, statusCode: number) {
    super(message, model);
    this.name = 'RetryableError';
    this.statusCode = statusCode;
  }
}

export class NonRetryableError extends AIClientError {
  readonly statusCode: number;

  constructor(message: string, model: string, statusCode: number) {
    super(message, model);
    this.name = 'NonRetryableError';
    this.statusCode = statusCode;
  }
}

export class RateLimitError extends RetryableError {
  readonly retryAfter?: number;

  constructor(model: string, retryAfter?: number) {
    super(`Rate limited on model ${model}`, model, 429);
    this.name = 'RateLimitError';
    this.retryAfter = retryAfter;
  }
}

export class TimeoutError extends AIClientError {
  readonly timeoutMs: number;

  constructor(model: string, timeoutMs: number) {
    super(`Timeout: ${model} took >${timeoutMs}ms`, model);
    this.name = 'TimeoutError';
    this.timeoutMs = timeoutMs;
  }
}

export class AllModelsFailed extends AIClientError {
  readonly models: string[];
  readonly errors: Error[];

  constructor(models: string[], errors: Error[]) {
    super(`All models failed: ${models.join(', ')}`, models[0] ?? 'unknown');
    this.name = 'AllModelsFailed';
    this.models = models;
    this.errors = errors;
  }
}

export const RETRYABLE_STATUS_CODES = new Set([429, 500, 502, 503]);
