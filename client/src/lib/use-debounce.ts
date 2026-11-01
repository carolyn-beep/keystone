import { useCallback, useEffect, useRef } from 'react';

/**
 * Returns a stable callback that delays invoking `fn` until `ms` milliseconds
 * have elapsed since the last call. When `ms === 0` the callback fires
 * synchronously on every call (useful for tests).
 *
 * The returned callback is stable across renders; only the latest `fn`
 * reference is invoked when the timer fires.
 */
export function useDebouncedCallback<TArgs extends unknown[]>(
  fn: (...args: TArgs) => void,
  ms: number,
): (...args: TArgs) => void {
  const fnRef = useRef(fn);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    fnRef.current = fn;
  }, [fn]);

  useEffect(() => {
    return () => {
      if (timerRef.current !== null) {
        clearTimeout(timerRef.current);
        timerRef.current = null;
      }
    };
  }, []);

  return useCallback(
    (...args: TArgs) => {
      if (ms === 0) {
        fnRef.current(...args);
        return;
      }
      if (timerRef.current !== null) {
        clearTimeout(timerRef.current);
      }
      timerRef.current = setTimeout(() => {
        timerRef.current = null;
        fnRef.current(...args);
      }, ms);
    },
    [ms],
  );
}
