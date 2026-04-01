/**
 * Tests for FR3: In-Memory Rate Limiter
 *
 * Pure unit tests — no database or network needed.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { RateLimiter } from '../rate-limiter';

describe('RateLimiter', () => {
  let limiter: RateLimiter;

  beforeEach(() => {
    limiter = new RateLimiter(60_000); // 1-minute window
  });

  it('allows requests under the limit', () => {
    const result = limiter.check('key-1', 5);
    expect(result.allowed).toBe(true);
    expect(result.retryAfter).toBeUndefined();
  });

  it('allows up to exactly the limit', () => {
    for (let i = 0; i < 4; i++) {
      expect(limiter.check('key-1', 5).allowed).toBe(true);
    }
    // 5th request should still be allowed
    expect(limiter.check('key-1', 5).allowed).toBe(true);
  });

  it('blocks requests at the limit', () => {
    for (let i = 0; i < 5; i++) {
      limiter.check('key-1', 5);
    }
    const result = limiter.check('key-1', 5);
    expect(result.allowed).toBe(false);
    expect(result.retryAfter).toBeGreaterThan(0);
  });

  it('resets counter after window passes', () => {
    vi.useFakeTimers();
    try {
      // Fill up the limit
      for (let i = 0; i < 5; i++) {
        limiter.check('key-1', 5);
      }
      expect(limiter.check('key-1', 5).allowed).toBe(false);

      // Advance time past the window
      vi.advanceTimersByTime(61_000);

      // Should be allowed again
      expect(limiter.check('key-1', 5).allowed).toBe(true);
    } finally {
      vi.useRealTimers();
    }
  });

  it('tracks different keys independently', () => {
    for (let i = 0; i < 5; i++) {
      limiter.check('key-1', 5);
    }
    expect(limiter.check('key-1', 5).allowed).toBe(false);

    // Different key should still be allowed
    expect(limiter.check('key-2', 5).allowed).toBe(true);
  });

  it('reset() clears all state', () => {
    for (let i = 0; i < 5; i++) {
      limiter.check('key-1', 5);
    }
    expect(limiter.check('key-1', 5).allowed).toBe(false);

    limiter.reset();

    expect(limiter.check('key-1', 5).allowed).toBe(true);
  });

  it('reset(key) clears only that key', () => {
    for (let i = 0; i < 5; i++) {
      limiter.check('key-1', 5);
      limiter.check('key-2', 5);
    }
    expect(limiter.check('key-1', 5).allowed).toBe(false);
    expect(limiter.check('key-2', 5).allowed).toBe(false);

    limiter.reset('key-1');

    expect(limiter.check('key-1', 5).allowed).toBe(true);
    expect(limiter.check('key-2', 5).allowed).toBe(false);
  });

  it('retryAfter is in seconds', () => {
    vi.useFakeTimers();
    try {
      for (let i = 0; i < 5; i++) {
        limiter.check('key-1', 5);
      }
      const result = limiter.check('key-1', 5);
      expect(result.allowed).toBe(false);
      // retryAfter should be roughly 60 seconds (the window)
      expect(result.retryAfter).toBeGreaterThan(0);
      expect(result.retryAfter).toBeLessThanOrEqual(60);
    } finally {
      vi.useRealTimers();
    }
  });
});
