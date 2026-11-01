import { useMemo } from 'react';
import { useQuery, useMutation } from '@tanstack/react-query';
import { queryClient } from '@/lib/queryClient';
import type { BuilderExpert, BuilderSuggestionStatus } from '@shared/schema';

interface BuilderExpertsResponse {
  experts: BuilderExpert[];
  suggestionStatus: BuilderSuggestionStatus;
  suggestionError: string | null;
}

interface CreateExpertInput {
  name: string;
  who: string;
  where: string;
  focus?: string | null;
  why?: string | null;
}

interface UpdateExpertInput {
  name?: string;
  who?: string;
  where?: string;
  focus?: string | null;
  why?: string | null;
  status?: 'saved';
}

function invalidateExpertQueries(slug: string) {
  queryClient.invalidateQueries({ queryKey: ['builder-experts', slug] });
  queryClient.invalidateQueries({ queryKey: ['native-details', slug] });
}

export function useBuilderExperts(slug: string) {
  const query = useQuery<BuilderExpertsResponse>({
    queryKey: ['builder-experts', slug],
    queryFn: async () => {
      const res = await fetch(`/api/brainlifts/${slug}/builder-experts`);
      if (!res.ok) throw new Error('Failed to fetch builder experts');
      return res.json();
    },
    enabled: !!slug,
    refetchInterval: (query) => {
      const data = query.state.data as BuilderExpertsResponse | undefined;
      if (data?.suggestionStatus === 'queued') return 3000;
      return false;
    },
  });

  const experts = query.data?.experts ?? [];
  const suggestionStatus = query.data?.suggestionStatus ?? 'queued';
  const suggestionError = query.data?.suggestionError ?? null;

  const suggestions = useMemo(
    () => experts.filter((e) => e.status === 'pending'),
    [experts]
  );

  const savedExperts = useMemo(
    () => experts.filter((e) => e.status === 'saved'),
    [experts]
  );

  const createExpertMutation = useMutation({
    mutationFn: async (data: CreateExpertInput): Promise<BuilderExpert> => {
      const res = await fetch(`/api/brainlifts/${slug}/builder-experts`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({ message: 'Failed to create expert' }));
        throw new Error(err.message || 'Failed to create expert');
      }
      return res.json();
    },
    onSuccess: () => invalidateExpertQueries(slug),
  });

  const updateExpertMutation = useMutation({
    mutationFn: async ({
      id,
      fields,
    }: {
      id: number;
      fields: UpdateExpertInput;
    }): Promise<BuilderExpert> => {
      const res = await fetch(`/api/brainlifts/${slug}/builder-experts/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(fields),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({ message: 'Failed to update expert' }));
        throw new Error(err.message || 'Failed to update expert');
      }
      return res.json();
    },
    onSuccess: () => invalidateExpertQueries(slug),
  });

  const dismissSuggestionMutation = useMutation({
    mutationFn: async (id: number): Promise<void> => {
      const res = await fetch(
        `/api/brainlifts/${slug}/builder-experts/${id}/dismiss`,
        { method: 'PATCH' }
      );
      if (!res.ok) throw new Error('Failed to dismiss suggestion');
    },
    onSuccess: () => invalidateExpertQueries(slug),
  });

  const deleteExpertMutation = useMutation({
    mutationFn: async (id: number): Promise<void> => {
      const res = await fetch(`/api/brainlifts/${slug}/builder-experts/${id}`, {
        method: 'DELETE',
      });
      if (!res.ok) throw new Error('Failed to delete expert');
    },
    onSuccess: () => invalidateExpertQueries(slug),
  });

  const regenerateSuggestionsMutation = useMutation({
    mutationFn: async (): Promise<void> => {
      const res = await fetch(
        `/api/brainlifts/${slug}/builder-experts/regenerate-suggestions`,
        { method: 'POST' }
      );
      if (!res.ok) throw new Error('Failed to regenerate suggestions');
    },
    onSuccess: () => invalidateExpertQueries(slug),
  });

  return {
    experts,
    suggestions,
    savedExperts,
    suggestionStatus,
    suggestionError,
    isLoading: query.isLoading,
    createExpert: createExpertMutation.mutateAsync,
    updateExpert: async (id: number, fields: UpdateExpertInput) =>
      updateExpertMutation.mutateAsync({ id, fields }),
    dismissSuggestion: dismissSuggestionMutation.mutateAsync,
    deleteExpert: deleteExpertMutation.mutateAsync,
    regenerateSuggestions: regenerateSuggestionsMutation.mutateAsync,
    isCreating: createExpertMutation.isPending,
    isUpdating: updateExpertMutation.isPending,
  };
}
