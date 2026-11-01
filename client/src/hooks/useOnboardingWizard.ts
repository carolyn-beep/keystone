import { useQuery, useMutation } from '@tanstack/react-query';
import { apiRequest, queryClient } from '@/lib/queryClient';
import { USER_BRAINLIFTS_QUERY_KEY } from '@/hooks/useUserBrainlifts';
import type { Brainlift } from '@shared/schema';
import type { OnboardingPatchInput } from '@shared/routes';

/**
 * Data layer for the onboarding wizard (features/ux-redesign/onboarding-wizard).
 * Owns the resume query (loads the brainlift row when a slug is present) plus
 * the create / patch / complete mutations. Library list queries are
 * invalidated after create/complete so Home reflects the new project and drops
 * the "Setup incomplete" badge.
 */

/** Invalidate every surface that lists the user's brainlifts. */
function invalidateLibraryQueries(): void {
  // Home's infinite list (queryKey starts with '/api/brainlifts').
  queryClient.invalidateQueries({ queryKey: ['/api/brainlifts'] });
  // The lightweight titles list used for the zero-project auto-open gate.
  queryClient.invalidateQueries({ queryKey: USER_BRAINLIFTS_QUERY_KEY });
}

export function useOnboardingWizard(slug?: string) {
  // Resume: load the brainlift row when the URL carries a slug. A missing /
  // foreign slug 404s here, surfacing as `resume.isError` for the page's
  // error state.
  const resume = useQuery<Brainlift>({
    queryKey: ['brainlift', slug],
    enabled: Boolean(slug),
    queryFn: async () => {
      const res = await fetch(`/api/brainlifts/${slug}`, { credentials: 'include' });
      if (!res.ok) {
        throw new Error(`${res.status}`);
      }
      return (await res.json()) as Brainlift;
    },
  });

  const create = useMutation({
    mutationFn: async (topic: string) => {
      const res = await apiRequest('POST', '/api/onboarding/projects', { topic });
      return (await res.json()) as Brainlift;
    },
    onSuccess: () => {
      invalidateLibraryQueries();
    },
  });

  const patch = useMutation({
    mutationFn: async (args: { slug: string; patch: OnboardingPatchInput }) => {
      const res = await apiRequest('PATCH', `/api/brainlifts/${args.slug}/onboarding`, args.patch);
      return (await res.json()) as Brainlift;
    },
    onSuccess: (updated) => {
      queryClient.setQueryData(['brainlift', updated.slug], updated);
    },
  });

  const complete = useMutation({
    mutationFn: async (completeSlug: string) => {
      const res = await apiRequest('POST', `/api/brainlifts/${completeSlug}/onboarding/complete`, undefined);
      return (await res.json()) as { slug: string };
    },
    onSuccess: () => {
      invalidateLibraryQueries();
    },
  });

  return {
    resume,
    createProject: create.mutateAsync,
    isCreating: create.isPending,
    createError: create.error,
    patchProgress: patch.mutateAsync,
    completeOnboarding: complete.mutateAsync,
    isCompleting: complete.isPending,
  };
}
