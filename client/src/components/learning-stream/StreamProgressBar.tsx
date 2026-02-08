import { useMemo } from 'react';
import type { LearningStreamStats } from '@/hooks/useLearningStream';

interface StreamProgressBarProps {
  stats: LearningStreamStats;
}

export function StreamProgressBar({ stats }: StreamProgressBarProps) {
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
            <StatColumn label="Saved" value={stats.bookmarked} />
            <StatColumn label="Graded" value={stats.graded} />
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

function StatColumn({ label, value }: { label: string; value: number }) {
  return (
    <div className="flex flex-col gap-1">
      <span className="font-serif text-[28px] leading-none text-foreground">
        {value}
      </span>
      <span className="text-[10px] uppercase tracking-[0.35em] text-muted-foreground">
        {label}
      </span>
    </div>
  );
}
