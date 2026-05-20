import { SkeletonBlock } from './SkeletonBlock';

/**
 * Mirror of `client/src/pages/Dashboard.tsx` main column: a brainlift header
 * (title + author + actions cluster) plus a primary content panel.
 *
 * Note: the per-brainlift header would normally come from the page's
 * `usePageHeaderSlot({ custom: ... })` registration. Because the previous
 * page may have left a different header registered, we render a placeholder
 * header here too so the skeleton reads as a single page-shaped layout.
 */
export function DashboardSkeleton() {
  return (
    <div className="flex h-full min-h-0 flex-col">
      {/* Brainlift header bar */}
      <div className="shrink-0 border-b border-border bg-card px-4 sm:px-6 md:px-8 py-4">
        <div className="flex items-start gap-4">
          <SkeletonBlock className="h-14 w-14" rounded="xl" />
          <div className="flex flex-1 flex-col gap-2">
            <SkeletonBlock className="h-5 w-1/3" />
            <SkeletonBlock className="h-3 w-3/4" />
            <SkeletonBlock className="h-3 w-24" />
          </div>
          <div className="flex items-center gap-2">
            <SkeletonBlock className="h-8 w-32" rounded="md" />
            <SkeletonBlock className="h-8 w-14" rounded="md" />
            <SkeletonBlock className="h-8 w-16" rounded="md" />
          </div>
        </div>
      </div>

      {/* Content panel */}
      <div className="flex-1 min-h-0 overflow-hidden px-4 py-4 sm:px-6 md:px-8">
        <div className="rounded-2xl border border-border bg-card p-6">
          <div className="mb-5 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <SkeletonBlock className="h-8 w-8" rounded="md" />
              <div className="flex flex-col gap-1">
                <SkeletonBlock className="h-4 w-40" />
                <SkeletonBlock className="h-3 w-56" />
              </div>
            </div>
            <SkeletonBlock className="h-8 w-24" rounded="md" />
          </div>
          <div className="flex flex-col gap-3">
            {Array.from({ length: 8 }).map((_, i) => (
              <SkeletonBlock key={i} className={`h-4 ${i % 3 === 2 ? 'w-2/3' : 'w-full'}`} />
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
