import { useEffect } from 'react';

/**
 * Calls `onEscape` when the Escape key is pressed anywhere in the document
 * while `enabled` is true. Hand-rolled overlays use this so keyboard users
 * have the same way out that mouse users get from clicking the backdrop.
 * Radix dialogs handle Escape themselves and do not need it.
 */
export function useEscapeKey(onEscape: () => void, enabled: boolean): void {
  useEffect(() => {
    if (!enabled) return;
    const handler = (event: KeyboardEvent) => {
      if (event.key !== 'Escape' || event.defaultPrevented) return;
      onEscape();
    };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [onEscape, enabled]);
}
