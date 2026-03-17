import { useQuery } from '@tanstack/react-query';
import { useSearch } from 'wouter';
import { Loader2 } from 'lucide-react';
import type { BrainliftData } from '@shared/schema';
import type { NativeDetailsResponse } from '@shared/routes';
import { useBuilderNav } from '@/hooks/useBuilderNav';
import { BuilderSidebar } from './BuilderSidebar';
import { PhaseOverview } from './PhaseOverview';

interface BuilderPageProps {
  slug: string;
  brainlift: BrainliftData;
  canModify: boolean;
}

export function BuilderPage({ slug, brainlift, canModify }: BuilderPageProps) {
  // Preserve admin param for back link
  const searchString = useSearch();
  const isAdminView = new URLSearchParams(searchString).get('admin') === 'true';
  const backLink = isAdminView ? '/?admin=true' : '/';

  // Fetch native details
  const {
    data: nativeDetails,
    isLoading,
    error,
  } = useQuery<NativeDetailsResponse>({
    queryKey: ['native-details', slug],
    queryFn: async () => {
      const res = await fetch(`/api/brainlifts/${slug}/native-details`);
      if (!res.ok) throw new Error('Failed to fetch native details');
      return res.json();
    },
    enabled: !!slug,
  });

  // Loading state
  if (isLoading || !nativeDetails) {
    return (
      <div className="h-screen flex items-center justify-center bg-background">
        <Loader2 className="animate-spin text-muted-foreground" size={32} />
      </div>
    );
  }

  // Error state
  if (error) {
    return (
      <div className="h-screen flex items-center justify-center bg-background">
        <div className="text-center">
          <p className="text-muted-foreground text-sm">
            Failed to load builder details. Please try refreshing the page.
          </p>
        </div>
      </div>
    );
  }

  return (
    <BuilderPageContent
      slug={slug}
      brainlift={brainlift}
      canModify={canModify}
      nativeDetails={nativeDetails}
      backLink={backLink}
    />
  );
}

// Separate component so useBuilderNav only runs after nativeDetails is loaded
function BuilderPageContent({
  slug,
  brainlift,
  canModify,
  nativeDetails,
  backLink,
}: BuilderPageProps & { nativeDetails: NativeDetailsResponse; backLink: string }) {
  const { view, screen, setView, setScreen } = useBuilderNav(
    slug,
    nativeDetails.lastActivePhase
  );

  return (
    <div className="h-screen flex flex-col bg-background text-foreground font-sans">
      {/* Header */}
      <header className="bg-card border-b border-border shrink-0 px-6 py-3">
        <div className="flex items-center gap-3">
          <h1 className="text-[16px] font-semibold text-foreground m-0 truncate">
            {brainlift.title}
          </h1>
          <span className="px-[6px] py-[2px] rounded bg-primary/5 text-[9px] uppercase tracking-[0.25em] font-semibold text-muted-foreground">
            Builder
          </span>
        </div>
      </header>

      {/* Below header: sidebar + content */}
      <div className="flex flex-1 min-h-0">
        {/* Sidebar */}
        <aside className="w-52 shrink-0 bg-sidebar border-r border-sidebar-border overflow-y-auto">
          <BuilderSidebar
            view={view}
            screen={screen}
            phaseProgress={nativeDetails.phaseProgress}
            onViewChange={setView}
            onScreenChange={setScreen}
            backLink={backLink}
          />
        </aside>

        {/* Content area */}
        <main className="flex-1 px-4 py-4 sm:px-6 md:px-8 overflow-y-auto">
          {/* Build view */}
          {view === 'build' && screen === 'overview' && (
            <PhaseOverview
              phaseProgress={nativeDetails.phaseProgress}
              onSelectPhase={setScreen}
            />
          )}

          {view === 'build' && typeof screen === 'number' && (
            <div className="py-10 px-2">
              <h2 className="text-[26px] font-bold text-foreground tracking-tight leading-[1.1] m-0 mb-2">
                Phase {screen}
              </h2>
              <p className="font-serif text-[14px] italic text-muted-foreground leading-relaxed m-0">
                Phase content will be implemented in a future spec.
              </p>
            </div>
          )}

          {/* Display view */}
          {view === 'display' && (
            <div className="py-10 px-2">
              <h2 className="text-[26px] font-bold text-foreground tracking-tight leading-[1.1] m-0 mb-2">
                Display View
              </h2>
              <p className="font-serif text-[14px] italic text-muted-foreground leading-relaxed m-0">
                The display view will be implemented in a future spec.
              </p>
            </div>
          )}

          {/* Dashboard view - locked */}
          {view === 'dashboard' && (
            <div className="py-10 px-2">
              <div className="rounded-xl shadow-card bg-card-elevated p-10 max-w-lg">
                <h2 className="text-[22px] font-bold text-foreground tracking-tight leading-[1.1] m-0 mb-3">
                  Dashboard
                </h2>
                <p className="font-serif text-[14px] italic text-muted-foreground leading-relaxed m-0 mb-4">
                  The grading dashboard is not yet available for native brainlifts. Complete
                  building your brainlift first, then the dashboard will unlock with grading,
                  insights, and learning stream features.
                </p>
                <span className="inline-block px-[6px] py-[2px] rounded bg-muted text-muted-foreground text-[9px] uppercase tracking-[0.25em] font-semibold">
                  Coming Soon
                </span>
              </div>
            </div>
          )}
        </main>
      </div>
    </div>
  );
}
