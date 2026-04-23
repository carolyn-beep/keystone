import { describe, it, expect, beforeEach, vi } from 'vitest';
import { getProviderBreaker, resetCircuitBreakersForTests } from '../circuit-breaker';

describe('Provider circuit breaker', () => {
  beforeEach(() => {
    resetCircuitBreakersForTests();
  });

  it('opens after 5 failures in a 60s window', () => {
    const breaker = getProviderBreaker('openrouter');

    for (let i = 0; i < 4; i++) {
      breaker.recordFailure();
    }
    expect(breaker.getState()).toBe('closed');

    breaker.recordFailure();
    expect(breaker.getState()).toBe('open');
  });

  it('prunes failures outside the rolling window', () => {
    vi.useFakeTimers();
    try {
      const breaker = getProviderBreaker('openrouter');
      const start = new Date('2026-01-01T00:00:00Z');
      vi.setSystemTime(start);

      for (let i = 0; i < 4; i++) {
        breaker.recordFailure();
      }

      vi.setSystemTime(new Date(start.getTime() + 61_000));
      breaker.recordFailure();

      expect(breaker.getState()).toBe('closed');
    } finally {
      vi.useRealTimers();
    }
  });

  it('moves to half-open after cooldown and closes on success', () => {
    vi.useFakeTimers();
    try {
      const breaker = getProviderBreaker('openrouter');
      const start = new Date('2026-01-01T00:00:00Z');
      vi.setSystemTime(start);

      for (let i = 0; i < 5; i++) {
        breaker.recordFailure();
      }
      expect(breaker.getState()).toBe('open');

      vi.setSystemTime(new Date(start.getTime() + 120_000));
      const decision = breaker.getDecision();
      expect(decision.allow).toBe(true);
      expect(decision.state).toBe('half-open');

      breaker.recordSuccess();
      expect(breaker.getState()).toBe('closed');
    } finally {
      vi.useRealTimers();
    }
  });

  it('reopens when a half-open probe fails', () => {
    vi.useFakeTimers();
    try {
      const breaker = getProviderBreaker('openrouter');
      const start = new Date('2026-01-01T00:00:00Z');
      vi.setSystemTime(start);

      for (let i = 0; i < 5; i++) {
        breaker.recordFailure();
      }
      expect(breaker.getState()).toBe('open');

      vi.setSystemTime(new Date(start.getTime() + 120_000));
      breaker.getDecision();
      expect(breaker.getState()).toBe('half-open');

      breaker.recordFailure();
      expect(breaker.getState()).toBe('open');
    } finally {
      vi.useRealTimers();
    }
  });

  it('never opens for Fireworks', () => {
    const breaker = getProviderBreaker('fireworks');

    for (let i = 0; i < 20; i++) {
      breaker.recordFailure();
    }

    expect(breaker.getState()).toBe('closed');
    expect(breaker.getDecision()).toEqual({
      allow: true,
      state: 'closed',
      isHalfOpenProbe: false,
    });
  });
});
