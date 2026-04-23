import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  recordFailoverEvent,
  getRecentFailoverEvents,
  getFailoverCount,
  resetFailoverEventsForTests,
} from '../provider-events';

describe('Provider failover events', () => {
  beforeEach(() => {
    resetFailoverEventsForTests();
  });

  it('caps detailed events at 100', () => {
    const base = new Date('2026-01-01T00:00:00Z').getTime();

    for (let i = 0; i < 105; i++) {
      recordFailoverEvent({
        timestamp: new Date(base + i * 1000),
        caller: `caller-${i}`,
        originalModel: 'anthropic/claude-haiku-4.5',
        actualModel: 'accounts/fireworks/models/llama-v3p3-70b-instruct',
        failedProvider: 'openrouter',
        failoverProvider: 'fireworks',
        reason: 'retry_exhausted',
      });
    }

    const events = getRecentFailoverEvents();
    expect(events).toHaveLength(100);
    expect(events[0].caller).toBe('caller-5');
    expect(events[99].caller).toBe('caller-104');
  });

  it('tracks rolling 24h counts even when detail wraps', () => {
    vi.useFakeTimers();
    try {
      const start = new Date('2026-01-01T00:00:00Z');
      vi.setSystemTime(start);

      for (let i = 0; i < 120; i++) {
        recordFailoverEvent({
          timestamp: new Date(start.getTime() + i * 1000),
          caller: 'test',
          originalModel: 'anthropic/claude-haiku-4.5',
          actualModel: 'accounts/fireworks/models/llama-v3p3-70b-instruct',
          failedProvider: 'openrouter',
          failoverProvider: 'fireworks',
          reason: 'retry_exhausted',
        });
      }

      expect(getRecentFailoverEvents()).toHaveLength(100);
      expect(getFailoverCount('openrouter')).toBe(120);

      vi.setSystemTime(new Date(start.getTime() + 24 * 60 * 60 * 1000 + 120_000 + 1));
      expect(getFailoverCount('openrouter')).toBe(0);
    } finally {
      vi.useRealTimers();
    }
  });
});
