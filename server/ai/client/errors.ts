/**
 * Unified AI Client — Error Types
 *
 * Error class hierarchy supporting retry decision-making.
 * RetryableError signals retry is appropriate.
 * NonRetryableError signals do not retry.
 */
import type { ProviderName } from './types';

export class AIClientError extends Error {
  readonly model: string;

  constructor(message: string, model: string) {
    super(message);
    this.name = 'AIClientError';
    this.model = model;
  }
}

export class RetryableError extends AIClientError {
  readonly provider: ProviderName;
  readonly statusCode: number;
  readonly retryAfterMs?: number;
  readonly retryAfter?: number;

  constructor(
    message: string,
    model: string,
    provider: ProviderName,
    statusCode: number,
    retryAfterMs?: number,
  ) {
    super(message, model);
    this.name = 'RetryableError';
    this.provider = provider;
    this.statusCode = statusCode;
    this.retryAfterMs = retryAfterMs;
    // Backward-compatible alias for legacy callers/tests.
    this.retryAfter = retryAfterMs;
  }
}

export class NonRetryableError extends AIClientError {
  readonly provider: ProviderName;
  readonly statusCode: number;
  readonly retryAfterMs?: number;

  constructor(
    message: string,
    model: string,
    provider: ProviderName,
    statusCode: number,
    retryAfterMs?: number,
  ) {
    super(message, model);
    this.name = 'NonRetryableError';
    this.provider = provider;
    this.statusCode = statusCode;
    this.retryAfterMs = retryAfterMs;
  }
}

export class RateLimitError extends RetryableError {
  constructor(model: string, provider: ProviderName, retryAfterMs?: number) {
    super(`Rate limited on model ${model}`, model, provider, 429, retryAfterMs);
    this.name = 'RateLimitError';
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
