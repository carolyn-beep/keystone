/**
 * Run an async function with a timeout. If it doesn't resolve in time, retry once.
 * If the retry also times out, throw a TimeoutError.
 *
 * The timed-out call continues in the background (we can't abort in-flight HTTP requests
 * without threading AbortSignals through every layer), but we stop waiting for it.
 */
export class TimeoutError extends Error {
  constructor(timeoutMs: number, attempt: number) {
    super(`Operation timed out after ${timeoutMs}ms (attempt ${attempt})`);
    this.name = 'TimeoutError';
  }
}

export async function withRetryTimeout<T>(
  fn: () => Promise<T>,
  timeoutMs: number,
  label?: string,
): Promise<T> {
  for (let attempt = 1; attempt <= 2; attempt++) {
    try {
      const result = await Promise.race([
        fn(),
        new Promise<never>((_, reject) =>
          setTimeout(() => reject(new TimeoutError(timeoutMs, attempt)), timeoutMs)
        ),
      ]);
      return result;
    } catch (err) {
      if (err instanceof TimeoutError && attempt === 1) {
        console.warn(`[Timeout] ${label ?? 'Operation'} timed out (${timeoutMs}ms), retrying...`);
        continue;
      }
      throw err;
    }
  }

  // Unreachable, but TypeScript needs it
  throw new TimeoutError(timeoutMs, 2);
}
