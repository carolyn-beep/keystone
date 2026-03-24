import { useState, useMemo } from 'react';
import { useMutation } from '@tanstack/react-query';
import { CheckCircle } from 'lucide-react';
import { tokens } from '@/lib/colors';
import { queryClient } from '@/lib/queryClient';
import { useToast } from '@/hooks/use-toast';
import type { Fact } from '@shared/schema';
import { FactRow, type HumanGrade } from './FactRow';
import { RedundancyGroupCard, type RedundancyGroup } from './RedundancyGroupCard';
import type { RedundancyData } from './FactGradingPanel';
import overlapIcon from '@/assets/icons/overlap.svg';

interface RedundancyPageProps {
  slug: string;
  facts: Fact[];
  humanGrades: Record<number, HumanGrade>;
  redundancyData?: RedundancyData;
  onShowRedundancyModal: () => void;
  onViewFactFullText: (fact: Fact) => void;
  canModify?: boolean;
  setActiveTab: (tab: string) => void;
}

export function RedundancyPage({
  slug,
  facts,
  humanGrades,
  redundancyData,
  onShowRedundancyModal,
  onViewFactFullText,
  canModify = true,
  setActiveTab,
}: RedundancyPageProps) {
  const { toast } = useToast();
  const [expandedFactIds, setExpandedFactIds] = useState<Set<number>>(new Set());

  const toggleFactExpanded = (factId: number) => {
    setExpandedFactIds(prev => {
      const next = new Set(prev);
      if (next.has(factId)) next.delete(factId);
      else next.add(factId);
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
      toast({ title: 'Grade Saved', description: 'Your grade has been saved successfully.' });
    },
    onError: (error: Error) => {
      toast({ title: 'Failed to Save Grade', description: error.message, variant: 'destructive' });
    },
  });

  // Build fact lookup
  const factById = useMemo(() => {
    const map = new Map<number, Fact>();
    for (const fact of facts) map.set(fact.id, fact);
    return map;
  }, [facts]);

  // Group pending redundancy groups with their full fact data
  const pendingGroups = useMemo(() => {
    const result: Array<{ group: RedundancyGroup; facts: Fact[] }> = [];
    if (redundancyData?.groups) {
      for (const group of redundancyData.groups) {
        if (group.status === 'pending') {
          const groupFacts: Fact[] = [];
          for (const gf of group.facts) {
            const full = factById.get(gf.id);
            if (full) groupFacts.push(full);
          }
          if (groupFacts.length > 0) {
            groupFacts.sort((a, b) => b.score - a.score);
            result.push({ group, facts: groupFacts });
          }
        }
      }
    }
    return result;
  }, [redundancyData, factById]);

  // Resolved groups (kept or dismissed)
  const resolvedGroups = useMemo(() => {
    return (redundancyData?.groups ?? []).filter(g => g.status !== 'pending');
  }, [redundancyData]);

  const pendingCount = pendingGroups.length;
  const resolvedCount = resolvedGroups.length;
  const totalRedundant = redundancyData?.stats?.redundantFactCount ?? 0;

  return (
    <div className="max-w-[1200px] mx-auto">
      {/* Page Header */}
      <div className="flex flex-col gap-4 mb-8 pb-6 border-b border-border">
        <div className="flex items-center gap-3">
          <img src={overlapIcon} alt="" className="w-7 h-7 opacity-40" />
          <h2 className="text-[30px] font-bold text-foreground tracking-tight leading-[1.1] m-0">
            Redundancy Review
          </h2>
        </div>

        <p className="m-0 font-serif text-[15px] italic text-muted-foreground leading-relaxed max-w-[640px]">
          Groups of semantically similar facts identified by AI analysis.
          Review each group to keep the strongest fact and remove duplicates.
        </p>

        <div className="flex flex-wrap items-center gap-2 text-[12px] uppercase tracking-[0.35em] text-muted-foreground mt-1">
          <span className="font-semibold" style={{ color: pendingCount > 0 ? tokens.warning : tokens.textMuted }}>
            {pendingCount} PENDING REVIEW
          </span>
          <span aria-hidden className="text-[18px] font-extrabold text-muted-light">&middot;</span>
          <span className="font-semibold">{resolvedCount} RESOLVED</span>
          <span aria-hidden className="text-[18px] font-extrabold text-muted-light">&middot;</span>
          <span className="font-semibold">{totalRedundant} REDUNDANT FACTS</span>
        </div>
      </div>

      {/* Pending Groups */}
      {pendingGroups.map(({ group, facts: groupFacts }, groupIndex) => (
        <div
          key={group.id}
          className="animate-fade-slide-in"
          style={{ animationDelay: `${groupIndex * 80}ms`, animationFillMode: 'backwards' }}
        >
          <RedundancyGroupCard group={group} onReview={onShowRedundancyModal}>
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
                  if (score) setHumanGradeMutation.mutate({ factId: fact.id, score });
                }}
                isSavingGrade={setHumanGradeMutation.isPending}
                onViewFullText={() => onViewFactFullText(fact)}
                canModify={canModify}
              />
            ))}
          </RedundancyGroupCard>
        </div>
      ))}

      {/* Empty state — no pending groups */}
      {pendingGroups.length === 0 && (
        <div className="text-center py-16 px-6">
          <CheckCircle size={48} className="mx-auto opacity-30 mb-4" style={{ color: tokens.success }} />
          <h3 className="text-lg font-semibold text-foreground m-0 mb-2">
            No Pending Redundancies
          </h3>
          <p className="font-serif italic text-[14px] text-muted-foreground leading-relaxed max-w-[420px] mx-auto">
            {resolvedCount > 0
              ? 'All redundancy groups have been reviewed and resolved.'
              : 'No redundancy groups have been identified in this document.'
            }
          </p>
        </div>
      )}

      {/* Resolved Groups Summary */}
      {resolvedCount > 0 && (
        <div className="mt-12 border-t border-border pt-8">
          <h3 className="text-[12px] uppercase tracking-[0.35em] font-semibold text-muted-foreground mb-6">
            Resolved Groups
          </h3>
          <div className="space-y-3">
            {resolvedGroups.map(group => (
              <div key={group.id} className="flex items-center gap-3 py-3 px-5 rounded-lg bg-card-elevated shadow-card">
                <span className={`px-[6px] py-[2px] rounded text-[9px] uppercase tracking-[0.25em] font-semibold ${
                  group.status === 'kept'
                    ? 'bg-success-soft text-success'
                    : 'bg-muted text-muted-foreground'
                }`}>
                  {group.status === 'kept' ? 'Deduplicated' : 'Dismissed'}
                </span>
                <span className="text-[13px] text-foreground font-medium">{group.groupName}</span>
                <span className="text-[10px] text-muted-light ml-auto">
                  {group.facts.length} facts &middot; {group.similarityScore} match
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
