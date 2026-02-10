import { useQuery, useMutation } from '@tanstack/react-query';
import { queryClient, apiRequest } from '@/lib/queryClient';

export interface LearningStreamItem {
  id: number;
  brainliftId: number;
  // DB field names (actual API response)
  type: string;                     // "Substack", "Twitter", "Academic Paper", "Podcast", "Video"
  author: string;
  topic: string;                    // Title/topic of the resource
  time: string;                     // "5 min", "15 min"
  facts: string;                    // Key insights summary (2-3 sentences)
  url: string;
  source: 'quick-search' | 'deep-research' | 'twitter' | 'swarm-research';
  status: 'pending' | 'bookmarked' | 'graded' | 'discarded';
  relevanceScore: string | null;    // AI relevance score "0.5" to "1.0"
  aiRationale: string | null;       // Why AI suggested this
  quality: number | null;           // Grade (1-5)
  alignment: 'yes' | 'no' | null;
  createdAt: string;
  updatedAt: string;
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
    queryClient.invalidateQueries({ queryKey: ['learning-stream-bookmarked', slug] });
    queryClient.invalidateQueries({ queryKey: ['learning-stream-graded', slug] });
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
        alignment: alignment ? 'yes' : 'no',
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

    // Refetch data (e.g., after swarm completes)
    refetch: invalidateAll,

    // Loading states
    isBookmarking: bookmarkMutation.isPending,
    isDiscarding: discardMutation.isPending,
    isGrading: gradeMutation.isPending,
    isRefreshing: refreshMutation.isPending,
  };
}
