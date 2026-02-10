import { useState, useCallback } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useLearningStream, type LearningStreamItem } from '@/hooks/useLearningStream';
import { SavedItemsList } from './SavedItemsList';
import { GradeModal } from './GradeModal';

interface SavedItemsPageProps {
  slug: string;
  canModify?: boolean;
}

export function SavedItemsPage({ slug, canModify = true }: SavedItemsPageProps) {
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

  const [gradeModalItem, setGradeModalItem] = useState<LearningStreamItem | null>(null);

  const handleGrade = useCallback((item: LearningStreamItem) => {
    if (!canModify) return;
    setGradeModalItem(item);
  }, [canModify]);

  const handleGradeSubmit = useCallback(async (quality: number, alignment: boolean) => {
    if (!gradeModalItem || !canModify) return;
    await grade({ itemId: gradeModalItem.id, quality, alignment });
    setGradeModalItem(null);
  }, [gradeModalItem, grade, canModify]);

  const handleDiscard = useCallback(async (item: LearningStreamItem) => {
    if (!canModify) return;
    await discard(item.id);
  }, [discard, canModify]);

  return (
    <div className="max-w-3xl mx-auto space-y-6">
      {/* Page header */}
      <div>
        <h2 className="font-serif text-[28px] text-foreground mb-1">Saved Resources</h2>
        <p className="font-serif italic text-sm text-muted-foreground leading-relaxed">
          Resources you bookmarked for later review. Grade them or discard to clear the list.
        </p>
      </div>

      <SavedItemsList
        items={bookmarkedQuery.data ?? []}
        isLoading={bookmarkedQuery.isLoading}
        onGrade={handleGrade}
        onDiscard={handleDiscard}
      />

      <GradeModal
        show={!!gradeModalItem}
        item={gradeModalItem}
        onClose={() => setGradeModalItem(null)}
        onSubmit={handleGradeSubmit}
        isSubmitting={isGrading}
      />
    </div>
  );
}
