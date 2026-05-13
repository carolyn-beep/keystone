import { useMutation } from '@tanstack/react-query';
import { apiRequest, queryClient } from '@/lib/queryClient';
import type { LearningStreamItem } from '@/hooks/useLearningStream';
import type { Source } from '@/types/second-brain';

export interface BookmarkResearchStreamItemArgs {
  itemId: number;
  categoryId: number;
}

export interface BookmarkResearchStreamItemResult {
  item: LearningStreamItem;
  source: Source;
}

export function useBookmarkResearchStreamItem(slug: string) {
  return useMutation({
    mutationFn: async (args: BookmarkResearchStreamItemArgs): Promise<{ item: LearningStreamItem; source: Source }> => {
      const response = await apiRequest(
        'PATCH',
        `/api/brainlifts/${slug}/learning-stream/${args.itemId}/bookmark`,
        { categoryId: args.categoryId },
      );
      return response.json() as Promise<{ item: LearningStreamItem; source: Source }>;
    },
    onSuccess: (result) => {
      const markBookmarked = (current: LearningStreamItem[] | undefined) =>
        current?.map((item) => (item.id === result.item.id ? { ...item, ...result.item } : item));

      queryClient.setQueryData<LearningStreamItem[]>(['research-stream', slug], markBookmarked);
      queryClient.setQueryData<LearningStreamItem[]>(['learning-stream', slug], markBookmarked);
      queryClient.invalidateQueries({ queryKey: ['research-stream', slug] });
      queryClient.invalidateQueries({ queryKey: ['learning-stream', slug] });
      queryClient.invalidateQueries({ queryKey: ['learning-stream-stats', slug] });
      queryClient.invalidateQueries({ queryKey: ['learning-stream-bookmarked', slug] });
      queryClient.invalidateQueries({ queryKey: ['sources', slug] });
    },
  });
}
