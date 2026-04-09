import type { ModelDriftResponse } from '@shared/analytics-types';
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
  formatAnalyticsDelta,
} from './formatters';
import { tokens } from '@/lib/colors';

const MODEL_DRIFT_SUBTITLE = 'Every week, 25 brainlift scores from the prior run are compared to a fresh regrade pass to monitor drift and see whether the underlying models are getting stricter or laxer.';

interface ModelDriftCardProps {
  data?: ModelDriftResponse;
  isLoading: boolean;
  error: Error | null;
}

function deltaTone(value: number | null | undefined): 'ink' | 'olive' | 'amber' | 'brick' | 'steel' {
  if (value === null || value === undefined || Number.isNaN(value)) {
    return 'ink';
  }
  if (value > 0) {
    return 'olive';
  }
  if (value < 0) {
    return 'brick';
  }
  return 'steel';
}

function renderDelta(value: number | null | undefined): string {
  if (value === null || value === undefined || Number.isNaN(value)) {
    return '—';
  }
  return formatAnalyticsDelta(value);
}

function DriftMetric({
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
      <p className="mt-2.5 font-serif text-[30px] leading-none" style={{ color: deltaTone(rawValue) === 'olive'
        ? tokens.success
        : deltaTone(rawValue) === 'brick'
          ? tokens.danger
          : deltaTone(rawValue) === 'amber'
            ? tokens.warning
            : deltaTone(rawValue) === 'steel'
              ? tokens.info
              : tokens.textPrimary }}
      >
        {renderDelta(rawValue)}
      </p>
    </div>
  );
}

export function ModelDriftCard({
  data,
  isLoading,
  error,
}: ModelDriftCardProps) {
  if (isLoading) {
    return (
      <AnalyticsCardShell
        eyebrow="Week over week"
        title="Model Drift"
        subtitle={MODEL_DRIFT_SUBTITLE}
      >
        <AnalyticsLoadingState label="Loading week-over-week drift history for the frozen monitoring corpus." />
      </AnalyticsCardShell>
    );
  }

  if (error) {
    return (
      <AnalyticsCardShell
        eyebrow="Week over week"
        title="Model Drift"
        subtitle={MODEL_DRIFT_SUBTITLE}
      >
        <AnalyticsErrorState error={error} />
      </AnalyticsCardShell>
    );
  }

  if (!data || !data.hasData || !data.latestRun) {
    return (
      <AnalyticsCardShell
        eyebrow="Week over week"
        title="Model Drift"
        subtitle={MODEL_DRIFT_SUBTITLE}
      >
        <AnalyticsEmptyState
          title="No weekly drift history yet"
          description="Once two completed weekly runs exist for the same frozen corpus, this card will show whether the grader moved stricter or laxer."
        />
      </AnalyticsCardShell>
    );
  }

  const latest = data.latestRun;

  return (
    <AnalyticsCardShell
      eyebrow={`Latest run · ${formatAnalyticsDate(latest.completedAt)}`}
      title="Model Drift"
      subtitle={MODEL_DRIFT_SUBTITLE}
    >
      <div className="grid gap-4 md:grid-cols-3 xl:grid-cols-5">
        <DriftMetric label="Overall" rawValue={latest.overallBrainliftDelta} />
        <DriftMetric label="DOK1" rawValue={latest.byDokLevel.dok1} />
        <DriftMetric label="DOK2" rawValue={latest.byDokLevel.dok2} />
        <DriftMetric label="DOK3" rawValue={latest.byDokLevel.dok3} />
        <DriftMetric label="DOK4" rawValue={latest.byDokLevel.dok4} />
      </div>

      <div className="mt-8 rounded-xl bg-card px-5 py-5 shadow-card">
        <p className="m-0 text-[10px] uppercase tracking-[0.35em] font-semibold text-muted-foreground">
          Drift trend
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
                tick={{ fill: tokens.textSecondary, fontSize: 11 }}
                tickLine={false}
                axisLine={false}
                width={42}
              />
              <Tooltip
                formatter={(value: number) => formatAnalyticsDelta(value)}
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
                dataKey="overallBrainliftDelta"
                stroke={tokens.warning}
                strokeWidth={2.5}
                dot={{ r: 3, fill: tokens.warning }}
                activeDot={{ r: 5 }}
              />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </div>
    </AnalyticsCardShell>
  );
}
