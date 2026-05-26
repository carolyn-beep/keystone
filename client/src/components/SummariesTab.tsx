import { useState, useMemo, useCallback, ReactNode } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import {
  BookOpen,
  AlertTriangle,
  ChevronDown,
  ChevronUp,
} from 'lucide-react';
import { FaSortNumericDownAlt } from 'react-icons/fa';
import { TbCategoryFilled } from 'react-icons/tb';
import { IoLinkSharp } from 'react-icons/io5';
import { AiOutlineFileSearch } from 'react-icons/ai';
import { FaArrowUpRightDots } from 'react-icons/fa6';
import type { Fact, DOK2FailReason } from '@shared/schema';
import { tokens, getScoreChipColors } from '@/lib/colors';
import { FilterBar, type ExtraFilter } from '@/components/FilterBar';
import { AiWritingSignalChip } from '@/components/AiWritingSignal';
import type { AiWritingSignalPayload } from '@/types/ai-writing-signal';

// Widened locally so the file compiles before the GET /dok2-summaries route
// extension lands (see spec 02 Open Issues / Andon).
type Dok2SummaryWithSignal = DOK2Summary & {
  aiWritingSignal?: AiWritingSignalPayload | null;
};

/**
 * Render text with markdown links [text](url) as clickable <a> tags
 */
function renderWithLinks(text: string): ReactNode {
  const linkRegex = /\[([^\]]+)\]\(([^)]+)\)/g;
  const parts: ReactNode[] = [];
  let lastIndex = 0;
  let match;

  while ((match = linkRegex.exec(text)) !== null) {
    if (match.index > lastIndex) {
      parts.push(text.slice(lastIndex, match.index));
    }
    const [, linkText, url] = match;
    parts.push(
      <a
        key={match.index}
        href={url}
        target="_blank"
        rel="noopener noreferrer"
        onClick={(e) => e.stopPropagation()}
        className="text-teal-600 hover:text-teal-700 dark:text-teal-400 dark:hover:text-teal-300 underline"
      >
        {linkText}
      </a>
    );
    lastIndex = match.index + match[0].length;
  }

  if (lastIndex < text.length) {
    parts.push(text.slice(lastIndex));
  }

  return parts.length > 0 ? parts : text;
}

interface DOK2Point {
  id: number;
  text: string;
  sortOrder: number;
}

interface DOK2Summary {
  id: number;
  category: string;
  sourceName: string;
  sourceUrl: string | null;
  displayTitle: string | null;  // AI-generated insight title
  points: DOK2Point[];
  relatedFactIds: number[];
  // DOK2 Grading fields
  grade: number | null;
  diagnosis: string | null;
  feedback: string | null;
  failReason: DOK2FailReason | null;
  sourceVerified: boolean | null;
}

interface SummariesTabProps {
  summaries: DOK2Summary[];
  facts: Fact[];
  setActiveTab: (tab: string) => void;
}

type SortMode = 'grade' | 'category';

// Fail reason display labels
const FAIL_REASON_LABELS: Record<string, string> = {
  copy_paste: 'Copy-paste detected',
  no_purpose_relation: 'No connection to BrainLift purpose',
  factual_misrepresentation: 'Factual misrepresentation',
  fact_manipulation: 'Facts manipulated to fit narrative',
};

// Get grade label from score
function getGradeLabel(grade: number | null): string {
  if (grade === null) return 'Ungraded';
  if (grade === 5) return 'Excellent';
  if (grade === 4) return 'Strong';
  if (grade === 3) return 'Adequate';
  if (grade === 2) return 'Weak';
  return 'Failed';
}

const SUMMARY_SCORE_LABELS: Record<number, string> = {
  5: 'Excellent', 4: 'Strong', 3: 'Adequate', 2: 'Weak', 1: 'Failed',
};

const summarySearchFn = (summary: DOK2Summary, query: string): boolean => {
  const q = query.toLowerCase();
  return (
    summary.sourceName.toLowerCase().includes(q) ||
    (summary.displayTitle?.toLowerCase().includes(q) ?? false) ||
    summary.category.toLowerCase().includes(q) ||
    summary.points.some(p => p.text.toLowerCase().includes(q))
  );
};

const summaryScoreFn = (summary: DOK2Summary): number | null => summary.grade;

const SUMMARY_EXTRA_FILTERS: ExtraFilter<DOK2Summary>[] = [
  { key: 'no_purpose', label: 'No Purpose Connection', predicate: (s) => s.failReason !== null },
];

export function SummariesTab({ summaries, facts, setActiveTab }: SummariesTabProps) {
  // Track which sections are expanded within each card
  const [expandedAnalysis, setExpandedAnalysis] = useState<Record<number, boolean>>({});
  const [expandedPoints, setExpandedPoints] = useState<Record<number, boolean>>({});
  const [expandedFacts, setExpandedFacts] = useState<Record<number, boolean>>({});

  // Sort mode state
  const [sortMode, setSortMode] = useState<SortMode>('grade');

  // Filtered summaries from FilterBar
  const [filteredSummaries, setFilteredSummaries] = useState<DOK2Summary[]>([]);
  const handleFilteredChange = useCallback((items: DOK2Summary[]) => {
    setFilteredSummaries(items);
  }, []);

  // Group filtered summaries by category
  const groupedByCategory = useMemo(() => {
    const groups = new Map<string, DOK2Summary[]>();
    for (const summary of filteredSummaries) {
      const category = summary.category || 'General';
      if (!groups.has(category)) {
        groups.set(category, []);
      }
      groups.get(category)!.push(summary);
    }
    return groups;
  }, [filteredSummaries]);

  // Sort filtered summaries by grade (highest first)
  const sortedByGrade = useMemo(() => {
    return [...filteredSummaries].sort((a, b) => {
      // Put ungraded items last
      if (a.grade === null && b.grade === null) return 0;
      if (a.grade === null) return 1;
      if (b.grade === null) return -1;
      return b.grade - a.grade; // Highest grade first
    });
  }, [filteredSummaries]);

  // Get fact by ID helper
  const getFactById = (factId: number) => facts.find(f => f.id === factId);

  // Toggle functions
  const toggleAnalysis = (summaryId: number) => {
    setExpandedAnalysis(prev => ({ ...prev, [summaryId]: !prev[summaryId] }));
  };
  const togglePoints = (summaryId: number) => {
    setExpandedPoints(prev => ({ ...prev, [summaryId]: !prev[summaryId] }));
  };
  const toggleRelatedFacts = (summaryId: number) => {
    setExpandedFacts(prev => ({ ...prev, [summaryId]: !prev[summaryId] }));
  };

  // Navigate to a specific fact in the Grading tab
  const navigateToFact = (factId: number) => {
    setActiveTab('grading');
    setTimeout(() => {
      const el = document.getElementById(`fact-row-${factId}`);
      if (el) {
        el.scrollIntoView({ behavior: 'smooth', block: 'center' });
        el.classList.add('ring-2', 'ring-primary', 'ring-offset-2');
        setTimeout(() => {
          el.classList.remove('ring-2', 'ring-primary', 'ring-offset-2');
        }, 2000);
      }
    }, 150);
  };

  // Sort control element for FilterBar
  const sortControl = (
    <button
      onClick={() => setSortMode(prev => prev === 'grade' ? 'category' : 'grade')}
      className="flex items-center gap-2 text-[10px] uppercase tracking-[0.35em] text-muted-light font-semibold bg-transparent border-0 p-0 cursor-pointer hover:text-muted-foreground transition-colors duration-200"
    >
      {sortMode === 'grade' ? (
        <>
          <FaSortNumericDownAlt size={14} />
          Sort by Grade
        </>
      ) : (
        <>
          <TbCategoryFilled size={14} />
          Sort by Category
        </>
      )}
    </button>
  );

  // Render a single summary card
  const renderSummaryCard = (summary: DOK2Summary) => {
    const pointsExpanded = expandedPoints[summary.id];
    const factsExpanded = expandedFacts[summary.id];
    const relatedFacts = summary.relatedFactIds
      .map(id => getFactById(id))
      .filter((f): f is Fact => f !== undefined);

    const gradeColors = summary.grade !== null ? getScoreChipColors(summary.grade) : null;
    const gradeLabel = getGradeLabel(summary.grade);

    // AI Writing Signal — defensively widened until the GET /dok2-summaries
    // route extension lands (see spec 02 Open Issues).
    const aiSignal: AiWritingSignalPayload | null =
      (summary as Dok2SummaryWithSignal).aiWritingSignal ?? null;

    return (
      <div
        className="bg-card-elevated rounded-xl shadow-card overflow-hidden"
      >
        {/* Header: Grade + Title + Meta */}
        <div className="flex gap-8 px-10 py-12">
          {/* Grade Circle */}
          <div className="flex flex-col items-center gap-3 shrink-0">
            <div
              className="flex items-center justify-center w-14 h-14 rounded-full font-serif text-[28px] font-normal"
              style={{
                backgroundColor: 'transparent',
                color: gradeColors ? gradeColors.text : tokens.textMuted,
                border: `1px solid ${tokens.border}`,
              }}
            >
              {summary.grade !== null ? summary.grade : '—'}
            </div>
            <span
              className="text-[9px] uppercase tracking-[0.25em]"
              style={{ color: gradeColors ? gradeColors.text : tokens.textMuted }}
            >
              {gradeLabel}
            </span>
          </div>

          {/* Title & Meta */}
          <div className="flex flex-col gap-4 flex-1">
            <h4 className="font-serif text-[24px] font-bold leading-snug text-foreground m-0">
              {summary.displayTitle || renderWithLinks(summary.sourceName)}
            </h4>

            {/* Meta row */}
            <div className="flex items-center gap-4 text-muted-foreground">
              <span className="text-[11px] uppercase tracking-[0.2em] font-semibold">
                {summary.category}
              </span>
              <span className="text-muted-light">•</span>
              <span className="text-[11px] uppercase tracking-[0.2em]">
                {summary.points.length} summary point{summary.points.length !== 1 ? 's' : ''}
              </span>
              {summary.sourceUrl && (
                <>
                  <span className="text-muted-light">•</span>
                  <a
                    href={summary.sourceUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center gap-1.5 text-[11px] text-muted-foreground hover:text-foreground transition-colors"
                    onClick={(e) => e.stopPropagation()}
                  >
                    <IoLinkSharp size={14} />
                    Source
                  </a>
                </>
              )}
            </div>

            {/* AI Writing Signal -- informational, never affects grade. */}
            {aiSignal && <AiWritingSignalChip signal={aiSignal} />}

            {/* Fail reason warning */}
            {summary.grade === 1 && summary.failReason && (
              <span className="inline-flex items-center gap-2 text-[9px] uppercase tracking-[0.35em] font-semibold text-warning">
                <AlertTriangle size={14} className="opacity-50" />
                {FAIL_REASON_LABELS[summary.failReason] || summary.failReason}
              </span>
            )}

          </div>
        </div>

        {/* Diagnosis & Feedback — clamped, click to expand both */}
        {(summary.diagnosis || summary.feedback) && (() => {
          const analysisOpen = expandedAnalysis[summary.id] ?? false;
          return (
            <div className="px-10 pb-8">
              <div
                onClick={(e) => {
                  e.stopPropagation();
                  toggleAnalysis(summary.id);
                  if (!analysisOpen) {
                    const card = e.currentTarget.closest('.bg-card-elevated');
                    if (card) setTimeout(() => card.scrollIntoView({ behavior: 'smooth', block: 'start' }), 50);
                  }
                }}
                className="grid grid-cols-2 gap-12 cursor-pointer"
                role="button"
                tabIndex={0}
                onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); toggleAnalysis(summary.id); } }}
              >
                {/* Summary Analysis */}
                {summary.diagnosis && (
                  <div className={`rounded-xl p-10 bg-primary/5 border transition-all duration-300 ${analysisOpen ? 'border-border' : 'border-border hover:border-primary/30 hover:shadow-card-hover'}`}>
                    <div className="flex items-center gap-2.5 mb-8">
                      <AiOutlineFileSearch size={20} style={{ color: tokens.warning }} />
                      <span className="text-[16px] uppercase tracking-[0.1em] font-semibold" style={{ color: tokens.warning }}>
                        Summary Analysis
                      </span>
                    </div>
                    <p className={`font-serif text-[15px] leading-[2] text-foreground m-0 whitespace-pre-wrap ${analysisOpen ? '' : 'line-clamp-4'}`}>
                      {summary.diagnosis}
                    </p>
                  </div>
                )}

                {/* How to Improve */}
                {summary.feedback && (
                  <div className={`rounded-xl p-10 bg-primary/5 border transition-all duration-300 ${analysisOpen ? 'border-border' : 'border-border hover:border-primary/30 hover:shadow-card-hover'}`}>
                    <div className="flex items-center gap-2.5 mb-8">
                      <FaArrowUpRightDots size={20} style={{ color: tokens.success }} />
                      <span className="text-[16px] uppercase tracking-[0.1em] font-semibold" style={{ color: tokens.success }}>
                        How to Improve
                      </span>
                    </div>
                    <p className={`font-serif text-[15px] leading-[2] text-foreground m-0 whitespace-pre-wrap italic ${analysisOpen ? '' : 'line-clamp-4'}`}>
                      {summary.feedback}
                    </p>
                  </div>
                )}
              </div>

              {/* Toggle */}
              {!analysisOpen && (
                <div className="flex justify-center mt-5">
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      toggleAnalysis(summary.id);
                      const card = e.currentTarget.closest('.bg-card-elevated');
                      if (card) setTimeout(() => card.scrollIntoView({ behavior: 'smooth', block: 'start' }), 50);
                    }}
                    className="flex items-center gap-2 text-[13px] uppercase tracking-[0.2em] font-semibold text-muted-foreground bg-transparent border-0 py-3 px-5 rounded-lg cursor-pointer hover:text-foreground hover:bg-sidebar-accent/50 transition-all duration-300"
                  >
                    Read Full Analysis
                    <ChevronDown size={15} />
                  </button>
                </div>
              )}
              {analysisOpen && (
                <div className="flex justify-center mt-5">
                  <button
                    onClick={(e) => { e.stopPropagation(); toggleAnalysis(summary.id); }}
                    className="flex items-center gap-2 text-[11px] uppercase tracking-[0.25em] font-semibold text-muted-light bg-transparent border-0 py-2 px-4 rounded-md cursor-pointer hover:text-muted-foreground hover:bg-sidebar-accent/50 transition-all duration-300"
                  >
                    Collapse
                    <ChevronUp size={13} />
                  </button>
                </div>
              )}
            </div>
          );
        })()}

        {/* Buttons when nothing is expanded */}
        {!pointsExpanded && !factsExpanded && (summary.points.length > 0 || relatedFacts.length > 0) && (
          <div className="px-10 pb-10 flex gap-8">
            {summary.points.length > 0 && (
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  togglePoints(summary.id);
                  const el = e.currentTarget;
                  el.style.scrollMarginTop = '140px';
                  setTimeout(() => el.scrollIntoView({ behavior: 'smooth', block: 'start' }), 50);
                }}
                className="text-[12px] text-muted-light bg-transparent p-0 cursor-pointer text-left uppercase tracking-[0.35em] font-semibold border-0 border-b border-solid border-muted-light/50 hover:border-dashed hover:text-muted-foreground hover:border-muted-foreground transition-colors duration-300"
              >
                VIEW {summary.points.length} POINTS
              </button>
            )}
            {relatedFacts.length > 0 && (
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  toggleRelatedFacts(summary.id);
                  const el = e.currentTarget;
                  el.style.scrollMarginTop = '140px';
                  setTimeout(() => el.scrollIntoView({ behavior: 'smooth', block: 'start' }), 50);
                }}
                className="text-[12px] text-muted-light bg-transparent p-0 cursor-pointer text-left uppercase tracking-[0.35em] font-semibold border-0 border-b border-solid border-muted-light/50 hover:border-dashed hover:text-muted-foreground hover:border-muted-foreground transition-colors duration-300"
              >
                VIEW {relatedFacts.length} RELATED FACTS
              </button>
            )}
          </div>
        )}

        {/* Summary Points - Expandable */}
        <AnimatePresence initial={false}>
          {pointsExpanded && summary.points.length > 0 && (
            <motion.div
              key="points-content"
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: 'auto', opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              transition={{ height: { duration: 0.4, ease: 'easeInOut' }, opacity: { duration: 0.2 } }}
              className="overflow-hidden"
            >
              <div className="px-10 py-14">
                <span className="text-[13px] uppercase tracking-[0.3em] font-bold text-muted-foreground">
                  Summary Points
                </span>

                <div className="mt-10 space-y-10">
                  {summary.points
                    .sort((a, b) => a.sortOrder - b.sortOrder)
                    .map(point => {
                      const leadingSpaces = point.text.match(/^(\s*)/)?.[1]?.length || 0;
                      const indentLevel = Math.floor(leadingSpaces / 2);
                      const trimmedText = point.text.trim();

                      return (
                        <div
                          key={point.id}
                          className="pl-8 border-l-2 border-border"
                          style={{ marginLeft: `${indentLevel * 24}px` }}
                        >
                          <p className="font-serif text-[17px] leading-[2] text-foreground m-0 italic">
                            {trimmedText}
                          </p>
                        </div>
                      );
                    })}
                </div>

                {/* Buttons at bottom of points section */}
                <div className="mt-12 flex gap-8">
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      togglePoints(summary.id);
                    }}
                    className="text-[10px] text-muted-light bg-transparent p-0 cursor-pointer text-left uppercase tracking-[0.35em] font-semibold border-0 border-b border-solid border-muted-light/50 hover:border-dashed hover:text-muted-foreground hover:border-muted-foreground transition-colors duration-300"
                  >
                    HIDE POINTS
                  </button>
                  {relatedFacts.length > 0 && !factsExpanded && (
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        toggleRelatedFacts(summary.id);
                        const el = e.currentTarget;
                        el.style.scrollMarginTop = '140px';
                        setTimeout(() => el.scrollIntoView({ behavior: 'smooth', block: 'start' }), 50);
                      }}
                      className="text-[10px] text-muted-light bg-transparent p-0 cursor-pointer text-left uppercase tracking-[0.35em] font-semibold border-0 border-b border-solid border-muted-light/50 hover:border-dashed hover:text-muted-foreground hover:border-muted-foreground transition-colors duration-300"
                    >
                      VIEW {relatedFacts.length} RELATED FACTS
                    </button>
                  )}
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Related DOK1 Facts - Expandable */}
        <AnimatePresence initial={false}>
          {factsExpanded && relatedFacts.length > 0 && (
            <motion.div
              key="facts-content"
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: 'auto', opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              transition={{ height: { duration: 0.4, ease: 'easeInOut' }, opacity: { duration: 0.2 } }}
              className="overflow-hidden"
            >
              <div className="px-10 py-14">
                <span className="text-[13px] uppercase tracking-[0.3em] font-bold text-muted-foreground mb-10 block">
                  Related DOK1 Facts
                </span>

                <div className="space-y-8">
                  {relatedFacts.map(fact => (
                    <button
                      key={fact.id}
                      onClick={() => navigateToFact(fact.id)}
                      className="w-full text-left p-6 bg-sidebar rounded-lg border border-transparent hover:border-primary/30 transition-colors cursor-pointer"
                    >
                      <div className="flex items-start gap-6">
                        <span className="font-serif text-[18px] text-muted-light shrink-0">
                          #{fact.originalId}
                        </span>
                        <p className="text-[14px] text-foreground m-0 line-clamp-2 leading-relaxed">
                          {fact.fact}
                        </p>
                      </div>
                    </button>
                  ))}
                </div>

                {/* Buttons at bottom of facts section */}
                <div className="mt-12 flex gap-8">
                  {summary.points.length > 0 && !pointsExpanded && (
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        togglePoints(summary.id);
                        const el = e.currentTarget;
                        el.style.scrollMarginTop = '140px';
                        setTimeout(() => el.scrollIntoView({ behavior: 'smooth', block: 'start' }), 50);
                      }}
                      className="text-[10px] text-muted-light bg-transparent p-0 cursor-pointer text-left uppercase tracking-[0.35em] font-semibold border-0 border-b border-solid border-muted-light/50 hover:border-dashed hover:text-muted-foreground hover:border-muted-foreground transition-colors duration-300"
                    >
                      VIEW {summary.points.length} POINTS
                    </button>
                  )}
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      toggleRelatedFacts(summary.id);
                    }}
                    className="text-[10px] text-muted-light bg-transparent p-0 cursor-pointer text-left uppercase tracking-[0.35em] font-semibold border-0 border-b border-solid border-muted-light/50 hover:border-dashed hover:text-muted-foreground hover:border-muted-foreground transition-colors duration-300"
                  >
                    HIDE FACTS
                  </button>
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    );
  };

  // Empty state
  if (summaries.length === 0) {
    return (
      <div className="max-w-[1420px] mx-auto">
        {/* Page Header */}
        <div className="flex flex-col gap-4 mb-6 pb-4">
          <h2 className="text-[30px] font-bold text-foreground tracking-tight leading-[1.1] m-0">
            DOK2 Summaries
          </h2>
          <p className="text-[15px] text-muted-light m-0 max-w-2xl font-serif italic">
            Your interpretation and synthesis of source materials.
          </p>
        </div>

        {/* Empty Card */}
        <div className="bg-card-elevated rounded-xl shadow-card py-20 px-12">
          <div className="flex flex-col items-center text-center">
            <BookOpen size={40} className="text-muted-light opacity-40 mb-8" />
            <h3 className="font-serif text-[24px] text-foreground m-0 mb-4">
              No Syntheses Yet
            </h3>
            <p className="text-[14px] text-muted-light m-0 max-w-md leading-relaxed">
              DOK2 summaries capture how you've reorganized and interpreted your source materials.
              They will appear here once your BrainLift includes DOK2 content.
            </p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-[1420px] mx-auto min-h-[200vh]">
      {/* Page Header */}
      <div className="flex flex-col gap-4 mb-6 pb-4">
        <div className="flex items-start justify-between gap-6">
          <div>
            <h2 className="text-[30px] font-bold text-foreground tracking-tight leading-[1.1] m-0">
              DOK2 Summaries
            </h2>
          </div>
        </div>

        <p className="text-[15px] text-muted-light m-0 max-w-2xl font-serif italic">
          Your interpretation and synthesis of source materials. Grades reflect how well you've reorganized the facts through your unique lens.
        </p>
      </div>

      {/* Stats Summary */}
      <div className="flex justify-between mb-16">
        {(() => {
          const gradedSummaries = summaries.filter(s => s.grade !== null);
          const avgGradeNum = gradedSummaries.length > 0
            ? gradedSummaries.reduce((sum, s) => sum + (s.grade || 0), 0) / gradedSummaries.length
            : 0;
          const meanGrade = gradedSummaries.length > 0 ? parseFloat(avgGradeNum.toFixed(2)) : '—';

          // Color based on avg grade
          const getMeanGradeColor = (score: number) => {
            if (score >= 4.5) return tokens.success;
            if (score >= 3.5) return tokens.info;
            if (score >= 1.5) return tokens.warning;
            if (score > 0) return tokens.danger;
            return tokens.textMuted;
          };

          const highQuality = summaries.filter(s => s.grade !== null && s.grade >= 4).length;
          const lowQuality = summaries.filter(s => s.grade !== null && s.grade <= 2).length;

          return [
            { label: ['TOTAL', 'SUMMARIES'], value: summaries.length, color: tokens.primary },
            { label: ['MEAN', 'GRADE'], value: meanGrade, color: getMeanGradeColor(avgGradeNum) },
            { label: ['HIGH', 'QUALITY'], value: highQuality, color: tokens.success },
            { label: ['NEEDS', 'WORK'], value: lowQuality, color: lowQuality > 0 ? tokens.warning : tokens.textMuted },
          ];
        })().map((stat, i) => (
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

      <FilterBar
        title="Active Syntheses"
        items={summaries}
        searchFn={summarySearchFn}
        scoreFn={summaryScoreFn}
        scoreLabels={SUMMARY_SCORE_LABELS}
        extraFilters={SUMMARY_EXTRA_FILTERS}
        onFilteredChange={handleFilteredChange}
        sortControl={sortControl}
        searchPlaceholder="Search summaries..."
      />

      {/* Content - depends on sort mode */}
      {filteredSummaries.length > 0 && (
        sortMode === 'grade' ? (
          // Flat list sorted by grade
          <div className="flex flex-col gap-16">
            {sortedByGrade.map((summary, index) => (
              <motion.div
                key={summary.id}
                layout
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.15 }}
              >
                {renderSummaryCard(summary)}
              </motion.div>
            ))}
          </div>
        ) : (
          // Grouped by category
          Array.from(groupedByCategory.entries()).map(([category, categorySummaries], groupIndex) => (
            <div key={category} className="mb-20">
              {/* Category Header */}
              <div className="flex items-center gap-3 mb-8">
                <h3 className="text-lg font-semibold m-0 text-foreground">{category}</h3>
                <span className="bg-sidebar text-muted-foreground text-xs py-1 px-2.5 rounded-xl">
                  {categorySummaries.length} source{categorySummaries.length !== 1 ? 's' : ''}
                </span>
              </div>

              {/* Source Cards */}
              <div className="flex flex-col gap-16">
                {categorySummaries.map((summary) => (
                  <motion.div
                    key={summary.id}
                    layout
                    initial={{ opacity: 0, y: 12 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0 }}
                    transition={{ duration: 0.15 }}
                  >
                    {renderSummaryCard(summary)}
                  </motion.div>
                ))}
              </div>
            </div>
          ))
        )
      )}
    </div>
  );
}
