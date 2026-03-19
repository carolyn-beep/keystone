/**
 * SourceDetailWorkspace — Builder Phase 3 item detail wrapper.
 *
 * Fetches item detail data from the knowledge-tree API and renders
 * ExpandedItemView in builder mode with ManualTab instead of Quiz.
 */

import { Loader2, ArrowLeft } from 'lucide-react';
import { useQuery } from '@tanstack/react-query';
import { queryClient } from '@/lib/queryClient';
import { TactileButton } from '@/components/ui/tactile-button';
import { ExpandedItemView } from '@/components/learning-stream/ExpandedItemView';
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

  const handleMutationSuccess = () => {
    queryClient.invalidateQueries({ queryKey: ['item-detail', slug, itemId] });
    queryClient.invalidateQueries({ queryKey: ['knowledge-tree', slug] });
  };

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
        <div className="mb-4">
          <TactileButton
            variant="inset"
            onClick={onBackToList}
            className="flex items-center gap-2 text-[12px]"
          >
            <ArrowLeft size={13} />
            Back to Knowledge Tree
          </TactileButton>
        </div>
        <p className="font-serif italic text-muted-foreground text-[15px]">
          Could not load item details. It may have been removed.
        </p>
      </div>
    );
  }

  return (
    <div>
      {/* Back button above the detail view */}
      <div className="mb-4">
        <TactileButton
          variant="inset"
          onClick={onBackToList}
          className="flex items-center gap-2 text-[12px]"
        >
          <ArrowLeft size={13} />
          Back to Knowledge Tree
        </TactileButton>
      </div>

      <ExpandedItemView
        item={data.learningStreamItem}
        slug={slug}
        onClose={onBackToList}
        mode="builder"
        extractionCounts={data.extractionCounts}
        builderFacts={data.facts}
        builderSummaries={data.summaries}
        onMutationSuccess={handleMutationSuccess}
      />
    </div>
  );
}
