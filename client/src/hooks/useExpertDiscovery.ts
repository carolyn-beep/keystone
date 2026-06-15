import { useQuery, useMutation } from '@tanstack/react-query';
import { apiRequest, queryClient } from '@/lib/queryClient';
import type { ExpertDiscoveryResponse } from '@shared/routes';

/**
 * Data layer for the onboarding wizard's Experts step (spec 06). Owns the
 * search-grounded discovery query plus the per-card accept mutation.
 *
 * Discovery fires only while the step is open (`enabled`), never retries, and
 * is treated as fresh for the whole session (`staleTime: Infinity`) so a slug
 * reuses one candidate set. The endpoint is fail-open (200 { candidates: [] }),
 * so a network/HTTP failure renders the same manual-add + skip presentation as
 * an empty result — no error wall.
 *
 * Accept POSTs a one-expert array to the REST create endpoint and invalidates
 * both the brainlift query and the saved-experts list so UI state stays in sync.
 */

export type ExpertCandidate = ExpertDiscoveryResponse['candidates'][number];

/** Fields accepted by POST /api/brainlifts/:slug/experts (name + where required). */
export interface ExpertAcceptInput {
  name: string;
  where: string;
  who?: string;
  why?: string;
  focus?: string;
}

/** A saved expert row returned by GET /api/brainlifts/:slug/experts. */
export interface SavedExpert {
  id: number;
  name: string;
  where: string | null;
  who: string | null;
  why: string | null;
}

export function useExpertDiscovery(slug: string | undefined, enabled: boolean) {
  const discovery = useQuery<ExpertDiscoveryResponse>({
    queryKey: ['onboarding-expert-discovery', slug],
    enabled: Boolean(slug) && enabled,
    retry: false,
    staleTime: Infinity,
    queryFn: async () => {
      const res = await apiRequest(
        'POST',
        `/api/brainlifts/${slug}/onboarding/expert-discovery`,
        undefined,
      );
      return (await res.json()) as ExpertDiscoveryResponse;
    },
  });

  const savedExperts = useQuery<SavedExpert[]>({
    queryKey: ['experts', slug],
    enabled: Boolean(slug),
    staleTime: 30_000,
    queryFn: async () => {
      const res = await apiRequest('GET', `/api/brainlifts/${slug}/experts`);
      return (await res.json()) as SavedExpert[];
    },
  });

  const accept = useMutation({
    mutationFn: async (expert: ExpertAcceptInput) => {
      const res = await apiRequest('POST', `/api/brainlifts/${slug}/experts`, {
        experts: [expert],
      });
      return (await res.json()) as { experts: Array<{ id: number; name: string }> };
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['brainlift', slug] });
      queryClient.invalidateQueries({ queryKey: ['experts', slug] });
    },
  });

  return {
    candidates: discovery.data?.candidates ?? [],
    isLoading: discovery.isLoading && discovery.fetchStatus !== 'idle',
    isError: discovery.isError,
    acceptExpert: accept.mutateAsync,
    isAccepting: accept.isPending,
    savedExperts: savedExperts.data ?? [],
    savedExpertsLoaded: savedExperts.isSuccess || savedExperts.isError,
  };
}
