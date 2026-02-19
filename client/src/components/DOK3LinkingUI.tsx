import { useState, useMemo, useEffect, useCallback, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Check, Loader2, Archive, ArrowRight, AlertCircle, ChevronDown,
} from 'lucide-react';
import { tokens, getScoreChipColors } from '@/lib/colors';
import { useDOK3Insights, type DOK3InsightWithLinks } from '@/hooks/useDOK3Insights';
import { useDOK3GradingEvents } from '@/hooks/useDOK3GradingEvents';
import { useToast } from '@/hooks/use-toast';
import { type ImportState } from '@/hooks/useImportWithProgress';
import { STAGE_LABELS, type ImportStage } from '@shared/import-progress';
import { TactileButton } from '@/components/ui/tactile-button';

import linkingBg from '@/assets/textures/dok3_linking_3.webp';

// ─── Types ──────────────────────────────────────────────────────────────────────

interface DOK2SummaryForLinking {
  id: number;
  sourceName: string;
  sourceUrl: string | null;
  displayTitle: string | null;
  category: string;
  grade: number | null;
  points: { id: number; text: string; sortOrder: number }[];
}

interface DOK2CardItem extends DOK2SummaryForLinking {
  relevanceScore: number;
}

type SortMode = 'relevance' | 'order';

interface DOK3LinkingUIProps {
  slug: string;
  dok3Count: number;
  importState?: ImportState;
  onComplete: () => void;
}

// ─── Constants ──────────────────────────────────────────────────────────────────



// ─── Helpers ────────────────────────────────────────────────────────────────────

function normalizeSourceKey(sourceUrl: string | null, sourceName: string): string {
  if (sourceUrl) return sourceUrl.toLowerCase().replace(/\/+$/, '');
  return sourceName.toLowerCase().trim();
}

function getBackgroundStageLabel(stage: ImportStage | null): string {
  if (!stage) return '';
  if (stage === 'complete') return 'Import complete';
  if (stage === 'error') return 'Import error';
  return STAGE_LABELS[stage] || '';
}

/** Renders text with markdown links [label](url) and bare URLs converted to <a> tags */
function RichInsightText({ text, className }: { text: string; className?: string }) {
  // Match markdown links [text](url) or bare URLs
  const pattern = /\[([^\]]*)\]\((https?:\/\/[^\s)]+)\)|(https?:\/\/[^\s)\]]+)/g;
  const parts: React.ReactNode[] = [];
  let lastIndex = 0;
  let match: RegExpExecArray | null;

  while ((match = pattern.exec(text)) !== null) {
    // Text before this match
    if (match.index > lastIndex) {
      parts.push(text.slice(lastIndex, match.index));
    }

    const url = match[2] || match[3];
    const label = match[1]?.trim() || new URL(url).hostname.replace(/^www\./, '');

    parts.push(
      <a
        key={match.index}
        href={url}
        target="_blank"
        rel="noopener noreferrer"
        className="text-primary hover:text-primary/80 underline underline-offset-2"
        onClick={e => e.stopPropagation()}
      >
        {label || 'link'}
      </a>
    );
    lastIndex = match.index + match[0].length;
  }

  if (lastIndex < text.length) {
    parts.push(text.slice(lastIndex));
  }

  return <span className={className}>{parts}</span>;
}

// ─── Component ──────────────────────────────────────────────────────────────────

export function DOK3LinkingUI({ slug, dok3Count, importState, onComplete }: DOK3LinkingUIProps) {
  const { toast } = useToast();
  const dok3 = useDOK3Insights(slug);
  const [selectedInsightId, setSelectedInsightId] = useState<number | null>(null);
  const [selectedDok2Ids, setSelectedDok2Ids] = useState<Set<number>>(new Set());
  const [sortMode, setSortMode] = useState<SortMode>('relevance');
  const [linkError, setLinkError] = useState<string | null>(null);
  const [showIntro, setShowIntro] = useState(true);
  const successTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Fetch DOK2 summaries from the brainlift data endpoint
  const [dok2Summaries, setDok2Summaries] = useState<DOK2SummaryForLinking[]>([]);
  useEffect(() => {
    fetch(`/api/brainlifts/${slug}`)
      .then(r => r.ok ? r.json() : null)
      .then((data: { dok2Summaries?: DOK2SummaryForLinking[] } | null) => {
        if (data?.dok2Summaries) setDok2Summaries(data.dok2Summaries);
      })
      .catch(() => {});
  }, [slug]);

  // Include all insights (including scratchpadded) for the linking flow
  const allInsights = dok3.insights;

  // Grading events for real-time updates
  const hasGradingActivity = allInsights.some(i => i.status === 'grading' || i.status === 'linked');
  const gradingEvents = useDOK3GradingEvents(slug, hasGradingActivity);

  // Build event map: insightId → latest event
  const eventMap = useMemo(() => {
    const map = new Map<number, { stage: string; message: string; score?: number }>();
    for (const e of gradingEvents.events) {
      map.set(e.insightId, { stage: e.type, message: e.message, score: e.score });
    }
    return map;
  }, [gradingEvents.events]);

  // Auto-select first unresolved insight on mount
  useEffect(() => {
    if (selectedInsightId === null && allInsights.length > 0) {
      const first = allInsights.find(i => i.status === 'pending_linking');
      if (first) setSelectedInsightId(first.id);
    }
  }, [allInsights, selectedInsightId]);

  // Auto-advance to next unresolved after link/scratchpad
  const advanceToNext = useCallback((skipId?: number) => {
    const next = allInsights.find(i => i.status === 'pending_linking' && i.id !== skipId);
    setSelectedInsightId(next?.id ?? null);
    setSelectedDok2Ids(new Set());
    setLinkError(null);
  }, [allInsights]);

  // Track all-resolved state
  const allResolved = allInsights.length > 0 && allInsights.every(
    i => i.status !== 'pending_linking'
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

  const selectedInsight = allInsights.find(i => i.id === selectedInsightId) ?? null;

  // Flat DOK2 card list with relevance scores
  const sortedDok2Cards = useMemo((): DOK2CardItem[] => {
    const cards: DOK2CardItem[] = dok2Summaries.map(s => {
      let relevanceScore = 0.5;
      if (selectedInsight?.sourceRankings) {
        const ranking = Object.entries(selectedInsight.sourceRankings)
          .find(([name]) => name.toLowerCase().trim() === s.sourceName.toLowerCase().trim());
        if (ranking) relevanceScore = ranking[1];
      }
      return { ...s, relevanceScore };
    });

    if (sortMode === 'relevance') {
      cards.sort((a, b) => b.relevanceScore - a.relevanceScore);
    }
    return cards;
  }, [dok2Summaries, selectedInsight, sortMode]);


  // Validation: ≥2 unique sources selected
  const selectedSourceCount = useMemo(() => {
    const sources = new Set<string>();
    Array.from(selectedDok2Ids).forEach(id => {
      const s = dok2Summaries.find(d => d.id === id);
      if (s) sources.add(normalizeSourceKey(s.sourceUrl, s.sourceName));
    });
    return sources.size;
  }, [selectedDok2Ids, dok2Summaries]);

  const canLink = selectedDok2Ids.size >= 2 && selectedSourceCount >= 2;

  // Toggle individual DOK2
  const toggleDok2 = (id: number) => {
    setSelectedDok2Ids(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  // Link action
  const handleLink = async () => {
    if (!selectedInsight || !canLink) return;
    setLinkError(null);

    try {
      await dok3.link({
        insightId: selectedInsight.id,
        dok2SummaryIds: Array.from(selectedDok2Ids),
      });
      advanceToNext(selectedInsight.id);
    } catch (err: any) {
      setLinkError(err.message || 'Failed to link insight');
    }
  };

  // Scratchpad action
  const handleScratchpad = async () => {
    if (!selectedInsight) return;
    const insightId = selectedInsight.id;

    try {
      await dok3.scratchpad(insightId);
      advanceToNext(insightId);

      toast({
        title: 'Sent to Scratchpad',
        description: 'Insight moved to scratchpad.',
        action: (
          <button
            onClick={async () => {
              await dok3.unscratchpad(insightId);
              setSelectedInsightId(insightId);
              setSelectedDok2Ids(new Set());
            }}
            className="text-[11px] uppercase tracking-[0.2em] font-semibold text-primary bg-transparent border-0 cursor-pointer hover:text-foreground transition-colors"
          >
            Undo
          </button>
        ),
      });
    } catch (err: any) {
      console.error('Failed to scratchpad:', err);
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
                {importState.gradingProgress && importState.currentStage === 'grading' && (
                  <span className="ml-2 text-foreground tabular-nums">
                    {importState.gradingProgress.completed}/{importState.gradingProgress.total}
                  </span>
                )}
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
              <h3 className="font-serif text-[24px] text-foreground m-0 mb-2">All Insights Resolved</h3>
              <p className="text-[14px] text-muted-foreground m-0">
                {importComplete ? 'Redirecting to Insights tab...' : 'Waiting for import to finish...'}
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
              Before You Begin
            </span>

            <h2 className="font-serif text-[28px] leading-[1.3] text-foreground m-0 mb-6">
              Your insights need roots.
            </h2>

            <div className="space-y-4 mb-8">
              <p className="font-serif text-[15px] leading-[1.7] text-muted-foreground m-0">
                A DOK3 insight is a <span className="text-foreground italic">principle</span> that
                connects ideas across multiple sources. Without that connection, it's just a claim.
              </p>
              <p className="font-serif text-[15px] leading-[1.7] text-muted-foreground m-0">
                In this step, you'll link each insight to the DOK2 summaries it draws from.
                This is what makes the insight <span className="text-foreground italic">traceable</span> —
                grounded in evidence rather than assertion.
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
                    Select an insight from the left panel
                  </span>
                </li>
                <li className="flex items-start gap-3">
                  <span className="font-serif text-[18px] leading-none text-primary mt-0.5">2</span>
                  <span className="font-serif text-[14px] leading-[1.6] text-foreground">
                    Choose at least 2 DOK2 summaries from 2+ different sources that support it
                  </span>
                </li>
                <li className="flex items-start gap-3">
                  <span className="font-serif text-[18px] leading-none text-primary mt-0.5">3</span>
                  <span className="font-serif text-[14px] leading-[1.6] text-foreground">
                    Link them — the grader uses these connections to evaluate schema quality
                  </span>
                </li>
              </ul>
            </div>

            <p className="font-serif italic text-[13px] leading-[1.6] text-muted-light m-0 mb-8">
              Non-linked insights won't be graded. If an insight isn't ready or lacks
              good connections, send it to the scratchpad — you can refine and link it later.
            </p>

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

        {/* Left panel — DOK3 insight list (~35%) */}
        <div className="relative z-10 w-[35%] border-r border-border flex flex-col bg-sidebar/50">
          <div className="px-5 py-4 border-b border-border">
            <h3 className="text-[13px] uppercase tracking-[0.3em] font-bold text-muted-foreground m-0">
              DOK3 Insights
            </h3>
            <span className="text-[11px] uppercase tracking-[0.2em] text-muted-light mt-1 block">
              {allInsights.filter(i => i.status === 'pending_linking').length} remaining
            </span>
          </div>

          <div className="flex-1 overflow-y-auto p-3 space-y-1 scrollbar-styled">
            <AnimatePresence mode="popLayout">
              {allInsights.map(insight => (
                <InsightListItem
                  key={insight.id}
                  insight={insight}
                  isSelected={insight.id === selectedInsightId}
                  onClick={() => {
                    setSelectedInsightId(insight.id);
                    setSelectedDok2Ids(new Set());
                    setLinkError(null);
                  }}
                  eventInfo={eventMap.get(insight.id)}
                />
              ))}
            </AnimatePresence>
          </div>

          {/* Skip and link later */}
          {allInsights.some(i => i.status === 'pending_linking') && (
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

        {/* Right panel — DOK2 card picker (~65%) */}
        <div className="relative z-10 w-[65%] flex flex-col bg-card/50">
          {selectedInsight ? (
            <>
              {/* Selected insight header */}
              <div className="max-h-[40%] flex flex-col border-b border-border shrink-0">
                <div className="flex-1 overflow-y-auto overflow-x-hidden px-8 py-6 scrollbar-styled">
                  <span className="text-[11px] uppercase tracking-[0.2em] text-muted-light block mb-2">
                    Selected Insight
                  </span>
                  <p className="font-serif text-[18px] leading-[1.6] text-foreground m-0 italic break-words">
                    &ldquo;<RichInsightText text={selectedInsight.text} />&rdquo;
                  </p>
                </div>
                <div className="flex items-center justify-between px-8 py-3 border-t border-border/50">
                  <span className="text-[13px] uppercase tracking-[0.3em] font-bold text-muted-foreground">
                    Evidence Pool
                  </span>
                  <button
                    onClick={() => setSortMode(prev => prev === 'relevance' ? 'order' : 'relevance')}
                    className="text-[11px] uppercase tracking-[0.25em] text-muted-light font-semibold bg-transparent border-0 cursor-pointer hover:text-muted-foreground transition-colors"
                  >
                    Sort: {sortMode === 'relevance' ? 'Relevance' : 'Brainlift Order'}
                  </button>
                </div>
              </div>

              {/* DOK2 card list */}
              <div className="flex-1 overflow-y-auto px-6 py-4 space-y-2 scrollbar-styled">
                <AnimatePresence initial={false}>
                  {sortedDok2Cards.map((card, index) => (
                    <DOK2Card
                      key={card.id}
                      card={card}
                      isSelected={selectedDok2Ids.has(card.id)}
                      onToggle={() => toggleDok2(card.id)}
                      showRelevance={sortMode === 'relevance'}

                      index={index}
                    />
                  ))}
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
                {selectedDok2Ids.size > 0 && selectedSourceCount < 2 && (
                  <p className="text-[12px] text-warning m-0 mb-3 font-serif italic">
                    Select DOK2 summaries from at least 2 different sources.
                  </p>
                )}
                <div className="flex items-center justify-between gap-3">
                  <button
                    onClick={handleScratchpad}
                    disabled={dok3.isScratchpadding}
                    className="text-[11px] uppercase tracking-[0.25em] font-semibold text-muted-light bg-transparent border-0 cursor-pointer hover:text-warning transition-colors disabled:opacity-50"
                  >
                    {dok3.isScratchpadding ? 'Moving...' : 'Send to Scratchpad'}
                  </button>
                  <TactileButton
                    variant="raised"
                    onClick={handleLink}
                    disabled={!canLink || dok3.isLinking}
                  >
                    {dok3.isLinking ? (
                      <span className="flex items-center gap-2">
                        <Loader2 size={14} className="animate-spin" />
                        Linking...
                      </span>
                    ) : (
                      <span className="flex items-center gap-2">
                        Link Insight
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
                    ? 'All insights have been resolved.'
                    : 'Select an insight from the left panel to begin linking.'}
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

// ─── Insight List Item ──────────────────────────────────────────────────────────

interface InsightListItemProps {
  insight: DOK3InsightWithLinks;
  isSelected: boolean;
  onClick: () => void;
  eventInfo?: { stage: string; message: string; score?: number };
}

function InsightListItem({ insight, isSelected, onClick, eventInfo }: InsightListItemProps) {
  const getStatusIndicator = () => {
    if (insight.status === 'graded' && insight.score !== null) {
      const colors = getScoreChipColors(insight.score);
      return (
        <span
          className="text-[13px] font-serif font-medium w-6 h-6 rounded-full flex items-center justify-center shrink-0"
          style={{ backgroundColor: colors.bg, color: colors.text }}
        >
          {insight.score}
        </span>
      );
    }
    if (insight.status === 'grading' || insight.status === 'linked') {
      return <Loader2 size={14} className="animate-spin text-primary shrink-0" />;
    }
    if (insight.status === 'scratchpadded') {
      return <span className="w-2.5 h-2.5 rounded-full bg-muted shrink-0" />;
    }
    if (insight.status === 'error') {
      return <AlertCircle size={14} className="text-destructive shrink-0" />;
    }
    // pending_linking
    return <span className="w-2.5 h-2.5 rounded-full bg-warning shrink-0" />;
  };

  const isScratchpadded = insight.status === 'scratchpadded';

  return (
    <motion.button
      layout
      initial={{ opacity: 0, x: -10 }}
      animate={{ opacity: isScratchpadded ? 0.5 : 1, x: 0 }}
      exit={{ opacity: 0, x: -20, height: 0, marginBottom: 0 }}
      transition={{ duration: 0.2 }}
      onClick={onClick}
      className={`w-full text-left flex items-start gap-3 px-4 py-3 rounded-lg cursor-pointer border transition-all duration-200 ${
        isSelected
          ? 'bg-card-elevated shadow-card border-transparent'
          : 'bg-card border-border hover:shadow-card hover:border-transparent'
      } ${isScratchpadded ? 'line-through opacity-50' : ''}`}
    >
      <div className="mt-1">{getStatusIndicator()}</div>
      <div className="min-w-0 flex-1">
        <p className="font-serif text-[14px] leading-[1.6] text-foreground m-0 line-clamp-3 break-words">
          <RichInsightText text={insight.text} />
        </p>
        {eventInfo && (insight.status === 'grading' || insight.status === 'linked') && (
          <span className="font-serif italic text-[10px] text-muted-light mt-1 block truncate">
            {eventInfo.message}
          </span>
        )}
      </div>
    </motion.button>
  );
}

// ─── DOK2 Card ──────────────────────────────────────────────────────────────────

interface DOK2CardProps {
  card: DOK2CardItem;
  isSelected: boolean;
  onToggle: () => void;
  showRelevance: boolean;
  index: number;
}

function DOK2Card({ card, isSelected, onToggle, showRelevance, index }: DOK2CardProps) {
  const [expanded, setExpanded] = useState(false);
  const relevancePct = Math.round(card.relevanceScore * 100);

  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -8 }}
      transition={{ duration: 0.15, delay: index * 0.02 }}
      className={`w-full rounded-lg border transition-all duration-200 ${
        isSelected
          ? 'bg-primary/8 border-primary/25 shadow-card'
          : 'bg-card border-border hover:bg-sidebar/50'
      }`}
    >
      {/* Main row — clickable for selection */}
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

        {/* Title + Category */}
        <div className="flex-1 min-w-0">
          <p className={`font-serif text-[16px] font-semibold leading-snug text-foreground m-0 ${expanded ? '' : 'line-clamp-2'}`}>
            {card.displayTitle || card.sourceName}
          </p>
          <span className="text-[10px] uppercase tracking-[0.15em] text-muted-light font-semibold mt-1 block">
            {card.category}
          </span>
        </div>

        {/* Relevance % */}
        {showRelevance && (
          <span
            className="text-[10px] uppercase tracking-[0.2em] font-semibold rounded-full px-2.5 py-1 shrink-0 mt-0.5"
            style={{
              backgroundColor: relevancePct >= 70
                ? tokens.successSoft
                : relevancePct >= 40
                  ? tokens.warningSoft
                  : tokens.dangerSoft,
              color: relevancePct >= 70
                ? tokens.success
                : relevancePct >= 40
                  ? tokens.warning
                  : tokens.danger,
            }}
          >
            {relevancePct}%
          </span>
        )}
      </button>

      {/* Expand toggle */}
      <button
        onClick={(e) => { e.stopPropagation(); setExpanded(v => !v); }}
        className="w-full flex items-center justify-center gap-1.5 py-1.5 bg-transparent border-0 border-t border-border cursor-pointer text-muted-light hover:text-muted-foreground transition-colors"
      >
        <span className="text-[9px] uppercase tracking-[0.25em] font-semibold">
          {expanded ? 'Collapse' : 'View Full Text'}
        </span>
        <ChevronDown
          size={12}
          className={`transition-transform duration-200 ${expanded ? 'rotate-180' : ''}`}
        />
      </button>

      {/* Expanded content */}
      <AnimatePresence initial={false}>
        {expanded && (
          <motion.div
            initial={{ height: 0 }}
            animate={{ height: 'auto' }}
            exit={{ height: 0 }}
            transition={{ duration: 0.2 }}
            className="overflow-hidden"
          >
            <div className="px-5 py-4 border-t border-border space-y-2">
              {card.points.length > 0 ? (
                card.points
                  .sort((a, b) => a.sortOrder - b.sortOrder)
                  .map(pt => (
                    <p key={pt.id} className="font-serif text-[14px] leading-[1.7] text-foreground m-0">
                      {pt.text}
                    </p>
                  ))
              ) : (
                <p className="font-serif text-[14px] leading-[1.7] text-muted-foreground m-0 italic">
                  No content available.
                </p>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}
