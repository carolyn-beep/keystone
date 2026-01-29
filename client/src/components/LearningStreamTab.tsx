import { useState, useCallback, useEffect, useRef } from 'react';
import { Loader2 } from 'lucide-react';
import { useLearningStream, type LearningStreamItem } from '@/hooks/useLearningStream';
import { useSwarmEvents } from '@/hooks/useSwarmEvents';
import { StreamProgressBar, StreamItemCard, GradeModal, MissionDashboard } from './learning-stream';

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
    refetch,
    isBookmarking,
    isDiscarding,
    isGrading,
    isRefreshing,
  } = useLearningStream(slug);

  const { isComplete: swarmComplete } = useSwarmEvents(slug);
  const hasRefetchedForCompletion = useRef(false);

  // Derive: when swarm completes, refetch data (once)
  if (swarmComplete && !hasRefetchedForCompletion.current) {
    hasRefetchedForCompletion.current = true;
    refetch();
  }
  // Reset flag when swarm is no longer complete (new swarm starting)
  if (!swarmComplete && hasRefetchedForCompletion.current) {
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

  // Loading state
  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-16">
        <Loader2 size={32} className="animate-spin text-primary" />
      </div>
    );
  }

  // No items yet - show Mission Dashboard (handles idle/deploying/active states)
  if (stats.total === 0) {
    return (
      <div className="max-w-3xl mx-auto">
        <MissionDashboard
          slug={slug}
          onLaunch={handleLaunch}
          isLaunching={isRefreshing}
        />
      </div>
    );
  }

  // Has items - show progress bar and items
  // Mission Dashboard will show itself when research is running (via SSE)
  return (
    <div className="max-w-3xl mx-auto space-y-4">
      {/* Mission Dashboard - only shows when swarm is active (hideWhenIdle hides it otherwise) */}
      <MissionDashboard
        slug={slug}
        onLaunch={handleLaunch}
        isLaunching={isRefreshing}
        hideWhenIdle
        pendingCount={stats.pending}
      />

      <StreamProgressBar stats={stats} />

      {/* All items processed - show completion prompt */}
      {stats.pending === 0 ? (
        <AllProcessedState onNewMission={handleLaunch} isLaunching={isRefreshing} />
      ) : (
        <>
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
        </>
      )}

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

// All processed state - matches mission control vibe
import { CheckCircle, Radar, Loader2 as Loader } from 'lucide-react';

function AllProcessedState({ onNewMission, isLaunching }: { onNewMission: () => void; isLaunching?: boolean }) {
  return (
    <div className="bg-slate-950 border border-slate-800 rounded-xl overflow-hidden">
      {/* Header bar */}
      <div className="flex items-center gap-3 px-4 py-3 bg-slate-900 border-b border-slate-800">
        <div className="flex items-center gap-1">
          <div className="w-2 h-4 bg-emerald-600" />
          <div className="w-2 h-4 bg-emerald-700" />
          <div className="w-2 h-4 bg-emerald-800" />
        </div>
        <span className="font-mono text-xs text-slate-500 tracking-widest uppercase">
          Queue Cleared
        </span>
      </div>

      <div className="p-8">
        <div className="flex flex-col items-center justify-center text-center">
          {/* Success indicator */}
          <div className="relative mb-6">
            <div className="w-20 h-20 rounded-full border-2 border-emerald-500/30 flex items-center justify-center bg-emerald-500/5">
              <CheckCircle size={40} className="text-emerald-500" />
            </div>
            <div className="absolute inset-0 rounded-full bg-emerald-500/10 blur-xl" />
          </div>

          <h3 className="font-mono text-lg font-bold text-slate-300 tracking-wide mb-2">
            ALL RESOURCES PROCESSED
          </h3>
          <p className="font-mono text-sm text-slate-500 max-w-md mb-8">
            Intelligence queue cleared. Deploy new units to continue research operations.
          </p>

          {/* New mission button */}
          <button
            onClick={onNewMission}
            disabled={isLaunching}
            className={`
              group relative px-8 py-4 font-mono text-sm font-bold tracking-widest uppercase
              border-2 rounded-lg transition-all duration-300
              ${isLaunching
                ? 'border-emerald-600/50 bg-emerald-950/30 text-emerald-500/70 cursor-wait'
                : 'border-emerald-500 bg-emerald-500/10 text-emerald-400 hover:bg-emerald-500/20 hover:shadow-[0_0_20px_rgba(16,185,129,0.3)]'
              }
            `}
          >
            <span className="absolute top-0 left-0 w-2 h-2 border-t-2 border-l-2 border-emerald-500" />
            <span className="absolute top-0 right-0 w-2 h-2 border-t-2 border-r-2 border-emerald-500" />
            <span className="absolute bottom-0 left-0 w-2 h-2 border-b-2 border-l-2 border-emerald-500" />
            <span className="absolute bottom-0 right-0 w-2 h-2 border-b-2 border-r-2 border-emerald-500" />

            {isLaunching ? (
              <span className="flex items-center gap-3">
                <Loader size={18} className="animate-spin" />
                DEPLOYING...
              </span>
            ) : (
              <span className="flex items-center gap-3">
                <Radar size={18} />
                NEW RESEARCH MISSION
              </span>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
