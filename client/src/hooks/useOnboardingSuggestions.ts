/**
 * useOnboardingSuggestions — fetches the wizard's tap-to-accept suggestion
 * chips for a given step (04-suggestion-steps FR3).
 *
 * - The `topic` kind hits the pre-create route (no slug yet); the other kinds
 *   hit the slug-scoped route.
 * - Fetches when the step opens; exposes a single `refresh` that re-requests
 *   once, passing the already-shown items as `exclude` so repeats are avoided.
 * - Non-blocking by contract: any failure surfaces as `[]` (the step renders
 *   input-only, never an error wall).
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { apiRequest } from '@/lib/queryClient';
import type { OnboardingTopicSuggestion } from '@shared/routes';

export type SuggestionKind = 'topic' | 'in-scope' | 'out-of-scope' | 'categories';

/** True when a payload element is a structured topic suggestion. */
function isTopicSuggestion(s: unknown): s is OnboardingTopicSuggestion {
  if (typeof s !== 'object' || s === null) return false;
  const o = s as Record<string, unknown>;
  return (
    typeof o.text === 'string' &&
    typeof o.topic === 'string' &&
    typeof o.focus === 'string' &&
    typeof o.why === 'string'
  );
}

interface BuildRequestArgs {
  kind: SuggestionKind;
  /** Required for non-topic kinds; ignored for `topic`. */
  slug: string | undefined;
  /** Already-shown items to avoid on a refresh. */
  exclude: string[];
}

interface SuggestionRequest {
  url: string;
  body: Record<string, unknown>;
}

/**
 * Pure request shaper: resolves the endpoint + POST body for a kind. Topic
 * kind targets the pre-create route with an `{ exclude }` body; slug kinds
 * target the slug-scoped route with `{ kind }` (+ `exclude` when non-empty).
 * Empty `exclude` is omitted from the body.
 */
export function buildSuggestionRequest({ kind, slug, exclude }: BuildRequestArgs): SuggestionRequest {
  const hasExclude = exclude.length > 0;
  if (kind === 'topic') {
    return {
      url: '/api/onboarding/topic-suggestions',
      body: hasExclude ? { exclude } : {},
    };
  }
  return {
    url: `/api/brainlifts/${slug}/onboarding/suggestions`,
    body: hasExclude ? { kind, exclude } : { kind },
  };
}

export interface UseOnboardingSuggestions {
  /** Display strings: composed `text` for topic kind, plain items otherwise. */
  suggestions: string[];
  /** Topic kind only: the same suggestions split for the three-part field. */
  structured: OnboardingTopicSuggestion[];
  isLoading: boolean;
  /** Re-request once, excluding everything shown so far. No-op after one use. */
  refresh: () => void;
  refreshUsed: boolean;
}

export function useOnboardingSuggestions(args: {
  kind: SuggestionKind;
  slug?: string;
  /** Gate the initial fetch (e.g. don't fetch slug kinds before the slug exists). */
  enabled?: boolean;
}): UseOnboardingSuggestions {
  const { kind, slug, enabled = true } = args;

  const [suggestions, setSuggestions] = useState<string[]>([]);
  const [structured, setStructured] = useState<OnboardingTopicSuggestion[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [refreshUsed, setRefreshUsed] = useState(false);

  // Everything shown across the initial fetch + the one refresh, used as the
  // refresh `exclude`. A ref so the fetch callback stays stable.
  const shownRef = useRef<string[]>([]);

  const fetchSuggestions = useCallback(
    async (exclude: string[]) => {
      const req = buildSuggestionRequest({ kind, slug, exclude });
      setIsLoading(true);
      try {
        const res = await apiRequest('POST', req.url, req.body);
        const payload = (await res.json()) as { suggestions?: unknown };
        const items = Array.isArray(payload.suggestions) ? payload.suggestions : [];
        // Topic kind returns structured objects; the other kinds plain strings.
        const nextStructured = items.filter(isTopicSuggestion);
        const next =
          nextStructured.length > 0
            ? nextStructured.map((s) => s.text)
            : items.filter((s): s is string => typeof s === 'string');
        shownRef.current = [...shownRef.current, ...next];
        setStructured(nextStructured);
        setSuggestions(next);
      } catch {
        // Non-blocking: degrade to no suggestions.
        setStructured([]);
        setSuggestions([]);
      } finally {
        setIsLoading(false);
      }
    },
    [kind, slug],
  );

  // Initial fetch when the step opens. Slug kinds wait for a slug.
  useEffect(() => {
    if (!enabled) return;
    if (kind !== 'topic' && !slug) return;
    shownRef.current = [];
    setRefreshUsed(false);
    void fetchSuggestions([]);
  }, [enabled, kind, slug, fetchSuggestions]);

  const refresh = useCallback(() => {
    if (refreshUsed || isLoading) return;
    setRefreshUsed(true);
    void fetchSuggestions(shownRef.current);
  }, [refreshUsed, isLoading, fetchSuggestions]);

  return { suggestions, structured, isLoading, refresh, refreshUsed };
}
