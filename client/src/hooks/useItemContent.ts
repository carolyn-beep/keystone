import { useCallback, useRef } from 'react';
import { useQuery } from '@tanstack/react-query';
import { queryClient } from '@/lib/queryClient';
import { apiRequest } from '@/lib/queryClient';
import type { ExtractedContent, LearningStreamItem } from './useLearningStream';

/**
 * Fetch extracted content for a learning stream item.
 * If the item already has extractedContent from the list response,
 * seeds the cache — zero network requests.
 */
export function useItemContent(slug: string, item: LearningStreamItem | null) {
  const itemId = item?.id ?? null;
  const cacheKey = ['item-content', slug, itemId];
  const retryingRef = useRef(false);

  // Seed cache from list data, but not while a retry is polling
  if (item?.extractedContent && !retryingRef.current) {
    queryClient.setQueryData(cacheKey, item.extractedContent);
  }

  const query = useQuery<ExtractedContent>({
    queryKey: cacheKey,
    queryFn: async () => {
      const res = await fetch(`/api/brainlifts/${slug}/learning-stream/${itemId}/content`);
      if (!res.ok) throw new Error('Failed to fetch content');
      const data = await res.json();
      // Extraction finished — stop blocking the seed and refresh the list
      if (retryingRef.current && data.contentType !== 'pending') {
        retryingRef.current = false;
        queryClient.invalidateQueries({ queryKey: ['learning-stream', slug] });
      }
      return data;
    },
    enabled: itemId !== null,
    staleTime: Infinity,
    refetchInterval: (query) => {
      const data = query.state.data;
      return data?.contentType === 'pending' ? 3000 : false;
    },
  });

  const retryExtraction = useCallback(async () => {
    if (!itemId) return;
    retryingRef.current = true;
    await apiRequest('POST', `/api/brainlifts/${slug}/learning-stream/${itemId}/retry-extract`);
    queryClient.setQueryData(cacheKey, { contentType: 'pending' } as ExtractedContent);
  }, [slug, itemId, cacheKey]);

  return { ...query, retryExtraction };
}
