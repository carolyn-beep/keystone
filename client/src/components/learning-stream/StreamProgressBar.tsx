import { useMemo } from 'react';
import { Bookmark, CheckCircle, Clock } from 'lucide-react';
import { tokens } from '@/lib/colors';
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
    <div className="bg-card rounded-xl p-5 mb-6 border border-border">
      {/* Stats Row */}
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-6">
          <div className="flex items-center gap-2">
            <Clock size={16} className="text-muted-foreground" />
            <span className="text-sm text-muted-foreground">
              <span className="font-semibold text-foreground">{stats.pending}</span> pending
            </span>
          </div>
          <div className="flex items-center gap-2">
            <Bookmark size={16} className="text-info" />
            <span className="text-sm text-muted-foreground">
              <span className="font-semibold text-foreground">{stats.bookmarked}</span> saved
            </span>
          </div>
          <div className="flex items-center gap-2">
            <CheckCircle size={16} className="text-success" />
            <span className="text-sm text-muted-foreground">
              <span className="font-semibold text-foreground">{stats.graded}</span> graded
            </span>
          </div>
        </div>
        <div className="text-sm font-medium" style={{ color: tokens.primary }}>
          {progress}% complete
        </div>
      </div>

      {/* Progress Bar */}
      <div className="relative h-3 bg-muted rounded-full overflow-hidden">
        <div
          className="absolute inset-y-0 left-0 rounded-full bg-gradient-to-r from-secondary via-primary to-info transition-all duration-500 ease-out"
          style={{ width: `${progress}%` }}
        >
          {/* Shimmer overlay */}
          <div className="absolute inset-0 animate-shimmer bg-gradient-to-r from-transparent via-white/20 to-transparent bg-[length:200%_100%]" />
        </div>
      </div>
    </div>
  );
}
