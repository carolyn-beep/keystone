import { Search } from 'lucide-react';
import { tokens } from '@/lib/colors';
import { FilterTabs } from '@/components/home/FilterTabs';
import { SkeletonBlock } from './SkeletonBlock';

/**
 * Skeleton shaped like `client/src/pages/Home.tsx`. Renders the REAL static
 * chrome (filter tabs, search input) so the layout the user sees during the
 * lazy chunk fetch already matches the final page. Only the card grid (which
 * needs server data to populate) shimmers.
 *
 * The page itself uses <ProjectCardGridSkeleton /> while its data query is
 * in flight, so the Suspense → data-loading transition has no visual seam.
 */
export function HomeSkeleton() {
  return (
    <div className="px-4 sm:px-6 md:px-8 py-4 max-w-[1420px] mx-auto">
      <FilterTabs activeFilter="all" onFilterChange={() => {}} />

      <div className="relative mb-4">
        <Search
          size={16}
          className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground pointer-events-none"
        />
        <input
          type="text"
          disabled
          placeholder="Search by title or author..."
          className="w-full pl-9 pr-9 py-2 text-sm rounded-lg border bg-card text-foreground placeholder:text-muted-foreground focus:outline-none"
          style={{ borderColor: tokens.border }}
        />
      </div>

      <ProjectCardGridSkeleton />
    </div>
  );
}

/**
 * Just the card grid -- exported so `Home.tsx` can render the same skeleton
 * while its data query is in flight (no spinner / skeleton seam between the
 * Suspense fallback and the page's own loading state).
 */
export function ProjectCardGridSkeleton({ count = 9 }: { count?: number }) {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 items-stretch">
      {Array.from({ length: count }).map((_, i) => (
        <ProjectCardSkeleton key={i} />
      ))}
    </div>
  );
}

function ProjectCardSkeleton() {
  return (
    <div className="flex flex-col gap-4 rounded-2xl border border-border bg-card p-4">
      <div className="flex items-center gap-3">
        <SkeletonBlock className="h-14 w-14" rounded="xl" />
        <div className="flex flex-1 flex-col gap-2">
          <SkeletonBlock className="h-4 w-3/4" />
          <SkeletonBlock className="h-3 w-1/2" />
        </div>
      </div>
      <SkeletonBlock className="h-3 w-full" />
      <SkeletonBlock className="h-3 w-5/6" />
      <div className="mt-auto flex items-center justify-between pt-2">
        <SkeletonBlock className="h-3 w-20" />
        <SkeletonBlock className="h-6 w-14" rounded="md" />
      </div>
    </div>
  );
}
