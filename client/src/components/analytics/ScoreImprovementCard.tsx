import { useEffect, useState } from 'react';
import { ChevronDown, ChevronUp } from 'lucide-react';
import type { AnalyticsDateFilter, ScoreImprovementResponse } from '@shared/analytics-types';
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
import { useBrainliftScoreHistoryAnalytics } from '@/hooks/useAnalyticsDashboard';
import { formatAnalyticsDate, formatAnalyticsDelta, formatAnalyticsDecimal, formatAnalyticsNumber } from './formatters';
import { TactileButton } from '@/components/ui/tactile-button';
import { tokens } from '@/lib/colors';
import { cn } from '@/lib/utils';

interface ScoreImprovementCardProps {
  data?: ScoreImprovementResponse;
  isLoading: boolean;
  error: Error | null;
  filters: AnalyticsDateFilter;
  revealNames?: boolean;
}

const SCORE_IMPROVEMENT_PAGE_SIZE = 5;
const SCORE_IMPROVEMENT_SUBTITLE = 'Tracks whether platform feedback is actually helping people and automated research loops improve BrainLifts over time, not just where scores happen to sit today.';

function formatScoreHistoryTick(value: string): string {
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return '';
  return new Intl.DateTimeFormat('en-US', {
    month: 'short',
    day: 'numeric',
  }).format(parsed);
}

function formatScoreHistoryTooltipLabel(value: string): string {
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return 'Undated';
  return new Intl.DateTimeFormat('en-US', {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  }).format(parsed);
}

function hashAliasSeed(seed: string): number {
  let hash = 2166136261;

  for (let index = 0; index < seed.length; index += 1) {
    hash ^= seed.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }

  return hash >>> 0;
}

function formatAlias(prefix: 'Owner' | 'Brainlift', seed: string): string {
  const token = hashAliasSeed(seed).toString(36).toUpperCase().padStart(6, '0').slice(0, 6);
  return `${prefix} ${token}`;
}

export function ScoreImprovementCard({
  data,
  isLoading,
  error,
  filters,
  revealNames = false,
}: ScoreImprovementCardProps) {
  const [page, setPage] = useState(0);
  const [expandedBrainliftId, setExpandedBrainliftId] = useState<number | null>(null);
  const scoreHistory = useBrainliftScoreHistoryAnalytics({
    ...filters,
    brainliftId: expandedBrainliftId,
  }, {
    enabled: expandedBrainliftId !== null,
  });

  useEffect(() => {
    setPage(0);
    setExpandedBrainliftId(null);
  }, [data]);

  if (isLoading) {
    return (
      <AnalyticsCardShell
        eyebrow="Quality movement"
        title="Score Improvement"
        subtitle={SCORE_IMPROVEMENT_SUBTITLE}
        subtitleClassName="max-w-none"
      >
        <AnalyticsLoadingState label="Loading score history deltas and recent movers." />
      </AnalyticsCardShell>
    );
  }

  if (error) {
    return (
      <AnalyticsCardShell
        eyebrow="Quality movement"
        title="Score Improvement"
        subtitle={SCORE_IMPROVEMENT_SUBTITLE}
        subtitleClassName="max-w-none"
      >
        <AnalyticsErrorState error={error} />
      </AnalyticsCardShell>
    );
  }

  if (!data || !data.hasData || data.rows.length === 0) {
    return (
      <AnalyticsCardShell
        eyebrow="Quality movement"
        title="Score Improvement"
        subtitle={SCORE_IMPROVEMENT_SUBTITLE}
        subtitleClassName="max-w-none"
      >
        <AnalyticsEmptyState
          title="No score history yet"
          description="This section becomes meaningful once score windows accumulate over time. The analytics foundation is recording them now."
        />
      </AnalyticsCardShell>
    );
  }

  const totalRows = data.rows.length;
  const totalPages = Math.max(1, Math.ceil(totalRows / SCORE_IMPROVEMENT_PAGE_SIZE));
  const currentPage = Math.min(page, totalPages - 1);
  const startIndex = currentPage * SCORE_IMPROVEMENT_PAGE_SIZE;
  const endIndex = Math.min(startIndex + SCORE_IMPROVEMENT_PAGE_SIZE, totalRows);
  const visibleRows = data.rows.slice(startIndex, endIndex);

  const expandedRow = expandedBrainliftId === null
    ? null
    : data.rows.find((row) => row.brainliftId === expandedBrainliftId) ?? null;

  return (
    <AnalyticsCardShell
      eyebrow={`${formatAnalyticsNumber(data.summary.totalBrainlifts)} tracked brainlifts`}
      title="Score Improvement"
      subtitle={SCORE_IMPROVEMENT_SUBTITLE}
      subtitleClassName="max-w-none"
    >
      <div className="grid gap-4 sm:grid-cols-3">
        <AnalyticsMetric label="Average Delta" value={formatAnalyticsDelta(data.summary.averageDelta)} tone="steel" />
        <AnalyticsMetric label="Improving" value={formatAnalyticsNumber(data.summary.improving)} tone="olive" />
        <AnalyticsMetric label="Declining" value={formatAnalyticsNumber(data.summary.declining)} tone="brick" />
      </div>

      <div className="mt-8 rounded-xl bg-card shadow-card">
        <div className="grid gap-px bg-border/70">
          {visibleRows.map((row) => {
            const isExpanded = row.brainliftId === expandedBrainliftId;
            const ownerSeed = `${row.brainliftId}:${row.ownerUserId ?? row.ownerEmail ?? 'unassigned'}`;
            const brainliftSeed = `${row.brainliftId}:${row.brainliftSlug}:${row.latestRecordedAt}`;
            const ownerLabel = revealNames
              ? row.ownerName ?? row.ownerEmail ?? 'Unassigned owner'
              : row.ownerUserId ?? row.ownerEmail
                ? formatAlias('Owner', ownerSeed)
                : 'Unassigned owner';
            const brainliftLabel = revealNames
              ? row.brainliftTitle
              : formatAlias('Brainlift', brainliftSeed);

            return (
              <div key={row.brainliftId} className="bg-card-elevated">
                <div
                  role="button"
                  tabIndex={0}
                  onClick={() => setExpandedBrainliftId((value) => value === row.brainliftId ? null : row.brainliftId)}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter' || event.key === ' ') {
                      event.preventDefault();
                      setExpandedBrainliftId((value) => value === row.brainliftId ? null : row.brainliftId);
                    }
                  }}
                  className={cn(
                    'grid gap-4 px-6 py-5 transition-colors focus:outline-none',
                    isExpanded ? 'bg-card-elevated' : 'bg-card-elevated hover:bg-card',
                  )}
                >
                  <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_140px_110px_28px]">
                    <div>
                      <p className="m-0 text-[10px] uppercase tracking-[0.35em] font-semibold text-muted-foreground">
                        {ownerLabel}
                      </p>
                      <h3 className="mt-3 font-serif text-[18px] leading-[1.4] text-foreground">
                        {brainliftLabel}
                      </h3>
                      <p className="mt-2 font-serif text-[13px] italic leading-[1.7] text-muted-foreground">
                        Latest activity: {formatAnalyticsDate(row.latestRecordedAt)}
                      </p>
                    </div>
                    <div>
                      <p className="m-0 text-[10px] uppercase tracking-[0.35em] font-semibold text-muted-foreground">
                        Score path
                      </p>
                      <p className="mt-3 font-serif text-[18px] leading-none text-foreground">
                        {formatAnalyticsDecimal(row.firstScore)} → {formatAnalyticsDecimal(row.latestScore)}
                      </p>
                      <p className="mt-2 font-serif text-[13px] italic leading-[1.7] text-muted-foreground">
                        {formatAnalyticsNumber(row.totalEvents)} {row.totalEvents === 1 ? 'edit' : 'edits'} across {formatAnalyticsNumber(row.totalWindows)} {row.totalWindows === 1 ? 'window' : 'windows'}
                      </p>
                    </div>
                    <div>
                      <p className="m-0 text-[10px] uppercase tracking-[0.35em] font-semibold text-muted-foreground">
                        Delta
                      </p>
                      <p
                        className={cn(
                          'mt-3 font-serif text-[32px] leading-none',
                          row.delta > 0 ? 'text-success' : row.delta < 0 ? 'text-danger' : 'text-foreground',
                        )}
                      >
                        {formatAnalyticsDelta(row.delta)}
                      </p>
                    </div>
                    <div className="flex items-start justify-end pt-1 text-muted-foreground">
                      {isExpanded ? <ChevronUp size={18} /> : <ChevronDown size={18} />}
                    </div>
                  </div>
                </div>

                {isExpanded ? (
                  <div className="border-t border-border/70 bg-card px-6 py-5">
                    <p className="m-0 text-[10px] uppercase tracking-[0.35em] font-semibold text-muted-foreground">
                      Evolution
                    </p>
                    <p className="mt-3 font-serif text-[13px] italic leading-[1.7] text-muted-foreground">
                      Windowed score history across the current date range.
                    </p>

                    {scoreHistory.isLoading ? (
                      <div className="mt-5 flex min-h-[220px] items-center justify-center rounded-xl bg-card-elevated px-6 py-8 text-center shadow-card">
                        <p className="m-0 font-serif text-[14px] italic leading-[1.7] text-muted-foreground">
                          Loading score evolution.
                        </p>
                      </div>
                    ) : scoreHistory.error ? (
                      <div className="mt-5 flex min-h-[220px] items-center justify-center rounded-xl bg-danger-soft/70 px-6 py-8 text-center shadow-card">
                        <p className="m-0 font-serif text-[14px] italic leading-[1.7] text-foreground">
                          {scoreHistory.error.message}
                        </p>
                      </div>
                    ) : !scoreHistory.data || !scoreHistory.data.hasData || scoreHistory.data.points.length === 0 ? (
                      <div className="mt-5 flex min-h-[220px] items-center justify-center rounded-xl bg-card-elevated px-6 py-8 text-center shadow-card">
                        <p className="m-0 font-serif text-[14px] italic leading-[1.7] text-muted-foreground">
                          No score path recorded for this brainlift in the selected window.
                        </p>
                      </div>
                    ) : (
                      <div className="mt-5 h-[240px] w-full">
                        <ResponsiveContainer width="100%" height="100%">
                          <LineChart data={scoreHistory.data.points}>
                            <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" opacity={0.35} />
                            <XAxis
                              dataKey="recordedAt"
                              tick={{ fill: tokens.textSecondary, fontSize: 11 }}
                              tickFormatter={formatScoreHistoryTick}
                              tickLine={false}
                              axisLine={false}
                              minTickGap={24}
                            />
                            <YAxis
                              domain={[0, 5]}
                              tick={{ fill: tokens.textSecondary, fontSize: 11 }}
                              tickLine={false}
                              axisLine={false}
                              width={32}
                            />
                            <Tooltip
                              labelFormatter={(value: string) => formatScoreHistoryTooltipLabel(value)}
                              formatter={(value: number | string, _name, payload) => [
                                formatAnalyticsDecimal(typeof value === 'number' ? value : Number(value)),
                                payload?.payload?.kind === 'baseline' ? 'Baseline score' : 'Recorded score',
                              ]}
                              contentStyle={{
                                borderRadius: '14px',
                                borderColor: tokens.border,
                                backgroundColor: tokens.surface,
                                boxShadow: 'var(--shadow-card)',
                              }}
                            />
                            <Line
                              type="linear"
                              dataKey="score"
                              stroke={tokens.info}
                              strokeWidth={3}
                              dot={{
                                r: 4,
                                fill: tokens.surface,
                                stroke: tokens.info,
                                strokeWidth: 2,
                              }}
                              activeDot={{
                                r: 5,
                                fill: tokens.surface,
                                stroke: tokens.info,
                                strokeWidth: 2,
                              }}
                            />
                          </LineChart>
                        </ResponsiveContainer>
                      </div>
                    )}

                    {expandedRow ? (
                      <p className="mt-4 font-serif text-[12px] italic leading-[1.7] text-muted-foreground">
                        {(revealNames
                          ? expandedRow.brainliftTitle
                          : formatAlias(
                            'Brainlift',
                            `${expandedRow.brainliftId}:${expandedRow.brainliftSlug}:${expandedRow.latestRecordedAt}`,
                          ))} moved from {formatAnalyticsDecimal(expandedRow.firstScore)} to {formatAnalyticsDecimal(expandedRow.latestScore)} in this window.
                      </p>
                    ) : null}
                  </div>
                ) : null}
              </div>
            );
          })}
        </div>

        {totalPages > 1 ? (
          <div className="flex flex-col gap-4 border-t border-border/70 bg-card px-6 py-4 sm:flex-row sm:items-center sm:justify-between">
            <p className="m-0 text-[10px] uppercase tracking-[0.35em] font-semibold text-muted-foreground">
              Showing {formatAnalyticsNumber(startIndex + 1)}-{formatAnalyticsNumber(endIndex)} of {formatAnalyticsNumber(totalRows)}
            </p>
            <div className="flex items-center gap-3">
              <TactileButton
                variant="inset"
                className="px-4 py-2 text-[11px] uppercase tracking-[0.2em]"
                disabled={currentPage === 0}
                onClick={() => {
                  setExpandedBrainliftId(null);
                  setPage((value) => Math.max(0, value - 1));
                }}
              >
                Prev
              </TactileButton>
              <p className="m-0 text-[10px] uppercase tracking-[0.35em] font-semibold text-muted-foreground">
                Page {formatAnalyticsNumber(currentPage + 1)} / {formatAnalyticsNumber(totalPages)}
              </p>
              <TactileButton
                variant="inset"
                className="px-4 py-2 text-[11px] uppercase tracking-[0.2em]"
                disabled={currentPage >= totalPages - 1}
                onClick={() => {
                  setExpandedBrainliftId(null);
                  setPage((value) => Math.min(totalPages - 1, value + 1));
                }}
              >
                Next
              </TactileButton>
            </div>
          </div>
        ) : null}
      </div>
    </AnalyticsCardShell>
  );
}
