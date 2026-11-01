/**
 * Tests for FR2: Error Types and Classification
 *
 * Validates error class hierarchy, properties, instanceof checks,
 * and RETRYABLE_STATUS_CODES set.
 */

import { describe, it, expect } from 'vitest';
import {
  AIClientError,
  RetryableError,
  NonRetryableError,
  RateLimitError,
  TimeoutError,
  AllModelsFailed,
  RETRYABLE_STATUS_CODES,
} from '../errors';

const PROVIDER = 'openrouter' as const;

// ═══════════════════════════════════════════════════════════════════════════
// AIClientError (base)
// ═══════════════════════════════════════════════════════════════════════════

describe('AIClientError', () => {
  it('extends Error', () => {
    const err = new AIClientError('test error', 'test-model');
    expect(err).toBeInstanceOf(Error);
    expect(err).toBeInstanceOf(AIClientError);
  });

  it('carries model property', () => {
    const err = new AIClientError('something went wrong', 'anthropic/claude-haiku-4.5');
    expect(err.model).toBe('anthropic/claude-haiku-4.5');
    expect(err.message).toBe('something went wrong');
  });

  it('has correct name', () => {
    const err = new AIClientError('test', 'model');
    expect(err.name).toBe('AIClientError');
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// RetryableError
// ═══════════════════════════════════════════════════════════════════════════

describe('RetryableError', () => {
  it('extends AIClientError', () => {
    const err = new RetryableError('retryable', 'model', PROVIDER, 500);
    expect(err).toBeInstanceOf(AIClientError);
    expect(err).toBeInstanceOf(RetryableError);
  });

  it('carries statusCode', () => {
    const err = new RetryableError('server error', 'model', PROVIDER, 502);
    expect(err.statusCode).toBe(502);
  });

  it('carries provider and retryAfterMs', () => {
    const err = new RetryableError('server error', 'model', PROVIDER, 502, 900);
    expect(err.provider).toBe(PROVIDER);
    expect(err.retryAfterMs).toBe(900);
    expect(err.retryAfter).toBe(900);
  });

  it('has correct name', () => {
    const err = new RetryableError('test', 'model', PROVIDER, 500);
    expect(err.name).toBe('RetryableError');
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// NonRetryableError
// ═══════════════════════════════════════════════════════════════════════════

describe('NonRetryableError', () => {
  it('extends AIClientError', () => {
    const err = new NonRetryableError('bad request', 'model', PROVIDER, 400);
    expect(err).toBeInstanceOf(AIClientError);
    expect(err).toBeInstanceOf(NonRetryableError);
  });

  it('carries statusCode', () => {
    const err = new NonRetryableError('unauthorized', 'model', PROVIDER, 401);
    expect(err.statusCode).toBe(401);
  });

  it('carries provider and retryAfterMs', () => {
    const err = new NonRetryableError('unauthorized', 'model', PROVIDER, 401, 3000);
    expect(err.provider).toBe(PROVIDER);
    expect(err.retryAfterMs).toBe(3000);
  });

  it('is NOT instanceof RetryableError', () => {
    const err = new NonRetryableError('bad', 'model', PROVIDER, 400);
    expect(err).not.toBeInstanceOf(RetryableError);
  });

  it('has correct name', () => {
    const err = new NonRetryableError('test', 'model', PROVIDER, 400);
    expect(err.name).toBe('NonRetryableError');
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// RateLimitError
// ═══════════════════════════════════════════════════════════════════════════

describe('RateLimitError', () => {
  it('extends RetryableError', () => {
    const err = new RateLimitError('model', PROVIDER);
    expect(err).toBeInstanceOf(RetryableError);
    expect(err).toBeInstanceOf(AIClientError);
  });

  it('has statusCode 429', () => {
    const err = new RateLimitError('model', PROVIDER);
    expect(err.statusCode).toBe(429);
  });

  it('carries optional retryAfter', () => {
    const err = new RateLimitError('model', PROVIDER, 30_000);
    expect(err.retryAfter).toBe(30_000);
    expect(err.retryAfterMs).toBe(30_000);
  });

  it('retryAfter is undefined when not provided', () => {
    const err = new RateLimitError('model', PROVIDER);
    expect(err.retryAfter).toBeUndefined();
  });

  it('has correct name', () => {
    const err = new RateLimitError('model', PROVIDER);
    expect(err.name).toBe('RateLimitError');
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// TimeoutError
// ═══════════════════════════════════════════════════════════════════════════

describe('TimeoutError', () => {
  it('extends AIClientError', () => {
    const err = new TimeoutError('model', 60000);
    expect(err).toBeInstanceOf(AIClientError);
  });

  it('carries model and timeoutMs', () => {
    const err = new TimeoutError('anthropic/claude-opus-4.6', 90000);
    expect(err.model).toBe('anthropic/claude-opus-4.6');
    expect(err.timeoutMs).toBe(90000);
  });

  it('has descriptive message', () => {
    const err = new TimeoutError('anthropic/claude-opus-4.6', 60000);
    expect(err.message).toContain('anthropic/claude-opus-4.6');
    expect(err.message).toContain('60000');
  });

  it('has correct name', () => {
    const err = new TimeoutError('model', 5000);
    expect(err.name).toBe('TimeoutError');
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// AllModelsFailed
// ═══════════════════════════════════════════════════════════════════════════

describe('AllModelsFailed', () => {
  it('extends AIClientError', () => {
    const err = new AllModelsFailed(['model-a', 'model-b'], [new Error('a failed'), new Error('b failed')]);
    expect(err).toBeInstanceOf(AIClientError);
  });

  it('carries models array', () => {
    const models = ['model-a', 'model-b', 'model-c'];
    const errors = models.map((m) => new Error(`${m} failed`));
    const err = new AllModelsFailed(models, errors);
    expect(err.models).toEqual(models);
  });

  it('carries errors array', () => {
    const errors = [new Error('first'), new Error('second')];
    const err = new AllModelsFailed(['a', 'b'], errors);
    expect(err.errors).toEqual(errors);
  });

  it('has descriptive message', () => {
    const err = new AllModelsFailed(['model-a', 'model-b'], [new Error('fail')]);
    expect(err.message).toContain('model-a');
    expect(err.message).toContain('model-b');
  });

  it('has correct name', () => {
    const err = new AllModelsFailed(['a'], [new Error('fail')]);
    expect(err.name).toBe('AllModelsFailed');
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// RETRYABLE_STATUS_CODES
// ═══════════════════════════════════════════════════════════════════════════

describe('RETRYABLE_STATUS_CODES', () => {
  it('contains exactly 429, 500, 502, 503', () => {
    expect(RETRYABLE_STATUS_CODES.has(429)).toBe(true);
    expect(RETRYABLE_STATUS_CODES.has(500)).toBe(true);
    expect(RETRYABLE_STATUS_CODES.has(502)).toBe(true);
    expect(RETRYABLE_STATUS_CODES.has(503)).toBe(true);
    expect(RETRYABLE_STATUS_CODES.size).toBe(4);
  });

  it('does not contain non-retryable codes', () => {
    expect(RETRYABLE_STATUS_CODES.has(400)).toBe(false);
    expect(RETRYABLE_STATUS_CODES.has(401)).toBe(false);
    expect(RETRYABLE_STATUS_CODES.has(403)).toBe(false);
    expect(RETRYABLE_STATUS_CODES.has(404)).toBe(false);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// instanceof hierarchy checks
// ═══════════════════════════════════════════════════════════════════════════

describe('instanceof hierarchy', () => {
  it('RateLimitError is instanceof RetryableError and AIClientError', () => {
    const err = new RateLimitError('model', PROVIDER);
    expect(err instanceof RateLimitError).toBe(true);
    expect(err instanceof RetryableError).toBe(true);
    expect(err instanceof AIClientError).toBe(true);
    expect(err instanceof Error).toBe(true);
  });

  it('NonRetryableError is not instanceof RetryableError', () => {
    const err = new NonRetryableError('msg', 'model', PROVIDER, 400);
    expect(err instanceof NonRetryableError).toBe(true);
    expect(err instanceof RetryableError).toBe(false);
  });

  it('TimeoutError is not instanceof RetryableError or NonRetryableError', () => {
    const err = new TimeoutError('model', 5000);
    expect(err instanceof TimeoutError).toBe(true);
    expect(err instanceof AIClientError).toBe(true);
    expect(err instanceof RetryableError).toBe(false);
    expect(err instanceof NonRetryableError).toBe(false);
  });

  it('AllModelsFailed is not instanceof RetryableError', () => {
    const err = new AllModelsFailed(['a'], [new Error('fail')]);
    expect(err instanceof AllModelsFailed).toBe(true);
    expect(err instanceof AIClientError).toBe(true);
    expect(err instanceof RetryableError).toBe(false);
  });
});
