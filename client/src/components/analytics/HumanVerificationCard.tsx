import type { HumanVerificationResponse } from '@shared/analytics-types';
import {
  Line,
  LineChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { AnalyticsCardShell, AnalyticsEmptyState, AnalyticsErrorState, AnalyticsLoadingState, AnalyticsMetric } from './AnalyticsCardShell';
import { formatAnalyticsDate, formatAnalyticsNumber, formatAnalyticsPercent } from './formatters';
import { tokens } from '@/lib/colors';

interface HumanVerificationCardProps {
  data?: HumanVerificationResponse;
  isLoading: boolean;
  error: Error | null;
}

export function HumanVerificationCard({
  data,
  isLoading,
  error,
}: HumanVerificationCardProps) {
  if (isLoading) {
    return (
      <AnalyticsCardShell
        eyebrow="Review drift"
        title="Human Verification"
        subtitle="Weekly truth-set checks against the reviewed record, with change-rate context that separates model drift from content drift."
      >
        <AnalyticsLoadingState label="Loading truth-set baselines and the latest verification batch." />
      </AnalyticsCardShell>
    );
  }

  if (error) {
    return (
      <AnalyticsCardShell
        eyebrow="Review drift"
        title="Human Verification"
        subtitle="Weekly truth-set checks against the reviewed record, with change-rate context that separates model drift from content drift."
      >
        <AnalyticsErrorState error={error} />
      </AnalyticsCardShell>
    );
  }

  if (!data || !data.hasData || !data.latestBatch) {
    return (
      <AnalyticsCardShell
        eyebrow="Review drift"
        title="Human Verification"
        subtitle="Weekly truth-set checks against the reviewed record, with change-rate context that separates model drift from content drift."
      >
        <AnalyticsEmptyState
          title="No verification batches yet"
          description="Once the reviewed truth set is imported and a run completes, this section will show stability, changed-counts, and weighted agreement."
        />
      </AnalyticsCardShell>
    );
  }

  const metrics = data.latestBatch.metrics;

  return (
    <AnalyticsCardShell
      eyebrow={`Latest run · ${formatAnalyticsDate(data.latestBatch.completedAt)}`}
      title="Human Verification"
      subtitle="The truth set checks whether today’s graders still score the reviewed content the same way humans did."
    >
      <div className="grid gap-4 sm:grid-cols-2">
        <AnalyticsMetric
          label="Stability Rate"
          value={formatAnalyticsPercent(metrics.scoreStabilityRate)}
          tone="olive"
        />
        <AnalyticsMetric
          label="Weighted Agreement"
          value={formatAnalyticsPercent(data.baseline?.weightedAgreement)}
          tone="steel"
          hint={data.baseline ? `${formatAnalyticsNumber(data.baseline.totalItems)} reviewed items in the active baseline.` : undefined}
        />
        <AnalyticsMetric
          label="Changed Items"
          value={formatAnalyticsNumber(metrics.changedCount)}
          tone="brick"
        />
        <AnalyticsMetric
          label="Agree / Borderline / Disagree"
          value={`${formatAnalyticsNumber(metrics.agreeChangedCount)} / ${formatAnalyticsNumber(metrics.borderlineChangedCount)} / ${formatAnalyticsNumber(metrics.disagreeChangedCount)}`}
          tone="amber"
        />
      </div>

      <div className="mt-8 rounded-xl bg-card px-5 py-5 shadow-card">
        <p className="m-0 text-[10px] uppercase tracking-[0.35em] font-semibold text-muted-foreground">
          Stability trend
        </p>
        <div className="mt-5 h-[220px] w-full">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={data.trend}>
              <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" opacity={0.35} />
              <XAxis
                dataKey="completedAt"
                tickFormatter={formatAnalyticsDate}
                tick={{ fill: tokens.textSecondary, fontSize: 11 }}
                tickLine={false}
                axisLine={false}
              />
              <YAxis
                domain={[0, 1]}
                tickFormatter={(value: number) => `${Math.round(value * 100)}%`}
                tick={{ fill: tokens.textSecondary, fontSize: 11 }}
                tickLine={false}
                axisLine={false}
                width={42}
              />
              <Tooltip
                formatter={(value: number) => formatAnalyticsPercent(value)}
                labelFormatter={(value: string) => formatAnalyticsDate(value)}
                contentStyle={{
                  borderRadius: '14px',
                  borderColor: tokens.border,
                  backgroundColor: tokens.surface,
                  boxShadow: 'var(--shadow-card)',
                }}
              />
              <Line
                type="monotone"
                dataKey="scoreStabilityRate"
                stroke={tokens.success}
                strokeWidth={2.5}
                dot={{ r: 3, fill: tokens.success }}
                activeDot={{ r: 5 }}
              />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </div>
    </AnalyticsCardShell>
  );
}
