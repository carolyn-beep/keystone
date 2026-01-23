import { useState, useMemo } from 'react';
import {
  FileText,
  ChevronDown,
  ChevronUp,
  ExternalLink,
  BookOpen,
  Layers,
  AlertTriangle,
  ArrowUpDown,
} from 'lucide-react';
import type { Fact, DOK2FailReason } from '@shared/schema';

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

// Grade color configuration
const GRADE_COLORS: Record<number, { bg: string; text: string; border: string }> = {
  1: { bg: 'bg-red-100 dark:bg-red-900/30', text: 'text-red-700 dark:text-red-300', border: 'border-red-300 dark:border-red-700' },
  2: { bg: 'bg-orange-100 dark:bg-orange-900/30', text: 'text-orange-700 dark:text-orange-300', border: 'border-orange-300 dark:border-orange-700' },
  3: { bg: 'bg-yellow-100 dark:bg-yellow-900/30', text: 'text-yellow-700 dark:text-yellow-300', border: 'border-yellow-300 dark:border-yellow-700' },
  4: { bg: 'bg-green-100 dark:bg-green-900/30', text: 'text-green-700 dark:text-green-300', border: 'border-green-300 dark:border-green-700' },
  5: { bg: 'bg-emerald-100 dark:bg-emerald-900/30', text: 'text-emerald-700 dark:text-emerald-300', border: 'border-emerald-300 dark:border-emerald-700' },
};

// Fail reason display labels
const FAIL_REASON_LABELS: Record<string, string> = {
  copy_paste: 'Copy-paste detected',
  no_purpose_relation: 'No connection to BrainLift purpose',
  factual_misrepresentation: 'Factual misrepresentation',
  fact_manipulation: 'Facts manipulated to fit narrative',
};

function GradeBadge({ grade, failReason }: { grade: number | null; failReason: DOK2FailReason | null }) {
  if (grade === null) {
    return (
      <span className="px-2 py-1 text-xs font-medium rounded-full bg-muted text-muted-foreground">
        Not graded
      </span>
    );
  }

  const colors = GRADE_COLORS[grade] || GRADE_COLORS[3];

  return (
    <div className="flex items-center gap-2">
      <span className={`px-2.5 py-1 text-sm font-bold rounded-full ${colors.bg} ${colors.text} border ${colors.border}`}>
        {grade}/5
      </span>
      {grade === 1 && failReason && (
        <span className="flex items-center gap-1 px-2 py-1 text-xs font-medium rounded-full bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-300">
          <AlertTriangle size={12} />
          {FAIL_REASON_LABELS[failReason] || failReason}
        </span>
      )}
    </div>
  );
}

export function SummariesTab({ summaries, facts, setActiveTab }: SummariesTabProps) {
  // Track which source cards are expanded (default: all expanded)
  const [expandedSources, setExpandedSources] = useState<Record<number, boolean>>(() =>
    Object.fromEntries(summaries.map(s => [s.id, true]))
  );

  // Track which sections are expanded within each card
  const [expandedDiagnosis, setExpandedDiagnosis] = useState<Record<number, boolean>>(() =>
    Object.fromEntries(summaries.map(s => [s.id, true]))
  );
  const [expandedFeedback, setExpandedFeedback] = useState<Record<number, boolean>>(() =>
    Object.fromEntries(summaries.map(s => [s.id, true]))
  );
  const [expandedPoints, setExpandedPoints] = useState<Record<number, boolean>>({});
  const [expandedFacts, setExpandedFacts] = useState<Record<number, boolean>>({});

  // Sort mode state
  const [sortMode, setSortMode] = useState<SortMode>('grade');

  // Group summaries by category
  const groupedByCategory = useMemo(() => {
    const groups = new Map<string, DOK2Summary[]>();
    for (const summary of summaries) {
      const category = summary.category || 'General';
      if (!groups.has(category)) {
        groups.set(category, []);
      }
      groups.get(category)!.push(summary);
    }
    return groups;
  }, [summaries]);

  // Sort summaries by grade (highest first)
  const sortedByGrade = useMemo(() => {
    return [...summaries].sort((a, b) => {
      // Put ungraded items last
      if (a.grade === null && b.grade === null) return 0;
      if (a.grade === null) return 1;
      if (b.grade === null) return -1;
      return b.grade - a.grade; // Highest grade first
    });
  }, [summaries]);

  // Calculate stats
  const totalPoints = useMemo(() =>
    summaries.reduce((sum, s) => sum + s.points.length, 0),
    [summaries]
  );

  const avgGrade = useMemo(() => {
    const graded = summaries.filter(s => s.grade !== null);
    if (graded.length === 0) return null;
    const sum = graded.reduce((acc, s) => acc + (s.grade || 0), 0);
    return (sum / graded.length).toFixed(1);
  }, [summaries]);

  // Get fact by ID helper
  const getFactById = (factId: number) => facts.find(f => f.id === factId);

  // Toggle functions
  const toggleSource = (summaryId: number) => {
    setExpandedSources(prev => ({ ...prev, [summaryId]: !prev[summaryId] }));
  };
  const toggleDiagnosis = (summaryId: number) => {
    setExpandedDiagnosis(prev => ({ ...prev, [summaryId]: !prev[summaryId] }));
  };
  const toggleFeedback = (summaryId: number) => {
    setExpandedFeedback(prev => ({ ...prev, [summaryId]: !prev[summaryId] }));
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

  // Render a single summary card
  const renderSummaryCard = (summary: DOK2Summary) => {
    const isExpanded = expandedSources[summary.id];
    const diagnosisExpanded = expandedDiagnosis[summary.id];
    const feedbackExpanded = expandedFeedback[summary.id];
    const pointsExpanded = expandedPoints[summary.id];
    const factsExpanded = expandedFacts[summary.id];
    const relatedFacts = summary.relatedFactIds
      .map(id => getFactById(id))
      .filter((f): f is Fact => f !== undefined);

    return (
      <div
        key={summary.id}
        className="bg-card rounded-xl transition-all duration-200 border border-border"
      >
        {/* Header - Always visible */}
        <div
          className="p-5 cursor-pointer"
          onClick={() => toggleSource(summary.id)}
        >
          <div className="flex items-start justify-between gap-4">
            <div className="flex items-start gap-3 flex-1 min-w-0">
              {/* Grade Badge */}
              <GradeBadge grade={summary.grade} failReason={summary.failReason} />
              <div className="min-w-0 flex-1">
                <h4 className="text-base font-semibold text-foreground m-0 truncate">
                  {summary.sourceName}
                </h4>
                <div className="flex items-center gap-2 mt-0.5 flex-wrap">
                  <span className="text-xs text-muted-foreground">
                    {summary.points.length} point{summary.points.length !== 1 ? 's' : ''}
                  </span>
                  {sortMode === 'grade' && (
                    <span className="text-xs text-muted-foreground">
                      • {summary.category}
                    </span>
                  )}
                  {summary.sourceUrl && (
                    <a
                      href={summary.sourceUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-xs text-primary flex items-center gap-1 hover:underline"
                      onClick={(e) => e.stopPropagation()}
                    >
                      View source <ExternalLink size={10} />
                    </a>
                  )}
                  {!summary.sourceUrl && (
                    <span className="text-xs text-orange-600 dark:text-orange-400">
                      No source link
                    </span>
                  )}
                </div>
              </div>
            </div>
            <button
              className="p-2 rounded-lg hover:bg-sidebar transition-colors text-muted-foreground shrink-0"
              aria-label={isExpanded ? 'Collapse' : 'Expand'}
            >
              {isExpanded ? <ChevronUp size={18} /> : <ChevronDown size={18} />}
            </button>
          </div>
        </div>

        {/* Expanded Content */}
        {isExpanded && (
          <div className="px-5 pb-5 space-y-4">
            {/* Diagnosis Section */}
            {summary.diagnosis && (
              <div className="border-t border-border pt-4">
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    toggleDiagnosis(summary.id);
                  }}
                  className="flex items-center gap-2 text-sm font-medium text-foreground hover:text-primary transition-colors bg-transparent border-none cursor-pointer p-0 w-full text-left"
                >
                  {diagnosisExpanded ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
                  <span>Diagnosis</span>
                </button>
                {diagnosisExpanded && (
                  <div className="mt-2 p-3 bg-sidebar rounded-lg">
                    <p className="text-sm text-foreground m-0 whitespace-pre-wrap">
                      {summary.diagnosis}
                    </p>
                  </div>
                )}
              </div>
            )}

            {/* Feedback Section */}
            {summary.feedback && (
              <div className="border-t border-border pt-4">
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    toggleFeedback(summary.id);
                  }}
                  className="flex items-center gap-2 text-sm font-medium text-foreground hover:text-primary transition-colors bg-transparent border-none cursor-pointer p-0 w-full text-left"
                >
                  {feedbackExpanded ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
                  <span>How to Improve</span>
                </button>
                {feedbackExpanded && (
                  <div className="mt-2 p-3 bg-blue-50 dark:bg-blue-900/20 rounded-lg border border-blue-200 dark:border-blue-800">
                    <p className="text-sm text-foreground m-0 whitespace-pre-wrap">
                      {summary.feedback}
                    </p>
                  </div>
                )}
              </div>
            )}

            {/* Summary Points Section */}
            <div className="border-t border-border pt-4">
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  togglePoints(summary.id);
                }}
                className="flex items-center gap-2 text-sm font-medium text-foreground hover:text-primary transition-colors bg-transparent border-none cursor-pointer p-0"
              >
                {pointsExpanded ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
                <span>Summary Points ({summary.points.length})</span>
              </button>
              {pointsExpanded && (
                <div className="mt-2 bg-sidebar rounded-lg p-4">
                  <ul className="m-0 pl-4 space-y-1.5">
                    {summary.points
                      .sort((a, b) => a.sortOrder - b.sortOrder)
                      .map(point => {
                        const leadingSpaces = point.text.match(/^(\s*)/)?.[1]?.length || 0;
                        const indentLevel = Math.floor(leadingSpaces / 2);
                        const trimmedText = point.text.trim();

                        return (
                          <li
                            key={point.id}
                            className="text-sm text-foreground leading-relaxed list-none"
                            style={{ marginLeft: `${indentLevel * 16}px` }}
                          >
                            <span className="flex items-start gap-2">
                              <span className={`shrink-0 mt-1.5 w-1.5 h-1.5 rounded-full ${
                                indentLevel === 0 ? 'bg-primary' : 'bg-muted-foreground/50'
                              }`} />
                              <span>{trimmedText}</span>
                            </span>
                          </li>
                        );
                      })}
                  </ul>
                </div>
              )}
            </div>

            {/* Related DOK1 Facts Section */}
            {relatedFacts.length > 0 && (
              <div className="border-t border-border pt-4">
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    toggleRelatedFacts(summary.id);
                  }}
                  className="flex items-center gap-2 text-sm font-medium text-foreground hover:text-primary transition-colors bg-transparent border-none cursor-pointer p-0"
                >
                  {factsExpanded ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
                  <span>Related DOK1 Facts ({relatedFacts.length})</span>
                </button>
                {factsExpanded && (
                  <div className="mt-3 space-y-2">
                    {relatedFacts.map(fact => (
                      <button
                        key={fact.id}
                        onClick={() => navigateToFact(fact.id)}
                        className="w-full text-left p-3 bg-sidebar rounded-lg border border-transparent hover:border-primary/30 transition-colors cursor-pointer"
                      >
                        <div className="flex items-start gap-2">
                          <span className="text-xs font-semibold text-primary bg-primary/10 px-1.5 py-0.5 rounded shrink-0">
                            #{fact.originalId}
                          </span>
                          <p className="text-sm text-foreground m-0 line-clamp-2">
                            {fact.fact}
                          </p>
                        </div>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
        )}
      </div>
    );
  };

  // Empty state
  if (summaries.length === 0) {
    return (
      <div className="max-w-[1200px] mx-auto">
        <div className="text-center py-16 bg-card rounded-xl border border-border">
          <BookOpen size={48} className="mx-auto mb-4 text-muted-foreground opacity-50" />
          <h3 className="text-lg font-semibold text-foreground mb-2">No Summaries Found</h3>
          <p className="text-muted-foreground max-w-md mx-auto">
            DOK2 summaries capture the owner's interpretation and synthesis of source materials.
            They will appear here once your brainlift includes DOK2 content.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-[1200px] mx-auto">
      {/* Page Header */}
      <div className="mb-8 pb-5 border-b border-border">
        <div className="flex justify-between items-start flex-wrap gap-4">
          <div>
            <h2 className="text-2xl font-bold m-0 mb-2 text-foreground">
              DOK2 Summaries
            </h2>
            <p className="text-[15px] text-muted-foreground m-0">
              Your interpretation and synthesis of source materials. Grades reflect how well you've reorganized the facts through your unique lens.
            </p>
          </div>
          {/* Sort Toggle */}
          <button
            onClick={() => setSortMode(prev => prev === 'grade' ? 'category' : 'grade')}
            className="flex items-center gap-2 px-3 py-2 text-sm font-medium bg-sidebar hover:bg-sidebar/80 rounded-lg transition-colors text-foreground border border-border"
          >
            <ArrowUpDown size={16} />
            {sortMode === 'grade' ? 'Sort by Category' : 'Sort by Grade'}
          </button>
        </div>
      </div>

      {/* Summary Stats */}
      <div className="flex gap-6 px-5 py-4 bg-sidebar rounded-lg mb-8 flex-wrap">
        <div className="flex items-center gap-2">
          <Layers size={18} className="text-primary" />
          <span className="text-[13px] text-muted-foreground">Total summaries:</span>
          <span className="text-[15px] font-semibold text-foreground">{summaries.length}</span>
        </div>
        <div className="flex items-center gap-2">
          <FileText size={18} className="text-primary" />
          <span className="text-[13px] text-muted-foreground">Total points:</span>
          <span className="text-[15px] font-semibold text-foreground">{totalPoints}</span>
        </div>
        {avgGrade && (
          <div className="flex items-center gap-2">
            <span className="text-[13px] text-muted-foreground">Avg grade:</span>
            <span className="text-[15px] font-semibold text-foreground">{avgGrade}/5</span>
          </div>
        )}
      </div>

      {/* Content - depends on sort mode */}
      {sortMode === 'grade' ? (
        // Flat list sorted by grade
        <div className="flex flex-col gap-4">
          {sortedByGrade.map(renderSummaryCard)}
        </div>
      ) : (
        // Grouped by category
        Array.from(groupedByCategory.entries()).map(([category, categorySummaries]) => (
          <div key={category} className="mb-10">
            {/* Category Header */}
            <div className="flex items-center gap-3 mb-4">
              <h3 className="text-lg font-semibold m-0 text-foreground">{category}</h3>
              <span className="bg-sidebar text-muted-foreground text-xs py-1 px-2.5 rounded-xl">
                {categorySummaries.length} source{categorySummaries.length !== 1 ? 's' : ''}
              </span>
            </div>

            {/* Source Cards */}
            <div className="flex flex-col gap-4">
              {categorySummaries.map(renderSummaryCard)}
            </div>
          </div>
        ))
      )}
    </div>
  );
}
