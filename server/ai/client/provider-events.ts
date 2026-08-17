import type { ProviderName } from './types';

export type FailoverEvent = {
  timestamp: Date;
  caller: string;
  originalModel: string;
  actualModel: string;
  failedProvider: ProviderName;
  failoverProvider: ProviderName;
  reason: string;
};

const MAX_DETAILED_EVENTS = 100;
const WINDOW_MS = 24 * 60 * 60 * 1000;

class FailoverEventStore {
  private events: FailoverEvent[] = [];
  private perProviderTimestamps = new Map<ProviderName, number[]>();

  record(event: Omit<FailoverEvent, 'timestamp'> & { timestamp?: Date }): void {
    const timestamp = event.timestamp ?? new Date();
    const stored: FailoverEvent = { ...event, timestamp };
    this.events.push(stored);
    if (this.events.length > MAX_DETAILED_EVENTS) {
      this.events.shift();
    }

    const providerTimestamps = this.perProviderTimestamps.get(event.failedProvider) ?? [];
    providerTimestamps.push(timestamp.getTime());
    this.perProviderTimestamps.set(event.failedProvider, providerTimestamps);
  }

  getRecentEvents(now = Date.now()): FailoverEvent[] {
    const cutoff = now - WINDOW_MS;
    return this.events
      .filter((event) => event.timestamp.getTime() >= cutoff)
      .reverse();
  }

  getFailoverCount(provider: ProviderName, now = Date.now()): number {
    const timestamps = this.perProviderTimestamps.get(provider) ?? [];
    const cutoff = now - WINDOW_MS;
    while (timestamps.length > 0 && timestamps[0] < cutoff) {
      timestamps.shift();
    }
    if (timestamps.length === 0) {
      this.perProviderTimestamps.delete(provider);
    } else {
      this.perProviderTimestamps.set(provider, timestamps);
    }
    return timestamps.length;
  }

  getFailoverCounts(now = Date.now()): Record<ProviderName, number> {
    const result: Partial<Record<ProviderName, number>> = {};
    for (const provider of Array.from(this.perProviderTimestamps.keys())) {
      result[provider] = this.getFailoverCount(provider, now);
    }
    return result as Record<ProviderName, number>;
  }

  reset(): void {
    this.events = [];
    this.perProviderTimestamps.clear();
  }
}

const store = new FailoverEventStore();

export function recordFailoverEvent(event: Omit<FailoverEvent, 'timestamp'> & { timestamp?: Date }): void {
  store.record(event);
}

export function getRecentFailoverEvents(): FailoverEvent[] {
  return store.getRecentEvents();
}

export function getFailoverCount(provider: ProviderName, now = Date.now()): number {
  return store.getFailoverCount(provider, now);
}

export function getFailoverCounts(now = Date.now()): Record<ProviderName, number> {
  return store.getFailoverCounts(now);
}

export function resetFailoverEventsForTests(): void {
  store.reset();
}
