import { AlertTriangle, Eye, Copy } from 'lucide-react';
import { tokens } from '@/lib/colors';

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
    <div className="mb-7 rounded-xl overflow-hidden shadow-md">
      {/* Alert Banner */}
      <div
        className="py-3 px-4 flex items-center justify-between"
        style={{ background: `linear-gradient(135deg, ${tokens.warning} 0%, #d97706 100%)` }}
      >
        <div className="flex items-center gap-2.5">
          <div className="flex items-center justify-center w-7 h-7 bg-white/25 rounded-md">
            <Copy size={16} color="#fff" />
          </div>
          <div>
            <span className="text-xs font-bold text-white uppercase tracking-wider">
              Redundancy Found
            </span>
            <span className="ml-2.5 text-[11px] text-white/85">
              {group.facts.length} similar facts • {group.similarityScore} match
            </span>
          </div>
        </div>

        {/* Review Button */}
        <button
          onClick={onReview}
          className="flex items-center gap-1.5 py-2 px-3.5 bg-white border-none rounded-md text-xs font-bold cursor-pointer transition-all duration-150"
          style={{ color: '#b45309' }}
          onMouseEnter={(e) => {
            e.currentTarget.style.backgroundColor = '#fefce8';
            e.currentTarget.style.transform = 'translateY(-1px)';
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.backgroundColor = '#fff';
            e.currentTarget.style.transform = 'translateY(0)';
          }}
        >
          <Eye size={14} />
          Review & Resolve
        </button>
      </div>

      {/* Reason Box */}
      <div
        className="py-2.5 px-4 bg-warning-soft flex items-start gap-2"
        style={{
          borderLeft: `3px solid ${tokens.warning}`,
          borderBottom: `1px solid ${tokens.warning}`,
        }}
      >
        <AlertTriangle size={14} color={tokens.warning} className="mt-0.5 shrink-0" />
        <p className="m-0 text-[13px] text-muted-foreground leading-normal">
          {group.reason}
        </p>
      </div>

      {/* Facts Container */}
      <div
        className="bg-card rounded-b-xl"
        style={{
          borderLeft: `3px solid ${tokens.warning}`,
          borderRight: `1px solid ${tokens.border}`,
          borderBottom: `1px solid ${tokens.border}`,
        }}
      >
        {children}
      </div>
    </div>
  );
}
