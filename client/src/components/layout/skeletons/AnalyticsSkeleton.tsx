import { SkeletonBlock } from './SkeletonBlock';

/**
 * Mirror of `client/src/pages/Analytics.tsx`: hero card with title + filter
 * controls, followed by a stack of analytics chart cards.
 */
export function AnalyticsSkeleton() {
  return (
    <div className="min-h-full bg-background">
      <main className="mx-auto max-w-[1440px] px-4 py-8 sm:px-8 sm:py-10">
        {/* Hero */}
        <section className="rounded-[32px] bg-card-elevated px-6 py-8 shadow-card sm:px-10 sm:py-10">
          <SkeletonBlock className="h-8 w-24" rounded="md" />
          <SkeletonBlock className="mt-8 h-12 w-2/3" />
          <SkeletonBlock className="mt-4 h-4 w-1/2" />
          <div className="mt-8 flex flex-wrap items-center gap-3">
            <SkeletonBlock className="h-8 w-16" rounded="full" />
            <SkeletonBlock className="h-8 w-16" rounded="full" />
            <SkeletonBlock className="h-8 w-28" rounded="full" />
            <SkeletonBlock className="h-8 w-40" rounded="md" />
          </div>
        </section>

        {/* Analytics cards */}
        <div className="mt-10 flex flex-col gap-6">
          {Array.from({ length: 5 }).map((_, i) => (
            <AnalyticsCardSkeleton key={i} />
          ))}
        </div>
      </main>
    </div>
  );
}

function AnalyticsCardSkeleton() {
  return (
    <div className="rounded-2xl border border-border bg-card p-6">
      <div className="mb-4 flex items-start justify-between">
        <div className="flex flex-col gap-2">
          <SkeletonBlock className="h-5 w-48" />
          <SkeletonBlock className="h-3 w-72" />
        </div>
        <div className="flex items-center gap-2">
          <SkeletonBlock className="h-7 w-20" rounded="md" />
          <SkeletonBlock className="h-7 w-20" rounded="md" />
        </div>
      </div>
      <SkeletonBlock className="h-48 w-full" rounded="lg" />
    </div>
  );
}
