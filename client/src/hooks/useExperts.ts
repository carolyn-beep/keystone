import { useMutation } from '@tanstack/react-query';
import { queryClient } from '@/lib/queryClient';

export function useExperts(slug: string) {
  const refreshExpertsMutation = useMutation({
    mutationFn: async () => {
      const res = await fetch(`/api/brainlifts/${slug}/experts/refresh`, {
        method: 'POST',
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.message || 'Failed to refresh experts');
      }
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['brainlift', slug] });
    }
  });

  const toggleExpertFollowMutation = useMutation({
    mutationFn: async ({ expertId, isFollowing }: { expertId: number; isFollowing: boolean }) => {
      const res = await fetch(`/api/experts/${expertId}/follow`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ isFollowing }),
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.message || 'Failed to update expert');
      }
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['brainlift', slug] });
    }
  });

  const deleteExpertMutation = useMutation({
    mutationFn: async (expertId: number) => {
      const res = await fetch(`/api/experts/${expertId}`, {
        method: 'DELETE',
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.message || 'Failed to delete expert');
      }
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['brainlift', slug] });
    }
  });

  return {
    refresh: refreshExpertsMutation.mutateAsync,
    isRefreshing: refreshExpertsMutation.isPending,
    refreshMutation: refreshExpertsMutation,

    toggleFollow: toggleExpertFollowMutation.mutateAsync,
    toggleFollowMutation: toggleExpertFollowMutation,

    deleteExpert: deleteExpertMutation.mutateAsync,
    deleteMutation: deleteExpertMutation,
  };
}
