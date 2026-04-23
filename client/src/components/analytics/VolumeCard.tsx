import { useState } from 'react';
import type { VolumeResponse } from '@shared/analytics-types';
import {
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { AnalyticsCardShell, AnalyticsEmptyState, AnalyticsErrorState, AnalyticsLoadingState, AnalyticsMetric } from './AnalyticsCardShell';
import { formatAnalyticsNumber } from './formatters';
import { TactileButton } from '@/components/ui/tactile-button';
import { tokens } from '@/lib/colors';

interface VolumeCardProps {
  data?: VolumeResponse;
  isLoading: boolean;
  error: Error | null;
}

const VOLUME_SERIES_LABELS = {
  brainlifts: 'Brainlifts',
  facts: 'DOK1',
  dok2Summaries: 'DOK2',
  dok3Insights: 'DOK3',
  dok4Spovs: 'DOK4',
} as const;

const VOLUME_SERIES_META = [
  { key: 'brainlifts', label: 'Brainlifts', color: tokens.primary },
  { key: 'facts', label: 'DOK1', color: tokens.success },
  { key: 'dok2Summaries', label: 'DOK2', color: tokens.info },
  { key: 'dok3Insights', label: 'DOK3', color: tokens.warning },
  { key: 'dok4Spovs', label: 'DOK4', color: tokens.danger },
] as const;

type VolumeSeriesKey = keyof typeof VOLUME_SERIES_LABELS;

export function VolumeCard({ data, isLoading, error }: VolumeCardProps) {
  const [visibleSeriesKeys, setVisibleSeriesKeys] = useState<VolumeSeriesKey[]>(() =>
    VOLUME_SERIES_META.map((series) => series.key),
  );

  const toggleSeries = (key: VolumeSeriesKey) => {
    setVisibleSeriesKeys((current) => {
      if (current.includes(key)) {
        if (current.length === 1) {
          return current;
        }
        return current.filter((item) => item !== key);
      }

      return [...current, key];
    });
  };

  if (isLoading) {
    return (
      <AnalyticsCardShell
        title="Production Volume"
        subtitle="Creation volume across the selected date range."
      >
        <AnalyticsLoadingState label="Pulling volume totals and daily creation buckets." />
      </AnalyticsCardShell>
    );
  }

  if (error) {
    return (
      <AnalyticsCardShell
        title="Production Volume"
        subtitle="Creation volume across the selected date range."
      >
        <AnalyticsErrorState error={error} />
      </AnalyticsCardShell>
    );
  }

  if (!data) {
    return null;
  }

  return (
    <AnalyticsCardShell
      title="Production Volume"
      subtitle="How much material entered the system and how deeply it progressed across DOK levels."
    >
      <div className="grid gap-3 md:grid-cols-3 xl:grid-cols-5">
        <AnalyticsMetric compact label="Brainlifts" value={formatAnalyticsNumber(data.totals.brainlifts)} />
        <AnalyticsMetric compact label="DOK1 Facts" value={formatAnalyticsNumber(data.totals.facts)} tone="olive" />
        <AnalyticsMetric compact label="DOK2 Summaries" value={formatAnalyticsNumber(data.totals.dok2Summaries)} tone="steel" />
        <AnalyticsMetric compact label="DOK3 Insights" value={formatAnalyticsNumber(data.totals.dok3Insights)} tone="amber" />
        <AnalyticsMetric compact label="DOK4 SPOVs" value={formatAnalyticsNumber(data.totals.dok4Spovs)} tone="brick" />
      </div>

      <div className="mt-8 rounded-xl bg-card px-5 py-5 shadow-card">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <p className="m-0 text-[10px] uppercase tracking-[0.35em] font-semibold text-muted-foreground">
            Daily cadence
          </p>

          <div className="flex flex-wrap gap-x-2 gap-y-2">
            {VOLUME_SERIES_META.map((series) => (
              <TactileButton
                key={series.key}
                type="button"
                variant={visibleSeriesKeys.includes(series.key) ? 'raised' : 'inset'}
                aria-pressed={visibleSeriesKeys.includes(series.key)}
                className="inline-flex items-center gap-2 px-3 py-2 text-[10px] uppercase tracking-[0.2em] font-semibold"
                onClick={() => toggleSeries(series.key)}
              >
                <span
                  className="h-2.5 w-2.5 rounded-full"
                  style={{ backgroundColor: series.color }}
                />
                {series.label}
              </TactileButton>
            ))}
          </div>
        </div>

        {data.series.length === 0 ? (
          <div className="mt-5">
            <AnalyticsEmptyState
              title="No dated activity yet"
              description="The analytics foundation is live, but this window does not yet contain creation or grading history."
            />
          </div>
        ) : (
          <div className="mt-5 w-full">
            <div className="h-[280px] w-full">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={data.series}>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" opacity={0.35} />
                  <XAxis
                    dataKey="bucket"
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
                    formatter={(value: number | string, name: string) => {
                      const numericValue = typeof value === 'number' ? value : Number(value);
                      return [
                        Number.isFinite(numericValue) ? formatAnalyticsNumber(numericValue) : String(value),
                        VOLUME_SERIES_LABELS[name as keyof typeof VOLUME_SERIES_LABELS] ?? name,
                      ];
                    }}
                    contentStyle={{
                      borderRadius: '14px',
                      borderColor: tokens.border,
                      backgroundColor: tokens.surface,
                      boxShadow: 'var(--shadow-card)',
                    }}
                  />
                  {VOLUME_SERIES_META.filter((series) => visibleSeriesKeys.includes(series.key)).map((series) => (
                    <Line
                      key={series.key}
                      type="monotone"
                      dataKey={series.key}
                      stroke={series.color}
                      strokeWidth={2}
                      dot={false}
                      activeDot={{ r: 4, fill: tokens.surface, stroke: series.color, strokeWidth: 2 }}
                    />
                  ))}
                </LineChart>
              </ResponsiveContainer>
            </div>
          </div>
        )}
      </div>
    </AnalyticsCardShell>
  );
}
