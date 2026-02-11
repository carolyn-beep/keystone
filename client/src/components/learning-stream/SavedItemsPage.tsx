import { useState, useCallback, useMemo } from 'react';
import { LayoutGroup, motion } from 'framer-motion';
import { useQuery } from '@tanstack/react-query';
import { useLearningStream, type LearningStreamItem } from '@/hooks/useLearningStream';
import { SavedItemsList } from './SavedItemsList';
import { GradeModal } from './GradeModal';

interface SavedItemsPageProps {
  slug: string;
  canModify?: boolean;
  viewingItemId: number | null;
  setViewingItemId: (id: number | null) => void;
}

export function SavedItemsPage({ slug, canModify = true, viewingItemId, setViewingItemId }: SavedItemsPageProps) {
  const { grade, discard, isGrading, isDiscarding } = useLearningStream(slug);

  const bookmarkedQuery = useQuery<LearningStreamItem[]>({
    queryKey: ['learning-stream-bookmarked', slug],
    queryFn: async () => {
      const res = await fetch(`/api/brainlifts/${slug}/learning-stream?status=bookmarked`);
      if (!res.ok) throw new Error('Failed to fetch bookmarked items');
      return res.json();
    },
    enabled: !!slug,
  });

  const savedItems = bookmarkedQuery.data ?? [];

  const [gradeModalItem, setGradeModalItem] = useState<LearningStreamItem | null>(null);

  // Derive viewing item from URL param
  const viewingItem = useMemo(() =>
    viewingItemId ? savedItems.find((i) => i.id === viewingItemId) ?? null : null,
  [viewingItemId, savedItems]);
  const setViewingItem = useCallback((item: LearningStreamItem | null) => {
    setViewingItemId(item?.id ?? null);
  }, [setViewingItemId]);

  const getNextItem = useCallback((item: LearningStreamItem): LearningStreamItem | null => {
    const idx = savedItems.findIndex((i) => i.id === item.id);
    return savedItems[idx + 1] ?? null;
  }, [savedItems]);

  const handleGrade = useCallback((item: LearningStreamItem) => {
    if (!canModify) return;
    setGradeModalItem(item);
  }, [canModify]);

  const handleGradeSubmit = useCallback(async (quality: number, alignment: boolean) => {
    if (!gradeModalItem || !canModify) return;
    const itemId = gradeModalItem.id;

    // If grading from expanded view, advance to next
    if (viewingItem?.id === itemId) {
      setViewingItem(getNextItem(viewingItem));
    }

    setGradeModalItem(null);
    await grade({ itemId, quality, alignment });
  }, [gradeModalItem, grade, canModify, viewingItem, getNextItem, setViewingItem]);

  const handleDiscard = useCallback(async (item: LearningStreamItem) => {
    if (!canModify) return;
    await discard(item.id);
  }, [discard, canModify]);

  // Action handlers from expanded view — process and advance to next
  const handleGradeFromExpanded = useCallback((item: LearningStreamItem) => {
    setGradeModalItem(item);
  }, []);

  const handleDiscardFromExpanded = useCallback((item: LearningStreamItem) => {
    const next = getNextItem(item);
    setViewingItem(next);
    discard(item.id);
  }, [getNextItem, setViewingItem, discard]);

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
          <h2 className="font-serif text-[28px] text-foreground mb-1">Saved Resources</h2>
          <p className="font-serif italic text-sm text-muted-foreground leading-relaxed">
            Resources you bookmarked for later review. Grade them or discard to clear the list.
          </p>
        </motion.div>

        <SavedItemsList
          items={savedItems}
          isLoading={bookmarkedQuery.isLoading}
          onGrade={handleGrade}
          onDiscard={handleDiscard}
          viewingItem={viewingItem}
          slug={slug}
          onCloseViewing={() => setViewingItem(null)}
          onViewItem={setViewingItem}
          onGradeFromExpanded={handleGradeFromExpanded}
          onDiscardFromExpanded={handleDiscardFromExpanded}
        />

        <GradeModal
          show={!!gradeModalItem}
          item={gradeModalItem}
          onClose={() => setGradeModalItem(null)}
          onSubmit={handleGradeSubmit}
          isSubmitting={isGrading}
        />
      </div>
    </LayoutGroup>
  );
}
