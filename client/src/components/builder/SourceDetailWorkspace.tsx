/**
 * SourceDetailWorkspace — Builder Phase 3 item detail wrapper.
 *
 * Fetches item detail data from the knowledge-tree API and renders
 * ExpandedItemView in builder mode. No back button — ExpandedItemView's
 * X close button handles navigation back to the list.
 */

import { useCallback } from 'react';
import { Loader2 } from 'lucide-react';
import { useQuery } from '@tanstack/react-query';
import { queryClient } from '@/lib/queryClient';
import { ExpandedItemView } from '@/components/learning-stream/ExpandedItemView';
import { useKnowledgeTree } from '@/hooks/useKnowledgeTree';
import type { LearningStreamItem } from '@/hooks/useLearningStream';

interface SourceDetailWorkspaceProps {
  slug: string;
  itemId: number;
  onBackToList: () => void;
}

interface ItemDetailResponse {
  learningStreamItem: LearningStreamItem;
  facts: Array<{
    id: number;
    originalId: string;
    fact: string;
    learningStreamItemId: number | null;
  }>;
  summaries: Array<{
    id: number;
    text: string[];
    learningStreamItemId: number | null;
    relatedFactIds: number[];
  }>;
  extractionCounts: {
    facts: number;
    summaries: number;
  };
  categoryId: number | null;
  categoryName: string | null;
}

export function SourceDetailWorkspace({ slug, itemId, onBackToList }: SourceDetailWorkspaceProps) {
  const { data, isLoading, error } = useQuery<ItemDetailResponse>({
    queryKey: ['item-detail', slug, itemId],
    queryFn: async () => {
      const res = await fetch(`/api/brainlifts/${slug}/knowledge-tree/items/${itemId}`);
      if (!res.ok) throw new Error('Failed to fetch item detail');
      return res.json();
    },
    enabled: !!slug && !!itemId,
  });

  const { openItem, skipItem } = useKnowledgeTree(slug);

  const handleMutationSuccess = () => {
    queryClient.invalidateQueries({ queryKey: ['item-detail', slug, itemId] });
    queryClient.invalidateQueries({ queryKey: ['knowledge-tree', slug] });
  };

  // Keep = bookmark the item (move from unprocessed to triaged)
  const handleKeep = useCallback(async (item: LearningStreamItem) => {
    try {
      await openItem(item.id);
      handleMutationSuccess();
    } catch {
      // handled by TanStack Query
    }
  }, [openItem]);

  // Discard = permanently remove
  const handleDiscard = useCallback(async (item: LearningStreamItem) => {
    try {
      await skipItem(item.id);
      onBackToList();
    } catch {
      // handled by TanStack Query
    }
  }, [skipItem, onBackToList]);

  const isPending = data?.learningStreamItem?.status === 'pending';

  if (isLoading || !data) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="animate-spin text-muted-foreground" size={24} />
      </div>
    );
  }

  if (error) {
    return (
      <div className="py-12">
        <p className="font-serif italic text-muted-foreground text-[15px]">
          Could not load item details. It may have been removed.
        </p>
      </div>
    );
  }

  return (
    <ExpandedItemView
      item={data.learningStreamItem}
      slug={slug}
      onClose={onBackToList}
      mode="builder"
      extractionCounts={data.extractionCounts}
      builderFacts={data.facts}
      builderSummaries={data.summaries}
      onMutationSuccess={handleMutationSuccess}
      onBookmark={isPending ? handleKeep : undefined}
      onDiscard={isPending ? handleDiscard : undefined}
    />
  );
}
