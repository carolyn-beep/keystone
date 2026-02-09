import { useState, useMemo, useRef, useLayoutEffect } from 'react';
import { useMutation } from '@tanstack/react-query';
import { useVirtualizer } from '@tanstack/react-virtual';
import { tokens } from '@/lib/colors';
import { queryClient } from '@/lib/queryClient';
import { useToast } from '@/hooks/use-toast';
import type { Fact } from '@shared/schema';
import { FactRow, type HumanGrade } from './FactRow';
import { RedundancyGroupCard, type RedundancyGroup } from './RedundancyGroupCard';

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
  onShowRedundancyModal: () => void;
  onViewFactFullText: (fact: Fact) => void;
  canModify?: boolean;
}

export function FactGradingPanel({
  slug,
  facts,
  humanGrades,
  redundancyData,
  onShowRedundancyModal,
  onViewFactFullText,
  canModify = true,
}: FactGradingPanelProps) {
  const { toast } = useToast();

  // State for expanded fact rows
  const [expandedFactIds, setExpandedFactIds] = useState<Set<number>>(new Set());

  // State for grading


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

  // Build redundancy lookup: factId -> group info
  const redundancyLookup = useMemo(() => {
    const lookup: Record<number, {
      groupId: number;
      groupName: string;
      isPrimary: boolean;
      similarTo: string;
      similarityScore: string;
      reason: string;
      status: string;
    }> = {};
    if (redundancyData?.groups) {
      for (const group of redundancyData.groups) {
        for (const factId of group.factIds) {
          const isPrimary = factId === group.primaryFactId;
          const primaryFact = group.facts.find(f => f.id === group.primaryFactId);
          lookup[factId] = {
            groupId: group.id,
            groupName: group.groupName,
            isPrimary,
            similarTo: isPrimary ? '' : `Similar to ${primaryFact?.originalId || 'primary'}`,
            similarityScore: group.similarityScore,
            reason: group.reason,
            status: group.status,
          };
        }
      }
    }
    return lookup;
  }, [redundancyData]);

  // Build a map of fact.id -> full Fact object for quick lookup
  const factById = useMemo(() => {
    const map = new Map<number, Fact>();
    for (const fact of facts) {
      map.set(fact.id, fact);
    }
    return map;
  }, [facts]);

  // Build set of fact IDs in pending redundancy groups
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

  // Group facts by redundancy for visual display
  const groupedFacts = useMemo(() => {
    const groups: Map<number, {
      group: RedundancyGroup;
      facts: Fact[];
    }> = new Map();

    // Use group.facts directly from redundancy data (same approach as the modal)
    if (redundancyData?.groups) {
      for (const group of redundancyData.groups) {
        if (group.status === 'pending') {
          // Get full Fact objects from factById map
          const groupFacts: Fact[] = [];
          for (const groupFact of group.facts) {
            const fullFact = factById.get(groupFact.id);
            if (fullFact) {
              groupFacts.push(fullFact);
            }
          }

          if (groupFacts.length > 0) {
            // Sort by score (highest first)
            groupFacts.sort((a, b) => b.score - a.score);
            groups.set(group.id, { group, facts: groupFacts });
          }
        }
      }
    }

    // ALL facts sorted by score (stack ranked) - redundant ones will show with badge
    const allFactsSorted = [...facts].sort((a, b) => b.score - a.score || a.originalId.localeCompare(b.originalId));

    return { groups, allFactsSorted };
  }, [facts, factById, redundancyData]);

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
  }, [groupedFacts.groups.size]); // Re-measure when redundancy groups change

  const virtualizer = useVirtualizer({
    count: groupedFacts.allFactsSorted.length,
    getScrollElement: () => scrollElement,
    estimateSize: () => 350, // base row height estimate (with increased padding)
    overscan: 5, // render 5 extra rows above/below viewport
    scrollMargin,
  });

  const totalFacts = facts.length;
  const gradedFacts = Object.keys(humanGrades).length;
  const redundancyCount = redundancyData?.stats?.pendingReview ?? 0;

  return (
    <div className="max-w-[1200px] mx-auto">
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
          <span aria-hidden className="text-[18px] font-extrabold text-muted-light">·</span>
          <span className="font-semibold">{gradedFacts} GRADED</span>
          <span aria-hidden className="text-[18px] font-extrabold text-muted-light">·</span>
          <span className="font-semibold" style={{ color: tokens.warning }}>
            {redundancyCount} REDUNDANCIES IDENTIFIED
          </span>
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

          // Color based on rounded score: 5=green, 4=blue, 3-2=orange, 1=red
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

      {/* Redundancy Groups */}
      {Array.from(groupedFacts.groups.entries()).map(([groupId, { group, facts: groupFacts }], groupIndex) => (
        <div
          key={groupId}
          className="animate-fade-slide-in"
          style={{ animationDelay: `${(groupIndex + 5) * 80}ms`, animationFillMode: 'backwards' }}
        >
        <RedundancyGroupCard
          group={group}
          onReview={onShowRedundancyModal}
        >
          {groupFacts.map((fact, index) => (
            <FactRow
              key={fact.id}
              fact={fact}
              isExpanded={expandedFactIds.has(fact.id)}
              onToggle={() => toggleFactExpanded(fact.id)}
              isPrimary={fact.id === group.primaryFactId}
              isInGroup={true}
              isFirstInGroup={index === 0}
              isLastInGroup={index === groupFacts.length - 1}
              humanGrade={humanGrades[fact.id]}

              onSaveGrade={(score) => {
                if (score) {
                  setHumanGradeMutation.mutate({ factId: fact.id, score });
                }
              }}
              isSavingGrade={setHumanGradeMutation.isPending}
              onViewFullText={() => onViewFactFullText(fact)}
              canModify={canModify}
            />
          ))}
        </RedundancyGroupCard>
        </div>
      ))}

      {/* Individual Facts Section (Stack Ranked) - Virtualized */}
      {groupedFacts.allFactsSorted.length > 0 && (
        <div className="mt-20 animate-fade-slide-in" style={{ animationDelay: '500ms', animationFillMode: 'backwards' }}>
          <div className="flex items-baseline justify-between">
            <h3 className="text-[24px] font-semibold text-foreground m-0">
              Individual Facts
            </h3>
            <span className="text-[10px] uppercase tracking-[0.35em] text-muted-light font-semibold">
              STACK RANKED
            </span>
          </div>
          <hr className="border-t border-border mt-4 mb-12" />
          <div ref={listContainerRef} style={{ height: virtualizer.getTotalSize(), position: 'relative' }}>
            {virtualizer.getVirtualItems().map((virtualRow) => {
              const fact = groupedFacts.allFactsSorted[virtualRow.index];
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
                    />
                  </div>
                );
              })}
          </div>
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
