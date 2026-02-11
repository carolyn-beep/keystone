import { useState, useCallback, useEffect, useRef, useMemo } from 'react';
import { LayoutGroup, motion } from 'framer-motion';
import { Loader2 } from 'lucide-react';
import { useLearningStream, type LearningStreamItem } from '@/hooks/useLearningStream';
import { useSwarmEvents } from '@/hooks/useSwarmEvents';
import { StreamProgressBar, StreamItemCard, GradeModal, MissionDashboard, ExpandedItemView } from './learning-stream';

interface LearningStreamTabProps {
  slug: string;
  canModify?: boolean;
  setActiveTab: (tab: string) => void;
  viewingItemId: number | null;
  setViewingItemId: (id: number | null) => void;
}

type ExitAnimation = 'bookmark' | 'grade' | 'discard' | null;

export function LearningStreamTab({ slug, canModify = true, setActiveTab, viewingItemId, setViewingItemId }: LearningStreamTabProps) {
  const {
    items,
    stats,
    isLoading,
    bookmark,
    discard,
    grade,
    refresh,
    refetch,
    isBookmarking,
    isDiscarding,
    isGrading,
    isRefreshing,
  } = useLearningStream(slug);

  // Single SSE connection — passed down to MissionDashboard as props
  const swarmState = useSwarmEvents(slug, true);
  const hasRefetchedForCompletion = useRef(false);

  // Derive: when swarm completes, refetch data (once)
  if (swarmState.isComplete && !hasRefetchedForCompletion.current) {
    hasRefetchedForCompletion.current = true;
    refetch();
  }
  // Reset flag when swarm is no longer complete (new swarm starting)
  if (!swarmState.isComplete && hasRefetchedForCompletion.current) {
    hasRefetchedForCompletion.current = false;
  }

  // Track which item is being animated out
  const [exitingItem, setExitingItem] = useState<{ id: number; animation: ExitAnimation } | null>(null);
  // Grade modal state
  const [gradeModalItem, setGradeModalItem] = useState<LearningStreamItem | null>(null);
  // Content viewer state — derived from URL param
  const viewingItem = useMemo(() =>
    viewingItemId ? items.find((i) => i.id === viewingItemId) ?? null : null,
  [viewingItemId, items]);
  const setViewingItem = useCallback((item: LearningStreamItem | null) => {
    setViewingItemId(item?.id ?? null);
  }, [setViewingItemId]);

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

    // If grading from expanded view, advance to next item
    if (viewingItem?.id === itemId) {
      const currentIndex = items.findIndex((i) => i.id === itemId);
      const nextItem = items[currentIndex + 1] ?? null;
      setViewingItem(nextItem);
    }

    setGradeModalItem(null);

    if (prefersReducedMotion || viewingItem) {
      await grade({ itemId, quality, alignment });
    } else {
      setExitingItem({ id: itemId, animation: 'grade' });
      pendingOperationRef.current = { id: itemId, action: 'grade' };
      // Store grade data for after animation
      (pendingOperationRef.current as { id: number; action: 'grade'; quality: number; alignment: boolean }).quality = quality;
      (pendingOperationRef.current as { id: number; action: 'grade'; quality: number; alignment: boolean }).alignment = alignment;
    }
  }, [gradeModalItem, grade, canModify, prefersReducedMotion, viewingItem, items]);

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

  // Find the next item relative to a given item
  const getNextItem = useCallback((item: LearningStreamItem): LearningStreamItem | null => {
    const idx = items.findIndex((i) => i.id === item.id);
    return items[idx + 1] ?? null;
  }, [items]);

  // Action handlers from expanded view — process and advance to next
  const handleBookmarkFromExpanded = useCallback((item: LearningStreamItem) => {
    const next = getNextItem(item);
    setViewingItem(next);
    bookmark(item.id);
  }, [getNextItem, setViewingItem, bookmark]);

  const handleGradeFromExpanded = useCallback((item: LearningStreamItem) => {
    // Open grade modal — advance happens in handleGradeSubmit
    setGradeModalItem(item);
  }, []);

  const handleDiscardFromExpanded = useCallback((item: LearningStreamItem) => {
    const next = getNextItem(item);
    setViewingItem(next);
    discard(item.id);
  }, [getNextItem, setViewingItem, discard]);

  const getPrevItem = useCallback((item: LearningStreamItem): LearningStreamItem | null => {
    const idx = items.findIndex((i) => i.id === item.id);
    return idx > 0 ? items[idx - 1] : null;
  }, [items]);

  const handlePrevItem = useCallback(() => {
    if (!viewingItem) return;
    const prev = getPrevItem(viewingItem);
    if (prev) setViewingItem(prev);
  }, [viewingItem, getPrevItem, setViewingItem]);

  const handleNextItem = useCallback(() => {
    if (!viewingItem) return;
    const next = getNextItem(viewingItem);
    if (next) setViewingItem(next);
  }, [viewingItem, getNextItem, setViewingItem]);

  const handleLaunch = useCallback(async () => {
    if (!canModify) return;
    await refresh();
  }, [refresh, canModify]);

  const handleNavigate = useCallback((page: 'saved' | 'graded') => {
    setActiveTab(page === 'saved' ? 'learning-saved' : 'learning-graded');
  }, [setActiveTab]);

  // Loading state
  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-16">
        <Loader2 size={32} className="animate-spin text-primary" />
      </div>
    );
  }

  const hasItems = stats.total > 0;
  const collapseTransition = prefersReducedMotion
    ? { duration: 0 }
    : { opacity: { duration: 0.2 }, height: { duration: 0.35 }, marginBottom: { duration: 0.35 }, layout: { type: 'spring' as const, duration: 0.5, bounce: 0.15 } };
  const sectionCollapse = prefersReducedMotion
    ? { duration: 0 }
    : { opacity: { duration: 0.2 }, height: { duration: 0.3 }, marginBottom: { duration: 0.3 } };

  return (
    <LayoutGroup>
      <div>
        {/* Mission Dashboard - collapses when expanded */}
        <motion.div
          className="max-w-[1400px] mx-auto"
          animate={viewingItem
            ? { opacity: 0, height: 0, marginBottom: 0 }
            : { opacity: 1, height: 'auto', marginBottom: 32 }}
          transition={sectionCollapse}
          style={{ overflow: viewingItem ? 'hidden' : 'visible', pointerEvents: viewingItem ? 'none' : 'auto' }}
        >
          <MissionDashboard
            swarmState={swarmState}
            onLaunch={handleLaunch}
            isLaunching={isRefreshing}
            hideWhenIdle={hasItems}
            pendingCount={stats.pending}
          />
        </motion.div>

        {hasItems && (
          <div className={viewingItem ? '' : 'max-w-3xl mx-auto'} data-learning-items>
            {/* Progress bar - collapses when expanded */}
            <motion.div
              animate={viewingItem
                ? { opacity: 0, height: 0, marginBottom: 0 }
                : { opacity: 1, height: 'auto', marginBottom: 16 }}
              transition={sectionCollapse}
              style={{ overflow: viewingItem ? 'hidden' : 'visible', pointerEvents: viewingItem ? 'none' : 'auto' }}
            >
              <StreamProgressBar
                stats={stats}
                onNavigate={handleNavigate}
              />
            </motion.div>

            {stats.pending === 0 ? (
              <motion.div
                animate={viewingItem
                  ? { opacity: 0, height: 0, marginBottom: 0 }
                  : { opacity: 1, height: 'auto', marginBottom: 0 }}
                transition={sectionCollapse}
                style={{ overflow: viewingItem ? 'hidden' : 'visible', pointerEvents: viewingItem ? 'none' : 'auto' }}
              >
                <AllProcessedState onNewMission={handleLaunch} isLaunching={isRefreshing} />
              </motion.div>
            ) : (
              <>
                <div className="sr-only" aria-live="polite" aria-atomic="true">
                  {stats.pending} items remaining to process
                </div>

                <div className="flex flex-col">
                  {items.map((item, index) => {
                    const isExiting = exitingItem?.id === item.id;
                    const exitAnimation = isExiting ? exitingItem.animation : null;
                    const isSelected = viewingItem?.id === item.id;
                    const isCollapsing = !!viewingItem && !isSelected;

                    return (
                      <motion.div
                        key={item.id}
                        layoutId={`stream-item-${item.id}`}
                        animate={isCollapsing
                          ? { opacity: 0, height: 0, marginBottom: 0 }
                          : { opacity: 1, height: 'auto', marginBottom: 16 }}
                        style={{
                          overflow: isCollapsing ? 'hidden' : 'visible',
                          pointerEvents: isCollapsing ? 'none' : 'auto',
                          ...(!viewingItem && !prefersReducedMotion ? {
                            animationDelay: `${index * 80}ms`,
                            animationFillMode: 'backwards' as const,
                          } : {}),
                        }}
                        transition={collapseTransition}
                        className={!viewingItem && !prefersReducedMotion ? 'animate-fade-slide-in' : undefined}
                      >
                        {isSelected ? (
                          <ExpandedItemView
                            item={item}
                            slug={slug}
                            onClose={() => setViewingItem(null)}
                            onBookmark={handleBookmarkFromExpanded}
                            onGrade={handleGradeFromExpanded}
                            onDiscard={handleDiscardFromExpanded}
                            onBack={index > 0 ? handlePrevItem : undefined}
                            onNext={index < items.length - 1 ? handleNextItem : undefined}
                          />
                        ) : (
                          <div className="cursor-pointer" onClick={() => setViewingItem(item)}>
                            <StreamItemCard.Root
                              item={item}
                              exitAnimation={exitAnimation}
                              onAnimationEnd={() => handleAnimationEnd(item.id)}
                            >
                              <StreamItemCard.Header />
                              <StreamItemCard.Actions
                                onBookmark={() => handleBookmark(item)}
                                onGrade={() => handleGradeClick(item)}
                                onDiscard={() => handleDiscard(item)}
                                onOpen={() => setViewingItem(item)}
                                isBookmarking={isBookmarking}
                                isProcessing={isDiscarding || isGrading}
                              />
                            </StreamItemCard.Root>
                          </div>
                        )}
                      </motion.div>
                    );
                  })}
                </div>
              </>
            )}
          </div>
        )}

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

// All processed state - editorial print aesthetic
import { CheckCircle, Search, Loader2 as Loader } from 'lucide-react';
import telescopeImg from '@/assets/bl_profile/telescope.webp';
import { TactileButton } from '@/components/ui/tactile-button';

function AllProcessedState({ onNewMission, isLaunching }: { onNewMission: () => void; isLaunching?: boolean }) {
  return (
    <div className="bg-card-elevated rounded-xl shadow-card overflow-hidden relative">
      {/* Subtle background image */}
      <div
        className="absolute inset-0 opacity-[0.06] bg-no-repeat bg-center bg-contain pointer-events-none"
        style={{ backgroundImage: `url(${telescopeImg})` }}
      />

      <div className="relative p-12">
        <div className="flex flex-col items-center justify-center text-center">
          {/* Success indicator */}
          <div className="relative mb-8">
            <div
              className="w-16 h-16 rounded-full flex items-center justify-center"
              style={{ border: '1px solid var(--border-hex)' }}
            >
              <CheckCircle size={32} className="text-success" />
            </div>
          </div>

          <h3 className="font-serif text-[28px] text-foreground mb-3">
            All Resources Reviewed
          </h3>
          <p className="text-sm text-muted-foreground max-w-md mb-10 leading-relaxed">
            You've processed all the research resources in your queue.
            Launch a new swarm to discover more content.
          </p>

          {/* New swarm button */}
          <TactileButton
            variant="raised"
            onClick={onNewMission}
            disabled={isLaunching}
            className="flex items-center gap-3 px-8 py-4 text-[14px]"
          >
            {isLaunching ? (
              <>
                <Loader size={18} className="animate-spin" />
                Launching Swarm...
              </>
            ) : (
              <>
                <Search size={18} />
                New Research Swarm
              </>
            )}
          </TactileButton>
        </div>
      </div>
    </div>
  );
}
