import { SkeletonBlock } from './SkeletonBlock';

/**
 * Mirror of `client/src/pages/AdminProviders.tsx`: hero card with title,
 * followed by a provider-health table and a recent-failovers list.
 */
export function AdminProvidersSkeleton() {
  return (
    <div className="min-h-full bg-background">
      <main className="mx-auto max-w-[1400px] px-4 py-8 sm:px-8 sm:py-10">
        {/* Hero */}
        <section className="rounded-[32px] bg-card-elevated px-6 py-8 shadow-card sm:px-10 sm:py-10">
          <SkeletonBlock className="h-8 w-24" rounded="md" />
          <SkeletonBlock className="mt-8 h-12 w-2/3" />
          <SkeletonBlock className="mt-4 h-4 w-3/4" />
        </section>

        {/* Provider health table */}
        <section className="mt-10 rounded-2xl border border-border bg-card p-6">
          <SkeletonBlock className="mb-4 h-5 w-44" />
          <div className="flex flex-col divide-y divide-border">
            {Array.from({ length: 6 }).map((_, i) => (
              <ProviderRowSkeleton key={i} />
            ))}
          </div>
        </section>

        {/* Recent failovers */}
        <section className="mt-6 rounded-2xl border border-border bg-card p-6">
          <SkeletonBlock className="mb-4 h-5 w-40" />
          <div className="flex flex-col gap-3">
            {Array.from({ length: 4 }).map((_, i) => (
              <SkeletonBlock key={i} className="h-12 w-full" rounded="md" />
            ))}
          </div>
        </section>
      </main>
    </div>
  );
}

function ProviderRowSkeleton() {
  return (
    <div className="flex items-center justify-between py-3">
      <div className="flex items-center gap-3">
        <SkeletonBlock className="h-8 w-8" rounded="md" />
        <div className="flex flex-col gap-1">
          <SkeletonBlock className="h-4 w-40" />
          <SkeletonBlock className="h-3 w-24" />
        </div>
      </div>
      <div className="flex items-center gap-3">
        <SkeletonBlock className="h-6 w-20" rounded="full" />
        <SkeletonBlock className="h-6 w-12" rounded="md" />
      </div>
    </div>
  );
}
