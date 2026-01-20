import { X, AlertTriangle, CheckCircle } from 'lucide-react';
import { tokens, getScoreChipColors } from '@/lib/colors';

interface RedundancyGroup {
  id: number;
  groupName: string;
  status: string;
  factIds: number[];
  primaryFactId: number | null;
  similarityScore: string;
  reason: string;
  facts: Array<{
    id: number;
    originalId: string;
    fact: string;
    summary?: string;
    score: number;
  }>;
  primaryFact?: { id: number; originalId: string; fact: string; score: number; summary?: string };
}

interface RedundancyData {
  stats: {
    totalFacts: number;
    uniqueFactCount: number;
    redundantFactCount: number;
    pendingReview: number;
  };
  groups: RedundancyGroup[];
}

interface RedundancyModalProps {
  show: boolean;
  onClose: () => void;
  data: RedundancyData | null;
  selectedPrimaryFacts: Record<number, number>;
  onSelectPrimaryFact: (groupId: number, factId: number) => void;
  onKeep: (groupId: number, primaryFactId: number) => void;
  onDismiss: (groupId: number) => void;
  isUpdating: boolean;
}

export function RedundancyModal({
  show,
  onClose,
  data,
  selectedPrimaryFacts,
  onSelectPrimaryFact,
  onKeep,
  onDismiss,
  isUpdating,
}: RedundancyModalProps) {
  if (!show || !data) return null;

  return (
    <div
      className="fixed inset-0 flex items-center justify-center z-[1000]"
      style={{ backgroundColor: tokens.overlay }}
    >
      <div
        className="p-4 sm:p-8 w-[95%] max-w-[800px] max-h-[90vh] overflow-auto rounded-xl scrollbar-styled bg-card"
        style={{ overscrollBehavior: 'contain' }}
        onWheel={(e) => e.stopPropagation()}
      >
        <div className="flex justify-between items-center mb-6">
          <h2 className="text-xl font-bold m-0 text-primary">
            <AlertTriangle size={20} className="mr-2 align-middle text-warning inline-block" />
            Review Redundant Facts
          </h2>
          <button
            data-testid="button-close-redundancy-modal"
            onClick={onClose}
            className="bg-transparent border-none cursor-pointer p-1"
          >
            <X size={20} />
          </button>
        </div>

        <p className="text-muted-foreground text-sm mb-5">
          These facts have been flagged as potentially redundant. Review each group and decide which facts to keep.
          Keeping fewer, stronger facts helps focus the brainlift on essential DOK1 content.
        </p>

        <div className="grid grid-cols-3 gap-3 mb-6 p-4 bg-muted rounded-lg">
          <div className="text-center">
            <p className="text-2xl font-bold text-primary m-0">{data.stats.totalFacts}</p>
            <p className="text-xs text-muted-foreground m-0">Total Facts</p>
          </div>
          <div className="text-center">
            <p className="text-2xl font-bold text-success m-0">{data.stats.uniqueFactCount}</p>
            <p className="text-xs text-muted-foreground m-0">Core Facts</p>
          </div>
          <div className="text-center">
            <p className="text-2xl font-bold text-warning m-0">{data.stats.pendingReview}</p>
            <p className="text-xs text-muted-foreground m-0">Pending Review</p>
          </div>
        </div>

        {data.groups.filter(g => g.status === 'pending').length === 0 ? (
          <div className="text-center p-10 text-muted-foreground">
            <CheckCircle size={48} className="opacity-30 mb-4 inline-block" />
            <p className="m-0">No redundancies pending review</p>
          </div>
        ) : (
          <div className="flex flex-col gap-4">
            {data.groups.filter(g => g.status === 'pending').map((group) => (
              <div
                key={group.id}
                data-testid={`redundancy-group-${group.id}`}
                className="rounded-xl p-5 bg-card border border-border"
              >
                <div className="flex justify-between items-start mb-3">
                  <div>
                    <h3 className="m-0 mb-1 text-[15px] font-semibold text-foreground">
                      {group.groupName}
                    </h3>
                    <p className="m-0 text-xs text-muted-foreground">
                      {group.factIds.length} facts | {group.similarityScore} similarity
                    </p>
                  </div>
                  <span className="px-[10px] py-1 rounded-xl bg-warning-soft text-warning text-[11px] font-medium">
                    Pending
                  </span>
                </div>

                <p className="text-[13px] text-muted-foreground mb-4 italic">
                  {group.reason}
                </p>

                {/* Fact selection - click to choose primary */}
                <p className="text-[11px] text-muted-foreground mb-2">
                  Click a fact to select it as the one to keep:
                </p>
                <div className="flex flex-col gap-2 mb-4">
                  {group.facts.map((fact) => {
                    const currentPrimary = selectedPrimaryFacts[group.id] ?? group.primaryFactId;
                    const isSelected = fact.id === currentPrimary;
                    const isAutoRecommended = fact.id === group.primaryFactId;

                    return (
                      <div
                        key={fact.id}
                        onClick={() => onSelectPrimaryFact(group.id, fact.id)}
                        className="flex items-start gap-3 p-3 rounded-lg cursor-pointer transition-all duration-150"
                        style={{
                          backgroundColor: isSelected ? tokens.successSoft : tokens.surfaceAlt,
                          border: isSelected ? `2px solid ${tokens.success}` : '2px solid transparent',
                        }}
                      >
                        <div className="shrink-0">
                          {isSelected ? (
                            <CheckCircle size={16} style={{ color: tokens.success }} />
                          ) : (
                            <div
                              className="w-4 h-4 rounded-full bg-card"
                              style={{ border: `2px solid ${tokens.border}` }}
                            />
                          )}
                        </div>
                        <div className="flex-1">
                          <div className="flex items-center gap-2 mb-1">
                            <span className="font-semibold text-xs text-muted-foreground">
                              Fact {fact.originalId}
                            </span>
                            <span
                              className="px-[6px] py-[2px] rounded text-[10px] font-semibold"
                              style={{
                                backgroundColor: getScoreChipColors(fact.score).bg,
                                color: getScoreChipColors(fact.score).text,
                              }}
                            >
                              {fact.score}/5
                            </span>
                            {isAutoRecommended && (
                              <span className="px-[6px] py-[2px] rounded bg-info-soft text-info text-[10px] font-semibold">
                                AI Pick
                              </span>
                            )}
                            {isSelected && (
                              <span className="px-[6px] py-[2px] rounded bg-success text-white text-[10px] font-semibold">
                                Will Keep
                              </span>
                            )}
                          </div>
                          <p className="m-0 text-[13px] text-foreground leading-normal">
                            {fact.summary || fact.fact}
                          </p>
                        </div>
                      </div>
                    );
                  })}
                </div>

                <div className="flex gap-2 flex-wrap">
                  <button
                    onClick={() => {
                      const primaryFactId = selectedPrimaryFacts[group.id] ?? group.primaryFactId;
                      if (primaryFactId) {
                        onKeep(group.id, primaryFactId);
                      }
                    }}
                    disabled={isUpdating}
                    data-testid={`button-keep-${group.id}`}
                    className="hover-elevate active-elevate-2 px-4 py-2 rounded-md border-none bg-success text-white text-xs font-medium cursor-pointer flex items-center gap-[6px]"
                  >
                    <CheckCircle size={12} />
                    Keep Selected & Remove Others
                  </button>
                  <button
                    onClick={() => onDismiss(group.id)}
                    disabled={isUpdating}
                    data-testid={`button-dismiss-${group.id}`}
                    className="hover-elevate active-elevate-2 px-4 py-2 rounded-md bg-card text-muted-foreground text-xs font-medium cursor-pointer flex items-center gap-[6px]"
                    style={{ border: `1px solid ${tokens.border}` }}
                  >
                    <X size={12} />
                    Keep All (Not Redundant)
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
