import { useMemo } from 'react';
import { ChevronRight } from 'lucide-react';
import type { LearningStreamStats } from '@/hooks/useLearningStream';

interface StreamProgressBarProps {
  stats: LearningStreamStats;
  onNavigate?: (page: 'saved' | 'graded') => void;
}

export function StreamProgressBar({ stats, onNavigate }: StreamProgressBarProps) {
  const progress = useMemo(() => {
    if (stats.total === 0) return 0;
    const processed = stats.bookmarked + stats.graded + stats.discarded;
    return Math.round((processed / stats.total) * 100);
  }, [stats]);

  return (
    <div className="bg-card-elevated rounded-xl shadow-card overflow-hidden">
      {/* Stats Row */}
      <div className="px-10 py-8">
        <div className="flex items-end justify-between">
          {/* Stat columns */}
          <div className="flex gap-12">
            <StatColumn label="Pending" value={stats.pending} />
            <StatColumn
              label="Saved"
              value={stats.bookmarked}
              isClickable={!!onNavigate}
              onClick={() => onNavigate?.('saved')}
            />
            <StatColumn
              label="Graded"
              value={stats.graded}
              isClickable={!!onNavigate}
              onClick={() => onNavigate?.('graded')}
            />
          </div>

          {/* Progress percentage */}
          <div className="flex flex-col items-end gap-1">
            <span className="font-serif text-[28px] leading-none text-foreground">
              {progress}%
            </span>
            <span className="text-[10px] uppercase tracking-[0.35em] text-muted-foreground">
              Complete
            </span>
          </div>
        </div>

        {/* Progress Bar */}
        <div className="mt-6 h-1 bg-border rounded-full overflow-hidden">
          <div
            className="h-full bg-success rounded-full transition-all duration-500 ease-out"
            style={{ width: `${progress}%` }}
          />
        </div>
      </div>
    </div>
  );
}

interface StatColumnProps {
  label: string;
  value: number;
  isClickable?: boolean;
  onClick?: () => void;
}

function StatColumn({ label, value, isClickable, onClick }: StatColumnProps) {
  return (
    <div
      className={[
        'flex flex-col gap-1 pb-1.5',
        isClickable && 'cursor-pointer group transition-all',
        isClickable && 'border-b-2 border-dashed border-muted-foreground/40 hover:border-solid hover:border-primary/60',
      ].filter(Boolean).join(' ')}
      onClick={isClickable ? onClick : undefined}
      role={isClickable ? 'button' : undefined}
      tabIndex={isClickable ? 0 : undefined}
      onKeyDown={isClickable ? (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onClick?.(); } } : undefined}
    >
      <span className={`font-serif text-[28px] leading-none text-foreground ${isClickable ? 'group-hover:text-primary transition-colors' : ''}`}>
        {value}
      </span>
      <span className={`flex items-center gap-1 text-[10px] uppercase tracking-[0.35em] text-muted-foreground ${isClickable ? 'group-hover:text-foreground transition-colors' : ''}`}>
        {label}
        {isClickable && (
          <ChevronRight size={10} className="transition-transform duration-200 group-hover:translate-x-0.5" />
        )}
      </span>
    </div>
  );
}
