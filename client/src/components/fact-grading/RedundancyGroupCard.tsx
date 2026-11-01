import { tokens } from '@/lib/colors';
import { TactileButton } from '@/components/ui/tactile-button';
import overlapIcon from '@/assets/icons/overlap.svg';
import inkQuillIcon from '@/assets/icons/ink-quill.svg';

export interface RedundancyGroup {
  id: number;
  groupName: string;
  factIds: number[];
  primaryFactId: number | null;
  similarityScore: string;
  reason: string;
  status: string;
  facts: Array<{ id: number; originalId: string; fact: string; score: number }>;
}

export interface RedundancyGroupCardProps {
  group: RedundancyGroup;
  children: React.ReactNode;
  onReview: () => void;
}

export function RedundancyGroupCard({
  group,
  children,
  onReview,
}: RedundancyGroupCardProps) {
  return (
    <div className="mb-16 rounded-xl overflow-hidden shadow-card">
      {/* Header */}
      <div className="py-8 px-10 bg-primary/5 flex items-center justify-between border-b border-border">
        <div className="flex items-center gap-2.5">
          <img src={overlapIcon} alt="" className="w-6 h-6 opacity-40" />
          <span className="text-[11px] uppercase tracking-[0.35em] font-semibold" style={{ color: tokens.warning }}>
            Redundancy Identified
          </span>
          <span className="ml-3 text-[8px] uppercase tracking-[0.35em] font-semibold text-muted-light">
            {group.facts.length} SIMILAR FACTS
          </span>
          <span className="text-[10px] font-extrabold text-muted-light" aria-hidden>&middot;</span>
          <span className="text-[8px] uppercase tracking-[0.35em] font-semibold text-muted-light">
            {group.similarityScore} MATCH
          </span>
        </div>

        <TactileButton
          variant="raised"
          onClick={onReview}
          className="flex items-center gap-1.5 text-[12px]"
        >
          <img src={inkQuillIcon} alt="" className="w-3.5 h-3.5" />
          Review &amp; Resolve
        </TactileButton>
      </div>

      {/* Reason */}
      <div className="py-6 px-10 bg-card-elevated border-b border-border">
        <p className="m-0 font-serif text-[14px] italic text-muted-foreground leading-relaxed">
          {group.reason}
        </p>
      </div>

      {/* Facts */}
      <div className="bg-card rounded-b-xl">
        {children}
      </div>
    </div>
  );
}
