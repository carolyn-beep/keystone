import { useCallback, useMemo, useState } from 'react';
import { useSearch } from 'wouter';
import { motion, LayoutGroup } from 'framer-motion';
import { Loader2 } from 'lucide-react';
import type { BrainliftData } from '@shared/schema';
import type { NativeDetailsResponse } from '@shared/routes';
import { useNativeDetails } from '@/hooks/useNativeDetails';
import { useBuilderNav } from '@/hooks/useBuilderNav';
import { LIBRARY_ROUTE_PATH } from '@/components/chat/chat-home-helpers';
import { DashboardHeader } from '@/components/DashboardHeader';
import { BuilderSidebar } from './BuilderSidebar';
import { BuilderProgressTracker } from './BuilderProgressTracker';
import { Phase1Topic } from './Phase1Topic';
import { BuilderDisplayView } from './BuilderDisplayView';
import { Phase2Experts } from './Phase2Experts';
import { Phase3KnowledgeTree } from './Phase3KnowledgeTree';
import { SourceDetailWorkspace } from './SourceDetailWorkspace';

interface BuilderPageProps {
  slug: string;
  brainlift: BrainliftData;
  canModify: boolean;
}

export function BuilderPage({ slug, brainlift, canModify }: BuilderPageProps) {
  const searchString = useSearch();
  const isAdminView = new URLSearchParams(searchString).get('admin') === 'true';
  const backLink = isAdminView ? `${LIBRARY_ROUTE_PATH}?admin=true` : LIBRARY_ROUTE_PATH;

  const { nativeDetails, isLoading, error, update, isUpdating } = useNativeDetails(slug);

  if (isLoading || !nativeDetails) {
    return (
      <div className="h-screen flex items-center justify-center bg-background">
        <Loader2 className="animate-spin text-muted-foreground" size={32} />
      </div>
    );
  }

  if (error) {
    return (
      <div className="h-screen flex items-center justify-center bg-background">
        <p className="text-muted-foreground text-sm">
          Failed to load builder details. Please try refreshing.
        </p>
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
      update={update}
      isUpdating={isUpdating}
    />
  );
}

function BuilderPageContent({
  slug,
  brainlift,
  canModify,
  nativeDetails,
  backLink,
  update,
  isUpdating,
}: BuilderPageProps & {
  nativeDetails: NativeDetailsResponse;
  backLink: string;
  update: (fields: Partial<{ topic: string; purpose: string; owner: string | null; lastActivePhase: 1 | 2 | 3 | 4 | 5 }>) => Promise<NativeDetailsResponse>;
  isUpdating: boolean;
}) {
  const { view, screen, selectedItemId, setView, setScreen, clearSelectedItem } = useBuilderNav(
    slug,
    nativeDetails.lastActivePhase
  );
  const effectiveView = view === 'dashboard' ? 'build' : view;
  const [editingAuthor, setEditingAuthor] = useState(false);
  const [authorInput, setAuthorInput] = useState(nativeDetails.owner ?? '');

  const handlePhase1Update = useCallback(
    async (fields: Partial<{ topic: string; purpose: string; owner: string | null }>) => {
      await update(fields);
    },
    [update]
  );

  const handleUpdateAuthor = useCallback(async (author: string) => {
    await update({ owner: author });
    setEditingAuthor(false);
  }, [update]);

  const headerData = useMemo(() => ({
    ...brainlift,
    title: nativeDetails.topic,
    description: nativeDetails.purpose,
    displayPurpose: nativeDetails.purpose,
    author: nativeDetails.owner,
  }), [brainlift, nativeDetails]);

  return (
    <div className="h-screen flex flex-col bg-background text-foreground font-sans">
      <header className="bg-card border-b border-border shrink-0">
        <DashboardHeader
          data={headerData}
          isSharedView={false}
          isNotBrainlift={false}
          versions={[]}
          editingAuthor={editingAuthor}
          setEditingAuthor={setEditingAuthor}
          authorInput={authorInput}
          setAuthorInput={setAuthorInput}
          onUpdateAuthor={handleUpdateAuthor}
          setShowHistoryModal={() => {}}
          handleDownloadPDF={() => {}}
          canModify={canModify}
          hideDefaultActions={true}
          rightSlot={
            <LayoutGroup id="builder-mode-toggle">
              <div className="flex items-center rounded-lg bg-card-elevated border border-border p-1 shadow-card">
                {([
                  { id: 'build', label: 'Build', disabled: false },
                  { id: 'display', label: 'Display', disabled: false },
                  { id: 'dashboard', label: 'Grading', disabled: true },
                ] as const).map((item) => {
                  const isActive = effectiveView === item.id;
                  return (
                    <div key={item.id} className="relative">
                      {isActive && (
                        <motion.div
                          layoutId="builder-mode-pill"
                          className="absolute inset-0 rounded-md bg-card"
                          transition={{ type: 'spring', stiffness: 360, damping: 32 }}
                        />
                      )}
                      <button
                        onClick={() => { if (!item.disabled) setView(item.id); }}
                        disabled={item.disabled}
                        className={`relative px-3 py-1.5 rounded-md border-none text-[11px] uppercase tracking-[0.28em] font-semibold transition-colors ${
                          item.disabled
                            ? 'bg-transparent text-muted-light cursor-not-allowed opacity-60'
                            : isActive
                              ? 'bg-transparent text-foreground cursor-default'
                              : 'bg-transparent text-muted-foreground hover:text-foreground cursor-pointer'
                        }`}
                        data-testid={`builder-mode-${item.id}`}
                      >
                        {item.label}
                      </button>
                    </div>
                  );
                })}
              </div>
            </LayoutGroup>
          }
        />
      </header>

      <div className="flex flex-1 min-h-0">

        {/* Build view — vertical tracker on left, content on right */}
        {effectiveView === 'build' && (
          <>
            {/* Vertical progress tracker as left rail */}
            <aside className="w-72 shrink-0 overflow-y-auto bg-background">
              <BuilderProgressTracker
                phaseProgress={nativeDetails.phaseProgress}
                activeScreen={screen}
                onSelectPhase={setScreen}
              />
            </aside>

            {/* Phase 3 detail view — fills container without scroll wrapper */}
            {screen === 3 && selectedItemId && (
              <div className="flex-1 min-w-0 min-h-0 overflow-hidden p-4">
                <SourceDetailWorkspace
                  slug={slug}
                  itemId={selectedItemId}
                  onBackToList={clearSelectedItem}
                />
              </div>
            )}

            {/* Phase content — scrollable list/form views */}
            {!(screen === 3 && selectedItemId) && (
            <main className="flex-1 px-4 py-4 sm:px-8 sm:py-8 md:px-4 md:py-12 overflow-y-auto scrollbar-styled">
              {/* Phase 1: You & Your Mission */}
              {screen === 1 && (
                <Phase1Topic
                  nativeDetails={nativeDetails}
                  onUpdate={handlePhase1Update}
                  isUpdating={isUpdating}
                  canModify={canModify}
                />
              )}

              {/* Phase 2: Your Experts */}
              {screen === 2 && (
                <Phase2Experts slug={slug} onNavigatePhase3={() => setScreen(3)} />
              )}

              {/* Phase 3: Knowledge Tree — list view */}
              {screen === 3 && !selectedItemId && (
                <Phase3KnowledgeTree slug={slug} />
              )}

              {/* Phases 4-5: locked placeholders */}
              {screen > 3 && (
                <div>
                  <div className="flex items-center gap-4 mb-2">
                    <span className="font-serif text-[42px] leading-none text-muted-light font-normal tracking-wide">
                      {screen}
                    </span>
                    <h2 className="text-[26px] font-bold text-foreground tracking-tight leading-[1.1] m-0">
                      {screen === 4 ? 'Connections' : 'Your Stance'}
                    </h2>
                  </div>
                  <p className="font-serif text-[14px] italic text-muted-foreground leading-relaxed m-0 mb-4">
                    {screen === 4 && 'Cross-source patterns. Once your Knowledge Tree has sources from multiple voices, you\'ll find tensions and surprises that no single source contains. Coming in a future phase.'}
                    {screen === 5 && 'Your defensible position. What do you believe that others might push back on? Your Stance is built from your Connections, grounded in evidence. Coming in a future phase.'}
                  </p>
                  <span className="inline-block px-[6px] py-[2px] rounded bg-muted text-muted-foreground text-[9px] uppercase tracking-[0.25em] font-semibold">
                    Coming Soon
                  </span>
                </div>
              )}
            </main>
            )}
          </>
        )}

        {/* Display view — no sidebar, full width */}
        {effectiveView === 'display' && (
          <main className="flex-1 px-4 py-6 sm:px-6 md:px-10 overflow-y-auto">
            <BuilderDisplayView
              nativeDetails={nativeDetails}
              experts={[]}
            />
          </main>
        )}

        {/*
          SIDEBAR — commented out, may be needed for future views
          <aside className="w-52 shrink-0 bg-sidebar border-r border-sidebar-border overflow-y-auto">
            <BuilderSidebar
              screen={screen}
              phaseProgress={nativeDetails.phaseProgress}
              onScreenChange={setScreen}
              backLink={backLink}
            />
          </aside>
        */}

      </div>
    </div>
  );
}
