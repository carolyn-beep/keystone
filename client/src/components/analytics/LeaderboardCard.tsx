import type { LeaderboardRankBy, LeaderboardResponse } from '@shared/analytics-types';
import { BarChart3, Lock } from 'lucide-react';
import { TactileButton } from '@/components/ui/tactile-button';
import { AnalyticsCardShell, AnalyticsEmptyState, AnalyticsErrorState, AnalyticsLoadingState } from './AnalyticsCardShell';
import { formatAnalyticsDecimal, formatAnalyticsNumber } from './formatters';
import { cn } from '@/lib/utils';

interface LeaderboardCardProps {
  data?: LeaderboardResponse;
  isLoading: boolean;
  error: Error | null;
  rankBy: LeaderboardRankBy;
  onRankByChange: (rankBy: LeaderboardRankBy) => void;
  isVisible: boolean;
}

const rankOptions: Array<{ value: LeaderboardRankBy; label: string }> = [
  { value: 'quality', label: 'Quality' },
  { value: 'brainlifts', label: 'Brainlifts' },
  { value: 'edits', label: 'Edits' },
  { value: 'dok1', label: 'DOK1' },
  { value: 'dok2', label: 'DOK2' },
  { value: 'dok3', label: 'DOK3' },
  { value: 'dok4', label: 'DOK4' },
];

const rankMeta: Record<LeaderboardRankBy, {
  primaryLabel: string;
  secondaryLabel?: string;
  primaryFormat: 'decimal' | 'number';
}> = {
  quality: {
    primaryLabel: 'Avg score',
    secondaryLabel: 'Brainlifts',
    primaryFormat: 'decimal',
  },
  brainlifts: {
    primaryLabel: 'Brainlifts',
    primaryFormat: 'number',
  },
  edits: {
    primaryLabel: 'Edits',
    secondaryLabel: 'Brainlifts',
    primaryFormat: 'number',
  },
  dok1: {
    primaryLabel: 'Facts',
    secondaryLabel: 'Brainlifts',
    primaryFormat: 'number',
  },
  dok2: {
    primaryLabel: 'DOK2 summaries',
    secondaryLabel: 'Brainlifts',
    primaryFormat: 'number',
  },
  dok3: {
    primaryLabel: 'Graded DOK3',
    secondaryLabel: 'Brainlifts',
    primaryFormat: 'number',
  },
  dok4: {
    primaryLabel: 'Graded DOK4',
    secondaryLabel: 'Brainlifts',
    primaryFormat: 'number',
  },
};

function formatLeaderboardValue(format: 'decimal' | 'number', value: number): string {
  return format === 'decimal'
    ? formatAnalyticsDecimal(value)
    : formatAnalyticsNumber(value);
}

export function LeaderboardCard({
  data,
  isLoading,
  error,
  rankBy,
  onRankByChange,
  isVisible,
}: LeaderboardCardProps) {
  const meta = rankMeta[rankBy];

  return (
    <AnalyticsCardShell
      eyebrow="Owner-attributed ranking"
      title="Leaderboard"
      subtitle="A presentation-only admin slice over owner-attributed metrics. Backend access stays protected even if the UI elects not to show it."
      aside={(
        <div className="flex flex-wrap gap-2">
          {rankOptions.map((option) => (
            <TactileButton
              key={option.value}
              variant={option.value === rankBy ? 'raised' : 'inset'}
              className="text-[11px] uppercase tracking-[0.2em]"
              onClick={() => onRankByChange(option.value)}
            >
              {option.label}
            </TactileButton>
          ))}
        </div>
      )}
    >
      {!isVisible ? (
        <div className="flex min-h-[220px] flex-col items-center justify-center rounded-xl bg-card px-8 py-12 text-center shadow-card">
          <Lock className="h-10 w-10 text-muted-foreground/60" />
          <p className="mt-5 text-[10px] uppercase tracking-[0.35em] font-semibold text-muted-foreground">
            Restricted in presentation
          </p>
          <p className="mt-3 max-w-xl font-serif text-[14px] italic leading-[1.8] text-muted-foreground">
            This instance hides the leaderboard unless the current admin email is allowlisted.
          </p>
        </div>
      ) : isLoading ? (
        <AnalyticsLoadingState label="Loading the current owner-attributed leaderboard." />
      ) : error ? (
        <AnalyticsErrorState error={error} />
      ) : !data || data.rows.length === 0 ? (
        <AnalyticsEmptyState
          title="No leaderboard rows yet"
          description="This ranking will appear once the selected metric has enough recorded activity in the chosen window."
        />
      ) : (
        <div className="rounded-xl bg-card shadow-card">
          <div className="grid gap-px bg-border/70">
            {data.rows.map((row, index) => (
              <div
                key={`${row.userId}-${index}`}
                className="grid gap-4 bg-card-elevated px-6 py-5 lg:grid-cols-[72px_minmax(0,1fr)_160px]"
              >
                <div className="flex items-center gap-3">
                  <div className="flex h-11 w-11 items-center justify-center rounded-full bg-primary/8 text-[12px] font-semibold uppercase tracking-[0.2em] text-primary">
                    #{index + 1}
                  </div>
                </div>
                <div>
                  <p className="m-0 text-[10px] uppercase tracking-[0.35em] font-semibold text-muted-foreground">
                    {row.userEmail}
                  </p>
                  <h3 className="mt-3 font-serif text-[18px] leading-[1.3] text-foreground">
                    {row.userName || row.userEmail}
                  </h3>
                </div>
                <div className="flex items-center justify-between gap-4 lg:justify-end">
                  <div className="text-right">
                    <p className="m-0 text-[10px] uppercase tracking-[0.35em] font-semibold text-muted-foreground">
                      {meta.primaryLabel}
                    </p>
                    <p className="mt-3 font-serif text-[28px] leading-none text-foreground">
                      {formatLeaderboardValue(meta.primaryFormat, row.value)}
                    </p>
                    {row.secondaryValue !== undefined && meta.secondaryLabel ? (
                      <p className={cn('mt-2 font-serif text-[12px] italic leading-[1.6] text-muted-foreground')}>
                        {meta.secondaryLabel}: <span className="not-italic">{formatAnalyticsNumber(row.secondaryValue)}</span>
                      </p>
                    ) : null}
                  </div>
                  <BarChart3 className="hidden h-5 w-5 text-muted-foreground/60 lg:block" />
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </AnalyticsCardShell>
  );
}
