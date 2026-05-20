import { useMemo, useState } from 'react';
import { ArrowLeft, CalendarRange, ShieldAlert } from 'lucide-react';
import { useSidebarSlot } from '@/components/layout';
import type { AnalyticsDokLevelFilter, LeaderboardRankBy } from '@shared/analytics-types';
import { authClient } from '@/lib/auth-client';
import { TactileButton } from '@/components/ui/tactile-button';
import { useLocation } from 'wouter';
import { LIBRARY_ROUTE_PATH } from '@/components/chat/chat-home-helpers';
import {
  getAnalyticsQuickRangeFilters,
  getDefaultAnalyticsPageFilters,
  useDokCliffAnalytics,
  resolveAnalyticsQuickRange,
  normalizeAnalyticsPageFilters,
  useScoreDistributionAnalytics,
  shouldShowAnalyticsLeaderboard,
  useGraderConsistencyAnalytics,
  useHumanVerificationAnalytics,
  useLeaderboardAnalytics,
  useModelDriftAnalytics,
  useScoreImprovementAnalytics,
  useSpovDistributionAnalytics,
  useVanillaComparisonAnalytics,
  useVolumeAnalytics,
} from '@/hooks/useAnalyticsDashboard';
import { VolumeCard } from '@/components/analytics/VolumeCard';
import { HumanVerificationCard } from '@/components/analytics/HumanVerificationCard';
import { GraderConsistencyCard } from '@/components/analytics/GraderConsistencyCard';
import { ModelDriftCard } from '@/components/analytics/ModelDriftCard';
import { VanillaComparisonCard } from '@/components/analytics/VanillaComparisonCard';
import { DokCliffCard } from '@/components/analytics/DokCliffCard';
import { ScoreDistributionCard } from '@/components/analytics/ScoreDistributionCard';
import { SpovDistributionCard } from '@/components/analytics/SpovDistributionCard';
import { ScoreImprovementCard } from '@/components/analytics/ScoreImprovementCard';
import { LeaderboardCard } from '@/components/analytics/LeaderboardCard';

const QUICK_RANGE_OPTIONS = [
  { key: '7d', label: '7D' },
  { key: '14d', label: '14D' },
  { key: 'lastMonth', label: 'Last Month' },
] as const;

function QueryError(error: unknown): Error | null {
  return error instanceof Error ? error : null;
}

export default function Analytics() {
  const [, setLocation] = useLocation();
  const { data: session, isPending } = authClient.useSession();
  const sidebarSlotSpec = useMemo(
    () => ({ body: null, activeSection: 'analytics' as const }),
    [],
  );
  useSidebarSlot(sidebarSlotSpec);
  const [filters, setFilters] = useState(() => getDefaultAnalyticsPageFilters());
  const [leaderboardRankBy, setLeaderboardRankBy] = useState<LeaderboardRankBy>('quality');
  const [scoreDistributionDokLevel, setScoreDistributionDokLevel] = useState<AnalyticsDokLevelFilter>('all');
  const revealNames = typeof window !== 'undefined'
    && new URLSearchParams(window.location.search).get('viewNames') === 'true';

  const normalizedFilters = normalizeAnalyticsPageFilters(filters);
  const activeQuickRange = resolveAnalyticsQuickRange(normalizedFilters);
  const isAdmin = session?.user?.role === 'admin';
  const queriesEnabled = !isPending && isAdmin;
  const canSeeLeaderboard = shouldShowAnalyticsLeaderboard(
    session?.user?.email ?? null,
    import.meta.env.VITE_ANALYTICS_LEADERBOARD_ALLOWLIST as string | undefined,
  );

  const volume = useVolumeAnalytics({
    ...normalizedFilters,
    dokLevel: 'all',
    origin: 'all',
  }, { enabled: queriesEnabled });
  const humanVerification = useHumanVerificationAnalytics(normalizedFilters, { enabled: queriesEnabled });
  const graderConsistency = useGraderConsistencyAnalytics({ enabled: queriesEnabled });
  const modelDrift = useModelDriftAnalytics({ enabled: queriesEnabled });
  const vanillaComparison = useVanillaComparisonAnalytics(normalizedFilters, { enabled: queriesEnabled });
  const dokCliff = useDokCliffAnalytics(normalizedFilters, { enabled: queriesEnabled });
  const scoreDistribution = useScoreDistributionAnalytics({
    ...normalizedFilters,
    dokLevel: scoreDistributionDokLevel,
  }, { enabled: queriesEnabled });
  const spovDistribution = useSpovDistributionAnalytics(normalizedFilters, { enabled: queriesEnabled });
  const scoreImprovement = useScoreImprovementAnalytics(normalizedFilters, { enabled: queriesEnabled });
  const leaderboard = useLeaderboardAnalytics({
    ...normalizedFilters,
    rankBy: leaderboardRankBy,
    limit: 10,
  }, { enabled: queriesEnabled });
  const shouldShowHumanVerification =
    humanVerification.isLoading
    || !!humanVerification.error
    || !!humanVerification.data?.hasData;

  if (isPending) {
    return (
      <div className="min-h-screen bg-background px-4 py-16 sm:px-8">
        <div className="mx-auto flex max-w-[920px] flex-col items-center justify-center rounded-[28px] bg-card-elevated px-8 py-20 text-center shadow-card">
          <div className="h-10 w-10 animate-spin rounded-full border-4 border-primary border-t-transparent" />
          <p className="mt-6 text-[10px] uppercase tracking-[0.35em] font-semibold text-muted-foreground">
            Loading session
          </p>
          <p className="mt-3 font-serif text-[15px] italic leading-[1.8] text-muted-foreground">
            Preparing the analytics surface.
          </p>
        </div>
      </div>
    );
  }

  if (!isAdmin) {
    return (
      <div className="min-h-screen bg-background px-4 py-16 sm:px-8">
        <div className="mx-auto max-w-[920px] rounded-[28px] bg-card-elevated px-8 py-16 text-center shadow-card">
          <ShieldAlert className="mx-auto h-12 w-12 text-warning" />
          <p className="mt-6 text-[10px] uppercase tracking-[0.35em] font-semibold text-muted-foreground">
            Admin surface
          </p>
          <h1 className="mt-4 font-serif text-[34px] leading-[1.2] text-foreground">
            Analytics is restricted to admin sessions
          </h1>
          <p className="mx-auto mt-4 max-w-2xl font-serif text-[15px] italic leading-[1.9] text-muted-foreground">
            The route is protected, but this page still performs its own role check because the shared route guard only enforces authentication.
          </p>
          <div className="mt-8 flex justify-center">
            <TactileButton variant="raised" className="flex items-center gap-2" onClick={() => setLocation('/')}>
              <ArrowLeft size={16} />
              Return Home
            </TactileButton>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <main className="mx-auto max-w-[1440px] px-4 py-8 sm:px-8 sm:py-10">
        <section className="relative overflow-hidden rounded-[32px] bg-card-elevated px-6 py-8 shadow-card sm:px-10 sm:py-10">
          <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_left,rgba(59,110,143,0.14),transparent_34%),radial-gradient(circle_at_bottom_right,rgba(149,58,52,0.12),transparent_32%)]" />
          <div className="relative grid gap-6 xl:grid-cols-[minmax(0,1fr)_280px]">
            <div>
              <div className="flex flex-wrap items-center gap-3">
                <TactileButton variant="inset" className="flex items-center gap-2" onClick={() => setLocation(LIBRARY_ROUTE_PATH)}>
                  <ArrowLeft size={16} />
                  Library
                </TactileButton>
              </div>

              <h1 className="mt-8 max-w-4xl font-serif text-[42px] leading-[1.05] text-foreground sm:text-[56px]">
                Platform Analytics
              </h1>
              <p className="mt-5 max-w-3xl font-serif text-[16px] italic leading-[1.9] text-muted-foreground">
                A printed-ledger view of production volume, grader drift, SPOV quality, and owner-attributed momentum across the system.
              </p>
            </div>

            <div className="rounded-[18px] bg-card/95 px-4 py-4  shadow-card backdrop-blur-sm">
              <div className="flex items-center gap-4 py-2">
                <CalendarRange className="h-4 w-4 text-primary" />
                <p className="m-0 font-serif text-[16px] leading-[1.25] text-foreground">
                  Shared Date Window
                </p>
              </div>

              <div className="mt-4 grid grid-cols-[56px_56px_minmax(0,1fr)] gap-4 py-2">
                {QUICK_RANGE_OPTIONS.map((option) => (
                  <TactileButton
                    key={option.key}
                    variant={activeQuickRange === option.key ? 'raised' : 'inset'}
                    className="whitespace-nowrap px-2.5 py-2 text-[9px] uppercase tracking-[0.16em] font-semibold"
                    onClick={() => setFilters(getAnalyticsQuickRangeFilters(option.key))}
                  >
                    {option.label}
                  </TactileButton>
                ))}
              </div>

              <div className="mt-4 grid grid-cols-2 gap-2">
                <label className="block">
                  <span className="text-[8px] uppercase tracking-[0.35em] font-semibold text-muted-foreground">
                    From
                  </span>
                  <input
                    aria-label="From date"
                    type="date"
                    value={normalizedFilters.from}
                    onChange={(event) => setFilters((current) => ({ ...current, from: event.target.value }))}
                    className="mt-1.5 w-full rounded-lg border border-border/80 bg-card-elevated px-2.5 py-2 font-serif text-[12px] text-foreground outline-none transition-colors focus:border-primary/40"
                  />
                </label>

                <label className="block">
                  <span className="text-[8px] uppercase tracking-[0.35em] font-semibold text-muted-foreground">
                    To
                  </span>
                  <input
                    aria-label="To date"
                    type="date"
                    value={normalizedFilters.to}
                    onChange={(event) => setFilters((current) => ({ ...current, to: event.target.value }))}
                    className="mt-1.5 w-full rounded-lg border border-border/80 bg-card-elevated px-2.5 py-2 font-serif text-[12px] text-foreground outline-none transition-colors focus:border-primary/40"
                  />
                </label>
              </div>
            </div>
          </div>
        </section>

        <section className="mt-8 grid gap-8 xl:grid-cols-12">
          <div className="xl:col-span-12">
            <VolumeCard
              data={volume.data}
              isLoading={volume.isLoading}
              error={QueryError(volume.error)}
            />
          </div>

          <div className="xl:col-span-6">
            <DokCliffCard
              data={dokCliff.data}
              isLoading={dokCliff.isLoading}
              error={QueryError(dokCliff.error)}
            />
          </div>

          <div className="xl:col-span-6">
            <ScoreDistributionCard
              data={scoreDistribution.data}
              isLoading={scoreDistribution.isLoading}
              error={QueryError(scoreDistribution.error)}
              selectedDokLevel={scoreDistributionDokLevel}
              onDokLevelChange={setScoreDistributionDokLevel}
            />
          </div>

          <div className="xl:col-span-12">
            <SpovDistributionCard
              data={spovDistribution.data}
              isLoading={spovDistribution.isLoading}
              error={QueryError(spovDistribution.error)}
            />
          </div>

          <div className="xl:col-span-12">
            <ScoreImprovementCard
              data={scoreImprovement.data}
              isLoading={scoreImprovement.isLoading}
              error={QueryError(scoreImprovement.error)}
              filters={normalizedFilters}
              revealNames={revealNames}
            />
          </div>

          <div className="xl:col-span-6">
            <GraderConsistencyCard
              data={graderConsistency.data}
              isLoading={graderConsistency.isLoading}
              error={QueryError(graderConsistency.error)}
            />
          </div>

          <div className="xl:col-span-6">
            <ModelDriftCard
              data={modelDrift.data}
              isLoading={modelDrift.isLoading}
              error={QueryError(modelDrift.error)}
            />
          </div>

          {shouldShowHumanVerification ? (
            <div className="xl:col-span-12">
              <HumanVerificationCard
                data={humanVerification.data}
                isLoading={humanVerification.isLoading}
                error={QueryError(humanVerification.error)}
              />
            </div>
          ) : null}

          <div className="xl:col-span-12">
            <VanillaComparisonCard
              data={vanillaComparison.data}
              isLoading={vanillaComparison.isLoading}
              error={QueryError(vanillaComparison.error)}
              revealNames={revealNames}
            />
          </div>

          <div className="xl:col-span-12">
            <LeaderboardCard
              data={leaderboard.data}
              isLoading={leaderboard.isLoading}
              error={QueryError(leaderboard.error)}
              rankBy={leaderboardRankBy}
              onRankByChange={setLeaderboardRankBy}
              isVisible={canSeeLeaderboard}
            />
          </div>
        </section>
      </main>
    </div>
  );
}
