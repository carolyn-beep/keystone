/**
 * In-memory sliding window rate limiter.
 *
 * Tracks request timestamps per key and enforces a configurable
 * requests-per-window limit. Counters reset on process restart.
 */

export class RateLimiter {
  private windows: Map<string, number[]> = new Map();
  private windowMs: number;

  constructor(windowMs: number = 60_000) {
    this.windowMs = windowMs;
  }

  /**
   * Check if a request is allowed under the rate limit.
   *
   * @param key - Identifier to rate limit (e.g., API key ID)
   * @param limit - Maximum requests allowed in the window
   * @returns { allowed, retryAfter? } where retryAfter is in seconds
   */
  check(key: string, limit: number): { allowed: boolean; retryAfter?: number } {
    const now = Date.now();
    const windowStart = now - this.windowMs;

    // Get or create the timestamp array for this key
    let timestamps = this.windows.get(key);
    if (!timestamps) {
      timestamps = [];
      this.windows.set(key, timestamps);
    }

    // Remove timestamps outside the current window
    const filtered = timestamps.filter((t) => t > windowStart);
    this.windows.set(key, filtered);

    if (filtered.length < limit) {
      filtered.push(now);
      return { allowed: true };
    }

    // Calculate when the oldest request in the window will expire
    const oldestInWindow = filtered[0];
    const retryAfterMs = oldestInWindow + this.windowMs - now;
    const retryAfter = Math.ceil(retryAfterMs / 1000);

    return { allowed: false, retryAfter };
  }

  /**
   * Reset rate limit state.
   *
   * @param key - If provided, clear only that key. Otherwise clear all.
   */
  reset(key?: string): void {
    if (key) {
      this.windows.delete(key);
    } else {
      this.windows.clear();
    }
  }
}
