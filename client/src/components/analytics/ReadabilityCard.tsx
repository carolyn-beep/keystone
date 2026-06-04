import type {
  AnalyticsDokLevelFilter,
  ReadabilityAnalyticsResponse,
  ReadabilityLevelStats,
} from '@shared/analytics-types';
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
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
import { tokens } from '@/lib/colors';

const SCOPE_OPTIONS: Array<{ value: AnalyticsDokLevelFilter; label: string }> = [
  { value: 'all', label: 'All Levels' },
  { value: 1, label: 'DOK1' },
  { value: 2, label: 'DOK2' },
  { value: 3, label: 'DOK3' },
  { value: 4, label: 'DOK4' },
];

// Human labels for the rewrite outcome reasons (see RewriteReason in rewrite.ts).
const REASON_LABELS: Record<string, string> = {
  ok: 'Clean rewrite',
  accepted_below_target: 'Kept (below target)',
  model_failed: 'Model failed',
  malformed_output: 'Malformed output',
  sanity_failed: 'Sanity reject',
  token_guard_failed: 'Token reject',
  gate_unmet: 'Gate miss (legacy)',
  unknown: 'Unknown',
};

function reasonLabel(reason: string): string {
  return (
    REASON_LABELS[reason] ??
    reason.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase())
  );
}

interface ReadabilityCardProps {
  data?: ReadabilityAnalyticsResponse;
  isLoading: boolean;
  error: Error | null;
  selectedDokLevel: AnalyticsDokLevelFilter;
  onDokLevelChange: (value: AnalyticsDokLevelFilter) => void;
}

function parseScopeValue(value: string): AnalyticsDokLevelFilter {
  if (value === 'all') return 'all';
  return Number(value) as 1 | 2 | 3 | 4;
}

/** Weighted-mean of a per-level metric, weighted by row count, ignoring nulls. */
function weightedMean(
  levels: ReadabilityLevelStats[],
  pick: (l: ReadabilityLevelStats) => number | null,
): number | null {
  let weight = 0;
  let acc = 0;
  for (const l of levels) {
    const v = pick(l);
    if (v === null) continue;
    acc += v * l.total;
    weight += l.total;
  }
  return weight > 0 ? acc / weight : null;
}

interface ScopeStats {
  total: number;
  successRate: number;
  avgFkBefore: number | null;
  avgFkAfter: number | null;
  avgFkDelta: number | null;
  avgWordsBefore: number | null;
  avgWordsAfter: number | null;
  avgWordsDelta: number | null;
}

function resolveScopeStats(
  data: ReadabilityAnalyticsResponse,
  scope: AnalyticsDokLevelFilter,
): ScopeStats {
  if (scope === 'all') {
    return {
      total: data.overall.total,
      successRate: data.overall.successRate,
      avgFkBefore: weightedMean(data.levels, (l) => l.avgFkBefore),
      avgFkAfter: weightedMean(data.levels, (l) => l.avgFkAfter),
      avgFkDelta: weightedMean(data.levels, (l) => l.avgFkDelta),
      avgWordsBefore: weightedMean(data.levels, (l) => l.avgWordsBefore),
      avgWordsAfter: weightedMean(data.levels, (l) => l.avgWordsAfter),
      avgWordsDelta: weightedMean(data.levels, (l) => l.avgWordsDelta),
    };
  }
  const level = data.levels.find((l) => l.dokLevel === scope);
  return {
    total: level?.total ?? 0,
    successRate: level?.successRate ?? 0,
    avgFkBefore: level?.avgFkBefore ?? null,
    avgFkAfter: level?.avgFkAfter ?? null,
    avgFkDelta: level?.avgFkDelta ?? null,
    avgWordsBefore: level?.avgWordsBefore ?? null,
    avgWordsAfter: level?.avgWordsAfter ?? null,
    avgWordsDelta: level?.avgWordsDelta ?? null,
  };
}

export function ReadabilityCard({
  data,
  isLoading,
  error,
  selectedDokLevel,
  onDokLevelChange,
}: ReadabilityCardProps) {
  const subtitle =
    'Did the downstream rewrite make grader feedback easier to read without dropping it? Reading grade (Flesch-Kincaid) before and after, plus where rewrites are rejected.';
  const scopeAside = (
    <div className="w-full sm:w-[160px]">
      <Select
        value={String(selectedDokLevel)}
        onValueChange={(value) => onDokLevelChange(parseScopeValue(value))}
      >
        <SelectTrigger className="h-auto w-full rounded-xl px-4 py-3 font-serif text-[14px]">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {SCOPE_OPTIONS.map((option) => (
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
      <AnalyticsCardShell eyebrow="Readability rewrite" title="Readability Rewrite" subtitle={subtitle} aside={scopeAside}>
        <AnalyticsLoadingState label="Aggregating downstream rewrite outcomes across DOK levels." />
      </AnalyticsCardShell>
    );
  }

  if (error) {
    return (
      <AnalyticsCardShell eyebrow="Readability rewrite" title="Readability Rewrite" subtitle={subtitle} aside={scopeAside}>
        <AnalyticsErrorState error={error} />
      </AnalyticsCardShell>
    );
  }

  if (!data || !data.hasData) {
    return (
      <AnalyticsCardShell eyebrow="Readability rewrite" title="Readability Rewrite" subtitle={subtitle} aside={scopeAside}>
        <AnalyticsEmptyState
          title="No rewrite attempts yet"
          description="Once graded DOK material runs through the downstream rewrite engine, this card will show how far reading grade dropped and which guards reject rewrites."
        />
      </AnalyticsCardShell>
    );
  }

  const scope = resolveScopeStats(data, selectedDokLevel);

  // FK before/after grouped bar: one group per level in scope.
  const fkLevels =
    selectedDokLevel === 'all'
      ? data.levels
      : data.levels.filter((l) => l.dokLevel === selectedDokLevel);
  const fkChartData = fkLevels.map((l) => ({
    label: `DOK${l.dokLevel}`,
    before: l.avgFkBefore,
    after: l.avgFkAfter,
  }));

  // Length (words) before/after grouped bar: mirrors the FK chart, one group per level.
  const lengthChartData = fkLevels.map((l) => ({
    label: `DOK${l.dokLevel}`,
    before: l.avgWordsBefore,
    after: l.avgWordsAfter,
  }));

  // Reason breakdown: summed across levels (or filtered to the selected level).
  const reasonScopeRows =
    selectedDokLevel === 'all'
      ? data.reasons
      : data.reasons.filter((r) => r.dokLevel === selectedDokLevel);
  const reasonMap = new Map<string, { count: number; rewritten: boolean }>();
  for (const row of reasonScopeRows) {
    const existing = reasonMap.get(row.reason);
    reasonMap.set(row.reason, {
      count: (existing?.count ?? 0) + row.count,
      // A reason maps to a fixed outcome; keep the success flag if any row is success.
      rewritten: (existing?.rewritten ?? false) || row.rewritten,
    });
  }
  const reasonChartData = Array.from(reasonMap.entries())
    .map(([reason, v]) => ({ reason, label: reasonLabel(reason), ...v }))
    .sort((a, b) => b.count - a.count);

  return (
    <AnalyticsCardShell
      eyebrow={`${formatAnalyticsNumber(scope.total)} rewrite attempts · ${
        selectedDokLevel === 'all' ? 'All levels' : `DOK${selectedDokLevel} only`
      }`}
      title="Readability Rewrite"
      subtitle={subtitle}
      aside={scopeAside}
    >
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <AnalyticsMetric label="Success Rate" value={formatAnalyticsPercent(scope.successRate, 0)} tone="olive" />
        <AnalyticsMetric
          label="Avg FK Drop"
          value={scope.avgFkDelta === null ? '—' : `−${formatAnalyticsDecimal(scope.avgFkDelta, 1)}`}
          tone="steel"
        />
        <AnalyticsMetric
          label="Avg Words"
          value={
            scope.avgWordsBefore === null || scope.avgWordsAfter === null
              ? '—'
              : `${formatAnalyticsNumber(Math.round(scope.avgWordsBefore))} → ${formatAnalyticsNumber(Math.round(scope.avgWordsAfter))}`
          }
          tone="ink"
        />
        <AnalyticsMetric
          label="Avg Length Reduction"
          value={
            scope.avgWordsDelta === null || scope.avgWordsBefore === null || scope.avgWordsBefore === 0
              ? '—'
              : `−${formatAnalyticsPercent(scope.avgWordsDelta / scope.avgWordsBefore, 0)}`
          }
          tone="olive"
        />
      </div>

      <div className="mt-6 grid gap-4 xl:grid-cols-3">
        <div className="rounded-xl bg-card px-4 py-4 shadow-card">
          <p className="m-0 text-[10px] uppercase tracking-[0.35em] font-semibold text-muted-foreground">
            Reading grade · before vs after
          </p>
          <div className="mt-4 h-[190px] w-full">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={fkChartData}>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" opacity={0.35} />
                <XAxis dataKey="label" tick={{ fill: tokens.textSecondary, fontSize: 11 }} tickLine={false} axisLine={false} />
                <YAxis tick={{ fill: tokens.textSecondary, fontSize: 11 }} tickLine={false} axisLine={false} width={36} />
                <Tooltip
                  formatter={(value: number, name) => [formatAnalyticsDecimal(value, 1), name === 'before' ? 'FK before' : 'FK after']}
                  contentStyle={{
                    borderRadius: '14px',
                    borderColor: tokens.border,
                    backgroundColor: tokens.surface,
                    boxShadow: 'var(--shadow-card)',
                  }}
                />
                <Legend
                  formatter={(value) => (value === 'before' ? 'Before' : 'After')}
                  wrapperStyle={{ fontSize: 11, color: tokens.textSecondary }}
                />
                <Bar dataKey="before" name="before" fill={tokens.danger} radius={[6, 6, 0, 0]} />
                <Bar dataKey="after" name="after" fill={tokens.info} radius={[6, 6, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="rounded-xl bg-card px-4 py-4 shadow-card">
          <p className="m-0 text-[10px] uppercase tracking-[0.35em] font-semibold text-muted-foreground">
            Length (words) · before vs after
          </p>
          <div className="mt-4 h-[190px] w-full">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={lengthChartData}>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" opacity={0.35} />
                <XAxis dataKey="label" tick={{ fill: tokens.textSecondary, fontSize: 11 }} tickLine={false} axisLine={false} />
                <YAxis tick={{ fill: tokens.textSecondary, fontSize: 11 }} tickLine={false} axisLine={false} width={40} />
                <Tooltip
                  formatter={(value: number, name) => [formatAnalyticsNumber(Math.round(value)), name === 'before' ? 'Words before' : 'Words after']}
                  contentStyle={{
                    borderRadius: '14px',
                    borderColor: tokens.border,
                    backgroundColor: tokens.surface,
                    boxShadow: 'var(--shadow-card)',
                  }}
                />
                <Legend
                  formatter={(value) => (value === 'before' ? 'Before' : 'After')}
                  wrapperStyle={{ fontSize: 11, color: tokens.textSecondary }}
                />
                <Bar dataKey="before" name="before" fill={tokens.danger} radius={[6, 6, 0, 0]} />
                <Bar dataKey="after" name="after" fill={tokens.info} radius={[6, 6, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="rounded-xl bg-card px-4 py-4 shadow-card">
          <p className="m-0 text-[10px] uppercase tracking-[0.35em] font-semibold text-muted-foreground">
            Outcomes by reason
          </p>
          <div className="mt-4 h-[190px] w-full">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={reasonChartData} layout="vertical" margin={{ left: 24 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" opacity={0.35} horizontal={false} />
                <XAxis type="number" tick={{ fill: tokens.textSecondary, fontSize: 11 }} tickLine={false} axisLine={false} allowDecimals={false} />
                <YAxis
                  type="category"
                  dataKey="label"
                  tick={{ fill: tokens.textSecondary, fontSize: 11 }}
                  tickLine={false}
                  axisLine={false}
                  width={88}
                />
                <Tooltip
                  formatter={(value: number) => [formatAnalyticsNumber(value), 'Attempts']}
                  contentStyle={{
                    borderRadius: '14px',
                    borderColor: tokens.border,
                    backgroundColor: tokens.surface,
                    boxShadow: 'var(--shadow-card)',
                  }}
                />
                <Bar dataKey="count" radius={[0, 6, 6, 0]}>
                  {reasonChartData.map((row) => (
                    <Cell key={row.reason} fill={row.rewritten ? tokens.success : tokens.danger} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>
    </AnalyticsCardShell>
  );
}
