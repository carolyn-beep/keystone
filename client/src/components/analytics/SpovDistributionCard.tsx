import type { SpovDistributionResponse } from '@shared/analytics-types';
import {
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { AnalyticsCardShell, AnalyticsEmptyState, AnalyticsErrorState, AnalyticsLoadingState, AnalyticsMetric } from './AnalyticsCardShell';
import { formatAnalyticsDecimal, formatAnalyticsNumber } from './formatters';
import { tokens } from '@/lib/colors';

const SPOV_DISTRIBUTION_SUBTITLE = 'A bird\'s-eye view of the SPOVs people are producing and how they are being graded right now.';

interface SpovDistributionCardProps {
  data?: SpovDistributionResponse;
  isLoading: boolean;
  error: Error | null;
}

export function SpovDistributionCard({
  data,
  isLoading,
  error,
}: SpovDistributionCardProps) {
  if (isLoading) {
    return (
      <AnalyticsCardShell
        eyebrow="Narrative mix"
        title="SPOV Distribution"
        subtitle={SPOV_DISTRIBUTION_SUBTITLE}
      >
        <AnalyticsLoadingState label="Loading the current SPOV score distribution." />
      </AnalyticsCardShell>
    );
  }

  if (error) {
    return (
      <AnalyticsCardShell
        eyebrow="Narrative mix"
        title="SPOV Distribution"
        subtitle={SPOV_DISTRIBUTION_SUBTITLE}
      >
        <AnalyticsErrorState error={error} />
      </AnalyticsCardShell>
    );
  }

  if (!data || !data.hasData || data.buckets.length === 0) {
    return (
      <AnalyticsCardShell
        eyebrow="Narrative mix"
        title="SPOV Distribution"
        subtitle={SPOV_DISTRIBUTION_SUBTITLE}
      >
        <AnalyticsEmptyState
          title="No SPOV distribution yet"
          description="Once scored SPOVs accumulate, this chart will show how the argumentative spread is actually distributed."
        />
      </AnalyticsCardShell>
    );
  }

  return (
    <AnalyticsCardShell
      eyebrow={`${formatAnalyticsNumber(data.totals.total)} SPOVs tracked`}
      title="SPOV Distribution"
      subtitle={SPOV_DISTRIBUTION_SUBTITLE}
    >
      <div className="grid gap-4 sm:grid-cols-2">
        <AnalyticsMetric label="Average Score" value={formatAnalyticsDecimal(data.totals.averageScore)} tone="steel" />
        <AnalyticsMetric label="Rejected" value={formatAnalyticsNumber(data.totals.rejected)} tone="brick" />
      </div>

      <div className="mt-8 rounded-xl bg-card px-5 py-5 shadow-card">
        <p className="m-0 text-[10px] uppercase tracking-[0.35em] font-semibold text-muted-foreground">
          Score buckets
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
                formatter={(value: number) => formatAnalyticsNumber(value)}
                contentStyle={{
                  borderRadius: '14px',
                  borderColor: tokens.border,
                  backgroundColor: tokens.surface,
                  boxShadow: 'var(--shadow-card)',
                }}
              />
              <Bar dataKey="count" fill={tokens.info} radius={[8, 8, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>
    </AnalyticsCardShell>
  );
}
