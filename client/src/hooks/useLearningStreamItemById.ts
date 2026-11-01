import { useQuery } from '@tanstack/react-query';
import type { LearningStreamItem } from './useLearningStream';

/**
 * Fetch a single learning stream item by id (regardless of status).
 * Used by the Second Brain source reader to hand the full item to
 * <ExpandedItemView>.
 */
export function useLearningStreamItemById(slug: string, itemId: number | null) {
  return useQuery<LearningStreamItem>({
    queryKey: ['learning-stream-item', slug, itemId],
    queryFn: async () => {
      const res = await fetch(`/api/brainlifts/${slug}/learning-stream/by-id/${itemId}`);
      if (!res.ok) throw new Error('Failed to fetch learning stream item');
      return res.json();
    },
    enabled: itemId != null,
    staleTime: 30_000,
  });
}
