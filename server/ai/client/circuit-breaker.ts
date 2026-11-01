import type { ProviderName } from './types';

export type BreakerState = 'closed' | 'open' | 'half-open';

type BreakerDecision = {
  allow: boolean;
  state: BreakerState;
  isHalfOpenProbe: boolean;
};

const FAILURE_THRESHOLD = 5;
const FAILURE_WINDOW_MS = 60_000;
const COOLDOWN_MS = 120_000;

class ProviderCircuitBreaker {
  private state: BreakerState = 'closed';
  private openedAt: number | null = null;
  private failureTimestamps: number[] = [];

  getState(): BreakerState {
    return this.state;
  }

  getDecision(now = Date.now()): BreakerDecision {
    if (this.state === 'open') {
      if (this.openedAt !== null && now - this.openedAt >= COOLDOWN_MS) {
        this.state = 'half-open';
        return { allow: true, state: this.state, isHalfOpenProbe: true };
      }
      return { allow: false, state: this.state, isHalfOpenProbe: false };
    }

    if (this.state === 'half-open') {
      return { allow: true, state: this.state, isHalfOpenProbe: true };
    }

    return { allow: true, state: this.state, isHalfOpenProbe: false };
  }

  recordSuccess(now = Date.now()): void {
    if (this.state === 'half-open') {
      this.state = 'closed';
      this.openedAt = null;
      this.failureTimestamps = [];
      return;
    }

    this.pruneFailures(now);
  }

  recordFailure(now = Date.now()): void {
    if (this.state === 'open') {
      return;
    }

    if (this.state === 'half-open') {
      this.open(now);
      this.failureTimestamps = [now];
      return;
    }

    this.failureTimestamps.push(now);
    this.pruneFailures(now);

    if (this.failureTimestamps.length >= FAILURE_THRESHOLD) {
      this.open(now);
    }
  }

  private open(now: number): void {
    this.state = 'open';
    this.openedAt = now;
  }

  private pruneFailures(now: number): void {
    const cutoff = now - FAILURE_WINDOW_MS;
    while (this.failureTimestamps.length > 0 && this.failureTimestamps[0] < cutoff) {
      this.failureTimestamps.shift();
    }
  }
}

class DisabledCircuitBreaker {
  getState(): BreakerState {
    return 'closed';
  }

  getDecision(): BreakerDecision {
    return { allow: true, state: 'closed', isHalfOpenProbe: false };
  }

  recordSuccess(): void {
    // Fireworks is the terminal fallback provider and must remain callable.
  }

  recordFailure(): void {
    // Fireworks is the terminal fallback provider and must remain callable.
  }
}

const breakers = new Map<ProviderName, ProviderCircuitBreaker | DisabledCircuitBreaker>();
const fireworksBreaker = new DisabledCircuitBreaker();

export function getProviderBreaker(provider: ProviderName): ProviderCircuitBreaker | DisabledCircuitBreaker {
  if (provider === 'fireworks') {
    return fireworksBreaker;
  }

  let breaker = breakers.get(provider);
  if (!breaker) {
    breaker = new ProviderCircuitBreaker();
    breakers.set(provider, breaker);
  }
  return breaker;
}

export function resetCircuitBreakersForTests(): void {
  breakers.clear();
}
