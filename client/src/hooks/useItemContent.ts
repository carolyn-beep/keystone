import { useQuery } from '@tanstack/react-query';
import { queryClient } from '@/lib/queryClient';
import type { ExtractedContent, LearningStreamItem } from './useLearningStream';

/**
 * Fetch extracted content for a learning stream item.
 * If the item already has extractedContent from the list response,
 * seeds the cache — zero network requests.
 */
export function useItemContent(slug: string, item: LearningStreamItem | null) {
  // Seed cache if item already has content
  const itemId = item?.id ?? null;
  const cacheKey = ['item-content', slug, itemId];

  if (item?.extractedContent) {
    queryClient.setQueryData(cacheKey, item.extractedContent);
  }

  return useQuery<ExtractedContent>({
    queryKey: cacheKey,
    queryFn: async () => {
      const res = await fetch(`/api/brainlifts/${slug}/learning-stream/${itemId}/content`);
      if (!res.ok) throw new Error('Failed to fetch content');
      return res.json();
    },
    enabled: itemId !== null,
    staleTime: Infinity,
    refetchInterval: (query) => {
      const data = query.state.data;
      return data?.contentType === 'pending' ? 3000 : false;
    },
  });
}
