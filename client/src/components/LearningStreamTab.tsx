import { useState, useCallback, useEffect, useRef } from 'react';
import { Loader2 } from 'lucide-react';
import { useLearningStream, type LearningStreamItem } from '@/hooks/useLearningStream';
import { StreamProgressBar, StreamEmptyState, StreamItemCard, GradeModal } from './learning-stream';

interface LearningStreamTabProps {
  slug: string;
  canModify?: boolean;
}

type ExitAnimation = 'bookmark' | 'grade' | 'discard' | null;

export function LearningStreamTab({ slug, canModify = true }: LearningStreamTabProps) {
  const {
    items,
    stats,
    isLoading,
    bookmark,
    discard,
    grade,
    refresh,
    isBookmarking,
    isDiscarding,
    isGrading,
    isRefreshing,
  } = useLearningStream(slug);

  // Track which item is being animated out
  const [exitingItem, setExitingItem] = useState<{ id: number; animation: ExitAnimation } | null>(null);
  // Grade modal state
  const [gradeModalItem, setGradeModalItem] = useState<LearningStreamItem | null>(null);

  // Reduced motion preference
  const [prefersReducedMotion, setPrefersReducedMotion] = useState(false);
  useEffect(() => {
    const mediaQuery = window.matchMedia('(prefers-reduced-motion: reduce)');
    setPrefersReducedMotion(mediaQuery.matches);
    const handler = (e: MediaQueryListEvent) => setPrefersReducedMotion(e.matches);
    mediaQuery.addEventListener('change', handler);
    return () => mediaQuery.removeEventListener('change', handler);
  }, []);

  // Ref to track pending operations for immediate removal (when reduced motion)
  const pendingOperationRef = useRef<{ id: number; action: 'bookmark' | 'grade' | 'discard' } | null>(null);

  const handleBookmark = useCallback(async (item: LearningStreamItem) => {
    if (!canModify) return;
    if (prefersReducedMotion) {
      await bookmark(item.id);
    } else {
      setExitingItem({ id: item.id, animation: 'bookmark' });
      pendingOperationRef.current = { id: item.id, action: 'bookmark' };
    }
  }, [bookmark, canModify, prefersReducedMotion]);

  const handleDiscard = useCallback(async (item: LearningStreamItem) => {
    if (!canModify) return;
    if (prefersReducedMotion) {
      await discard(item.id);
    } else {
      setExitingItem({ id: item.id, animation: 'discard' });
      pendingOperationRef.current = { id: item.id, action: 'discard' };
    }
  }, [discard, canModify, prefersReducedMotion]);

  const handleGradeClick = useCallback((item: LearningStreamItem) => {
    if (!canModify) return;
    setGradeModalItem(item);
  }, [canModify]);

  const handleGradeSubmit = useCallback(async (quality: number, alignment: boolean) => {
    if (!gradeModalItem || !canModify) return;
    const itemId = gradeModalItem.id;
    setGradeModalItem(null);

    if (prefersReducedMotion) {
      await grade({ itemId, quality, alignment });
    } else {
      setExitingItem({ id: itemId, animation: 'grade' });
      pendingOperationRef.current = { id: itemId, action: 'grade' };
      // Store grade data for after animation
      (pendingOperationRef.current as { id: number; action: 'grade'; quality: number; alignment: boolean }).quality = quality;
      (pendingOperationRef.current as { id: number; action: 'grade'; quality: number; alignment: boolean }).alignment = alignment;
    }
  }, [gradeModalItem, grade, canModify, prefersReducedMotion]);

  const handleAnimationEnd = useCallback(async (itemId: number) => {
    const pending = pendingOperationRef.current;
    if (!pending || pending.id !== itemId) {
      setExitingItem(null);
      return;
    }

    try {
      if (pending.action === 'bookmark') {
        await bookmark(itemId);
      } else if (pending.action === 'discard') {
        await discard(itemId);
      } else if (pending.action === 'grade') {
        const gradeData = pending as { id: number; action: 'grade'; quality: number; alignment: boolean };
        await grade({ itemId, quality: gradeData.quality, alignment: gradeData.alignment });
      }
    } finally {
      pendingOperationRef.current = null;
      setExitingItem(null);
    }
  }, [bookmark, discard, grade]);

  const handleRefresh = useCallback(async () => {
    if (!canModify) return;
    await refresh();
  }, [refresh, canModify]);

  // Loading state
  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-16">
        <Loader2 size={32} className="animate-spin text-primary" />
      </div>
    );
  }

  // No items and no job running - show "start" state
  if (stats.total === 0 && !stats.isResearching) {
    return (
      <div className="max-w-3xl mx-auto">
        <StreamEmptyState
          variant="no-data"
          onRefresh={handleRefresh}
          isRefreshing={isRefreshing}
        />
      </div>
    );
  }

  // No items but job is running - show generating state
  if (stats.total === 0 && stats.isResearching) {
    return (
      <div className="max-w-3xl mx-auto">
        <StreamEmptyState variant="generating" />
      </div>
    );
  }

  // All items processed - show completion state
  if (stats.pending === 0) {
    return (
      <div className="max-w-3xl mx-auto">
        <StreamProgressBar stats={stats} />
        <StreamEmptyState
          variant="all-processed"
          onRefresh={handleRefresh}
          isRefreshing={isRefreshing}
        />
      </div>
    );
  }

  // Normal state - show items
  return (
    <div className="max-w-3xl mx-auto">
      <StreamProgressBar stats={stats} />

      {/* Announcement region for screen readers */}
      <div className="sr-only" aria-live="polite" aria-atomic="true">
        {stats.pending} items remaining to process
      </div>

      {/* Item list with staggered animation */}
      <div className="flex flex-col gap-4">
        {items.map((item, index) => {
          const isExiting = exitingItem?.id === item.id;
          const exitAnimation = isExiting ? exitingItem.animation : null;

          return (
            <div
              key={item.id}
              className={prefersReducedMotion ? '' : 'animate-fade-slide-in'}
              style={{
                animationDelay: prefersReducedMotion ? '0ms' : `${index * 80}ms`,
                animationFillMode: 'backwards',
              }}
            >
              <StreamItemCard.Root
                item={item}
                exitAnimation={exitAnimation}
                onAnimationEnd={() => handleAnimationEnd(item.id)}
              >
                <StreamItemCard.Header />
                <StreamItemCard.Rationale />
                <StreamItemCard.Actions
                  onBookmark={() => handleBookmark(item)}
                  onGrade={() => handleGradeClick(item)}
                  onDiscard={() => handleDiscard(item)}
                  isBookmarking={isBookmarking}
                  isProcessing={isDiscarding || isGrading}
                />
              </StreamItemCard.Root>
            </div>
          );
        })}
      </div>

      {/* Grade Modal */}
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
