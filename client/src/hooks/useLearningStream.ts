import { useQuery, useMutation } from '@tanstack/react-query';
import { queryClient, apiRequest } from '@/lib/queryClient';

export interface LearningStreamItem {
  id: number;
  brainliftId: number;
  sourceType: 'quick-search' | 'deep-research' | 'twitter';
  author: string | null;
  title: string | null;
  topic: string | null;
  url: string | null;
  rationale: string | null;
  estimatedReadTime: number | null;
  status: 'pending' | 'bookmarked' | 'graded' | 'discarded';
  quality: number | null;
  alignment: boolean | null;
  createdAt: string;
  processedAt: string | null;
}

export interface LearningStreamStats {
  total: number;
  pending: number;
  bookmarked: number;
  graded: number;
  discarded: number;
  isResearching: boolean;
}

export function useLearningStream(slug: string) {
  // Query for pending items
  const itemsQuery = useQuery<LearningStreamItem[]>({
    queryKey: ['learning-stream', slug],
    queryFn: async () => {
      const res = await fetch(`/api/brainlifts/${slug}/learning-stream?status=pending`);
      if (!res.ok) throw new Error('Failed to fetch learning stream items');
      return res.json();
    },
    enabled: !!slug,
  });

  // Query for stats
  const statsQuery = useQuery<LearningStreamStats>({
    queryKey: ['learning-stream-stats', slug],
    queryFn: async () => {
      const res = await fetch(`/api/brainlifts/${slug}/learning-stream/stats`);
      if (!res.ok) throw new Error('Failed to fetch learning stream stats');
      return res.json();
    },
    enabled: !!slug,
  });

  const invalidateAll = () => {
    queryClient.invalidateQueries({ queryKey: ['learning-stream', slug] });
    queryClient.invalidateQueries({ queryKey: ['learning-stream-stats', slug] });
  };

  // Bookmark mutation
  const bookmarkMutation = useMutation({
    mutationFn: async (itemId: number) => {
      return apiRequest('PATCH', `/api/brainlifts/${slug}/learning-stream/${itemId}/bookmark`);
    },
    onSuccess: invalidateAll,
  });

  // Discard mutation
  const discardMutation = useMutation({
    mutationFn: async (itemId: number) => {
      return apiRequest('PATCH', `/api/brainlifts/${slug}/learning-stream/${itemId}/discard`);
    },
    onSuccess: invalidateAll,
  });

  // Grade mutation
  const gradeMutation = useMutation({
    mutationFn: async ({ itemId, quality, alignment }: { itemId: number; quality: number; alignment: boolean }) => {
      return apiRequest('POST', `/api/brainlifts/${slug}/learning-stream/${itemId}/grade`, {
        quality,
        alignment,
      });
    },
    onSuccess: invalidateAll,
  });

  // Refresh mutation (trigger new research)
  const refreshMutation = useMutation({
    mutationFn: async () => {
      return apiRequest('POST', `/api/brainlifts/${slug}/learning-stream/refresh`);
    },
    onSuccess: invalidateAll,
  });

  return {
    // Data
    items: itemsQuery.data ?? [],
    stats: statsQuery.data ?? { total: 0, pending: 0, bookmarked: 0, graded: 0, discarded: 0, isResearching: false },
    isLoading: itemsQuery.isLoading || statsQuery.isLoading,
    error: itemsQuery.error || statsQuery.error,

    // Mutations
    bookmark: bookmarkMutation.mutateAsync,
    discard: discardMutation.mutateAsync,
    grade: gradeMutation.mutateAsync,
    refresh: refreshMutation.mutateAsync,

    // Loading states
    isBookmarking: bookmarkMutation.isPending,
    isDiscarding: discardMutation.isPending,
    isGrading: gradeMutation.isPending,
    isRefreshing: refreshMutation.isPending,
  };
}
