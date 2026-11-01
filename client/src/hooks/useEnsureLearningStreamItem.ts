import { useEffect, useState } from 'react';
import type { LearningStreamItem } from './useLearningStream';
import { apiRequest } from '@/lib/queryClient';

/**
 * Ensures a Second Brain source has an underlying learning_stream_item.
 *
 * If the source already has one, returns it. Otherwise creates one
 * server-side, links it to the source, queues content extraction, and
 * returns the new item.
 *
 * Fires automatically once per `sourceId` change.
 */
export function useEnsureLearningStreamItem(slug: string, sourceId: number | null) {
  const [item, setItem] = useState<LearningStreamItem | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (sourceId == null) {
      setItem(null);
      setError(null);
      return;
    }
    let cancelled = false;
    setIsLoading(true);
    setError(null);
    (async () => {
      try {
        const res = await apiRequest(
          'POST',
          `/api/brainlifts/${slug}/sources/${sourceId}/ensure-learning-stream-item`,
        );
        const data = (await res.json()) as LearningStreamItem;
        if (!cancelled) setItem(data);
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : 'Failed to prepare reader');
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [slug, sourceId]);

  return { item, isLoading, error };
}
