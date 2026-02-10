import { useState, useCallback, useEffect, useRef } from 'react';
import { Loader2 } from 'lucide-react';
import { useLearningStream, type LearningStreamItem } from '@/hooks/useLearningStream';
import { useSwarmEvents } from '@/hooks/useSwarmEvents';
import { StreamProgressBar, StreamItemCard, GradeModal, MissionDashboard } from './learning-stream';

interface LearningStreamTabProps {
  slug: string;
  canModify?: boolean;
  setActiveTab: (tab: string) => void;
}

type ExitAnimation = 'bookmark' | 'grade' | 'discard' | null;

export function LearningStreamTab({ slug, canModify = true, setActiveTab }: LearningStreamTabProps) {
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

  return (
    <div className="space-y-8">
      {/* Mission Dashboard - always at same tree position */}
      <div className="max-w-[1400px] mx-auto">
        <MissionDashboard
          swarmState={swarmState}
          onLaunch={handleLaunch}
          isLaunching={isRefreshing}
          hideWhenIdle={hasItems}
          pendingCount={stats.pending}
        />
      </div>

      {hasItems && (
        <div className="max-w-3xl mx-auto space-y-4" data-learning-items>
          <StreamProgressBar
            stats={stats}
            onNavigate={handleNavigate}
          />

          {stats.pending === 0 ? (
            <AllProcessedState onNewMission={handleLaunch} isLaunching={isRefreshing} />
          ) : (
            <>
              <div className="sr-only" aria-live="polite" aria-atomic="true">
                {stats.pending} items remaining to process
              </div>

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
