import type { AnalyticsDokLevelFilter, ScoreDistributionResponse } from '@shared/analytics-types';
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  AnalyticsCardShell,
  AnalyticsEmptyState,
  AnalyticsErrorState,
  AnalyticsLoadingState,
  AnalyticsMetric,
} from './AnalyticsCardShell';
import {
  formatAnalyticsDecimal,
  formatAnalyticsNumber,
  formatAnalyticsPercent,
} from './formatters';
import { getScoreChipColors, tokens } from '@/lib/colors';

const SCORE_DISTRIBUTION_SCOPE_OPTIONS: Array<{
  value: AnalyticsDokLevelFilter;
  label: string;
}> = [
  { value: 'all', label: 'All Items' },
  { value: 1, label: 'DOK1' },
  { value: 2, label: 'DOK2' },
  { value: 3, label: 'DOK3' },
  { value: 4, label: 'DOK4' },
];

interface ScoreDistributionCardProps {
  data?: ScoreDistributionResponse;
  isLoading: boolean;
  error: Error | null;
  selectedDokLevel: AnalyticsDokLevelFilter;
  onDokLevelChange: (value: AnalyticsDokLevelFilter) => void;
}

function parseDokLevelSelectValue(value: string): AnalyticsDokLevelFilter {
  if (value === 'all') return 'all';
  return Number(value) as 1 | 2 | 3 | 4;
}

function getScoreDistributionScopeCopy(dokLevel: AnalyticsDokLevelFilter) {
  if (dokLevel === 'all') {
    return {
      subtitle: 'All scored items across DOK1 to DOK4. Switch scope to compare how the spread changes by level.',
      loadingLabel: 'Bucketing scored items from all DOK levels across the 1 to 5 grading scale.',
      emptyTitle: 'No scored items in this window',
      emptyDescription: 'Once graded DOK material accumulates in the selected cohort, this histogram will show whether the scorer is actually separating weak, middling, and strong work.',
      eyebrowSuffix: 'All DOK levels',
    };
  }

  return {
    subtitle: `Only ${SCORE_DISTRIBUTION_SCOPE_OPTIONS.find((option) => option.value === dokLevel)?.label ?? 'selected'} items. This isolates whether the grader still spreads scores once you stop pooling levels together.`,
    loadingLabel: `Bucketing scored DOK${dokLevel} items across the 1 to 5 grading scale.`,
    emptyTitle: `No scored DOK${dokLevel} items in this window`,
    emptyDescription: `Once graded DOK${dokLevel} material accumulates in the selected cohort, this histogram will show whether the scorer is actually separating weak, middling, and strong work at that level.`,
    eyebrowSuffix: `DOK${dokLevel} only`,
  };
}

export function ScoreDistributionCard({
  data,
  isLoading,
  error,
  selectedDokLevel,
  onDokLevelChange,
}: ScoreDistributionCardProps) {
  const scopeCopy = getScoreDistributionScopeCopy(selectedDokLevel);
  const scopeAside = (
    <div className="w-full sm:w-[160px]">
      <Select
        value={String(selectedDokLevel)}
        onValueChange={(value) => onDokLevelChange(parseDokLevelSelectValue(value))}
      >
        <SelectTrigger className="h-auto w-full rounded-xl px-4 py-3 font-serif text-[14px]">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {SCORE_DISTRIBUTION_SCOPE_OPTIONS.map((option) => (
            <SelectItem key={String(option.value)} value={String(option.value)}>
              {option.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );

  if (isLoading) {
    return (
      <AnalyticsCardShell
        eyebrow="Discrimination check"
        title="Score Distribution"
        subtitle={scopeCopy.subtitle}
        aside={scopeAside}
      >
        <AnalyticsLoadingState label={scopeCopy.loadingLabel} />
      </AnalyticsCardShell>
    );
  }

  if (error) {
    return (
      <AnalyticsCardShell
        eyebrow="Discrimination check"
        title="Score Distribution"
        subtitle={scopeCopy.subtitle}
        aside={scopeAside}
      >
        <AnalyticsErrorState error={error} />
      </AnalyticsCardShell>
    );
  }

  if (!data || !data.hasData) {
    return (
      <AnalyticsCardShell
        eyebrow="Discrimination check"
        title="Score Distribution"
        subtitle={scopeCopy.subtitle}
        aside={scopeAside}
      >
        <AnalyticsEmptyState
          title={scopeCopy.emptyTitle}
          description={scopeCopy.emptyDescription}
        />
      </AnalyticsCardShell>
    );
  }

  return (
    <AnalyticsCardShell
      eyebrow={`${formatAnalyticsNumber(data.totals.totalScoredItems)} scored items · ${scopeCopy.eyebrowSuffix}`}
      title="Score Distribution"
      subtitle={scopeCopy.subtitle}
      aside={scopeAside}
    >
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <AnalyticsMetric label="Average Score" value={formatAnalyticsDecimal(data.totals.averageScore)} tone="steel" />
        <AnalyticsMetric label="Modal Score" value={data.totals.modalScore === null ? '—' : String(data.totals.modalScore)} tone="amber" />
        <AnalyticsMetric label="Distinct Scores" value={formatAnalyticsNumber(data.totals.distinctScores)} tone="olive" />
        <AnalyticsMetric label="Scored Items" value={formatAnalyticsNumber(data.totals.totalScoredItems)} tone="ink" />
      </div>

      <div className="mt-8 rounded-xl bg-card px-5 py-5 shadow-card">
        <p className="m-0 text-[10px] uppercase tracking-[0.35em] font-semibold text-muted-foreground">
          Histogram
        </p>
        <div className="mt-5 h-[240px] w-full">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={data.buckets}>
              <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" opacity={0.35} />
              <XAxis
                dataKey="label"
                tick={{ fill: tokens.textSecondary, fontSize: 11 }}
                tickLine={false}
                axisLine={false}
              />
              <YAxis
                tick={{ fill: tokens.textSecondary, fontSize: 11 }}
                tickLine={false}
                axisLine={false}
                width={36}
              />
              <Tooltip
                formatter={(value: number, _name, payload) => [
                  `${formatAnalyticsNumber(value)} items · ${formatAnalyticsPercent(payload?.payload?.share, 1)}`,
                  `Score ${payload?.payload?.label ?? ''}`,
                ]}
                contentStyle={{
                  borderRadius: '14px',
                  borderColor: tokens.border,
                  backgroundColor: tokens.surface,
                  boxShadow: 'var(--shadow-card)',
                }}
              />
              <Bar dataKey="count" radius={[8, 8, 0, 0]}>
                {data.buckets.map((bucket) => {
                  const colors = getScoreChipColors(bucket.score);
                  return <Cell key={bucket.score} fill={colors.text} />;
                })}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>
    </AnalyticsCardShell>
  );
}
