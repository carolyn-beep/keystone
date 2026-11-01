import { useQuery } from '@tanstack/react-query';
import type {
  AnalyticsDateFilter,
  BrainliftScoreHistoryResponse,
  ScoreDistributionFilters,
  DokCliffResponse,
  GraderConsistencyResponse,
  HumanVerificationResponse,
  LeaderboardRankBy,
  LeaderboardResponse,
  ModelDriftResponse,
  ReadabilityAnalyticsResponse,
  ScoreDistributionResponse,
  ScoreImprovementResponse,
  SpovDistributionResponse,
  VanillaComparisonResponse,
  VolumeFilters,
  VolumeResponse,
} from '@shared/analytics-types';

export interface AnalyticsPageFilters {
  from: string;
  to: string;
}

export type AnalyticsQuickRange = '7d' | '14d' | 'lastMonth' | 'custom';

function formatDateInput(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function isDateInput(value: string | undefined): value is string {
  return typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value);
}

export function getDefaultAnalyticsPageFilters(now = new Date()): AnalyticsPageFilters {
  const to = formatDateInput(now);
  const fromDate = new Date(now);
  fromDate.setDate(fromDate.getDate() - 29);

  return {
    from: formatDateInput(fromDate),
    to,
  };
}

export function getRollingAnalyticsPageFilters(days: number, now = new Date()): AnalyticsPageFilters {
  const safeDays = Math.max(1, Math.floor(days));
  const to = formatDateInput(now);
  const fromDate = new Date(now);
  fromDate.setDate(fromDate.getDate() - (safeDays - 1));

  return {
    from: formatDateInput(fromDate),
    to,
  };
}

export function getLastMonthAnalyticsPageFilters(now = new Date()): AnalyticsPageFilters {
  const startOfCurrentMonth = new Date(now.getFullYear(), now.getMonth(), 1);
  const startOfLastMonth = new Date(startOfCurrentMonth.getFullYear(), startOfCurrentMonth.getMonth() - 1, 1);
  const endOfLastMonth = new Date(startOfCurrentMonth.getFullYear(), startOfCurrentMonth.getMonth(), 0);

  return {
    from: formatDateInput(startOfLastMonth),
    to: formatDateInput(endOfLastMonth),
  };
}

export function getAnalyticsQuickRangeFilters(
  range: Exclude<AnalyticsQuickRange, 'custom'>,
  now = new Date(),
): AnalyticsPageFilters {
  switch (range) {
    case '7d':
      return getRollingAnalyticsPageFilters(7, now);
    case '14d':
      return getRollingAnalyticsPageFilters(14, now);
    case 'lastMonth':
      return getLastMonthAnalyticsPageFilters(now);
  }
}

export function normalizeAnalyticsPageFilters(
  input?: Partial<AnalyticsPageFilters>,
  now = new Date(),
): AnalyticsPageFilters {
  const defaults = getDefaultAnalyticsPageFilters(now);
  let from = isDateInput(input?.from) ? input.from : defaults.from;
  let to = isDateInput(input?.to) ? input.to : defaults.to;

  if (from > to) {
    [from, to] = [to, from];
  }

  return { from, to };
}

export function resolveAnalyticsQuickRange(
  input?: Partial<AnalyticsPageFilters>,
  now = new Date(),
): AnalyticsQuickRange {
  const normalized = normalizeAnalyticsPageFilters(input, now);
  const quickRanges: Array<Exclude<AnalyticsQuickRange, 'custom'>> = ['7d', '14d', 'lastMonth'];

  for (const range of quickRanges) {
    const candidate = getAnalyticsQuickRangeFilters(range, now);
    if (candidate.from === normalized.from && candidate.to === normalized.to) {
      return range;
    }
  }

  return 'custom';
}

export function buildAnalyticsQueryString(
  params: Record<string, string | number | null | undefined>,
): string {
  const search = new URLSearchParams();

  for (const [key, value] of Object.entries(params)) {
    if (value === undefined || value === null || value === '') {
      continue;
    }
    search.set(key, String(value));
  }

  return search.toString();
}

export function parseAnalyticsLeaderboardAllowlist(
  source?: string | null,
): string[] {
  if (!source) {
    return [];
  }

  return source
    .split(',')
    .map((item) => item.trim().toLowerCase())
    .filter(Boolean);
}

export function shouldShowAnalyticsLeaderboard(
  email?: string | null,
  allowlistSource?: string | null,
): boolean {
  const allowlist = parseAnalyticsLeaderboardAllowlist(allowlistSource);
  if (allowlist.length === 0) {
    return true;
  }

  if (!email) {
    return false;
  }

  return allowlist.includes(email.trim().toLowerCase());
}

async function fetchAnalytics<T>(
  path: string,
  params: Record<string, string | number | null | undefined> = {},
): Promise<T> {
  const query = buildAnalyticsQueryString(params);
  const response = await fetch(query ? `${path}?${query}` : path, {
    credentials: 'include',
  });

  if (!response.ok) {
    const message = (await response.text()) || response.statusText;
    throw new Error(`${response.status}: ${message}`);
  }

  return response.json() as Promise<T>;
}

interface AnalyticsQueryOptions {
  enabled?: boolean;
}

export function useVolumeAnalytics(
  filters: VolumeFilters,
  options: AnalyticsQueryOptions = {},
) {
  return useQuery<VolumeResponse>({
    queryKey: [
      'analytics',
      'volume',
      filters.from ?? '',
      filters.to ?? '',
      filters.userId ?? '',
      String(filters.dokLevel ?? 'all'),
      filters.origin ?? 'all',
    ],
    enabled: options.enabled,
    queryFn: () => fetchAnalytics('/api/analytics/volume', { ...filters }),
  });
}

export function useHumanVerificationAnalytics(
  filters: AnalyticsDateFilter,
  options: AnalyticsQueryOptions = {},
) {
  return useQuery<HumanVerificationResponse>({
    queryKey: ['analytics', 'human-verification', filters.from ?? '', filters.to ?? ''],
    enabled: options.enabled,
    queryFn: () => fetchAnalytics('/api/analytics/human-verification', { ...filters }),
  });
}

export function useGraderConsistencyAnalytics(
  options: AnalyticsQueryOptions = {},
) {
  return useQuery<GraderConsistencyResponse>({
    queryKey: ['analytics', 'grader-consistency'],
    enabled: options.enabled,
    queryFn: () => fetchAnalytics('/api/analytics/grader-consistency'),
  });
}

export function useModelDriftAnalytics(
  options: AnalyticsQueryOptions = {},
) {
  return useQuery<ModelDriftResponse>({
    queryKey: ['analytics', 'model-drift'],
    enabled: options.enabled,
    queryFn: () => fetchAnalytics('/api/analytics/model-drift'),
  });
}

export function useReadabilityAnalytics(
  options: AnalyticsQueryOptions = {},
) {
  return useQuery<ReadabilityAnalyticsResponse>({
    queryKey: ['analytics', 'readability'],
    enabled: options.enabled,
    queryFn: () => fetchAnalytics('/api/analytics/readability'),
  });
}

export function useVanillaComparisonAnalytics(
  filters: AnalyticsDateFilter,
  options: AnalyticsQueryOptions = {},
) {
  return useQuery<VanillaComparisonResponse>({
    queryKey: ['analytics', 'vanilla-comparison', filters.from ?? '', filters.to ?? ''],
    enabled: options.enabled,
    queryFn: () => fetchAnalytics('/api/analytics/vanilla-comparison', { ...filters }),
  });
}

export function useDokCliffAnalytics(
  filters: AnalyticsDateFilter,
  options: AnalyticsQueryOptions = {},
) {
  return useQuery<DokCliffResponse>({
    queryKey: ['analytics', 'dok-cliff', filters.from ?? '', filters.to ?? ''],
    enabled: options.enabled,
    queryFn: () => fetchAnalytics('/api/analytics/dok-cliff', { ...filters }),
  });
}

export function useScoreDistributionAnalytics(
  filters: ScoreDistributionFilters,
  options: AnalyticsQueryOptions = {},
) {
  return useQuery<ScoreDistributionResponse>({
    queryKey: ['analytics', 'score-distribution', filters.from ?? '', filters.to ?? '', String(filters.dokLevel ?? 'all')],
    enabled: options.enabled,
    queryFn: () => fetchAnalytics('/api/analytics/score-distribution', { ...filters }),
  });
}

export function useSpovDistributionAnalytics(
  filters: AnalyticsDateFilter,
  options: AnalyticsQueryOptions = {},
) {
  return useQuery<SpovDistributionResponse>({
    queryKey: ['analytics', 'spov-distribution', filters.from ?? '', filters.to ?? ''],
    enabled: options.enabled,
    queryFn: () => fetchAnalytics('/api/analytics/spov-distribution', { ...filters }),
  });
}

export function useScoreImprovementAnalytics(
  filters: AnalyticsDateFilter & { limit?: number },
  options: AnalyticsQueryOptions = {},
) {
  return useQuery<ScoreImprovementResponse>({
    queryKey: [
      'analytics',
      'score-improvement',
      filters.from ?? '',
      filters.to ?? '',
      filters.limit ?? 0,
    ],
    enabled: options.enabled,
    queryFn: () => fetchAnalytics('/api/analytics/score-improvement', { ...filters }),
  });
}

export function useBrainliftScoreHistoryAnalytics(
  filters: AnalyticsDateFilter & { brainliftId?: number | null },
  options: AnalyticsQueryOptions = {},
) {
  const brainliftId = filters.brainliftId ?? null;

  return useQuery<BrainliftScoreHistoryResponse>({
    queryKey: [
      'analytics',
      'brainlift-score-history',
      filters.from ?? '',
      filters.to ?? '',
      brainliftId ?? 0,
    ],
    enabled: options.enabled && brainliftId !== null,
    queryFn: () => fetchAnalytics('/api/analytics/brainlift-score-history', {
      from: filters.from,
      to: filters.to,
      brainliftId,
    }),
  });
}

export function useLeaderboardAnalytics(
  filters: AnalyticsDateFilter & { rankBy: LeaderboardRankBy; limit?: number },
  options: AnalyticsQueryOptions = {},
) {
  return useQuery<LeaderboardResponse>({
    queryKey: [
      'analytics',
      'leaderboard',
      filters.from ?? '',
      filters.to ?? '',
      filters.rankBy,
      filters.limit ?? 0,
    ],
    enabled: options.enabled,
    queryFn: () => fetchAnalytics('/api/analytics/leaderboard', { ...filters }),
  });
}
