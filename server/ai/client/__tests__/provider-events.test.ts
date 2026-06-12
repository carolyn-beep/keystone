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
    // getRecentFailoverEvents() filters to a rolling 24h window relative to the
    // real clock, so the recorded events must sit inside that window. Anchor the
    // system clock to the events' base time (matches the sibling 24h-count test).
    const base = new Date('2026-01-01T00:00:00Z');
    vi.useFakeTimers();
    try {
      vi.setSystemTime(base);

      for (let i = 0; i < 105; i++) {
        recordFailoverEvent({
          timestamp: new Date(base.getTime() + i * 1000),
          caller: `caller-${i}`,
          originalModel: 'anthropic/claude-haiku-4.5',
          actualModel: 'accounts/fireworks/models/gpt-oss-120b',
          failedProvider: 'openrouter',
          failoverProvider: 'fireworks',
          reason: 'retry_exhausted',
        });
      }

      // getRecentFailoverEvents() returns newest-first; the buffer keeps the last
      // 100 of 105 (callers 5..104), so index 0 is the newest (104), last is 5.
      const events = getRecentFailoverEvents();
      expect(events).toHaveLength(100);
      expect(events[0].caller).toBe('caller-104');
      expect(events[99].caller).toBe('caller-5');
    } finally {
      vi.useRealTimers();
    }
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
