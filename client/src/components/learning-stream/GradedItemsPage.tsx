import { useCallback, useMemo } from 'react';
import { LayoutGroup, motion } from 'framer-motion';
import { useQuery } from '@tanstack/react-query';
import { useLearningStream, type LearningStreamItem } from '@/hooks/useLearningStream';
import { GradedItemsList } from './GradedItemsList';

interface GradedItemsPageProps {
  slug: string;
  canModify?: boolean;
  viewingItemId: number | null;
  setViewingItemId: (id: number | null) => void;
}

export function GradedItemsPage({ slug, canModify = true, viewingItemId, setViewingItemId }: GradedItemsPageProps) {
  const { discard } = useLearningStream(slug);

  const gradedQuery = useQuery<LearningStreamItem[]>({
    queryKey: ['learning-stream-graded', slug],
    queryFn: async () => {
      const res = await fetch(`/api/brainlifts/${slug}/learning-stream?status=graded`);
      if (!res.ok) throw new Error('Failed to fetch graded items');
      return res.json();
    },
    enabled: !!slug,
  });

  const gradedItems = gradedQuery.data ?? [];

  // Derive viewing item from URL param
  const viewingItem = useMemo(() =>
    viewingItemId ? gradedItems.find((i) => i.id === viewingItemId) ?? null : null,
  [viewingItemId, gradedItems]);
  const setViewingItem = useCallback((item: LearningStreamItem | null) => {
    setViewingItemId(item?.id ?? null);
  }, [setViewingItemId]);

  const handleDiscardFromExpanded = useCallback((item: LearningStreamItem) => {
    // Sort matches the list's display order
    const sorted = [...gradedItems].sort((a, b) => (b.quality ?? 0) - (a.quality ?? 0));
    const idx = sorted.findIndex((i) => i.id === item.id);
    const next = sorted[idx + 1] ?? null;
    setViewingItem(next);
    discard(item.id);
  }, [gradedItems, setViewingItem, discard]);

  return (
    <LayoutGroup>
      <div className={viewingItem ? '' : 'max-w-3xl mx-auto'}>
        {/* Page header - collapses when expanded */}
        <motion.div
          animate={viewingItem
            ? { opacity: 0, height: 0, marginBottom: 0 }
            : { opacity: 1, height: 'auto', marginBottom: 24 }}
          transition={{ opacity: { duration: 0.2 }, height: { duration: 0.3 }, marginBottom: { duration: 0.3 } }}
          style={{ overflow: viewingItem ? 'hidden' : 'visible', pointerEvents: viewingItem ? 'none' : 'auto' }}
        >
          <h2 className="font-serif text-[28px] text-foreground mb-1">Graded Resources</h2>
          <p className="font-serif italic text-sm text-muted-foreground leading-relaxed">
            Archive of resources you've reviewed and rated for quality and alignment.
          </p>
        </motion.div>

        <GradedItemsList
          items={gradedItems}
          isLoading={gradedQuery.isLoading}
          viewingItem={viewingItem}
          slug={slug}
          onCloseViewing={() => setViewingItem(null)}
          onViewItem={setViewingItem}
          onDiscardFromExpanded={handleDiscardFromExpanded}
        />
      </div>
    </LayoutGroup>
  );
}
