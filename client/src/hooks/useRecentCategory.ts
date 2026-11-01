/**
 * useRecentCategory — per-brainlift localStorage of the most-recently-used
 * category id for the reader Notes pane composer.
 *
 * Trivial getter + setter; no React state subscription. Consumers re-read
 * on mount. The composer writes on every successful save so the chip's
 * smart-default reflects the user's latest pick across reader sessions.
 *
 * Key: `reader-notes:recent-category:${slug}` (FEATURE.md decision #6).
 */

import { useCallback, useRef } from 'react';

const KEY_PREFIX = 'reader-notes:recent-category:';

export interface UseRecentCategoryResult {
  recentCategoryId: number | null;
  setRecentCategoryId: (id: number) => void;
}

function readRecent(slug: string): number | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = window.localStorage.getItem(`${KEY_PREFIX}${slug}`);
    if (!raw) return null;
    const parsed = parseInt(raw, 10);
    if (Number.isNaN(parsed) || !Number.isFinite(parsed)) return null;
    return parsed;
  } catch {
    return null;
  }
}

export function useRecentCategory(slug: string): UseRecentCategoryResult {
  // Cache the value lazily once per slug; consumers re-mount to refresh.
  const cachedRef = useRef<{ slug: string; value: number | null } | null>(null);
  if (cachedRef.current === null || cachedRef.current.slug !== slug) {
    cachedRef.current = { slug, value: readRecent(slug) };
  }
  const recentCategoryId = cachedRef.current.value;

  const setRecentCategoryId = useCallback(
    (id: number) => {
      if (typeof window === 'undefined') return;
      try {
        window.localStorage.setItem(`${KEY_PREFIX}${slug}`, String(id));
        cachedRef.current = { slug, value: id };
      } catch {
        // Storage may be full or disabled; ignore silently.
      }
    },
    [slug],
  );

  return { recentCategoryId, setRecentCategoryId };
}
