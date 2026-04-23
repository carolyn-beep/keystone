import type { GraderConsistencyResponse } from '@shared/analytics-types';
import {
  CartesianGrid,
  Line,
  LineChart,
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
} from './AnalyticsCardShell';
import {
  formatAnalyticsDate,
  formatAnalyticsDecimal,
} from './formatters';
import { tokens } from '@/lib/colors';

const GRADER_CONSISTENCY_SUBTITLE = 'Each week, 25 random brainlifts are graded twice in isolated runs with no shared context, a direct test of how well the platform architecture suppresses LLM variance.';

function getConsistencyTone(value: number | null | undefined): string {
  if (value === null || value === undefined || Number.isNaN(value)) {
    return tokens.textPrimary;
  }
  if (value >= 0.98) {
    return tokens.info;
  }
  if (value >= 0.9) {
    return tokens.success;
  }
  if (value >= 0.85) {
    return tokens.secondary;
  }
  if (value >= 0.8) {
    return tokens.warning;
  }
  return tokens.danger;
}

function ConsistencyMetric({
  label,
  rawValue,
}: {
  label: string;
  rawValue: number | null | undefined;
}) {
  return (
    <div className="flex min-h-[98px] flex-col rounded-xl bg-card px-4 py-3.5 shadow-card">
      <p className="m-0 min-h-[1.75rem] text-[8px] leading-[1.2] uppercase tracking-[0.18em] font-semibold text-muted-foreground">
        {label}
      </p>
      <p className="mt-2.5 font-serif text-[30px] leading-none" style={{ color: getConsistencyTone(rawValue) }}>
        {formatAnalyticsDecimal(rawValue)}
      </p>
    </div>
  );
}

interface GraderConsistencyCardProps {
  data?: GraderConsistencyResponse;
  isLoading: boolean;
  error: Error | null;
}

export function GraderConsistencyCard({
  data,
  isLoading,
  error,
}: GraderConsistencyCardProps) {
  if (isLoading) {
    return (
      <AnalyticsCardShell
        eyebrow="Weekly replay"
        title="Grader Consistency"
        subtitle={GRADER_CONSISTENCY_SUBTITLE}
      >
        <AnalyticsLoadingState label="Loading weekly consistency runs and pass-to-pass agreement." />
      </AnalyticsCardShell>
    );
  }

  if (error) {
    return (
      <AnalyticsCardShell
        eyebrow="Weekly replay"
        title="Grader Consistency"
        subtitle={GRADER_CONSISTENCY_SUBTITLE}
      >
        <AnalyticsErrorState error={error} />
      </AnalyticsCardShell>
    );
  }

  if (!data || !data.hasData || !data.latestRun) {
    return (
      <AnalyticsCardShell
        eyebrow="Weekly replay"
        title="Grader Consistency"
        subtitle={GRADER_CONSISTENCY_SUBTITLE}
      >
        <AnalyticsEmptyState
          title="No weekly consistency runs yet"
          description="Freeze the monitored five-brainlift corpus and run the weekly dual-pass job to populate pass-to-pass agreement."
        />
      </AnalyticsCardShell>
    );
  }

  const latest = data.latestRun;

  return (
    <AnalyticsCardShell
      eyebrow={`Latest run · ${formatAnalyticsDate(latest.completedAt)}`}
      title="Grader Consistency"
      subtitle={GRADER_CONSISTENCY_SUBTITLE}
    >
      <div className="grid gap-4 md:grid-cols-3 xl:grid-cols-6">
        <ConsistencyMetric label="All Items" rawValue={latest.overallPearsonR} />
        <ConsistencyMetric label="Brainlifts" rawValue={latest.brainliftPearsonR} />
        <ConsistencyMetric label="DOK1" rawValue={latest.byDokLevel.dok1} />
        <ConsistencyMetric label="DOK2" rawValue={latest.byDokLevel.dok2} />
        <ConsistencyMetric label="DOK3" rawValue={latest.byDokLevel.dok3} />
        <ConsistencyMetric label="DOK4" rawValue={latest.byDokLevel.dok4} />
      </div>

      <div className="mt-8 rounded-xl bg-card px-5 py-5 shadow-card">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <p className="m-0 text-[10px] uppercase tracking-[0.35em] font-semibold text-muted-foreground">
            Trend
          </p>
          <p className="m-0 text-[10px] uppercase tracking-[0.2em] font-semibold text-muted-foreground">
            25 monitored brainlifts
          </p>
        </div>
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
                domain={[-1, 1]}
                tick={{ fill: tokens.textSecondary, fontSize: 11 }}
                tickLine={false}
                axisLine={false}
                width={36}
              />
              <Tooltip
                formatter={(value: number, name: string) => [
                  formatAnalyticsDecimal(value),
                  name === 'overallPearsonR' ? 'All Items' : 'Brainlifts',
                ]}
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
                dataKey="overallPearsonR"
                name="overallPearsonR"
                stroke={tokens.info}
                strokeWidth={2.5}
                dot={{ r: 3, fill: tokens.info }}
                activeDot={{ r: 5 }}
              />
              <Line
                type="monotone"
                dataKey="brainliftPearsonR"
                name="brainliftPearsonR"
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
