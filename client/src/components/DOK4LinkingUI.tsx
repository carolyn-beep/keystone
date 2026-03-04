import { useState, useMemo, useEffect, useCallback, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Check, Loader2, Archive, ArrowRight, AlertCircle, X as XIcon,
} from 'lucide-react';
import { tokens, getScoreChipColors } from '@/lib/colors';
import { useDOK4 } from '@/hooks/useDOK4';
import { useDOK4Linking } from '@/hooks/useDOK4Linking';
import { useDOK3Insights } from '@/hooks/useDOK3Insights';
import { useDOK4GradingEvents } from '@/hooks/useDOK4GradingEvents';
import { type ImportState } from '@/hooks/useImportWithProgress';
import { STAGE_LABELS, type ImportStage } from '@shared/import-progress';
import { TactileButton } from '@/components/ui/tactile-button';
import type { DOK4SpovWithLinks } from '@shared/dok4-types';

import linkingBg from '@/assets/textures/research_apparatus.webp';

// ─── Types ──────────────────────────────────────────────────────────────────────

interface DOK4LinkingUIProps {
  slug: string;
  spovCount: number;
  importState?: ImportState;
  onComplete: () => void;
}

// ─── Helpers ────────────────────────────────────────────────────────────────────

function getBackgroundStageLabel(stage: ImportStage | null): string {
  if (!stage) return '';
  if (stage === 'complete') return 'Import complete';
  if (stage === 'error') return 'Import error';
  return STAGE_LABELS[stage] || '';
}

// ─── Component ──────────────────────────────────────────────────────────────────

export function DOK4LinkingUI({ slug, spovCount, importState, onComplete }: DOK4LinkingUIProps) {
  const dok4 = useDOK4(slug);
  const dok4Linking = useDOK4Linking(slug);
  const dok3 = useDOK3Insights(slug);
  const [selectedSpovId, setSelectedSpovId] = useState<number | null>(null);
  const [selectedDok3Ids, setSelectedDok3Ids] = useState<Set<number>>(new Set());
  const [primaryDok3Id, setPrimaryDok3Id] = useState<number | null>(null);
  const [linkError, setLinkError] = useState<string | null>(null);
  const [showIntro, setShowIntro] = useState(true);
  const successTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const allSpovs = dok4.spovs;

  // Grading events for real-time updates
  const hasGradingActivity = allSpovs.some(s => s.status === 'grading' || s.status === 'linked');
  const gradingEvents = useDOK4GradingEvents(slug, hasGradingActivity);

  // Build event map: spovId -> latest event
  const eventMap = useMemo(() => {
    const map = new Map<number, { stage: string; message: string; score?: number }>();
    for (const e of gradingEvents.events) {
      map.set(e.spovId, { stage: e.type, message: e.message, score: e.score });
    }
    return map;
  }, [gradingEvents.events]);

  // DOK3 insights for the picker (only graded ones are ideal, but show all linked+graded)
  const availableDok3Insights = useMemo(() => {
    return dok3.insights.filter(i =>
      i.status === 'graded' || i.status === 'linked' || i.status === 'grading'
    );
  }, [dok3.insights]);

  // Auto-select first unresolved SPOV
  useEffect(() => {
    if (selectedSpovId === null && allSpovs.length > 0) {
      const first = allSpovs.find(s => s.status === 'pending_linking');
      if (first) setSelectedSpovId(first.id);
    }
  }, [allSpovs, selectedSpovId]);

  // Auto-advance to next unresolved after link
  const advanceToNext = useCallback((skipId?: number) => {
    const next = allSpovs.find(s => s.status === 'pending_linking' && s.id !== skipId);
    setSelectedSpovId(next?.id ?? null);
    setSelectedDok3Ids(new Set());
    setPrimaryDok3Id(null);
    setLinkError(null);
  }, [allSpovs]);

  // Track all-resolved state
  const allResolved = allSpovs.length > 0 && allSpovs.every(
    s => s.status !== 'pending_linking'
  );
  const importComplete = !importState || importState.currentStage === 'complete';

  // Auto-close when all resolved + import complete
  useEffect(() => {
    if (allResolved && importComplete && !successTimerRef.current) {
      successTimerRef.current = setTimeout(() => {
        onComplete();
      }, 2000);
    }
    return () => {
      if (successTimerRef.current) clearTimeout(successTimerRef.current);
    };
  }, [allResolved, importComplete, onComplete]);

  const selectedSpov = allSpovs.find(s => s.id === selectedSpovId) ?? null;

  // Validation: >=1 DOK3 selected + primary designated
  const canLink = selectedDok3Ids.size >= 1 && primaryDok3Id !== null && selectedDok3Ids.has(primaryDok3Id);

  // Toggle DOK3 selection
  const toggleDok3 = (id: number) => {
    setSelectedDok3Ids(prev => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
        // If we removed the primary, clear primary
        if (primaryDok3Id === id) setPrimaryDok3Id(null);
      } else {
        next.add(id);
        // Auto-designate as primary if it's the only one
        if (next.size === 1) setPrimaryDok3Id(id);
      }
      return next;
    });
  };

  // Link action
  const handleLink = async () => {
    if (!selectedSpov || !canLink || !primaryDok3Id) return;
    setLinkError(null);

    const links = Array.from(selectedDok3Ids).map(dok3Id => ({
      dok3InsightId: dok3Id,
      isPrimary: dok3Id === primaryDok3Id,
    }));

    try {
      await dok4Linking.link({ spovId: selectedSpov.id, links });
      advanceToNext(selectedSpov.id);
    } catch (err: any) {
      setLinkError(err.message || 'Failed to link SPOV');
    }
  };

  return (
    <div className="flex flex-col h-full">
      {/* Import progress bar */}
      {importState && (
        <div className="flex items-center gap-3 px-6 py-2.5 border-b border-border bg-sidebar shrink-0">
          {importComplete ? (
            <>
              <Check size={14} className="text-success" />
              <span className="text-[12px] text-success font-medium">Import complete</span>
            </>
          ) : (
            <>
              <Loader2 size={14} className="animate-spin text-primary" />
              <span className="text-[12px] text-muted-foreground">
                {getBackgroundStageLabel(importState.currentStage)}
              </span>
            </>
          )}
        </div>
      )}

      {/* Success overlay */}
      <AnimatePresence>
        {allResolved && (
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            className="absolute inset-0 z-20 flex items-center justify-center bg-background/80 backdrop-blur-sm"
          >
            <div className="text-center">
              <Check size={48} className="text-success mx-auto mb-4" />
              <h3 className="font-serif text-[24px] text-foreground m-0 mb-2">All SPOVs Resolved</h3>
              <p className="text-[14px] text-muted-foreground m-0">
                {importComplete ? 'Redirecting to dashboard...' : 'Waiting for import to finish...'}
              </p>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Teaching moment intro */}
      {showIntro && (
        <div className="flex-1 flex items-center justify-center relative overflow-hidden">
          {/* Background texture */}
          <div
            aria-hidden="true"
            className="absolute inset-0 pointer-events-none"
            style={{
              backgroundImage: `url(${linkingBg})`,
              backgroundSize: '45%',
              backgroundRepeat: 'no-repeat',
              backgroundPosition: 'center',
              opacity: 0.1,
              mixBlendMode: 'multiply',
            }}
          />

          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.4 }}
            className="relative z-10 max-w-[560px] px-10"
          >
            <span className="text-[11px] uppercase tracking-[0.35em] font-semibold text-muted-foreground block mb-6">
              DOK4 Linking
            </span>

            <h2 className="font-serif text-[28px] leading-[1.3] text-foreground m-0 mb-6">
              Your positions need foundations.
            </h2>

            <div className="space-y-4 mb-8">
              <p className="font-serif text-[15px] leading-[1.7] text-muted-foreground m-0">
                A DOK4 SPOV (Spiky Point of View) is a <span className="text-foreground italic">position</span> that
                synthesizes insights into an original stance. It needs to be grounded in your DOK3 insights.
              </p>
              <p className="font-serif text-[15px] leading-[1.7] text-muted-foreground m-0">
                In this step, you'll link each SPOV to the DOK3 insights it builds upon, and designate
                which insight is <span className="text-foreground italic">primary</span> -- the core foundation
                of the position.
              </p>
            </div>

            <div className="rounded-lg bg-primary/5 border border-border px-6 py-5 mb-8">
              <span className="text-[10px] uppercase tracking-[0.3em] font-bold text-muted-foreground block mb-3">
                What you'll do
              </span>
              <ul className="m-0 pl-0 list-none space-y-2.5">
                <li className="flex items-start gap-3">
                  <span className="font-serif text-[18px] leading-none text-primary mt-0.5">1</span>
                  <span className="font-serif text-[14px] leading-[1.6] text-foreground">
                    Select a SPOV from the left panel
                  </span>
                </li>
                <li className="flex items-start gap-3">
                  <span className="font-serif text-[18px] leading-none text-primary mt-0.5">2</span>
                  <span className="font-serif text-[14px] leading-[1.6] text-foreground">
                    Choose at least 1 DOK3 insight that supports it, and mark one as primary
                  </span>
                </li>
                <li className="flex items-start gap-3">
                  <span className="font-serif text-[18px] leading-none text-primary mt-0.5">3</span>
                  <span className="font-serif text-[14px] leading-[1.6] text-foreground">
                    Link them -- grading evaluates how well the SPOV builds on its foundation
                  </span>
                </li>
              </ul>
            </div>

            <TactileButton
              variant="raised"
              onClick={() => setShowIntro(false)}
              className="text-[13px]"
            >
              <span className="flex items-center gap-2">
                Begin Linking
                <ArrowRight size={14} />
              </span>
            </TactileButton>
          </motion.div>
        </div>
      )}

      {/* Main two-panel layout */}
      {!showIntro && (
      <div className="flex flex-1 min-h-0 relative">
        {/* Background texture */}
        <div
          aria-hidden="true"
          className="absolute inset-0 pointer-events-none z-0"
          style={{
            backgroundImage: `url(${linkingBg})`,
            backgroundSize: '60%',
            backgroundRepeat: 'no-repeat',
            backgroundPosition: 'center',
            opacity: 0.16,
            mixBlendMode: 'multiply',
          }}
        />

        {/* Left panel -- SPOV list (~35%) */}
        <div className="relative z-10 w-[35%] border-r border-border flex flex-col bg-sidebar/50">
          <div className="px-5 py-4 border-b border-border">
            <h3 className="text-[13px] uppercase tracking-[0.3em] font-bold text-muted-foreground m-0">
              DOK4 SPOVs
            </h3>
            <span className="text-[11px] uppercase tracking-[0.2em] text-muted-light mt-1 block">
              {allSpovs.filter(s => s.status === 'pending_linking').length} remaining
            </span>
          </div>

          <div className="flex-1 overflow-y-auto p-3 space-y-1 scrollbar-styled">
            <AnimatePresence mode="popLayout">
              {allSpovs.map(spov => (
                <SpovListItem
                  key={spov.id}
                  spov={spov}
                  isSelected={spov.id === selectedSpovId}
                  onClick={() => {
                    setSelectedSpovId(spov.id);
                    setSelectedDok3Ids(new Set());
                    setPrimaryDok3Id(null);
                    setLinkError(null);
                  }}
                  eventInfo={eventMap.get(spov.id)}
                />
              ))}
            </AnimatePresence>
          </div>

          {/* Skip and link later */}
          {allSpovs.some(s => s.status === 'pending_linking') && (
            <div className="px-5 py-3 border-t border-border">
              <button
                onClick={onComplete}
                className="w-full text-[11px] uppercase tracking-[0.25em] font-semibold text-muted-light bg-transparent border-0 cursor-pointer hover:text-muted-foreground transition-colors py-2"
              >
                Skip &amp; Link Later
              </button>
            </div>
          )}
        </div>

        {/* Right panel -- DOK3 insight picker (~65%) */}
        <div className="relative z-10 w-[65%] flex flex-col bg-card/50">
          {selectedSpov ? (
            <>
              {/* Selected SPOV header */}
              <div className="max-h-[40%] flex flex-col border-b border-border shrink-0">
                <div className="flex-1 overflow-y-auto overflow-x-hidden px-8 py-6 scrollbar-styled">
                  <span className="text-[11px] uppercase tracking-[0.2em] text-muted-light block mb-2">
                    Selected SPOV
                  </span>
                  <p className="font-serif text-[18px] leading-[1.6] text-foreground m-0 italic break-words">
                    &ldquo;{selectedSpov.text}&rdquo;
                  </p>
                </div>
                <div className="px-8 py-3 border-t border-border/50">
                  <span className="text-[13px] uppercase tracking-[0.3em] font-bold text-muted-foreground">
                    DOK3 Insights
                  </span>
                </div>
              </div>

              {/* DOK3 insight list */}
              <div className="flex-1 overflow-y-auto px-6 py-4 space-y-2 scrollbar-styled">
                <AnimatePresence initial={false}>
                  {availableDok3Insights.length > 0 ? (
                    availableDok3Insights.map((insight, index) => (
                      <DOK3InsightCard
                        key={insight.id}
                        insight={insight}
                        isSelected={selectedDok3Ids.has(insight.id)}
                        isPrimary={primaryDok3Id === insight.id}
                        onToggle={() => toggleDok3(insight.id)}
                        onSetPrimary={() => {
                          if (selectedDok3Ids.has(insight.id)) {
                            setPrimaryDok3Id(insight.id);
                          }
                        }}
                        index={index}
                      />
                    ))
                  ) : (
                    <div className="flex items-center justify-center h-32 text-muted-foreground text-sm italic">
                      No DOK3 insights available for linking.
                    </div>
                  )}
                </AnimatePresence>
              </div>

              {/* Validation + actions */}
              <div className="px-8 py-4 border-t border-border bg-sidebar/30">
                {linkError && (
                  <div className="flex items-center gap-2 text-[12px] text-destructive mb-3">
                    <AlertCircle size={14} />
                    {linkError}
                  </div>
                )}
                {selectedDok3Ids.size > 0 && !primaryDok3Id && (
                  <p className="text-[12px] text-warning m-0 mb-3 font-serif italic">
                    Click the star icon on one insight to designate it as primary.
                  </p>
                )}
                <div className="flex items-center justify-end">
                  <TactileButton
                    variant="raised"
                    onClick={handleLink}
                    disabled={!canLink || dok4Linking.isLinking}
                  >
                    {dok4Linking.isLinking ? (
                      <span className="flex items-center gap-2">
                        <Loader2 size={14} className="animate-spin" />
                        Linking...
                      </span>
                    ) : (
                      <span className="flex items-center gap-2">
                        Link SPOV
                        <ArrowRight size={14} />
                      </span>
                    )}
                  </TactileButton>
                </div>
              </div>
            </>
          ) : (
            <div className="flex-1 flex items-center justify-center text-center p-8">
              <div>
                <Archive size={32} className="text-muted-light opacity-40 mx-auto mb-4" />
                <p className="font-serif text-[14px] italic text-muted-foreground m-0">
                  {allResolved
                    ? 'All SPOVs have been resolved.'
                    : 'Select a SPOV from the left panel to begin linking.'}
                </p>
              </div>
            </div>
          )}
        </div>
      </div>
      )}
    </div>
  );
}

// ─── SPOV List Item ─────────────────────────────────────────────────────────

interface SpovListItemProps {
  spov: DOK4SpovWithLinks;
  isSelected: boolean;
  onClick: () => void;
  eventInfo?: { stage: string; message: string; score?: number };
}

function SpovListItem({ spov, isSelected, onClick, eventInfo }: SpovListItemProps) {
  const getStatusIndicator = () => {
    if (spov.status === 'graded' && spov.score !== null) {
      const colors = getScoreChipColors(spov.score);
      return (
        <span
          className="text-[13px] font-serif font-medium w-6 h-6 rounded-full flex items-center justify-center shrink-0"
          style={{ backgroundColor: colors.bg, color: colors.text }}
        >
          {spov.score}
        </span>
      );
    }
    if (spov.status === 'grading' || spov.status === 'linked') {
      return <Loader2 size={14} className="animate-spin text-primary shrink-0" />;
    }
    if (spov.status === 'rejected') {
      return <XIcon size={14} className="text-muted shrink-0" />;
    }
    if (spov.status === 'error') {
      return <AlertCircle size={14} className="text-destructive shrink-0" />;
    }
    // pending_linking
    return <span className="w-2.5 h-2.5 rounded-full bg-warning shrink-0" />;
  };

  return (
    <motion.button
      layout
      initial={{ opacity: 0, x: -10 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: -20, height: 0, marginBottom: 0 }}
      transition={{ duration: 0.2 }}
      onClick={onClick}
      className={`w-full text-left flex items-start gap-3 px-4 py-3 rounded-lg cursor-pointer border transition-all duration-200 ${
        isSelected
          ? 'bg-card-elevated shadow-card border-transparent'
          : 'bg-card border-border hover:shadow-card hover:border-transparent'
      }`}
    >
      <div className="mt-1">{getStatusIndicator()}</div>
      <div className="min-w-0 flex-1">
        <p className="font-serif text-[14px] leading-[1.6] text-foreground m-0 line-clamp-3 break-words">
          {spov.text}
        </p>
        {eventInfo && (spov.status === 'grading' || spov.status === 'linked') && (
          <span className="font-serif italic text-[10px] text-muted-light mt-1 block truncate">
            {eventInfo.message}
          </span>
        )}
      </div>
    </motion.button>
  );
}

// ─── DOK3 Insight Card ──────────────────────────────────────────────────────

interface DOK3InsightCardProps {
  insight: {
    id: number;
    text: string;
    score: number | null;
    status: string;
  };
  isSelected: boolean;
  isPrimary: boolean;
  onToggle: () => void;
  onSetPrimary: () => void;
  index: number;
}

function DOK3InsightCard({ insight, isSelected, isPrimary, onToggle, onSetPrimary, index }: DOK3InsightCardProps) {
  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -8 }}
      transition={{ duration: 0.15, delay: index * 0.02 }}
      className={`w-full rounded-lg border transition-all duration-200 ${
        isSelected
          ? isPrimary
            ? 'bg-primary/12 border-primary/40 shadow-card'
            : 'bg-primary/8 border-primary/25 shadow-card'
          : 'bg-card border-border hover:bg-sidebar/50'
      }`}
    >
      <button
        onClick={onToggle}
        className="w-full text-left flex items-start gap-3 px-4 py-3.5 bg-transparent border-0 cursor-pointer"
      >
        {/* Checkbox */}
        <div
          className={`w-5 h-5 rounded border-2 flex items-center justify-center shrink-0 mt-0.5 transition-colors ${
            isSelected
              ? 'bg-primary border-primary'
              : 'border-muted-foreground/30 bg-transparent'
          }`}
        >
          {isSelected && <Check size={12} className="text-primary-foreground" />}
        </div>

        {/* Insight text + score */}
        <div className="flex-1 min-w-0">
          <p className="font-serif text-[14px] leading-[1.6] text-foreground m-0 line-clamp-3 break-words">
            {insight.text}
          </p>
          <div className="flex items-center gap-2 mt-1">
            {insight.score !== null ? (
              <span
                className="text-[10px] font-semibold px-2 py-0.5 rounded-full"
                style={{
                  ...getScoreChipColors(insight.score),
                  backgroundColor: getScoreChipColors(insight.score).bg,
                  color: getScoreChipColors(insight.score).text,
                }}
              >
                Score: {insight.score}
              </span>
            ) : (
              <span className="text-[10px] text-muted-light italic">
                {insight.status === 'grading' ? 'Grading...' : 'Pending'}
              </span>
            )}
          </div>
        </div>

        {/* Primary designation */}
        {isSelected && (
          <button
            onClick={(e) => {
              e.stopPropagation();
              onSetPrimary();
            }}
            className={`shrink-0 w-7 h-7 rounded-full flex items-center justify-center transition-all border-0 cursor-pointer ${
              isPrimary
                ? 'bg-primary text-primary-foreground'
                : 'bg-muted/50 text-muted-foreground hover:bg-muted'
            }`}
            title={isPrimary ? 'Primary insight' : 'Set as primary'}
          >
            <span className="text-[11px] font-bold">P</span>
          </button>
        )}
      </button>
    </motion.div>
  );
}
