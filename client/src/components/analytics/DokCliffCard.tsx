import type { DokCliffResponse } from '@shared/analytics-types';
import {
  Area,
  AreaChart,
  CartesianGrid,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import {
  AnalyticsCardShell,
  AnalyticsEmptyState,
  AnalyticsErrorState,
  AnalyticsLoadingState,
  AnalyticsMetric,
} from './AnalyticsCardShell';
import { formatAnalyticsDecimal, formatAnalyticsNumber } from './formatters';
import { tokens } from '@/lib/colors';

interface DokCliffCardProps {
  data?: DokCliffResponse;
  isLoading: boolean;
  error: Error | null;
}

export function DokCliffCard({
  data,
  isLoading,
  error,
}: DokCliffCardProps) {
  if (isLoading) {
    return (
      <AnalyticsCardShell
        eyebrow="Knowledge gradient"
        title="DOK Cliff"
        subtitle="How sharply average score quality falls as a brainlift climbs from DOK1 facts to DOK4 SPOVs."
      >
        <AnalyticsLoadingState label="Calculating average DOK means across the current brainlift cohort." />
      </AnalyticsCardShell>
    );
  }

  if (error) {
    return (
      <AnalyticsCardShell
        eyebrow="Knowledge gradient"
        title="DOK Cliff"
        subtitle="How sharply average score quality falls as a brainlift climbs from DOK1 facts to DOK4 SPOVs."
      >
        <AnalyticsErrorState error={error} />
      </AnalyticsCardShell>
    );
  }

  if (!data || !data.hasData) {
    return (
      <AnalyticsCardShell
        eyebrow="Knowledge gradient"
        title="DOK Cliff"
        subtitle="How sharply average score quality falls as a brainlift climbs from DOK1 facts to DOK4 SPOVs."
      >
        <AnalyticsEmptyState
          title="No graded DOK slope yet"
          description="Once this window includes brainlifts with graded material across the stack, this card will show where quality starts to collapse."
        />
      </AnalyticsCardShell>
    );
  }

  const chartRows = data.rows.map((row) => ({
    ...row,
    chartScore: row.averageScore ?? null,
  }));

  return (
    <AnalyticsCardShell
      eyebrow={`${formatAnalyticsNumber(data.summary.totalBrainlifts)} brainlifts in window`}
      title="DOK Cliff"
      subtitle="Each point is the average of each brainlift’s own DOK mean, so one oversized brainlift cannot flatten the shape for everyone else."
    >
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <AnalyticsMetric label="DOK1 Avg" value={formatAnalyticsDecimal(data.summary.dok1Average)} tone="olive" />
        <AnalyticsMetric label="DOK4 Avg" value={formatAnalyticsDecimal(data.summary.dok4Average)} tone="brick" />
        <AnalyticsMetric label="DOK1 → DOK4 Drop" value={formatAnalyticsDecimal(data.summary.cliffDrop)} tone="amber" />
        <AnalyticsMetric label="Brainlifts" value={formatAnalyticsNumber(data.summary.totalBrainlifts)} tone="steel" />
      </div>

      <div className="mt-8 rounded-xl bg-card px-5 py-5 shadow-card">
        <p className="m-0 text-[10px] uppercase tracking-[0.35em] font-semibold text-muted-foreground">
          Average score by DOK level
        </p>

        <div className="mt-5 h-[240px] w-full">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={chartRows}>
              <defs>
                <linearGradient id="dok-cliff-fill" x1="0" x2="0" y1="0" y2="1">
                  <stop offset="0%" stopColor={tokens.warning} stopOpacity={0.28} />
                  <stop offset="100%" stopColor={tokens.warningSoft} stopOpacity={0.06} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" opacity={0.35} />
              <XAxis
                dataKey="label"
                tick={{ fill: tokens.textSecondary, fontSize: 11 }}
                tickLine={false}
                axisLine={false}
              />
              <YAxis
                domain={[0, 5]}
                tick={{ fill: tokens.textSecondary, fontSize: 11 }}
                tickLine={false}
                axisLine={false}
                width={32}
              />
              <ReferenceLine
                y={4}
                stroke={tokens.borderStrong}
                strokeDasharray="4 4"
                ifOverflow="extendDomain"
              />
              <Tooltip
                formatter={(value: number | string) => [
                  formatAnalyticsDecimal(typeof value === 'number' ? value : Number(value)),
                  'Average score',
                ]}
                labelFormatter={(_label: string, payload: Array<{ payload?: { label: string; brainliftCount: number } }>) => {
                  const row = payload[0]?.payload;
                  return row ? row.label : 'DOK level';
                }}
                contentStyle={{
                  borderRadius: '14px',
                  borderColor: tokens.border,
                  backgroundColor: tokens.surface,
                  boxShadow: 'var(--shadow-card)',
                }}
              />
              <Area
                type="linear"
                dataKey="chartScore"
                stroke={tokens.warning}
                fill="url(#dok-cliff-fill)"
                strokeWidth={3}
                connectNulls={false}
                dot={{
                  r: 5,
                  fill: tokens.surface,
                  stroke: tokens.warning,
                  strokeWidth: 2,
                }}
                activeDot={{
                  r: 6,
                  fill: tokens.surface,
                  stroke: tokens.warning,
                  strokeWidth: 2,
                }}
              />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      </div>
    </AnalyticsCardShell>
  );
}
