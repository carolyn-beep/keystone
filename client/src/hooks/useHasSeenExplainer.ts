/**
 * useHasSeenExplainer(key)
 *
 * TanStack Query hook owning the per-user "has the user seen this explainer
 * modal yet?" flag.  Reads /api/users/me/preferences (which returns
 * `{ seenExplainers: string[] }`) and exposes:
 *
 *   - isLoading: while the initial fetch is in flight
 *   - hasSeen:   `seenExplainers.includes(key)` — defaults to false while
 *                loading, disabled, or on error.
 *   - markSeen:  fire-and-forget mutation that PATCHes the seen-explainer
 *                endpoint; invalidates the preferences query on success.
 *   - isMarking: while the mutation is in flight.
 *
 * `enabled` lets callers avoid fetching preferences until the explainer surface
 * is relevant. Fail-open is intentional once enabled: teaching DOK1 is more
 * important than perfectly suppressing a repeat modal after a transient API
 * failure.
 *
 * Independent of Better Auth's useSession() to avoid the 5-min cookie-cache
 * freshness gotcha after markSeen.
 *
 * Spec: features/pedagogy/dok1-rubric-explainer/specs/01-foundation/spec.md
 */

import { useMutation, useQuery } from '@tanstack/react-query';
import { apiRequest, queryClient } from '@/lib/queryClient';

export const USER_PREFERENCES_QUERY_KEY = ['user', 'preferences'] as const;

interface UserPreferencesResponse {
  seenExplainers: string[];
}

async function fetchUserPreferences(): Promise<UserPreferencesResponse> {
  const res = await fetch('/api/users/me/preferences', { credentials: 'include' });
  if (!res.ok) {
    throw new Error(`Failed to load user preferences (${res.status})`);
  }
  return res.json();
}

async function postMarkSeen(key: string): Promise<UserPreferencesResponse> {
  const res = await apiRequest('PATCH', '/api/users/me/seen-explainer', { key });
  return res.json();
}

export function useHasSeenExplainer(
  key: string,
  options: { enabled?: boolean } = {},
): {
  isLoading: boolean;
  hasSeen: boolean;
  markSeen: () => void;
  isMarking: boolean;
} {
  const query = useQuery<UserPreferencesResponse>({
    queryKey: USER_PREFERENCES_QUERY_KEY,
    queryFn: fetchUserPreferences,
    enabled: options.enabled ?? true,
  });

  const mutation = useMutation<UserPreferencesResponse, Error, void>({
    mutationFn: () => postMarkSeen(key),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: USER_PREFERENCES_QUERY_KEY });
    },
  });

  // Fail-open is intentional: once the query is enabled, loading or error states
  // keep `hasSeen` false so new users are taught DOK1 even if preferences fail.
  // Consumers that auto-trigger MUST still gate on !isLoading to avoid a flash.
  const hasSeen = !!query.data?.seenExplainers?.includes(key);

  return {
    isLoading: query.isLoading,
    hasSeen,
    markSeen: () => mutation.mutate(),
    isMarking: mutation.isPending,
  };
}
