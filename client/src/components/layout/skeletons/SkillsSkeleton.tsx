import { Search } from 'lucide-react';
import { SkeletonBlock } from './SkeletonBlock';

const FILTER_LABELS = ['All', 'Public', 'Private', 'Enabled', 'Disabled'] as const;

/**
 * Skeleton shaped like `client/src/pages/Skills.tsx` library view. Mirrors
 * the exact markup of `components/skills/SkillsLibraryView.tsx` so the
 * static hero, featured banner, search field, and filter chips render in
 * their real treatment; only the data-backed skill cards shimmer.
 */
export function SkillsSkeleton() {
  return (
    <main className="mx-auto flex w-full max-w-[1500px] flex-col gap-6 px-4 py-6 sm:px-6 md:px-8">
      <div className="flex flex-col gap-6">
        {/* Editorial hero -- identical markup to SkillsLibraryView */}
        <section className="overflow-hidden rounded-2xl bg-card-elevated px-8 py-7 shadow-card sm:px-10">
          <div className="grid grid-cols-1 items-center gap-6 lg:grid-cols-[minmax(0,1fr)_auto]">
            <div className="min-w-0">
              <h1 className="font-serif text-[44px] leading-[1.05] text-foreground sm:text-[56px]">
                Skill Library
              </h1>
              <p className="mt-3 max-w-2xl font-serif text-[16px] italic leading-relaxed text-muted-foreground">
                Browse reusable skills, workflows, and expert prompts available to your conversations.
              </p>
            </div>
            <div aria-hidden className="hidden self-center lg:block">
              <img
                src="/skills/library-hero.webp"
                alt=""
                className="h-32 w-auto select-none object-contain opacity-95"
                loading="eager"
              />
            </div>
          </div>
        </section>

        {/* Featured Skill Creator banner -- shape known, text static */}
        <section className="overflow-hidden rounded-2xl bg-card-elevated px-8 py-7 shadow-card sm:px-10 sm:py-8">
          <div className="grid items-center gap-6 lg:grid-cols-[minmax(0,1fr)_auto]">
            <div className="min-w-0">
              <p className="text-[10px] uppercase tracking-[0.4em] font-semibold text-primary">
                Featured
              </p>
              <h2 className="mt-2 font-serif text-[30px] leading-tight text-foreground">
                Skill Creator
              </h2>
              <p className="mt-2 max-w-2xl font-serif text-[14px] italic leading-relaxed text-muted-foreground">
                Design and publish custom skills in minutes. Combine prompts, knowledge, and references to fit your team's unique workflows.
              </p>
              <div className="mt-3 flex flex-wrap gap-1.5">
                {['Creation', 'No code', 'Team enablement'].map((tag) => (
                  <span
                    key={tag}
                    className="rounded-md bg-muted/70 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.18em] text-muted-foreground"
                  >
                    {tag}
                  </span>
                ))}
              </div>
            </div>
            <div aria-hidden className="hidden self-center lg:block">
              <img
                src="/skills/skill-creator-hero.webp"
                alt=""
                className="h-52 w-auto select-none object-contain opacity-95"
                loading="lazy"
              />
            </div>
          </div>
        </section>

        {/* Search + filters -- identical markup */}
        <section className="flex flex-col gap-3">
          <label className="relative block">
            <Search className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <input
              type="search"
              disabled
              placeholder="Search skills, descriptions, or authors..."
              className="w-full rounded-full border border-border/70 bg-card-elevated py-3 pl-11 pr-16 font-serif text-[15px] text-foreground outline-none"
            />
            <span className="pointer-events-none absolute right-4 top-1/2 -translate-y-1/2 rounded-md border border-border/70 bg-card px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
              ⌘K
            </span>
          </label>

          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex flex-wrap items-center gap-1.5">
              {FILTER_LABELS.map((label, i) => (
                <span
                  key={label}
                  className={`rounded-full px-3.5 py-1.5 text-[12px] font-semibold uppercase tracking-[0.2em] ${
                    i === 0
                      ? 'bg-primary text-primary-foreground'
                      : 'bg-card-elevated text-muted-foreground'
                  }`}
                >
                  {label}
                </span>
              ))}
              <span aria-hidden className="mx-2 h-4 w-px bg-border" />
              <span className="rounded-full bg-card-elevated px-3.5 py-1.5 text-[12px] font-semibold uppercase tracking-[0.2em] text-muted-foreground">
                Created by me
              </span>
            </div>
          </div>
        </section>

        {/* Skill cards -- the only data-driven section */}
        <SkillCardGridSkeleton />
      </div>
    </main>
  );
}

/**
 * Just the skill card grid -- exported so `SkillsLibraryView.tsx` can render
 * the same skeleton while its data query is in flight (no spinner seam
 * between the Suspense fallback and the page's own loading state).
 */
export function SkillCardGridSkeleton({ count = 6 }: { count?: number }) {
  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
      {Array.from({ length: count }).map((_, i) => (
        <SkillCardSkeleton key={i} />
      ))}
    </div>
  );
}

function SkillCardSkeleton() {
  return (
    <div className="flex flex-col gap-3 rounded-2xl border border-border bg-card-elevated p-5">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <SkeletonBlock className="h-9 w-9" rounded="md" />
          <div className="flex flex-col gap-1">
            <SkeletonBlock className="h-4 w-36" />
            <SkeletonBlock className="h-3 w-24" />
          </div>
        </div>
        <SkeletonBlock className="h-5 w-9" rounded="full" />
      </div>
      <SkeletonBlock className="h-3 w-full" />
      <SkeletonBlock className="h-3 w-5/6" />
      <SkeletonBlock className="h-3 w-4/6" />
      <div className="mt-1 flex items-center gap-2">
        <SkeletonBlock className="h-5 w-16" rounded="full" />
        <SkeletonBlock className="h-5 w-12" rounded="full" />
      </div>
    </div>
  );
}
