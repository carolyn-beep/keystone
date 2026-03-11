import { useState, useMemo } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { RefreshCw, Loader2, ChevronDown, ChevronUp, Info, ShieldAlert, Radio, Weight, Link2, ArrowRight } from 'lucide-react';
import { PiFootprintsFill } from 'react-icons/pi';
import type { DOK4SpovWithLinks, DOK4CriteriaBreakdown, DOK4BarrierType } from '@shared/dok4-types';
import type { DOK4GradingSSEEvent } from '@/hooks/useDOK4GradingEvents';
import { tokens, getScoreChipColors } from '@/lib/colors';
import { TactileButton } from '@/components/ui/tactile-button';

// ─── DOK4 Criteria Metadata ──────────────────────────────────────────────────

interface CriterionMeta {
  key: keyof DOK4CriteriaBreakdown;
  name: string;
  description: string;
}

interface AxisMeta {
  id: string;
  label: string;
  question: string;
  criteria: CriterionMeta[];
}

const DOK4_CRITERIA_AXES: AxisMeta[] = [
  {
    id: 'S',
    label: 'Spikiness',
    question: 'Is this a real SPOV?',
    criteria: [
      { key: 'S1', name: 'Contested Territory', description: 'Does the SPOV stake out a position that reasonable experts would disagree about?' },
      { key: 'S2', name: 'LLM Divergence', description: 'Does the SPOV say something a vanilla LLM would not produce on its own?' },
      { key: 'S3', name: 'Grounded & Traceable', description: 'Is the SPOV anchored in the student\'s DOK1-3 evidence chain?' },
      { key: 'S4', name: 'Clear Side', description: 'Does the SPOV take an unambiguous position, not a hedge?' },
      { key: 'S5', name: 'Cross-Domain Synthesis', description: 'Does the SPOV synthesize across multiple domains or frameworks?' },
    ],
  },
  {
    id: 'O',
    label: 'Ownership',
    question: 'Is this the student\'s thinking?',
    criteria: [
      { key: 'O1', name: 'Causal Reasoning', description: 'Does the student\'s reasoning chain show original causal logic, not just citation?' },
      { key: 'O2', name: 'Distinct Voice', description: 'Is the framing and language distinctly the student\'s own, not parroting sources?' },
    ],
  },
];

// ─── DOK4 Quality Labels ────────────────────────────────────────────────────

function getDOK4QualityLabel(score: number | null): string {
  if (score === null) return 'Ungraded';
  if (score === 5) return 'Field-Advancing';
  if (score === 4) return 'Defensible';
  if (score === 3) return 'Original, Weak Defense';
  if (score === 2) return 'Borrowed Spikiness';
  return 'Not Spiky';
}

function getAssessmentColor(assessment: string): { bg: string; text: string } {
  const lower = assessment.toLowerCase();
  if (lower === 'strong') return { bg: tokens.successSoft, text: tokens.success };
  if (lower === 'partial') return { bg: tokens.warningSoft, text: tokens.warning };
  return { bg: tokens.dangerSoft, text: tokens.danger };
}

// ─── Rejection Category Display ─────────────────────────────────────────────

const REJECTION_LABELS: Record<string, string> = {
  not_a_claim: 'Not a Claim',
  dok3_misclassification: 'DOK3 Misclassification',
  opinion_without_evidence: 'Opinion Without Evidence',
};

const REJECTION_GUIDANCE: Record<string, string> = {
  not_a_claim: 'This submission is not a defensible claim. A SPOV needs to stake out a specific position that experts could disagree about. Try reframing your observation into a clear "I believe X because Y" statement.',
  dok3_misclassification: 'This reads more like a DOK3 cross-source insight than a DOK4 Spiky Point of View. A SPOV should go beyond synthesis to commit to a position that is uniquely yours. Consider what controversial stance your insight supports.',
  opinion_without_evidence: 'This is an opinion, but it lacks connection to your evidence chain. A strong SPOV is grounded in your DOK1 facts, DOK2 summaries, and DOK3 insights. Trace your claim back to specific evidence from your sources.',
};

// ─── Barrier Type Display ───────────────────────────────────────────────────

const BARRIER_LABELS: Record<DOK4BarrierType, string> = {
  immunity: 'Audience Immunity',
  low_transmission: 'Low Transmission',
  high_drag: 'High Drag',
};

const BARRIER_DESCRIPTIONS: Record<DOK4BarrierType, string> = {
  immunity: 'The target audience is likely to actively reject this idea due to existing beliefs or biases.',
  low_transmission: 'This idea doesn\'t stick or spread easily — it lacks a memorable hook or clear framing.',
  high_drag: 'This idea requires too much context or background knowledge to land with the audience.',
};

function BarrierIcon({ type, className }: { type: DOK4BarrierType; className?: string }) {
  switch (type) {
    case 'immunity': return <ShieldAlert className={className} />;
    case 'low_transmission': return <Radio className={className} />;
    case 'high_drag': return <Weight className={className} />;
  }
}

// ─── Component Props ────────────────────────────────────────────────────────

interface DOK4TabProps {
  spovs: DOK4SpovWithLinks[];
  isLoading: boolean;
  meanScore: number | null;
  totalCount: number;
  highQualityCount: number;
  needsWorkCount: number;
  gradedSpovs: DOK4SpovWithLinks[];
  rejectedSpovs: DOK4SpovWithLinks[];
  pendingSpovs: DOK4SpovWithLinks[];
  errorSpovs: DOK4SpovWithLinks[];
  gradingSpovs: DOK4SpovWithLinks[];
  gradeAll: () => Promise<{ queued: number }>;
  isGrading: boolean;
  retryOne: (spovId: number) => Promise<unknown>;
  latestEvent: DOK4GradingSSEEvent | null;
  /** Number of DOK3 insights still pending_linking (blocks DOK4 linking) */
  dok3PendingLinkingCount: number;
  /** Number of DOK4 SPOVs still pending_linking */
  pendingLinkingCount: number;
  /** Callback to open DOK3 linking modal (navigate user to DOK3 tab) */
  onLinkDok3: () => void;
  /** Callback to open DOK4 linking modal */
  onLinkDok4: () => void;
}

type SortMode = 'score' | 'status';

export function DOK4Tab({
  spovs,
  isLoading,
  meanScore,
  totalCount,
  highQualityCount,
  needsWorkCount,
  errorSpovs,
  gradingSpovs,
  gradeAll,
  isGrading,
  retryOne,
  latestEvent,
  dok3PendingLinkingCount,
  pendingLinkingCount,
  onLinkDok3,
  onLinkDok4,
}: DOK4TabProps) {
  const [expandedIds, setExpandedIds] = useState<Record<number, boolean>>({});
  const [sortMode, setSortMode] = useState<SortMode>('score');

  const toggleExpanded = (id: number) => {
    setExpandedIds(prev => ({ ...prev, [id]: !prev[id] }));
  };

  // Separate rejected from active SPOVs
  const rejectedSpovsList = useMemo(() =>
    spovs.filter(s => s.status === 'rejected'),
  [spovs]);

  // Sort active SPOVs (non-pending, non-rejected)
  const sortedSpovs = useMemo(() => {
    const displayable = spovs.filter(s => s.status !== 'pending_linking' && s.status !== 'rejected');
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
  }, [spovs, sortMode]);

  const getMeanScoreColor = (score: number) => {
    if (score >= 4.5) return tokens.success;
    if (score >= 3.5) return tokens.info;
    if (score >= 1.5) return tokens.warning;
    if (score > 0) return tokens.danger;
    return tokens.textMuted;
  };

  if (isLoading) {
    return (
      <div className="max-w-[1200px] mx-auto p-12 text-center text-muted-foreground">
        Loading SPOVs...
      </div>
    );
  }

  // Empty state (should rarely appear since tab is hidden when no SPOVs)
  if (spovs.length === 0) {
    return (
      <div className="max-w-[1200px] mx-auto">
        <div className="flex flex-col gap-4 mb-6 pb-4">
          <h2 className="text-[30px] font-bold text-foreground tracking-tight leading-[1.1] m-0">
            DOK4 Spiky Points of View
          </h2>
          <p className="text-[15px] text-muted-light m-0 max-w-2xl font-serif italic">
            Your defensible positions built on DOK1-3 evidence.
          </p>
        </div>

        <div className="bg-card-elevated rounded-xl shadow-card py-20 px-12">
          <div className="flex flex-col items-center text-center">
            <h3 className="font-serif text-[24px] text-foreground m-0 mb-4">
              No SPOVs Yet
            </h3>
            <p className="text-[14px] text-muted-light m-0 max-w-md leading-relaxed">
              DOK4 Spiky Points of View are your original, defensible positions that synthesize your entire evidence chain.
              They will appear here once your BrainLift includes DOK4 content.
            </p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-[1200px] mx-auto">
      {/* Page Header */}
      <div className="flex flex-col gap-4 mb-6 pb-4">
        <div className="flex items-start justify-between gap-6">
          <div>
            <h2 className="text-[30px] font-bold text-foreground tracking-tight leading-[1.1] m-0">
              DOK4 Spiky Points of View
            </h2>
          </div>
        </div>
        <p className="text-[15px] text-muted-light m-0 max-w-2xl font-serif italic">
          Your defensible positions built on DOK1-3 evidence. Grades reflect originality, spikiness, and intellectual ownership.
        </p>
      </div>

      {/* Stats Cards */}
      <div className="flex justify-between mb-16">
        {[
          { label: ['TOTAL', 'SPOVS'], value: totalCount, color: tokens.primary },
          { label: ['MEAN', 'SCORE'], value: meanScore !== null ? meanScore.toFixed(2) : '\u2014', color: meanScore !== null ? getMeanScoreColor(meanScore) : tokens.textMuted },
          { label: ['HIGH', 'QUALITY'], value: highQualityCount, color: tokens.success },
          { label: ['NEEDS', 'WORK'], value: needsWorkCount, color: needsWorkCount > 0 ? tokens.warning : tokens.textMuted },
          ...(rejectedSpovsList.length > 0 ? [{ label: ['REJECTED', ''], value: rejectedSpovsList.length, color: tokens.danger }] : []),
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

      {/* Pending Linking Banner — state-aware based on DOK3 dependency */}
      {pendingLinkingCount > 0 && (
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

              {dok3PendingLinkingCount > 0 ? (
                <>
                  <h3 className="font-serif text-[28px] text-foreground m-0 mb-3">
                    DOK3 Insights Must Be Linked First
                  </h3>
                  <p className="text-sm text-muted-foreground max-w-lg mb-4 leading-relaxed">
                    You have {pendingLinkingCount} DOK4 SPOV{pendingLinkingCount !== 1 ? 's' : ''} waiting to be linked,
                    but {dok3PendingLinkingCount} DOK3 insight{dok3PendingLinkingCount !== 1 ? 's' : ''} still
                    need to be linked to DOK2 sources first.
                  </p>
                  <p className="text-sm text-muted-foreground max-w-lg mb-10 leading-relaxed">
                    DOK4 SPOVs are grounded in DOK3 insights — you need to link and grade your DOK3 insights
                    before you can connect your SPOVs to them.
                  </p>
                  <TactileButton
                    variant="raised"
                    onClick={onLinkDok3}
                    className="flex items-center gap-3 px-8 py-4 text-[14px]"
                  >
                    <Link2 size={18} />
                    Link DOK3 Insights First
                    <ArrowRight size={16} />
                  </TactileButton>
                </>
              ) : (
                <>
                  <h3 className="font-serif text-[28px] text-foreground m-0 mb-3">
                    {pendingLinkingCount} SPOV{pendingLinkingCount !== 1 ? 's' : ''} Awaiting Linking
                  </h3>
                  <p className="text-sm text-muted-foreground max-w-lg mb-10 leading-relaxed">
                    Each SPOV needs to be linked to the DOK3 insights it builds upon.
                    You'll designate one insight as the primary foundation for each position.
                    Once linked, grading will evaluate how well each SPOV stands on its evidence.
                  </p>
                  <TactileButton
                    variant="raised"
                    onClick={onLinkDok4}
                    className="flex items-center gap-3 px-8 py-4 text-[14px]"
                  >
                    <Link2 size={18} />
                    Link SPOVs
                  </TactileButton>
                </>
              )}
            </div>
          </div>
        </motion.div>
      )}

      {/* Section Header + Actions + Cards */}
      {sortedSpovs.length > 0 && (
        <>
          <div className="flex items-baseline justify-between animate-fade-slide-in" style={{ animationDelay: '400ms', animationFillMode: 'backwards' }}>
            <h3 className="text-[24px] font-semibold text-foreground m-0">
              Active SPOVs
            </h3>
            <div className="flex items-center gap-6">
              {/* Grade All button */}
              {spovs.some(s => s.status === 'linked') && (
                <TactileButton
                  variant="raised"
                  onClick={() => gradeAll()}
                  disabled={isGrading}
                  className="text-[12px]"
                >
                  {isGrading ? <Loader2 size={14} className="animate-spin mr-2" /> : null}
                  Grade All
                </TactileButton>
              )}
              {/* Retry failed */}
              {errorSpovs.length > 0 && (
                <button
                  onClick={() => gradeAll()}
                  disabled={isGrading}
                  className="flex items-center gap-2 text-[10px] uppercase tracking-[0.35em] text-warning font-semibold bg-transparent border-0 p-0 cursor-pointer hover:text-foreground transition-colors duration-200 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {isGrading ? <Loader2 size={14} className="animate-spin" /> : <RefreshCw size={14} />}
                  Retry {errorSpovs.length} Failed
                </button>
              )}
              {/* Sort toggle */}
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
          {gradingSpovs.length > 0 && latestEvent && (
            <div className="bg-primary/5 border border-border rounded-xl p-4 mb-8 flex items-center gap-3">
              <Loader2 size={16} className="animate-spin text-primary" />
              <span className="text-[13px] text-muted-foreground">{latestEvent.message}</span>
            </div>
          )}

          {/* SPOV Cards */}
          <div className="flex flex-col gap-16">
            {sortedSpovs.map((spov, index) => (
              <SpovCard
                key={spov.id}
                spov={spov}
                expanded={expandedIds[spov.id] ?? false}
                onToggle={() => toggleExpanded(spov.id)}
                onRetry={() => retryOne(spov.id)}
                animationDelay={(index + 6) * 80}
                latestEvent={spov.status === 'grading' ? latestEvent : null}
              />
            ))}
          </div>
        </>
      )}

      {/* ── Rejected SPOVs — separate section ── */}
      {rejectedSpovsList.length > 0 && (
        <>
          <div className="flex items-baseline justify-between mt-16 animate-fade-slide-in" style={{ animationDelay: '500ms', animationFillMode: 'backwards' }}>
            <h3 className="text-[24px] font-semibold text-foreground m-0">
              Rejected SPOVs
            </h3>
            <span className="text-[11px] uppercase tracking-[0.35em] font-semibold" style={{ color: tokens.danger }}>
              {rejectedSpovsList.length} REJECTED
            </span>
          </div>
          <hr className="border-t border-border mt-4 mb-12" />

          <div className="flex flex-col gap-10">
            {rejectedSpovsList.map((spov, index) => (
              <RejectedSpovCard
                key={spov.id}
                spov={spov}
                animationDelay={(index + 8) * 80}
              />
            ))}
          </div>
        </>
      )}
    </div>
  );
}

// ─── SpovCard ───────────────────────────────────────────────────────────────

interface SpovCardProps {
  spov: DOK4SpovWithLinks;
  expanded: boolean;
  onToggle: () => void;
  onRetry: () => void;
  animationDelay: number;
  latestEvent: DOK4GradingSSEEvent | null;
}

function SpovCard({ spov, expanded, onToggle, onRetry, animationDelay, latestEvent }: SpovCardProps) {
  const gradeColors = spov.score !== null ? getScoreChipColors(spov.score) : null;
  const gradeLabel = getDOK4QualityLabel(spov.score);
  const hasCriteria = spov.criteriaBreakdown && Object.keys(spov.criteriaBreakdown).length > 0;
  const hasAntimemetic = spov.score !== null && spov.score >= 3 && spov.antimemeticAssessment !== null;

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
            {spov.status === 'grading' ? (
              <div className="flex items-center justify-center w-14 h-14 rounded-full" style={{ border: `1px solid ${tokens.border}` }}>
                <Loader2 size={24} className="animate-spin text-muted-foreground" />
              </div>
            ) : (
              <div
                className="flex items-center justify-center w-14 h-14 rounded-full font-serif text-[28px] font-normal"
                style={{
                  backgroundColor: 'transparent',
                  color: gradeColors ? gradeColors.text : tokens.textMuted,
                  border: `1px solid ${tokens.border}`,
                }}
              >
                {spov.score !== null ? spov.score : '\u2014'}
              </div>
            )}
            {spov.status === 'graded' && (
              <span
                className="text-[9px] uppercase tracking-[0.25em] text-center max-w-[80px]"
                style={{ color: gradeColors ? gradeColors.text : tokens.textMuted }}
              >
                {gradeLabel}
              </span>
            )}
            {spov.status === 'grading' && (
              <span className="text-[9px] uppercase tracking-[0.25em] text-muted-foreground">
                Grading
              </span>
            )}
          </div>

          {/* Title & Meta */}
          <div className="flex flex-col gap-4 flex-1 min-w-0">
            <p className="font-serif text-[18px] leading-[1.6] text-foreground m-0">
              {spov.text}
            </p>

            {/* Meta row */}
            <div className="flex items-center gap-4 flex-wrap">
              {spov.frameworkDependency && (
                <span className="text-[11px] uppercase tracking-[0.2em] text-muted-foreground font-semibold">
                  {spov.frameworkDependency}
                </span>
              )}
              {spov.linkedDok3InsightIds.length > 0 && (
                <>
                  {spov.frameworkDependency && <span className="text-muted-light">&middot;</span>}
                  <span className="text-[11px] text-muted-foreground">
                    {spov.linkedDok3InsightIds.length} linked DOK3{spov.linkedDok3InsightIds.length !== 1 ? 's' : ''}
                  </span>
                </>
              )}
              {spov.status === 'error' && (
                <button
                  onClick={(e) => { e.stopPropagation(); onRetry(); }}
                  className="flex items-center gap-1.5 text-[10px] uppercase tracking-[0.2em] text-warning font-semibold bg-transparent border-0 p-0 cursor-pointer hover:text-foreground transition-colors"
                >
                  <RefreshCw size={12} />
                  Retry
                </button>
              )}
            </div>

            {/* Grading progress */}
            {spov.status === 'grading' && latestEvent && latestEvent.spovId === spov.id && (
              <div className="flex items-center gap-2 text-[12px] text-muted-foreground">
                <Loader2 size={12} className="animate-spin" />
                {latestEvent.message}
              </div>
            )}

            {/* Traceability flag */}
            {spov.traceabilityFlagged && (
              <div className="group relative inline-flex items-center gap-2 text-[9px] uppercase tracking-[0.35em] font-semibold text-warning">
                <PiFootprintsFill size={14} className="opacity-50" />
                Traceability flagged{spov.traceabilityFlaggedSource ? `: ${spov.traceabilityFlaggedSource}` : ''}
                <Info size={11} className="opacity-50 group-hover:opacity-100 transition-opacity" />
                <div className="absolute bottom-full left-0 mb-2 w-72 px-4 py-3 bg-foreground text-background text-[12px] leading-[1.5] rounded-lg shadow-lg opacity-0 pointer-events-none group-hover:opacity-100 group-hover:pointer-events-auto transition-opacity duration-200 z-10 normal-case tracking-normal font-normal">
                  This SPOV appears traceable to a single source. A DOK4 SPOV should represent your own position built on multiple lines of evidence, not a restatement of a single source.
                  <div className="absolute top-full left-6 border-4 border-transparent border-t-foreground" />
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Rationale & Feedback - Always visible for graded SPOVs */}
        {spov.status === 'graded' && (spov.rationale || spov.feedback) && (
          <div className="px-10 pb-12 flex flex-col gap-8">
            {spov.rationale && (
              <div className="rounded-xl p-10 bg-primary/5 border border-border">
                <div className="flex items-center gap-2.5 mb-8">
                  <span className="text-[14px] uppercase tracking-[0.15em] font-semibold" style={{ color: tokens.warning }}>
                    Rationale
                  </span>
                </div>
                <p className="font-serif text-[15px] leading-[2] text-foreground m-0 whitespace-pre-wrap">
                  {spov.rationale}
                </p>
              </div>
            )}
            {spov.feedback && (
              <div className="rounded-xl p-10 bg-primary/5 border border-border">
                <div className="flex items-center gap-2.5 mb-8">
                  <span className="text-[14px] uppercase tracking-[0.15em] font-semibold" style={{ color: tokens.success }}>
                    How to Improve
                  </span>
                </div>
                <p className="font-serif text-[15px] leading-[2] text-foreground m-0 whitespace-pre-wrap italic">
                  {spov.feedback}
                </p>
              </div>
            )}
          </div>
        )}

        {/* Expand toggle for graded SPOVs with details */}
        {spov.status === 'graded' && (hasCriteria || hasAntimemetic) && (
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
          {expanded && spov.status === 'graded' && (
            <motion.div
              key="details"
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: 'auto', opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              transition={{ height: { duration: 0.4, ease: 'easeInOut' }, opacity: { duration: 0.2 } }}
              className="overflow-hidden"
            >
              <div className="px-10 py-14 border-t border-border">
                {/* Criteria Breakdown — Grouped by Axis */}
                {hasCriteria && (
                  <div className="mb-12">
                    <span className="text-[13px] uppercase tracking-[0.3em] font-bold text-muted-foreground block mb-8">
                      Criteria Breakdown
                    </span>
                    <div className="space-y-10">
                      {DOK4_CRITERIA_AXES.map(axis => {
                        const axisCriteria = axis.criteria.filter(
                          c => spov.criteriaBreakdown![c.key]
                        );
                        if (axisCriteria.length === 0) return null;

                        return (
                          <div key={axis.id}>
                            <div className="flex items-baseline gap-3 mb-5">
                              <span className="text-[11px] uppercase tracking-[0.3em] font-bold" style={{ color: tokens.primary }}>
                                {axis.label}
                              </span>
                              <span className="text-[11px] italic text-muted-light font-serif">
                                {axis.question}
                              </span>
                            </div>

                            <div className="grid grid-cols-2 gap-5">
                              {axisCriteria.map((criterion, idx) => {
                                const data = spov.criteriaBreakdown![criterion.key];
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

                {/* Foundation Metrics — DOK1, DOK2, DOK3, Index, Ceiling */}
                <div className="mb-12">
                  <span className="text-[13px] uppercase tracking-[0.3em] font-bold text-muted-foreground block mb-8">
                    Foundation Metrics
                  </span>
                  <div className="grid grid-cols-3 gap-6">
                    {[
                      { label: 'DOK1 Foundation', tooltip: 'Average DOK1 fact verification score from linked sources.', value: spov.dok1FoundationScore },
                      { label: 'DOK2 Synthesis', tooltip: 'Average grade of linked DOK2 summaries.', value: spov.dok2FoundationScore },
                      { label: 'Primary DOK3', tooltip: 'Score of the primary linked DOK3 insight.', value: spov.dok3FoundationScore },
                    ].map(metric => (
                      <div
                        key={metric.label}
                        className="group relative rounded-lg p-6 bg-sidebar border border-border flex flex-col items-center text-center"
                      >
                        <div className="font-serif text-[32px] text-foreground leading-none">
                          {metric.value ?? '\u2014'}
                        </div>
                        <div className="mt-3 flex items-center gap-1.5">
                          <span className="text-[10px] uppercase tracking-[0.2em] text-muted-foreground">
                            {metric.label}
                          </span>
                          <Info size={11} className="text-muted-light opacity-60 group-hover:opacity-100 transition-opacity" />
                        </div>
                        <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 w-64 px-4 py-3 bg-foreground text-background text-[12px] leading-[1.5] rounded-lg shadow-lg opacity-0 pointer-events-none group-hover:opacity-100 group-hover:pointer-events-auto transition-opacity duration-200 z-10">
                          <div className="font-semibold mb-1">{metric.label}</div>
                          {metric.tooltip}
                          <div className="absolute top-full left-1/2 -translate-x-1/2 border-4 border-transparent border-t-foreground" />
                        </div>
                      </div>
                    ))}
                  </div>

                  {/* Foundation Index + Ceiling */}
                  <div className="grid grid-cols-2 gap-6 mt-6">
                    <div className="rounded-lg p-6 bg-sidebar border border-border flex flex-col items-center text-center">
                      <div className="font-serif text-[32px] text-foreground leading-none">
                        {spov.foundationIntegrityIndex ?? '\u2014'}
                      </div>
                      <div className="mt-3">
                        <span className="text-[10px] uppercase tracking-[0.2em] text-muted-foreground">
                          Foundation Index
                        </span>
                      </div>
                    </div>
                    <div className="rounded-lg p-6 bg-sidebar border border-border flex flex-col items-center text-center">
                      <div className="font-serif text-[32px] text-foreground leading-none">
                        {spov.foundationCeiling !== null ? `Cap ${spov.foundationCeiling}` : '\u2014'}
                      </div>
                      <div className="mt-3">
                        <span className="text-[10px] uppercase tracking-[0.2em] text-muted-foreground">
                          Ceiling Tier
                        </span>
                      </div>
                    </div>
                  </div>
                </div>

                {/* LLM Divergence Comparison */}
                {(spov.divergenceQuestion || spov.divergenceVanillaResponse) && (
                  <div className="mb-12">
                    <span className="text-[13px] uppercase tracking-[0.3em] font-bold text-muted-foreground block mb-3">
                      LLM Divergence Comparison
                    </span>
                    <p className="font-serif text-[13px] leading-[1.7] text-muted-foreground mt-0 mb-8">
                      We converted your SPOV into a neutral question and asked an AI with no context to take a position. The more your stance diverges from this vanilla response, the spikier your thinking.
                    </p>
                    <div className="space-y-6">
                      {spov.divergenceQuestion && (
                        <div className="rounded-xl p-8 bg-sidebar border border-border">
                          <span className="text-[10px] uppercase tracking-[0.35em] font-semibold text-muted-foreground block mb-4">
                            Question Derived from Your SPOV
                          </span>
                          <p className="font-serif text-[15px] leading-[1.8] text-foreground m-0 italic">
                            {spov.divergenceQuestion}
                          </p>
                        </div>
                      )}
                      {spov.divergenceVanillaResponse && (
                        <div className="rounded-xl p-8 bg-sidebar border border-border">
                          <span className="text-[10px] uppercase tracking-[0.35em] font-semibold text-muted-foreground block mb-4">
                            What the AI Answered
                          </span>
                          <p className="font-serif text-[15px] leading-[1.8] text-muted-foreground m-0">
                            {spov.divergenceVanillaResponse}
                          </p>
                        </div>
                      )}
                      {/* S2 criterion assessment = LLM Divergence score */}
                      {spov.criteriaBreakdown?.S2 && (
                        <div className="rounded-xl p-8 bg-primary/5 border border-border">
                          <div className="flex items-center justify-between mb-4">
                            <span className="text-[10px] uppercase tracking-[0.35em] font-semibold text-muted-foreground">
                              Evaluator Assessment
                            </span>
                            <span
                              className="text-[9px] uppercase tracking-[0.2em] font-bold px-2 py-0.5 rounded-full"
                              style={{
                                ...getAssessmentColor(spov.criteriaBreakdown.S2.assessment),
                                backgroundColor: getAssessmentColor(spov.criteriaBreakdown.S2.assessment).bg,
                                color: getAssessmentColor(spov.criteriaBreakdown.S2.assessment).text,
                              }}
                            >
                              {spov.criteriaBreakdown.S2.assessment}
                            </span>
                          </div>
                          <p className="font-serif text-[15px] leading-[1.8] text-foreground m-0">
                            {spov.criteriaBreakdown.S2.evidence}
                          </p>
                        </div>
                      )}
                    </div>
                  </div>
                )}

                {/* Antimemetic Assessment */}
                {hasAntimemetic && spov.antimemeticAssessment && (
                  <div className="mb-12">
                    <span className="text-[13px] uppercase tracking-[0.3em] font-bold text-muted-foreground block mb-8">
                      Antimemetic Assessment
                    </span>
                    <div className="rounded-xl overflow-hidden border border-border">
                      {/* Barrier header */}
                      <div className="py-6 px-8 bg-primary/5 flex items-center gap-4 border-b border-border">
                        <BarrierIcon type={spov.antimemeticAssessment.barrier_type} className="w-5 h-5 opacity-50" />
                        <div>
                          <span className="text-[11px] uppercase tracking-[0.3em] font-bold" style={{ color: tokens.warning }}>
                            {BARRIER_LABELS[spov.antimemeticAssessment.barrier_type]}
                          </span>
                          <p className="text-[12px] text-muted-foreground m-0 mt-1">
                            {BARRIER_DESCRIPTIONS[spov.antimemeticAssessment.barrier_type]}
                          </p>
                        </div>
                      </div>
                      {/* Diagnosis */}
                      <div className="py-8 px-8 border-b border-border bg-card-elevated">
                        <span className="text-[10px] uppercase tracking-[0.35em] font-semibold text-muted-foreground block mb-4">
                          Diagnosis
                        </span>
                        <p className="font-serif text-[15px] leading-[1.8] text-foreground m-0">
                          {spov.antimemeticAssessment.barrier_diagnosis}
                        </p>
                      </div>
                      {/* Strategy (prominent) */}
                      <div className="py-8 px-8 bg-card-elevated">
                        <span className="text-[10px] uppercase tracking-[0.35em] font-semibold block mb-4" style={{ color: tokens.success }}>
                          Strategy
                        </span>
                        <p className="font-serif text-[16px] leading-[1.8] text-foreground m-0 font-normal">
                          {spov.antimemeticAssessment.strategy}
                        </p>
                      </div>
                    </div>
                  </div>
                )}

                {/* Graded date */}
                {spov.gradedAt && (
                  <div className="text-[10px] text-muted-light uppercase tracking-[0.2em]">
                    Graded {new Date(spov.gradedAt).toLocaleDateString()}
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

// ─── RejectedSpovCard ───────────────────────────────────────────────────────

interface RejectedSpovCardProps {
  spov: DOK4SpovWithLinks;
  animationDelay: number;
}

function RejectedSpovCard({ spov, animationDelay }: RejectedSpovCardProps) {
  const categoryLabel = spov.rejectionCategory
    ? REJECTION_LABELS[spov.rejectionCategory] ?? spov.rejectionCategory
    : 'Rejected';
  const guidance = spov.rejectionCategory
    ? REJECTION_GUIDANCE[spov.rejectionCategory] ?? ''
    : '';

  return (
    <div
      className="animate-fade-slide-in"
      style={{ animationDelay: `${animationDelay}ms`, animationFillMode: 'backwards' }}
    >
      <div className="rounded-xl overflow-hidden shadow-card" style={{ backgroundColor: tokens.dangerSoft }}>
        {/* Header — category badge + label */}
        <div className="py-8 px-10 flex items-center gap-3 border-b border-border">
          <span
            className="px-[6px] py-[2px] rounded text-[9px] uppercase tracking-[0.25em] font-semibold"
            style={{ backgroundColor: tokens.danger, color: '#fff' }}
          >
            Rejected
          </span>
          <span className="text-[11px] uppercase tracking-[0.35em] font-semibold" style={{ color: tokens.danger }}>
            {categoryLabel}
          </span>
        </div>

        {/* SPOV text — the student's words, quoted and subdued */}
        <div className="px-10 py-8 border-b border-border">
          <p className="font-serif text-[16px] leading-[1.7] text-foreground/60 m-0 italic">
            &ldquo;{spov.text}&rdquo;
          </p>
        </div>

        {/* Rejection reason — why it failed */}
        {spov.rejectionReason && (
          <div className="px-10 py-8 border-b border-border bg-card-elevated">
            <span className="text-[10px] uppercase tracking-[0.35em] font-semibold block mb-4" style={{ color: tokens.danger }}>
              Why This Was Rejected
            </span>
            <p className="font-serif text-[15px] leading-[1.8] text-foreground m-0">
              {spov.rejectionReason}
            </p>
          </div>
        )}

        {/* Guidance — how to fix, in a contrasting panel */}
        {guidance && (
          <div className="px-10 py-8 bg-card-elevated rounded-b-xl">
            <span className="text-[10px] uppercase tracking-[0.35em] font-semibold block mb-4" style={{ color: tokens.success }}>
              How to Fix It
            </span>
            <p className="font-serif text-[14px] leading-[1.8] text-muted-foreground m-0 italic">
              {guidance}
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
