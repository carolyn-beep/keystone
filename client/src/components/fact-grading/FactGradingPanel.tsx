import { useState, useMemo, useCallback, useRef, useLayoutEffect } from 'react';
import { useMutation } from '@tanstack/react-query';
import { useVirtualizer } from '@tanstack/react-virtual';
import { ChevronRight } from 'lucide-react';
import { tokens } from '@/lib/colors';
import { queryClient } from '@/lib/queryClient';
import { useToast } from '@/hooks/use-toast';
import type { Fact } from '@shared/schema';
import { FactRow, type HumanGrade } from './FactRow';
import { type RedundancyGroup } from './RedundancyGroupCard';
import { FilterBar, type ExtraFilter } from '@/components/FilterBar';
import overlapIcon from '@/assets/icons/overlap.svg';

export interface RedundancyData {
  groups: RedundancyGroup[];
  stats: {
    totalFacts: number;
    uniqueFactCount: number;
    redundantFactCount: number;
    pendingReview: number;
  };
}

export interface FactGradingPanelProps {
  slug: string;
  facts: Fact[];
  humanGrades: Record<number, HumanGrade>;
  redundancyData?: RedundancyData;
  onViewFactFullText: (fact: Fact) => void;
  onNavigateToRedundancy: () => void;
  canModify?: boolean;
  isAdmin?: boolean;
}

const FACT_SCORE_LABELS: Record<number, string> = {
  5: 'Verified', 4: 'Strong', 3: 'Partial', 2: 'Weak', 1: 'Failed',
};

const factSearchFn = (fact: Fact, query: string): boolean => {
  const q = query.toLowerCase();
  return (
    fact.fact.toLowerCase().includes(q) ||
    fact.originalId.toLowerCase().includes(q) ||
    (fact.source?.toLowerCase().includes(q) ?? false) ||
    fact.category.toLowerCase().includes(q)
  );
};

const factScoreFn = (fact: Fact): number | null => fact.score > 0 ? fact.score : null;

export function FactGradingPanel({
  slug,
  facts,
  humanGrades,
  redundancyData,
  onViewFactFullText,
  onNavigateToRedundancy,
  canModify = true,
  isAdmin = false,
}: FactGradingPanelProps) {
  const { toast } = useToast();

  // State for expanded fact rows
  const [expandedFactIds, setExpandedFactIds] = useState<Set<number>>(new Set());

  // Filtered facts from FilterBar
  const [filteredFacts, setFilteredFacts] = useState<Fact[]>([]);

  const toggleFactExpanded = (factId: number) => {
    setExpandedFactIds(prev => {
      const next = new Set(prev);
      if (next.has(factId)) {
        next.delete(factId);
      } else {
        next.add(factId);
      }
      return next;
    });
  };

  // Human grade mutation
  const setHumanGradeMutation = useMutation({
    mutationFn: async ({ factId, score }: { factId: number; score: number }) => {
      const res = await fetch(`/api/brainlifts/${slug}/facts/${factId}/human-grade`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ score }),
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.message || 'Failed to set grade');
      }
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['human-grades', slug] });
      toast({
        title: 'Grade Saved',
        description: 'Your grade has been saved successfully.',
      });
    },
    onError: (error: Error) => {
      toast({
        title: 'Failed to Save Grade',
        description: error.message,
        variant: 'destructive',
      });
    },
  });

  // Build set of fact IDs in pending redundancy groups (for filter)
  const factsInRedundancyGroups = useMemo(() => {
    const set = new Set<number>();
    if (redundancyData?.groups) {
      for (const group of redundancyData.groups) {
        if (group.status === 'pending') {
          for (const groupFact of group.facts) {
            set.add(groupFact.id);
          }
        }
      }
    }
    return set;
  }, [redundancyData]);

  // ALL facts sorted by score (stack ranked)
  const allFactsSorted = useMemo(() =>
    [...facts].sort((a, b) => b.score - a.score || a.originalId.localeCompare(b.originalId)),
  [facts]);

  // Extra filters for Facts tab
  const extraFilters = useMemo<ExtraFilter<Fact>[]>(() => [
    { key: 'flagged', label: 'Flagged', predicate: (f: Fact) => (f.flags?.length ?? 0) > 0 },
    { key: 'redundant', label: 'Redundant', predicate: (f: Fact) => factsInRedundancyGroups.has(f.id) },
  ], [factsInRedundancyGroups]);

  const handleFilteredChange = useCallback((items: Fact[]) => {
    setFilteredFacts(items);
  }, []);

  const handleSearchScroll = useCallback(() => {
    if (factsSectionRef.current) {
      factsSectionRef.current.style.scrollMarginTop = '10px';
      setTimeout(() => factsSectionRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 350);
    }
  }, []);

  const nonGradeableFacts = facts.filter(f => !f.isGradeable);

  // Virtualization for the main facts list
  const listContainerRef = useRef<HTMLDivElement>(null);
  const [scrollElement, setScrollElement] = useState<HTMLElement | null>(null);
  const [scrollMargin, setScrollMargin] = useState(0);

  // Find the nearest scrollable ancestor (<main> with overflow-y-auto) and measure offset
  useLayoutEffect(() => {
    const listEl = listContainerRef.current;
    if (!listEl) return;

    let scrollEl: HTMLElement | null = listEl.parentElement;
    while (scrollEl) {
      const { overflowY } = getComputedStyle(scrollEl);
      if (overflowY === 'auto' || overflowY === 'scroll') break;
      scrollEl = scrollEl.parentElement;
    }

    if (scrollEl) {
      setScrollElement(scrollEl);
      const scrollRect = scrollEl.getBoundingClientRect();
      const listRect = listEl.getBoundingClientRect();
      setScrollMargin(listRect.top - scrollRect.top + scrollEl.scrollTop);
    }
  }, [filteredFacts.length]);

  const virtualizer = useVirtualizer({
    count: filteredFacts.length,
    getScrollElement: () => scrollElement,
    estimateSize: () => 350,
    overscan: 5,
    scrollMargin,
  });

  const factsSectionRef = useRef<HTMLDivElement>(null);

  const totalFacts = facts.length;
  const gradedFacts = Object.keys(humanGrades).length;
  const pendingRedundancies = redundancyData?.stats?.pendingReview ?? 0;
  const redundantFactCount = redundancyData?.stats?.redundantFactCount ?? 0;

  return (
    <div className="max-w-[1200px] mx-auto min-h-[200vh]">
      {/* Panel Header */}
      <div className="flex flex-col gap-4 mb-6 pb-4">
        <div className="flex items-start justify-between gap-6">
          <div>
            <h2 className="text-[30px] font-bold text-foreground tracking-tight leading-[1.1] m-0">
              DOK1 Facts Grading
            </h2>
          </div>

        </div>

        <div className="flex flex-wrap items-center gap-2 text-[12px] uppercase tracking-[0.35em] text-muted-foreground">
          <span className="font-semibold">{totalFacts} FACTS EXTRACTED</span>
          <span aria-hidden className="text-[18px] font-extrabold text-muted-light">&middot;</span>
          <span className="font-semibold">{gradedFacts} GRADED</span>
        </div>
      </div>

      {/* Non-gradeable notice */}
      {nonGradeableFacts.length > 0 && (
        <div className="py-3 px-4 bg-muted rounded-lg mb-5 text-[13px] text-muted-foreground">
          This document contains {nonGradeableFacts.length} non-gradeable claims (prescriptive statements or uncited claims) alongside verifiable DOK1 facts.
        </div>
      )}

      {/* Stats Summary */}
      <div className="flex justify-between mb-16">
        {(() => {
          const gradeableFacts = facts.filter(f => f.isGradeable && f.score > 0);
          const meanScoreNum = gradeableFacts.length > 0
            ? gradeableFacts.reduce((sum, f) => sum + f.score, 0) / gradeableFacts.length
            : 0;
          const meanScore = gradeableFacts.length > 0 ? parseFloat(meanScoreNum.toFixed(2)) : '—';

          const getMeanScoreColor = (score: number) => {
            if (score >= 4.5) return tokens.success;
            if (score >= 3.5) return tokens.info;
            if (score >= 1.5) return tokens.warning;
            if (score > 0) return tokens.danger;
            return tokens.textMuted;
          };

          const highlyVerified = facts.filter(f => f.score === 5).length;
          const redundantCount = redundancyData?.stats?.redundantFactCount || 0;
          const coreFacts = redundancyData?.stats?.uniqueFactCount || facts.length;

          return [
            { label: ['TOTAL', 'FACTS'], value: facts.length, color: tokens.primary },
            { label: ['CORE', 'FACTS'], value: coreFacts, color: tokens.success },
            { label: ['MEAN', 'SCORE'], value: meanScore, color: getMeanScoreColor(meanScoreNum) },
            { label: ['HIGHLY', 'VERIFIED'], value: highlyVerified, color: tokens.success },
            { label: ['REDUNDANT', ''], value: redundantCount, color: redundantCount > 0 ? tokens.warning : tokens.textMuted },
          ];
        })().map((stat, i) => (
          <div
            key={i}
            className="w-[160px] py-6 px-5 bg-card-elevated rounded-lg  shadow-card flex flex-col animate-fade-slide-in"
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

      {/* Redundancy Alert Banner */}
      {pendingRedundancies > 0 && (
        <button
          onClick={onNavigateToRedundancy}
          className="w-full mb-16 rounded-xl overflow-hidden shadow-card bg-transparent border-0 p-0 cursor-pointer text-left group transition-shadow duration-300 hover:shadow-card-hover"
        >
          <div className="py-5 px-8 bg-primary/5 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <img src={overlapIcon} alt="" className="w-5 h-5 opacity-40" />
              <span className="text-[11px] uppercase tracking-[0.35em] font-semibold" style={{ color: tokens.warning }}>
                Redundancy Review Required
              </span>
              <span aria-hidden className="text-[10px] font-extrabold text-muted-light">&middot;</span>
              <span className="text-[10px] uppercase tracking-[0.35em] font-semibold text-muted-foreground">
                {redundantFactCount} {redundantFactCount === 1 ? 'FACT' : 'FACTS'} ACROSS {pendingRedundancies} {pendingRedundancies === 1 ? 'GROUP' : 'GROUPS'}
              </span>
            </div>
            <div className="flex items-center gap-1.5 text-[11px] uppercase tracking-[0.25em] font-semibold text-muted-foreground group-hover:text-foreground transition-colors duration-300">
              <span>Review</span>
              <ChevronRight size={14} className="transition-transform duration-300 group-hover:translate-x-0.5" />
            </div>
          </div>
          <div className="py-4 px-8 bg-card-elevated border-t border-border">
            <p className="m-0 font-serif text-[13px] italic text-muted-foreground leading-relaxed">
              {redundantFactCount} {redundantFactCount === 1 ? 'fact has' : 'facts have'} been flagged as semantically redundant. Review to keep the strongest and remove duplicates.
            </p>
          </div>
        </button>
      )}

      {/* Individual Facts Section (Stack Ranked) - Virtualized */}
      {allFactsSorted.length > 0 && (
        <div ref={factsSectionRef} className="animate-fade-slide-in" style={{ animationDelay: '500ms', animationFillMode: 'backwards' }}>
          <FilterBar
            title="Individual Facts"
            titleRight={
              <span className="text-[10px] uppercase tracking-[0.35em] text-muted-light font-semibold">
                STACK RANKED
              </span>
            }
            items={allFactsSorted}
            searchFn={factSearchFn}
            scoreFn={factScoreFn}
            scoreLabels={FACT_SCORE_LABELS}
            extraFilters={extraFilters}
            onFilteredChange={handleFilteredChange}
            searchPlaceholder="Search facts..."
            onSearchInput={handleSearchScroll}
          />

          {filteredFacts.length > 0 && (
            <div ref={listContainerRef} style={{ height: virtualizer.getTotalSize(), position: 'relative' }}>
              {virtualizer.getVirtualItems().map((virtualRow) => {
                const fact = filteredFacts[virtualRow.index];
                return (
                  <div
                    key={fact.id}
                    data-index={virtualRow.index}
                    ref={virtualizer.measureElement}
                    className={"pb-16"}
                    style={{
                      position: 'absolute',
                      top: 0,
                      left: 0,
                      width: '100%',
                      transform: `translateY(${virtualRow.start - scrollMargin}px)`,
                    }}
                  >
                      <FactRow
                        fact={fact}
                        isExpanded={expandedFactIds.has(fact.id)}
                        onToggle={() => toggleFactExpanded(fact.id)}
                        humanGrade={humanGrades[fact.id]}

                        onSaveGrade={(score) => {
                          if (score) {
                            setHumanGradeMutation.mutate({ factId: fact.id, score });
                          }
                        }}
                        isSavingGrade={setHumanGradeMutation.isPending}
                        onViewFullText={() => onViewFactFullText(fact)}
                        isRedundant={factsInRedundancyGroups.has(fact.id)}
                        canModify={canModify}
                        isAdmin={isAdmin}
                      />
                    </div>
                  );
                })}
            </div>
          )}
        </div>
      )}

      {/* Empty State */}
      {facts.length === 0 && (
        <div className="p-12 text-center text-muted-foreground">
          <p>No facts to grade yet.</p>
        </div>
      )}
    </div>
  );
}
