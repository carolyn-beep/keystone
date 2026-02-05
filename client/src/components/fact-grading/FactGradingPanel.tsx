import { useState, useMemo, useRef, useLayoutEffect } from 'react';
import { useMutation } from '@tanstack/react-query';
import { useWindowVirtualizer } from '@tanstack/react-virtual';
import { AlertTriangle, RefreshCw } from 'lucide-react';
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
  onAnalyzeRedundancy: () => void;
  isAnalyzingRedundancy: boolean;
  onViewFactFullText: (fact: Fact) => void;
  canModify?: boolean;
}

export function FactGradingPanel({
  slug,
  facts,
  humanGrades,
  redundancyData,
  onShowRedundancyModal,
  onAnalyzeRedundancy,
  isAnalyzingRedundancy,
  onViewFactFullText,
  canModify = true,
}: FactGradingPanelProps) {
  const { toast } = useToast();

  // State for expanded fact rows
  const [expandedFactIds, setExpandedFactIds] = useState<Set<number>>(new Set());

  // State for grading
  const [gradingFactId, setGradingFactId] = useState<number | null>(null);
  const [gradingScore, setGradingScore] = useState<number>(3);
  const [gradingNotes, setGradingNotes] = useState<string>('');

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
    mutationFn: async ({ factId, score, notes }: { factId: number; score: number; notes: string }) => {
      const res = await fetch(`/api/brainlifts/${slug}/facts/${factId}/human-grade`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ score, notes }),
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.message || 'Failed to set grade');
      }
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['human-grades', slug] });
      setGradingFactId(null);
      setGradingScore(3);
      setGradingNotes('');
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

  // Virtualization for the main facts list (uses window scrolling)
  const listContainerRef = useRef<HTMLDivElement>(null);
  const [scrollMargin, setScrollMargin] = useState(0);

  // Measure offset from top of document to the list container
  useLayoutEffect(() => {
    if (listContainerRef.current) {
      const rect = listContainerRef.current.getBoundingClientRect();
      const scrollTop = window.scrollY || document.documentElement.scrollTop;
      setScrollMargin(rect.top + scrollTop);
    }
  }, [groupedFacts.groups.size]); // Re-measure when redundancy groups change

  const virtualizer = useWindowVirtualizer({
    count: groupedFacts.allFactsSorted.length,
    estimateSize: () => 130, // base row height estimate
    overscan: 5, // render 5 extra rows above/below viewport
    scrollMargin,
  });

  return (
    <div className="max-w-[1200px] mx-auto">
      {/* Panel Header */}
      <div className="flex items-center justify-between mb-6 pb-4" style={{ borderBottom: `1px solid ${tokens.border}` }}>
        <div>
          <h2 className="text-xl font-bold text-foreground m-0">
            Fact Grading
          </h2>
          <p className="text-sm text-muted-foreground mt-1 mb-0">
            {facts.length} facts &bull; {Object.keys(humanGrades).length} graded
            {redundancyData?.stats?.pendingReview ? ` \u2022 ${redundancyData.stats.pendingReview} redundancy reviews pending` : ''}
          </p>
        </div>

        {/* Redundancy Actions */}
        <div className="flex gap-2">
          <button
            onClick={onAnalyzeRedundancy}
            disabled={isAnalyzingRedundancy}
            className="flex items-center gap-1.5 px-3.5 py-2 bg-card rounded-lg text-[13px] font-medium"
            style={{
              border: `1px solid ${tokens.border}`,
              cursor: isAnalyzingRedundancy ? 'not-allowed' : 'pointer',
              opacity: isAnalyzingRedundancy ? 0.7 : 1,
            }}
          >
            <RefreshCw size={14} className={isAnalyzingRedundancy ? 'animate-spin' : ''} />
            {isAnalyzingRedundancy ? 'Analyzing...' : 'Analyze Redundancy'}
          </button>
          {redundancyData?.stats?.pendingReview ? (
            <button
              onClick={onShowRedundancyModal}
              className="flex items-center gap-1.5 px-3.5 py-2 bg-warning-soft rounded-lg text-[13px] font-semibold cursor-pointer"
              style={{
                border: `1px solid ${tokens.warning}`,
                color: tokens.warning,
              }}
            >
              <AlertTriangle size={14} />
              Review {redundancyData.stats.pendingReview} Redundancies
            </button>
          ) : null}
        </div>
      </div>

      {/* Non-gradeable notice */}
      {nonGradeableFacts.length > 0 && (
        <div className="py-3 px-4 bg-muted rounded-lg mb-5 text-[13px] text-muted-foreground">
          This document contains {nonGradeableFacts.length} non-gradeable claims (prescriptive statements or uncited claims) alongside verifiable DOK1 facts.
        </div>
      )}

      {/* Stats Summary */}
      <div className="grid grid-cols-5 gap-3 mb-6">
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
            { label: 'Total Facts', value: facts.length, color: tokens.primary },
            { label: 'Core Facts', value: coreFacts, color: tokens.success },
            { label: 'Mean Score', value: meanScore, color: getMeanScoreColor(meanScoreNum) },
            { label: 'Highly Verified (5/5)', value: highlyVerified, color: tokens.success },
            { label: 'Redundant', value: redundantCount, color: redundantCount > 0 ? tokens.warning : tokens.textMuted },
          ];
        })().map((stat, i) => (
          <div
            key={i}
            className="p-4 bg-card rounded-lg border border-border text-center"
          >
            <div className="text-2xl font-bold mb-1" style={{ color: stat.color }}>
              {stat.value}
            </div>
            <div className="text-xs text-muted-foreground uppercase tracking-wider">
              {stat.label}
            </div>
          </div>
        ))}
      </div>

      {/* Redundancy Groups */}
      {Array.from(groupedFacts.groups.entries()).map(([groupId, { group, facts: groupFacts }]) => (
        <RedundancyGroupCard
          key={groupId}
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
              isGrading={gradingFactId === fact.id}
              gradingScore={gradingScore}
              gradingNotes={gradingNotes}
              onGradingScoreChange={setGradingScore}
              onGradingNotesChange={setGradingNotes}
              onStartGrading={() => {
                setGradingFactId(fact.id);
                setGradingScore(humanGrades[fact.id]?.score || 3);
                setGradingNotes(humanGrades[fact.id]?.notes || '');
              }}
              onSaveGrade={(score) => {
                setHumanGradeMutation.mutate({
                  factId: fact.id,
                  score: score ?? gradingScore,
                  notes: gradingNotes,
                });
              }}
              onCancelGrading={() => {
                setGradingFactId(null);
                setGradingScore(3);
                setGradingNotes('');
              }}
              isSavingGrade={setHumanGradeMutation.isPending}
              onViewFullText={() => onViewFactFullText(fact)}
              canModify={canModify}
            />
          ))}
        </RedundancyGroupCard>
      ))}

      {/* Individual Facts Section (Stack Ranked) - Virtualized */}
      {groupedFacts.allFactsSorted.length > 0 && (
        <div>
          <h3 className="text-base font-semibold text-foreground mb-4 pt-2">
            Individual Facts (Stack Ranked)
          </h3>
          <div ref={listContainerRef} style={{ height: virtualizer.getTotalSize(), position: 'relative' }}>
            {virtualizer.getVirtualItems().map((virtualRow) => {
              const fact = groupedFacts.allFactsSorted[virtualRow.index];
              return (
                <div
                  key={fact.id}
                  data-index={virtualRow.index}
                  ref={virtualizer.measureElement}
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
                      isGrading={gradingFactId === fact.id}
                      gradingScore={gradingScore}
                      gradingNotes={gradingNotes}
                      onGradingScoreChange={setGradingScore}
                      onGradingNotesChange={setGradingNotes}
                      onStartGrading={() => {
                        setGradingFactId(fact.id);
                        setGradingScore(humanGrades[fact.id]?.score || 3);
                        setGradingNotes(humanGrades[fact.id]?.notes || '');
                      }}
                      onSaveGrade={(score) => {
                        setHumanGradeMutation.mutate({
                          factId: fact.id,
                          score: score ?? gradingScore,
                          notes: gradingNotes,
                        });
                      }}
                      onCancelGrading={() => {
                        setGradingFactId(null);
                        setGradingScore(3);
                        setGradingNotes('');
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
