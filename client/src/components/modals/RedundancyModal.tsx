import { X } from 'lucide-react';
import { AnimatePresence, motion } from 'framer-motion';
import { tokens, getScoreChipColors } from '@/lib/colors';
import { TactileButton } from '@/components/ui/tactile-button';
import overlapIcon from '@/assets/icons/overlap.svg';
import inkQuillBg from '@/assets/bl_profile/ink-quill.webp';

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

  const pendingGroups = data.groups.filter(g => g.status === 'pending');

  return (
    <div
      className="fixed inset-0 flex items-center justify-center z-[1000]"
      style={{ backgroundColor: tokens.overlay }}
    >
      <div
        className="p-8 sm:p-10 w-[95%] max-w-[800px] max-h-[90vh] overflow-auto rounded-xl scrollbar-none bg-card-elevated"
        style={{ overscrollBehavior: 'contain' }}
        onWheel={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex justify-between items-center mb-8">
          <div className="flex items-center gap-2.5">
            <img src={overlapIcon} alt="" className="w-6 h-6 opacity-40" />
            <span
              className="text-[24px] uppercase tracking-[0.15em] font-semibold"
              style={{ color: tokens.warning }}
            >
              Review Redundant Facts
            </span>
          </div>
          <button
            data-testid="button-close-redundancy-modal"
            onClick={onClose}
            className="bg-transparent border-none cursor-pointer p-1.5 rounded-md text-muted-foreground hover:text-foreground transition-colors"
          >
            <X size={18} />
          </button>
        </div>

        {/* Description */}
        <p className="font-serif italic text-[14px] text-muted-foreground leading-relaxed mb-8">
          These facts have been flagged as potentially redundant. Review each group and decide which facts to keep.
          Keeping fewer, stronger facts helps focus the brainlift on essential DOK1 content.
        </p>

        {/* Groups or empty state */}
        {pendingGroups.length === 0 ? (
          <div className="text-center py-14">
            <p className="m-0 font-serif italic text-muted-foreground">No redundancies pending review</p>
          </div>
        ) : (
          <div className="flex flex-col gap-6">
            <AnimatePresence initial={false}>
              {pendingGroups.map((group) => (
                <motion.div
                  key={group.id}
                  layout
                  initial={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0, scale: 0.95, transition: { duration: 0.3, ease: 'easeInOut' } }}
                  transition={{ layout: { duration: 0.35, ease: 'easeInOut' } }}
                  data-testid={`redundancy-group-${group.id}`}
                  className="rounded-xl bg-card shadow-card overflow-hidden relative"
                >
                  {/* Ink quill background */}
                  <div
                    aria-hidden="true"
                    className="absolute bottom-0 right-0 w-[200px] h-[200px] pointer-events-none z-0"
                    style={{
                      backgroundImage: `url(${inkQuillBg})`,
                      backgroundSize: 'contain',
                      backgroundRepeat: 'no-repeat',
                      backgroundPosition: 'bottom right',
                      opacity: 0.12,
                      mixBlendMode: 'multiply',
                    }}
                  />

                  {/* Group header */}
                  <div className="py-6 px-8 bg-primary/5 border-b border-border">
                    <div className="flex items-center gap-2.5">
                      <img src={overlapIcon} alt="" className="w-5 h-5 opacity-40" />
                      <span
                        className="text-[11px] uppercase tracking-[0.35em] font-semibold"
                        style={{ color: tokens.warning }}
                      >
                        {group.groupName}
                      </span>
                    </div>
                    <div className="flex items-center gap-2 mt-2 ml-[30px]">
                      <span className="text-[9px] uppercase tracking-[0.35em] font-semibold text-muted-light">
                        {group.factIds.length} FACTS
                      </span>
                      <span className="text-[10px] font-extrabold text-muted-light" aria-hidden>&middot;</span>
                      <span className="text-[9px] uppercase tracking-[0.35em] font-semibold text-muted-light">
                        {group.similarityScore} MATCH
                      </span>
                    </div>
                  </div>

                  {/* Reason */}
                  <div className="py-5 px-8 border-b border-border">
                    <p className="m-0 font-serif italic text-[14px] text-muted-foreground leading-relaxed">
                      {group.reason}
                    </p>
                  </div>

                  {/* Fact selection */}
                  <div className="p-8">
                    <p className="text-[10px] uppercase tracking-[0.3em] font-semibold text-muted-light mb-3">
                      Click a fact to select it as the one to keep
                    </p>
                    <div className="flex flex-col gap-4 mb-6">
                      {group.facts.map((fact) => {
                        const currentPrimary = selectedPrimaryFacts[group.id] ?? group.primaryFactId;
                        const isSelected = fact.id === currentPrimary;
                        const isAutoRecommended = fact.id === group.primaryFactId;

                        return (
                          <div
                            key={fact.id}
                            onClick={() => onSelectPrimaryFact(group.id, fact.id)}
                            className={`flex items-start gap-3 p-3.5 rounded-lg cursor-pointer transition-all duration-300 ease-in-out ${
                              isSelected
                                ? 'bg-card-elevated shadow-card border border-transparent'
                                : 'bg-card border border-border shadow-none'
                            }`}
                          >
                            {/* Radio-like indicator */}
                            <div className="shrink-0 mt-0.5">
                              {isSelected ? (
                                <div className="w-4 h-4 rounded-full bg-primary flex items-center justify-center">
                                  <div className="w-1.5 h-1.5 rounded-full bg-white" />
                                </div>
                              ) : (
                                <div className="w-4 h-4 rounded-full border-2 border-border bg-card" />
                              )}
                            </div>
                            <div className="flex-1">
                              <div className="flex items-center gap-2 mb-1">
                                <span className="font-serif text-xs text-muted-light">
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
                                  <span className="px-[6px] py-[2px] rounded bg-muted text-muted-foreground text-[9px] uppercase tracking-[0.25em] font-semibold">
                                    AI Pick
                                  </span>
                                )}
                                {isSelected && (
                                  <span className="px-[6px] py-[2px] rounded bg-success-soft text-success text-[9px] uppercase tracking-[0.25em] font-semibold">
                                    Will Keep
                                  </span>
                                )}
                              </div>
                              <p className="m-0 font-serif italic text-[15px] text-foreground leading-normal">
                                {fact.summary || fact.fact}
                              </p>
                            </div>
                          </div>
                        );
                      })}
                    </div>

                    {/* Action buttons */}
                    <div className="flex gap-3 flex-wrap">
                      <TactileButton
                        variant="raised"
                        onClick={() => {
                          const primaryFactId = selectedPrimaryFacts[group.id] ?? group.primaryFactId;
                          if (primaryFactId) {
                            onKeep(group.id, primaryFactId);
                          }
                        }}
                        disabled={isUpdating}
                        data-testid={`button-keep-${group.id}`}
                        className="text-[12px] flex items-center gap-1.5"
                      >
                        Keep Selected &amp; Remove Others
                      </TactileButton>
                      <TactileButton
                        variant="inset"
                        onClick={() => onDismiss(group.id)}
                        disabled={isUpdating}
                        data-testid={`button-dismiss-${group.id}`}
                        className="text-[12px] flex items-center gap-1.5"
                      >
                        Keep All (Not Redundant)
                      </TactileButton>
                    </div>
                  </div>
                </motion.div>
              ))}
            </AnimatePresence>
          </div>
        )}
      </div>
    </div>
  );
}
