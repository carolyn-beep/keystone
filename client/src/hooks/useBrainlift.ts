import { useQuery, useMutation } from '@tanstack/react-query';
import { queryClient, apiRequest } from '@/lib/queryClient';
import type { BrainliftData } from '@shared/schema';

export function useBrainlift(slug: string, isSharedView = false) {
  // Main brainlift data query
  const query = useQuery<BrainliftData>({
    queryKey: ['brainlift', slug],
    queryFn: async () => {
      const res = await fetch(`/api/brainlifts/${slug}`);
      if (!res.ok) throw new Error('Failed to fetch brainlift');
      return res.json();
    },
    enabled: !!slug
  });

  // Update author mutation
  const updateAuthorMutation = useMutation({
    mutationFn: async (author: string) => {
      const res = await fetch(`/api/brainlifts/${slug}/author`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ author }),
      });
      if (!res.ok) throw new Error('Failed to update author');
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['brainlift', slug] });
    },
  });

  // Update brainlift file mutation
  const updateMutation = useMutation({
    mutationFn: async (formData: FormData) => {
      const res = await fetch(`/api/brainlifts/${slug}/update`, {
        method: 'PATCH',
        body: formData,
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.message || 'Failed to update');
      }
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['brainlift', slug] });
      queryClient.invalidateQueries({ queryKey: ['grades', slug] });
      queryClient.invalidateQueries({ queryKey: ['versions', slug] });
    }
  });

  // Save grade mutation
  const saveGradeMutation = useMutation({
    mutationFn: async (gradeData: { readingListItemId: number; aligns?: string; contradicts?: string; newInfo?: string; quality?: number }) => {
      return apiRequest('POST', `/api/brainlifts/${slug}/grades`, gradeData);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['grades', slug] });
    }
  });

  return {
    // Query state
    data: query.data,
    isLoading: query.isLoading,
    error: query.error,
    refetch: query.refetch,

    // Update author
    updateAuthor: updateAuthorMutation.mutateAsync,
    isUpdatingAuthor: updateAuthorMutation.isPending,
    updateAuthorError: updateAuthorMutation.error,

    // Update brainlift
    update: updateMutation.mutate,
    updateAsync: updateMutation.mutateAsync,
    isUpdating: updateMutation.isPending,
    updateError: updateMutation.error,

    // Save grade
    saveGrade: saveGradeMutation.mutate,
    saveGradeAsync: saveGradeMutation.mutateAsync,
    isSavingGrade: saveGradeMutation.isPending,
    saveGradeError: saveGradeMutation.error,
  };
}
