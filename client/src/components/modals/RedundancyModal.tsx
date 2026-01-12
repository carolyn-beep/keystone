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
    originalId: number;
    fact: string;
    summary: string | null;
    score: number;
  }>;
}

interface RedundancyData {
  stats: {
    totalFacts: number;
    uniqueFactCount: number;
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
    <div style={{
      position: 'fixed',
      top: 0,
      left: 0,
      right: 0,
      bottom: 0,
      backgroundColor: tokens.overlay,
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      zIndex: 1000,
    }}>
      <div
        className="p-4 sm:p-8 w-[95%] max-w-[800px] max-h-[90vh] overflow-auto rounded-xl scrollbar-styled"
        style={{
          backgroundColor: tokens.surface,
          overscrollBehavior: 'contain',
        }}
        onWheel={(e) => e.stopPropagation()}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px' }}>
          <h2 style={{ fontSize: '20px', fontWeight: 700, margin: 0, color: tokens.primary }}>
            <AlertTriangle size={20} style={{ marginRight: '8px', verticalAlign: 'middle', color: tokens.warning }} />
            Review Redundant Facts
          </h2>
          <button
            data-testid="button-close-redundancy-modal"
            onClick={onClose}
            style={{ background: 'none', border: 'none', cursor: 'pointer', padding: '4px' }}
          >
            <X size={20} />
          </button>
        </div>

        <p style={{ color: tokens.textSecondary, fontSize: '14px', marginBottom: '20px' }}>
          These facts have been flagged as potentially redundant. Review each group and decide which facts to keep.
          Keeping fewer, stronger facts helps focus the brainlift on essential DOK1 content.
        </p>

        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(3, 1fr)',
          gap: '12px',
          marginBottom: '24px',
          padding: '16px',
          backgroundColor: tokens.surfaceAlt,
          borderRadius: '8px',
        }}>
          <div style={{ textAlign: 'center' }}>
            <p style={{ fontSize: '24px', fontWeight: 700, color: tokens.primary, margin: 0 }}>{data.stats.totalFacts}</p>
            <p style={{ fontSize: '12px', color: tokens.textSecondary, margin: 0 }}>Total Facts</p>
          </div>
          <div style={{ textAlign: 'center' }}>
            <p style={{ fontSize: '24px', fontWeight: 700, color: tokens.success, margin: 0 }}>{data.stats.uniqueFactCount}</p>
            <p style={{ fontSize: '12px', color: tokens.textSecondary, margin: 0 }}>Core Facts</p>
          </div>
          <div style={{ textAlign: 'center' }}>
            <p style={{ fontSize: '24px', fontWeight: 700, color: tokens.warning, margin: 0 }}>{data.stats.pendingReview}</p>
            <p style={{ fontSize: '12px', color: tokens.textSecondary, margin: 0 }}>Pending Review</p>
          </div>
        </div>

        {data.groups.filter(g => g.status === 'pending').length === 0 ? (
          <div style={{ textAlign: 'center', padding: '40px', color: tokens.textSecondary }}>
            <CheckCircle size={48} style={{ opacity: 0.3, marginBottom: '16px' }} />
            <p style={{ margin: 0 }}>No redundancies pending review</p>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
            {data.groups.filter(g => g.status === 'pending').map((group) => (
              <div
                key={group.id}
                data-testid={`redundancy-group-${group.id}`}
                style={{
                  border: `1px solid ${tokens.border}`,
                  borderRadius: '12px',
                  padding: '20px',
                  backgroundColor: tokens.surface,
                }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '12px' }}>
                  <div>
                    <h3 style={{ margin: '0 0 4px 0', fontSize: '15px', fontWeight: 600, color: tokens.textPrimary }}>
                      {group.groupName}
                    </h3>
                    <p style={{ margin: 0, fontSize: '12px', color: tokens.textSecondary }}>
                      {group.factIds.length} facts | {group.similarityScore} similarity
                    </p>
                  </div>
                  <span style={{
                    padding: '4px 10px',
                    borderRadius: '12px',
                    backgroundColor: tokens.warningSoft,
                    color: tokens.warning,
                    fontSize: '11px',
                    fontWeight: 500,
                  }}>
                    Pending
                  </span>
                </div>

                <p style={{ fontSize: '13px', color: tokens.textSecondary, marginBottom: '16px', fontStyle: 'italic' }}>
                  {group.reason}
                </p>

                {/* Fact selection - click to choose primary */}
                <p style={{ fontSize: '11px', color: tokens.textMuted, marginBottom: '8px' }}>
                  Click a fact to select it as the one to keep:
                </p>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', marginBottom: '16px' }}>
                  {group.facts.map((fact) => {
                    const currentPrimary = selectedPrimaryFacts[group.id] ?? group.primaryFactId;
                    const isSelected = fact.id === currentPrimary;
                    const isAutoRecommended = fact.id === group.primaryFactId;

                    return (
                      <div
                        key={fact.id}
                        onClick={() => onSelectPrimaryFact(group.id, fact.id)}
                        style={{
                          display: 'flex',
                          alignItems: 'flex-start',
                          gap: '12px',
                          padding: '12px',
                          borderRadius: '8px',
                          backgroundColor: isSelected ? tokens.successSoft : tokens.surfaceAlt,
                          border: isSelected ? `2px solid ${tokens.success}` : `2px solid transparent`,
                          cursor: 'pointer',
                          transition: 'all 0.15s ease',
                        }}
                      >
                        <div style={{ flexShrink: 0 }}>
                          {isSelected ? (
                            <CheckCircle size={16} style={{ color: tokens.success }} />
                          ) : (
                            <div style={{
                              width: 16,
                              height: 16,
                              borderRadius: '50%',
                              border: `2px solid ${tokens.border}`,
                              backgroundColor: tokens.surface,
                            }} />
                          )}
                        </div>
                        <div style={{ flex: 1 }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '4px' }}>
                            <span style={{ fontWeight: 600, fontSize: '12px', color: tokens.textSecondary }}>
                              Fact {fact.originalId}
                            </span>
                            <span style={{
                              padding: '2px 6px',
                              borderRadius: '4px',
                              backgroundColor: getScoreChipColors(fact.score).bg,
                              color: getScoreChipColors(fact.score).text,
                              fontSize: '10px',
                              fontWeight: 600,
                            }}>
                              {fact.score}/5
                            </span>
                            {isAutoRecommended && (
                              <span style={{
                                padding: '2px 6px',
                                borderRadius: '4px',
                                backgroundColor: tokens.infoSoft,
                                color: tokens.info,
                                fontSize: '10px',
                                fontWeight: 600,
                              }}>
                                AI Pick
                              </span>
                            )}
                            {isSelected && (
                              <span style={{
                                padding: '2px 6px',
                                borderRadius: '4px',
                                backgroundColor: tokens.success,
                                color: '#fff',
                                fontSize: '10px',
                                fontWeight: 600,
                              }}>
                                Will Keep
                              </span>
                            )}
                          </div>
                          <p style={{ margin: 0, fontSize: '13px', color: tokens.textPrimary, lineHeight: 1.5 }}>
                            {fact.summary || fact.fact}
                          </p>
                        </div>
                      </div>
                    );
                  })}
                </div>

                <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                  <button
                    onClick={() => {
                      const primaryFactId = selectedPrimaryFacts[group.id] ?? group.primaryFactId;
                      if (primaryFactId) {
                        onKeep(group.id, primaryFactId);
                      }
                    }}
                    disabled={isUpdating}
                    data-testid={`button-keep-${group.id}`}
                    className="hover-elevate active-elevate-2"
                    style={{
                      padding: '8px 16px',
                      borderRadius: '6px',
                      border: 'none',
                      backgroundColor: tokens.success,
                      color: '#fff',
                      fontSize: '12px',
                      fontWeight: 500,
                      cursor: 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '6px',
                    }}
                  >
                    <CheckCircle size={12} />
                    Keep Selected & Remove Others
                  </button>
                  <button
                    onClick={() => onDismiss(group.id)}
                    disabled={isUpdating}
                    data-testid={`button-dismiss-${group.id}`}
                    className="hover-elevate active-elevate-2"
                    style={{
                      padding: '8px 16px',
                      borderRadius: '6px',
                      border: `1px solid ${tokens.border}`,
                      backgroundColor: tokens.surface,
                      color: tokens.textSecondary,
                      fontSize: '12px',
                      fontWeight: 500,
                      cursor: 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '6px',
                    }}
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
