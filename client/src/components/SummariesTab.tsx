import { useState, useMemo } from 'react';
import {
  FileText,
  ChevronDown,
  ChevronUp,
  ExternalLink,
  BookOpen,
  Layers,
} from 'lucide-react';
import { tokens } from '@/lib/colors';
import type { Fact } from '@shared/schema';

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
}

interface SummariesTabProps {
  summaries: DOK2Summary[];
  facts: Fact[];
  setActiveTab: (tab: string) => void;
}

export function SummariesTab({ summaries, facts, setActiveTab }: SummariesTabProps) {
  // Track which source cards are expanded (default: all expanded)
  const [expandedSources, setExpandedSources] = useState<Record<number, boolean>>(() =>
    Object.fromEntries(summaries.map(s => [s.id, true]))
  );

  // Track which "related facts" sections are expanded (default: collapsed)
  const [expandedFacts, setExpandedFacts] = useState<Record<number, boolean>>({});

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

  // Calculate stats
  const totalPoints = useMemo(() =>
    summaries.reduce((sum, s) => sum + s.points.length, 0),
    [summaries]
  );

  // Get fact by ID helper
  const getFactById = (factId: number) => facts.find(f => f.id === factId);

  // Toggle source expansion
  const toggleSource = (summaryId: number) => {
    setExpandedSources(prev => ({
      ...prev,
      [summaryId]: !prev[summaryId],
    }));
  };

  // Toggle related facts section
  const toggleRelatedFacts = (summaryId: number) => {
    setExpandedFacts(prev => ({
      ...prev,
      [summaryId]: !prev[summaryId],
    }));
  };

  // Navigate to a specific fact in the Grading tab
  const navigateToFact = (factId: number) => {
    setActiveTab('grading');
    setTimeout(() => {
      const el = document.getElementById(`fact-row-${factId}`);
      if (el) {
        el.scrollIntoView({ behavior: 'smooth', block: 'center' });
        // Add a brief highlight effect
        el.classList.add('ring-2', 'ring-primary', 'ring-offset-2');
        setTimeout(() => {
          el.classList.remove('ring-2', 'ring-primary', 'ring-offset-2');
        }, 2000);
      }
    }, 150);
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
              Summaries
            </h2>
            <p className="text-[15px] text-muted-foreground m-0">
              DOK2 summaries - the owner's interpretation and synthesis of source materials.
            </p>
            <p className="text-sm text-primary mt-1 mb-0 font-medium">
              These reflect how the owner understands and connects the evidence.
            </p>
          </div>
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
      </div>

      {/* Grouped by Category */}
      {Array.from(groupedByCategory.entries()).map(([category, categorySummaries]) => (
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
            {categorySummaries.map(summary => {
              const isExpanded = expandedSources[summary.id];
              const factsExpanded = expandedFacts[summary.id];
              const relatedFacts = summary.relatedFactIds
                .map(id => getFactById(id))
                .filter((f): f is Fact => f !== undefined);

              return (
                <div
                  key={summary.id}
                  className="bg-card rounded-xl transition-all duration-200 border border-border"
                >
                  {/* Source Header - Always visible */}
                  <div
                    className="p-5 cursor-pointer flex items-center justify-between"
                    onClick={() => toggleSource(summary.id)}
                  >
                    <div className="flex items-center gap-3 flex-1 min-w-0">
                      <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
                        <BookOpen size={20} className="text-primary" />
                      </div>
                      <div className="min-w-0">
                        <h4 className="text-base font-semibold text-foreground m-0 truncate">
                          {summary.sourceName}
                        </h4>
                        <div className="flex items-center gap-2 mt-0.5">
                          <span className="text-xs text-muted-foreground">
                            {summary.points.length} point{summary.points.length !== 1 ? 's' : ''}
                          </span>
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
                        </div>
                      </div>
                    </div>
                    <button
                      className="p-2 rounded-lg hover:bg-sidebar transition-colors text-muted-foreground"
                      aria-label={isExpanded ? 'Collapse' : 'Expand'}
                    >
                      {isExpanded ? <ChevronUp size={18} /> : <ChevronDown size={18} />}
                    </button>
                  </div>

                  {/* Expanded Content */}
                  {isExpanded && (
                    <div className="px-5 pb-5">
                      {/* Summary Points */}
                      <div className="bg-sidebar rounded-lg p-4 mb-4">
                        <ul className="m-0 pl-4 space-y-1.5">
                          {summary.points
                            .sort((a, b) => a.sortOrder - b.sortOrder)
                            .map(point => {
                              // Detect indentation level from leading spaces (2 spaces = 1 level)
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

                      {/* Related DOK1 Facts Section */}
                      {relatedFacts.length > 0 && (
                        <div className="border-t border-border pt-4">
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              toggleRelatedFacts(summary.id);
                            }}
                            className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors bg-transparent border-none cursor-pointer p-0"
                          >
                            {factsExpanded ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
                            <span className="font-medium">
                              Related DOK1 Facts ({relatedFacts.length})
                            </span>
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
            })}
          </div>
        </div>
      ))}
    </div>
  );
}
