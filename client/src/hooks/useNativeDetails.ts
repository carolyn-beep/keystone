import { useQuery, useMutation } from '@tanstack/react-query';
import { queryClient } from '@/lib/queryClient';
import type { NativeDetailsResponse } from '@shared/routes';

export function useNativeDetails(slug: string) {
  const query = useQuery<NativeDetailsResponse>({
    queryKey: ['native-details', slug],
    queryFn: async () => {
      const res = await fetch(`/api/brainlifts/${slug}/native-details`);
      if (!res.ok) throw new Error('Failed to fetch native details');
      return res.json();
    },
    enabled: !!slug,
  });

  const mutation = useMutation({
    mutationFn: async (
      fields: Partial<{
        topic: string;
        purpose: string;
        owner: string | null;
        lastActivePhase: 1 | 2 | 3 | 4 | 5;
      }>
    ) => {
      const res = await fetch(`/api/brainlifts/${slug}/native-details`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(fields),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({ message: 'Failed to update' }));
        throw new Error(err.message || 'Failed to update');
      }
      return res.json() as Promise<NativeDetailsResponse>;
    },
    onSuccess: () => {
      // Invalidate native details so Phase1Topic / Display reflect the update
      queryClient.invalidateQueries({ queryKey: ['native-details', slug] });
      // Invalidate brainlift so header title stays in sync (topic writes through to brainlifts.title)
      queryClient.invalidateQueries({ queryKey: ['brainlift', slug] });
    },
  });

  const celebrateMutation = useMutation({
    mutationFn: async () => {
      const res = await fetch(
        `/api/brainlifts/${slug}/native-details/celebrate-phase3`,
        { method: 'PATCH' }
      );
      if (!res.ok) {
        const err = await res.json().catch(() => ({ message: 'Failed to celebrate' }));
        throw new Error(err.message || 'Failed to celebrate');
      }
      return res.json() as Promise<NativeDetailsResponse>;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['native-details', slug] });
    },
  });

  return {
    nativeDetails: query.data,
    isLoading: query.isLoading,
    error: query.error,
    update: mutation.mutateAsync,
    isUpdating: mutation.isPending,
    celebratePhase3: celebrateMutation.mutateAsync,
    isCelebrating: celebrateMutation.isPending,
  };
}
