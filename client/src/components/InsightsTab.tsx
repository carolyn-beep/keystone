import { useState, useMemo } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { Lightbulb, RefreshCw, Loader2, ChevronDown, ChevronUp, Info, Link2 } from 'lucide-react';
import { PiFootprintsFill } from 'react-icons/pi';
import { IoLinkSharp } from 'react-icons/io5';
import type { DOK3InsightWithLinks } from '@/hooks/useDOK3Insights';
import type { DOK3GradingSSEEvent } from '@/hooks/useDOK3GradingEvents';
import { tokens, getScoreChipColors } from '@/lib/colors';
import { TactileButton } from '@/components/ui/tactile-button';

// ─── Criteria Metadata ─────────────────────────────────────────────────────────

interface CriterionMeta {
  key: string;
  name: string;
  description: string;
}

interface AxisMeta {
  id: string;
  label: string;
  question: string;
  criteria: CriterionMeta[];
}

const CRITERIA_AXES: AxisMeta[] = [
  {
    id: 'V',
    label: 'Framework Visibility',
    question: 'Can you see the framework?',
    criteria: [
      { key: 'V1', name: 'Framework Identifiability', description: 'Can the evaluator identify and name the conceptual framework this insight implies?' },
      { key: 'V2', name: 'Originality vs. Sources', description: 'Is the framework distinguishable from those the student\'s sources already use?' },
      { key: 'V3', name: 'Domain Specificity', description: 'Is the framework specific to the student\'s domain and BrainLift purpose?' },
    ],
  },
  {
    id: 'C',
    label: 'Framework Coherence',
    question: 'Does the evidence support it?',
    criteria: [
      { key: 'C1', name: 'Evidence Traceability', description: 'Do the linked DOK2 summaries logically support the insight?' },
      { key: 'C2', name: 'Internal Consistency', description: 'Does the insight avoid contradicting the student\'s own DOK1 facts?' },
    ],
  },
  {
    id: 'P',
    label: 'Framework Productivity',
    question: 'Does it generate meaning?',
    criteria: [
      { key: 'P1', name: 'Explanatory Power', description: 'Does the insight add meaning beyond what individual sources provide alone?' },
      { key: 'P2', name: 'Purpose Integration', description: 'Does the insight connect to and advance the BrainLift\'s broader purpose?' },
    ],
  },
];


// ─── DOK2 Summary Shape (minimal, from Dashboard) ──────────────────────────────

interface DOK2SummaryRef {
  id: number;
  sourceName: string;
  sourceUrl: string | null;
  displayTitle: string | null;
  category: string;
  grade: number | null;
}

// ─── Component Props ────────────────────────────────────────────────────────────

interface InsightsTabProps {
  insights: DOK3InsightWithLinks[];
  isLoading: boolean;
  meanScore: number | null;
  totalCount: number;
  highQualityCount: number;
  needsWorkCount: number;
  gradingInsights: DOK3InsightWithLinks[];
  errorInsights: DOK3InsightWithLinks[];
  gradeAll: () => Promise<{ queued: number }>;
  isGrading: boolean;
  setActiveTab: (tab: string) => void;
  latestEvent: DOK3GradingSSEEvent | null;
  dok2Summaries: DOK2SummaryRef[];
  onLinkNow?: () => void;
}

function getGradeLabel(score: number | null): string {
  if (score === null) return 'Ungraded';
  if (score === 5) return 'Excellent';
  if (score === 4) return 'Strong';
  if (score === 3) return 'Adequate';
  if (score === 2) return 'Weak';
  return 'Failed';
}

function getAssessmentColor(assessment: string): { bg: string; text: string } {
  const lower = assessment.toLowerCase();
  if (lower === 'strong' || lower === 'excellent') return { bg: tokens.successSoft, text: tokens.success };
  if (lower === 'partial' || lower === 'adequate') return { bg: tokens.warningSoft, text: tokens.warning };
  return { bg: tokens.dangerSoft, text: tokens.danger };
}

type SortMode = 'score' | 'status';

export function InsightsTab({
  insights,
  isLoading,
  meanScore,
  totalCount,
  highQualityCount,
  needsWorkCount,
  gradingInsights,
  errorInsights,
  gradeAll,
  isGrading,
  setActiveTab,
  latestEvent,
  dok2Summaries,
  onLinkNow,
}: InsightsTabProps) {
  const [expandedIds, setExpandedIds] = useState<Record<number, boolean>>({});
  const [sortMode, setSortMode] = useState<SortMode>('score');

  // Build DOK2 lookup map
  const dok2Map = useMemo(() => {
    const map = new Map<number, DOK2SummaryRef>();
    for (const s of dok2Summaries) map.set(s.id, s);
    return map;
  }, [dok2Summaries]);

  const toggleExpanded = (id: number) => {
    setExpandedIds(prev => ({ ...prev, [id]: !prev[id] }));
  };

  // Separate pending_linking insights (shown as banner, not cards)
  const pendingLinkingCount = useMemo(
    () => insights.filter(i => i.status === 'pending_linking').length,
    [insights],
  );

  // Sort non-pending insights: graded (score desc) → grading → linked → error
  const sortedInsights = useMemo(() => {
    const displayable = insights.filter(i => i.status !== 'pending_linking');
    if (sortMode === 'status') {
      const statusOrder: Record<string, number> = {
        graded: 0, grading: 1, linked: 2, error: 3,
      };
      return [...displayable].sort((a, b) => {
        return (statusOrder[a.status] ?? 99) - (statusOrder[b.status] ?? 99);
      });
    }
    return [...displayable].sort((a, b) => {
      if (a.status === 'graded' && b.status === 'graded') {
        return (b.score ?? 0) - (a.score ?? 0);
      }
      if (a.status === 'graded') return -1;
      if (b.status === 'graded') return 1;
      const statusOrder: Record<string, number> = {
        grading: 0, linked: 1, error: 2,
      };
      return (statusOrder[a.status] ?? 99) - (statusOrder[b.status] ?? 99);
    });
  }, [insights, sortMode]);

  const handleRetryOne = async () => {
    await gradeAll();
  };

  if (isLoading) {
    return (
      <div className="max-w-[1200px] mx-auto p-12 text-center text-muted-foreground">
        Loading insights...
      </div>
    );
  }

  // Empty state
  if (insights.length === 0) {
    return (
      <div className="max-w-[1200px] mx-auto">
        <div className="flex flex-col gap-4 mb-6 pb-4">
          <h2 className="text-[30px] font-bold text-foreground tracking-tight leading-[1.1] m-0">
            DOK3 Insights
          </h2>
          <p className="text-[15px] text-muted-light m-0 max-w-2xl font-serif italic">
            Your original analytical claims that synthesize multiple sources.
          </p>
        </div>

        <div className="bg-card-elevated rounded-xl shadow-card py-20 px-12">
          <div className="flex flex-col items-center text-center">
            <Lightbulb size={40} className="text-muted-light opacity-40 mb-8" />
            <h3 className="font-serif text-[24px] text-foreground m-0 mb-4">
              No Insights Yet
            </h3>
            <p className="text-[14px] text-muted-light m-0 max-w-md leading-relaxed">
              DOK3 insights are original analytical claims that synthesize across multiple DOK2 sources.
              They will appear here once your BrainLift includes DOK3 content and they are linked to supporting evidence.
            </p>
          </div>
        </div>
      </div>
    );
  }

  const getMeanScoreColor = (score: number) => {
    if (score >= 4.5) return tokens.success;
    if (score >= 3.5) return tokens.info;
    if (score >= 1.5) return tokens.warning;
    if (score > 0) return tokens.danger;
    return tokens.textMuted;
  };

  return (
    <div className="max-w-[1200px] mx-auto">
      {/* Page Header */}
      <div className="flex flex-col gap-4 mb-6 pb-4">
        <div className="flex items-start justify-between gap-6">
          <div>
            <h2 className="text-[30px] font-bold text-foreground tracking-tight leading-[1.1] m-0">
              DOK3 Insights
            </h2>
          </div>
        </div>
        <p className="text-[15px] text-muted-light m-0 max-w-2xl font-serif italic">
          Your original analytical claims that synthesize multiple sources. Grades reflect depth, traceability, and multi-source integration.
        </p>
      </div>

      {/* Stats Cards */}
      <div className="flex justify-between mb-16">
        {[
          { label: ['TOTAL', 'INSIGHTS'], value: totalCount, color: tokens.primary },
          { label: ['MEAN', 'GRADE'], value: meanScore !== null ? meanScore.toFixed(2) : '—', color: meanScore !== null ? getMeanScoreColor(meanScore) : tokens.textMuted },
          { label: ['HIGH', 'QUALITY'], value: highQualityCount, color: tokens.success },
          { label: ['NEEDS', 'WORK'], value: needsWorkCount, color: needsWorkCount > 0 ? tokens.warning : tokens.textMuted },
        ].map((stat, i) => (
          <div
            key={i}
            className="w-[160px] py-6 px-5 bg-card-elevated rounded-lg shadow-card flex flex-col animate-fade-slide-in"
            style={{ animationDelay: `${i * 80}ms`, animationFillMode: 'backwards' }}
          >
            <div className="font-serif text-[54px] leading-none font-normal tracking-wide" style={{ color: stat.color }}>
              {stat.value}
            </div>
            <div className="mt-5 text-[13px] text-muted-foreground font-semibold tracking-[0.35em] leading-relaxed">
              {stat.label[0]}
              {stat.label[1] && <br />}
              {stat.label[1]}
            </div>
          </div>
        ))}
      </div>

      {/* Pending Linking Banner */}
      {pendingLinkingCount > 0 && onLinkNow && (
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.35 }}
          className="bg-card-elevated rounded-xl shadow-card overflow-hidden mb-16"
        >
          <div className="py-14 px-12">
            <div className="flex flex-col items-center text-center">
              <div className="w-16 h-16 rounded-full flex items-center justify-center border border-border mb-8">
                <Link2 size={28} className="text-muted-foreground" />
              </div>

              <h3 className="font-serif text-[28px] text-foreground m-0 mb-3">
                {pendingLinkingCount} Insight{pendingLinkingCount !== 1 ? 's' : ''} Awaiting Linking
              </h3>
              <p className="text-sm text-muted-foreground max-w-md mb-10 leading-relaxed">
                These insights need to be linked to their supporting DOK2 sources before they can be properly graded.
                Each insight requires evidence from at least two different sources.
              </p>

              <TactileButton
                variant="raised"
                onClick={onLinkNow}
                className="flex items-center gap-3 px-8 py-4 text-[14px]"
              >
                <Link2 size={18} />
                Link Insights
              </TactileButton>
            </div>
          </div>
        </motion.div>
      )}

      {/* Section Header + Actions + Cards (hidden when only pending_linking insights remain) */}
      {sortedInsights.length > 0 && (
        <>
          <div className="flex items-baseline justify-between animate-fade-slide-in" style={{ animationDelay: '400ms', animationFillMode: 'backwards' }}>
            <h3 className="text-[24px] font-semibold text-foreground m-0">
              Active Insights
            </h3>
            <div className="flex items-center gap-6">
              {errorInsights.length > 0 && (
                <button
                  onClick={() => gradeAll()}
                  disabled={isGrading}
                  className="flex items-center gap-2 text-[10px] uppercase tracking-[0.35em] text-warning font-semibold bg-transparent border-0 p-0 cursor-pointer hover:text-foreground transition-colors duration-200 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {isGrading ? <Loader2 size={14} className="animate-spin" /> : <RefreshCw size={14} />}
                  Retry {errorInsights.length} Failed
                </button>
              )}
              <button
                onClick={() => setSortMode(prev => prev === 'score' ? 'status' : 'score')}
                className="flex items-center gap-2 text-[10px] uppercase tracking-[0.35em] text-muted-light font-semibold bg-transparent border-0 p-0 cursor-pointer hover:text-muted-foreground transition-colors duration-200"
              >
                {sortMode === 'score' ? 'By Score' : 'By Status'}
              </button>
            </div>
          </div>
          <hr className="border-t border-border mt-4 mb-12" />

          {/* Real-time grading indicator */}
          {gradingInsights.length > 0 && latestEvent && (
            <div className="bg-primary/5 border border-border rounded-xl p-4 mb-8 flex items-center gap-3">
              <Loader2 size={16} className="animate-spin text-primary" />
              <span className="text-[13px] text-muted-foreground">{latestEvent.message}</span>
            </div>
          )}

          {/* Insight Cards */}
          <div className="flex flex-col gap-16">
            {sortedInsights.map((insight, index) => (
              <InsightCard
                key={insight.id}
                insight={insight}
                expanded={expandedIds[insight.id] ?? false}
                onToggle={() => toggleExpanded(insight.id)}
                onRetry={() => handleRetryOne()}
                setActiveTab={setActiveTab}
                animationDelay={(index + 6) * 80}
                dok2Map={dok2Map}
              />
            ))}
          </div>
        </>
      )}
    </div>
  );
}

// ─── Insight Card ──────────────────────────────────────────────────────────────

interface InsightCardProps {
  insight: DOK3InsightWithLinks;
  expanded: boolean;
  onToggle: () => void;
  onRetry: () => void;
  setActiveTab: (tab: string) => void;
  animationDelay: number;
  dok2Map: Map<number, DOK2SummaryRef>;
}

function InsightCard({ insight, expanded, onToggle, onRetry, setActiveTab, animationDelay, dok2Map }: InsightCardProps) {
  const gradeColors = insight.score !== null ? getScoreChipColors(insight.score) : null;
  const gradeLabel = getGradeLabel(insight.score);
  const hasCriteria = insight.criteriaBreakdown && Object.keys(insight.criteriaBreakdown).length > 0;

  const navigateToSummary = (summaryId: number) => {
    setActiveTab('summaries');
    setTimeout(() => {
      const el = document.getElementById(`dok2-summary-${summaryId}`);
      if (el) {
        el.scrollIntoView({ behavior: 'smooth', block: 'center' });
        el.classList.add('ring-2', 'ring-primary', 'ring-offset-2');
        setTimeout(() => {
          el.classList.remove('ring-2', 'ring-primary', 'ring-offset-2');
        }, 2000);
      }
    }, 150);
  };

  // Resolve linked DOK2 summaries
  const linkedSummaries = insight.linkedDok2SummaryIds
    .map(id => dok2Map.get(id))
    .filter((s): s is DOK2SummaryRef => s !== undefined);

  return (
    <div
      className="animate-fade-slide-in"
      style={{ animationDelay: `${animationDelay}ms`, animationFillMode: 'backwards' }}
    >
      <div className="bg-card-elevated rounded-xl shadow-card overflow-hidden">
        {/* Header: Score + Text + Meta */}
        <div className="flex gap-8 px-10 py-12">
          {/* Score Circle */}
          <div className="flex flex-col items-center gap-3 shrink-0">
            <div
              className="flex items-center justify-center w-14 h-14 rounded-full font-serif text-[28px] font-normal"
              style={{
                backgroundColor: 'transparent',
                color: gradeColors ? gradeColors.text : tokens.textMuted,
                border: `1px solid ${tokens.border}`,
              }}
            >
              {insight.score !== null ? insight.score : '—'}
            </div>
            <span
              className="text-[9px] uppercase tracking-[0.25em]"
              style={{ color: gradeColors ? gradeColors.text : tokens.textMuted }}
            >
              {gradeLabel}
            </span>
          </div>

          {/* Title & Meta */}
          <div className="flex flex-col gap-4 flex-1 min-w-0">
            <p className="font-serif text-[18px] leading-[1.6] text-foreground m-0">
              {insight.text}
            </p>

            {/* Meta row */}
            <div className="flex items-center gap-4 flex-wrap">
              {insight.frameworkName && (
                <span className="text-[11px] uppercase tracking-[0.2em] text-muted-foreground font-semibold">
                  {insight.frameworkName}
                </span>
              )}
              {linkedSummaries.length > 0 && (
                <>
                  {insight.frameworkName && <span className="text-muted-light">·</span>}
                  <span className="text-[11px] text-muted-foreground">
                    {linkedSummaries.length} linked source{linkedSummaries.length !== 1 ? 's' : ''}
                  </span>
                </>
              )}
              {insight.status === 'error' && (
                <button
                  onClick={(e) => { e.stopPropagation(); onRetry(); }}
                  className="flex items-center gap-1.5 text-[10px] uppercase tracking-[0.2em] text-warning font-semibold bg-transparent border-0 p-0 cursor-pointer hover:text-foreground transition-colors"
                >
                  <RefreshCw size={12} />
                  Retry
                </button>
              )}
            </div>

            {/* Traceability flag */}
            {insight.traceabilityFlagged && (
              <div className="group relative inline-flex items-center gap-2 text-[9px] uppercase tracking-[0.35em] font-semibold text-warning">
                <PiFootprintsFill size={14} className="opacity-50" />
                Traceability flagged{insight.traceabilityFlaggedSource ? `: ${insight.traceabilityFlaggedSource}` : ''}
                <Info size={11} className="opacity-50 group-hover:opacity-100 transition-opacity" />
                <div className="absolute bottom-full left-0 mb-2 w-72 px-4 py-3 bg-foreground text-background text-[12px] leading-[1.5] rounded-lg shadow-lg opacity-0 pointer-events-none group-hover:opacity-100 group-hover:pointer-events-auto transition-opacity duration-200 z-10 normal-case tracking-normal font-normal">
                  This insight appears traceable to a single source. A DOK3 insight should be source-transcendent — a pattern visible only when holding multiple sources in mind simultaneously. If one source already states or directly implies it, it may be DOK2 miscategorized as DOK3.
                  <div className="absolute top-full left-6 border-4 border-transparent border-t-foreground" />
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Rationale & Feedback - Always visible for graded insights */}
        {insight.status === 'graded' && (insight.rationale || insight.feedback) && (
          <div className="px-10 pb-12 flex flex-col gap-8">
            {insight.rationale && (
              <div className="rounded-xl p-10 bg-primary/5 border border-border">
                <div className="flex items-center gap-2.5 mb-8">
                  <Lightbulb size={20} style={{ color: tokens.warning }} />
                  <span className="text-[14px] uppercase tracking-[0.15em] font-semibold" style={{ color: tokens.warning }}>
                    Rationale
                  </span>
                </div>
                <p className="font-serif text-[15px] leading-[2] text-foreground m-0 whitespace-pre-wrap">
                  {insight.rationale}
                </p>
              </div>
            )}
            {insight.feedback && (
              <div className="rounded-xl p-10 bg-primary/5 border border-border">
                <div className="flex items-center gap-2.5 mb-8">
                  <RefreshCw size={20} style={{ color: tokens.success }} />
                  <span className="text-[14px] uppercase tracking-[0.15em] font-semibold" style={{ color: tokens.success }}>
                    How to Improve
                  </span>
                </div>
                <p className="font-serif text-[15px] leading-[2] text-foreground m-0 whitespace-pre-wrap italic">
                  {insight.feedback}
                </p>
              </div>
            )}
          </div>
        )}

        {/* Expand toggle for graded insights with criteria */}
        {insight.status === 'graded' && hasCriteria && (
          <div className="px-10 pb-10">
            <button
              onClick={(e) => { e.stopPropagation(); onToggle(); }}
              className="flex items-center gap-2 text-[12px] text-muted-light bg-transparent p-0 cursor-pointer text-left uppercase tracking-[0.35em] font-semibold border-0 border-b border-solid border-muted-light/50 hover:border-dashed hover:text-muted-foreground hover:border-muted-foreground transition-colors duration-300"
            >
              {expanded ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
              {expanded ? 'HIDE DETAILS' : 'VIEW CRITERIA & FOUNDATION'}
            </button>
          </div>
        )}

        {/* Expandable Details */}
        <AnimatePresence initial={false}>
          {expanded && insight.status === 'graded' && (
            <motion.div
              key="details"
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: 'auto', opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              transition={{ height: { duration: 0.4, ease: 'easeInOut' }, opacity: { duration: 0.2 } }}
              className="overflow-hidden"
            >
              <div className="px-10 py-14 border-t border-border">
                {/* Framework Description */}
                {insight.frameworkDescription && (
                  <div className="mb-12">
                    <span className="text-[13px] uppercase tracking-[0.3em] font-bold text-muted-foreground block mb-4">
                      Framework
                    </span>
                    <p className="font-serif text-[15px] leading-[1.8] text-muted-foreground m-0 italic">
                      {insight.frameworkDescription}
                    </p>
                  </div>
                )}

                {/* Criteria Breakdown — Grouped by Axis */}
                {hasCriteria && (
                  <div className="mb-12">
                    <span className="text-[13px] uppercase tracking-[0.3em] font-bold text-muted-foreground block mb-8">
                      Criteria Breakdown
                    </span>
                    <div className="space-y-10">
                      {CRITERIA_AXES.map(axis => {
                        // Only render axis if at least one criterion exists in the data
                        const axisCriteria = axis.criteria.filter(
                          c => insight.criteriaBreakdown![c.key]
                        );
                        if (axisCriteria.length === 0) return null;

                        return (
                          <div key={axis.id}>
                            {/* Axis header */}
                            <div className="flex items-baseline gap-3 mb-5">
                              <span className="text-[11px] uppercase tracking-[0.3em] font-bold" style={{ color: tokens.primary }}>
                                {axis.label}
                              </span>
                              <span className="text-[11px] italic text-muted-light font-serif">
                                {axis.question}
                              </span>
                            </div>

                            {/* Criteria cards for this axis */}
                            <div className="grid grid-cols-2 gap-5">
                              {axisCriteria.map((criterion, idx) => {
                                const data = insight.criteriaBreakdown![criterion.key];
                                const colors = getAssessmentColor(data.assessment);
                                const isOddLast = axisCriteria.length % 2 === 1 && idx === axisCriteria.length - 1;

                                return (
                                  <div
                                    key={criterion.key}
                                    className={`rounded-lg p-5 bg-sidebar border border-border shadow-card ${isOddLast ? 'col-span-2 max-w-[calc(50%-0.625rem)] mx-auto' : ''}`}
                                  >
                                    <div className="flex items-start justify-between gap-3 mb-3">
                                      <span className="text-[12px] font-semibold text-foreground min-w-0">
                                        {criterion.name}
                                      </span>
                                      <span
                                        className="text-[9px] uppercase tracking-[0.2em] font-bold px-2 py-0.5 rounded-full shrink-0"
                                        style={{ backgroundColor: colors.bg, color: colors.text }}
                                      >
                                        {data.assessment}
                                      </span>
                                    </div>
                                    <p className="text-[13px] leading-[1.6] text-muted-foreground m-0">
                                      {data.evidence}
                                    </p>
                                  </div>
                                );
                              })}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}

                {/* Foundation Metrics — DOK1 and DOK2 only */}
                <div className="mb-12">
                  <span className="text-[13px] uppercase tracking-[0.3em] font-bold text-muted-foreground block mb-8">
                    Foundation Metrics
                  </span>
                  <div className="grid grid-cols-2 gap-6">
                    {[
                      { label: 'DOK1 Foundation', tooltip: 'Weighted median of the DOK1 fact verification scores from the linked sources. Measures how solid the factual base is.', value: insight.dok1FoundationScore },
                      { label: 'DOK2 Synthesis', tooltip: 'Average grade of the linked DOK2 summaries. Measures how well the student synthesized each source individually.', value: insight.dok2SynthesisScore },
                    ].map(metric => (
                      <div
                        key={metric.label}
                        className="group relative rounded-lg p-6 bg-sidebar border border-border flex flex-col items-center text-center"
                      >
                        <div className="font-serif text-[32px] text-foreground leading-none">
                          {metric.value ?? '—'}
                        </div>
                        <div className="mt-3 flex items-center gap-1.5">
                          <span className="text-[10px] uppercase tracking-[0.2em] text-muted-foreground">
                            {metric.label}
                          </span>
                          <Info size={11} className="text-muted-light opacity-60 group-hover:opacity-100 transition-opacity" />
                        </div>
                        {/* Tooltip */}
                        <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 w-64 px-4 py-3 bg-foreground text-background text-[12px] leading-[1.5] rounded-lg shadow-lg opacity-0 pointer-events-none group-hover:opacity-100 group-hover:pointer-events-auto transition-opacity duration-200 z-10">
                          <div className="font-semibold mb-1">{metric.label}</div>
                          {metric.tooltip}
                          <div className="absolute top-full left-1/2 -translate-x-1/2 border-4 border-transparent border-t-foreground" />
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Linked DOK2 Summaries — with names and source info */}
                {linkedSummaries.length > 0 && (
                  <div className="mb-8">
                    <span className="text-[13px] uppercase tracking-[0.3em] font-bold text-muted-foreground block mb-8">
                      Linked DOK2 Summaries
                    </span>
                    <div className="space-y-4">
                      {linkedSummaries.map(summary => {
                        const gradeColor = summary.grade !== null ? getScoreChipColors(summary.grade) : null;
                        return (
                          <button
                            key={summary.id}
                            onClick={() => navigateToSummary(summary.id)}
                            className="w-full text-left p-5 bg-sidebar rounded-lg border border-transparent hover:border-primary/30 transition-colors cursor-pointer flex items-center gap-5"
                          >
                            {/* Grade pip */}
                            <div
                              className="flex items-center justify-center w-9 h-9 rounded-full font-serif text-[16px] shrink-0"
                              style={{
                                color: gradeColor ? gradeColor.text : tokens.textMuted,
                                border: `1px solid ${tokens.border}`,
                              }}
                            >
                              {summary.grade ?? '—'}
                            </div>
                            {/* Title & meta */}
                            <div className="flex flex-col gap-1 min-w-0 flex-1">
                              <span className="text-[14px] font-semibold text-foreground truncate">
                                {summary.displayTitle || summary.sourceName}
                              </span>
                              <div className="flex items-center gap-3 text-[11px] text-muted-foreground">
                                <span className="uppercase tracking-[0.15em]">{summary.category}</span>
                                {summary.sourceUrl && (
                                  <>
                                    <span className="text-muted-light">·</span>
                                    <a
                                      href={summary.sourceUrl}
                                      target="_blank"
                                      rel="noopener noreferrer"
                                      onClick={(e) => e.stopPropagation()}
                                      className="flex items-center gap-1 text-muted-foreground hover:text-foreground transition-colors"
                                    >
                                      <IoLinkSharp size={12} />
                                      Source
                                    </a>
                                  </>
                                )}
                              </div>
                            </div>
                            {/* Arrow indicator */}
                            <span className="text-muted-light text-[11px] uppercase tracking-[0.2em] shrink-0 opacity-0 group-hover:opacity-100">
                              View →
                            </span>
                          </button>
                        );
                      })}
                    </div>
                  </div>
                )}

                {/* Evaluator Model */}
                {insight.evaluatorModel && (
                  <div className="text-[10px] text-muted-light uppercase tracking-[0.2em]">
                    Evaluated by {insight.evaluatorModel}
                    {insight.gradedAt && ` · ${new Date(insight.gradedAt).toLocaleDateString()}`}
                  </div>
                )}

                {/* Collapse button */}
                <div className="mt-10">
                  <button
                    onClick={(e) => { e.stopPropagation(); onToggle(); }}
                    className="text-[10px] text-muted-light bg-transparent p-0 cursor-pointer text-left uppercase tracking-[0.35em] font-semibold border-0 border-b border-solid border-muted-light/50 hover:border-dashed hover:text-muted-foreground hover:border-muted-foreground transition-colors duration-300"
                  >
                    HIDE DETAILS
                  </button>
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}
