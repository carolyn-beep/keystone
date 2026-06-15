import { useEffect, useMemo, useRef, useState, useCallback } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Link, useSearch } from 'wouter';
import { authClient } from '@/lib/auth-client';
import { BrainliftVersion, type Fact } from '@shared/schema';
import { AlertTriangle, Brain, FileText, Loader2, Copy, CalendarDays, FolderOpen } from 'lucide-react';
import { PiCompassToolFill } from 'react-icons/pi';
import { RiQuillPenAiFill } from 'react-icons/ri';
import { FaBalanceScale } from 'react-icons/fa';
import { MdDynamicFeed } from 'react-icons/md';
import { IoBookmarks, IoRibbon } from 'react-icons/io5';
import { TbTargetArrow } from 'react-icons/tb';
import { DeskLampIcon } from '@/assets/icons/DeskLampIcon';
import { ScratchpadIcon } from '@/assets/icons/ScratchpadIcon';
import { tokens } from '@/lib/colors';
import { useToast } from '@/hooks/use-toast';
import { useBrainlift } from '@/hooks/useBrainlift';
import { useRedundancy } from '@/hooks/useRedundancy';
import { FactGradingPanel } from '@/components/fact-grading';
import { DashboardHeader } from '@/components/DashboardHeader';
import { ContradictionsTab } from '@/components/ContradictionsTab';
import { FactDetailModal, HistoryModal, RedundancyModal, ShareModal } from '@/components/modals';
import { SetupCompleteModal } from '@/components/onboarding-wizard/SetupCompleteModal';
import { NotBrainliftView } from '@/components/NotBrainliftView';
import { BrainliftTab } from '@/components/BrainliftTab';
import { SummariesTab } from '@/components/SummariesTab';
import { InsightsTab } from '@/components/InsightsTab';
import { ScratchpadTab } from '@/components/ScratchpadTab';
import { DOK3LinkingUI } from '@/components/DOK3LinkingUI';
import { DOK4LinkingUI } from '@/components/DOK4LinkingUI';
import { ResearchStreamTab } from '@/components/ResearchStreamTab';
import SecondBrainTab from '@/components/SecondBrainTab';
import { SavedItemsPage, GradedItemsPage } from '@/components/learning-stream';
import { RedundancyPage } from '@/components/fact-grading/RedundancyPage';
import { SprintTab, parseTaskViewId } from '@/components/sprint/SprintTab';
import { DocumentHubTab } from '@/components/documents/DocumentHubTab';
import { LIBRARY_ROUTE_PATH } from '@/components/chat/chat-home-helpers';
import { usePDFExport } from '@/hooks/usePDFExport';
import { useShareToken } from '@/hooks/useShareToken';
import { useDOK3Insights } from '@/hooks/useDOK3Insights';
import { useDOK3GradingEvents } from '@/hooks/useDOK3GradingEvents';
import { useDOK4 } from '@/hooks/useDOK4';
import { useDOK4GradingEvents } from '@/hooks/useDOK4GradingEvents';
import { DOK4Tab } from '@/components/DOK4Tab';
import { usePageHeaderSlot, useSidebarSlot } from '@/components/layout';
import { DokNavTree, type NavItem } from '@/components/brainlift/DokNavTree';
import { BuilderPage } from '@/components/builder';
import { GradingExplainer } from '@/components/grading-explainer/GradingExplainer';
import { dok1Screens } from '@/components/grading-explainer/dok1';
import { useHasSeenExplainer } from '@/hooks/useHasSeenExplainer';
import { useIsMobile } from '@/hooks/use-mobile';

interface DashboardProps {
  slug: string;
  isSharedView?: boolean;
}

const VALID_TABS = ['second-brain', 'brainlift', 'facts', 'facts-redundancy', 'contradictions', 'summaries', 'insights', 'dok4', 'scratchpad', 'sprint', 'document-hub', 'learning', 'learning-saved', 'learning-graded'] as const;
type TabKey = typeof VALID_TABS[number];

// Backwards compat: map old ?tab=grading to facts
const TAB_ALIASES: Record<string, string> = {
  grading: 'facts',
  dok1: 'facts',
  dok2: 'summaries',
  dok3: 'insights',
  documents: 'document-hub',
  'research-stream': 'learning',
};

const RESEARCH_LOCK_REASON =
  'This space opens once your project graduates from research into authoring. Keep researching — the agent will help you get there.';

/**
 * Single nav list — order is the canonical reading order: Second Brain →
 * Research Stream → authoring surfaces. During the research phase the
 * authoring surfaces are rendered locked (greyed + lock icon + tooltip)
 * rather than hidden, so students see what's coming next. During the
 * authoring phase nothing is locked; Second Brain remains visible because
 * legacy brainlifts can still collect sources/notes alongside DOK work.
 */
function buildBrainliftNavItems(phase: 'research' | 'authoring'): NavItem[] {
  const isResearch = phase === 'research';
  const lock = (item: NavItem): NavItem => ({
    ...item,
    locked: isResearch,
    lockReason: isResearch ? RESEARCH_LOCK_REASON : undefined,
  });

  return [
    { id: 'second-brain', label: 'Second Brain', icon: Brain as NavItem['icon'] },
    {
      id: 'learning',
      label: 'Research Stream',
      icon: MdDynamicFeed,
      // Saved + Graded sub-items are useful in research phase too — they're
      // exactly where you go after bookmarking / grading items from the
      // stream.
      children: [
        { id: 'learning-saved', label: 'Saved Items', icon: IoBookmarks },
        { id: 'learning-graded', label: 'Graded Items', icon: IoRibbon },
      ],
    },
    lock({ id: 'brainlift', label: 'Brainlift', icon: FileText as NavItem['icon'] }),
    lock({
      id: 'facts',
      label: 'DOK1 Facts',
      icon: PiCompassToolFill,
      children: [
        { id: 'facts-redundancy', label: 'Redundancy', icon: Copy as NavItem['icon'] },
        { id: 'contradictions', label: 'Contradictions', icon: FaBalanceScale },
      ],
    }),
    lock({ id: 'summaries', label: 'DOK2 Summaries', icon: RiQuillPenAiFill }),
    lock({ id: 'insights', label: 'DOK3 Insights', icon: DeskLampIcon }),
    lock({ id: 'dok4', label: 'DOK4 SPOVs', icon: TbTargetArrow as NavItem['icon'] }),
    lock({ id: 'scratchpad', label: 'Scratchpad', icon: ScratchpadIcon }),
    lock({ id: 'sprint', label: 'Sprint', icon: CalendarDays as NavItem['icon'] }),
    lock({ id: 'document-hub', label: 'Document Hub', icon: FolderOpen as NavItem['icon'] }),
  ];
}

export default function Dashboard({ slug, isSharedView = false }: DashboardProps) {
  // Handle share token redemption if ?share=TOKEN is present
  const { isRedeeming } = useShareToken();

  // URL-synced tab state using query params (?tab=grading)
  const searchString = useSearch();
  const requestedTab = useMemo<TabKey | null>(() => {
    const params = new URLSearchParams(searchString);
    const raw = params.get('tab');
    const tab = raw ? (TAB_ALIASES[raw] ?? raw) : null;
    return tab && VALID_TABS.includes(tab as TabKey) ? tab as TabKey : null;
  }, [searchString]);

  // URL-synced expanded view (?view=123 for learning stream, ?view=task-123 for sprint)
  const viewParam = useMemo(() => {
    const params = new URLSearchParams(searchString);
    return params.get('view');
  }, [searchString]);

  const viewingItemId = useMemo(() => {
    if (!viewParam || !/^\d+$/.test(viewParam)) return null;
    return parseInt(viewParam, 10);
  }, [viewParam]);

  const viewingTaskId = useMemo(() => parseTaskViewId(viewParam), [viewParam]);

  // Always persist the selection as `?tab=<id>` — the canonical default
  // depends on phase (research → second-brain, authoring → brainlift),
  // which isn't known to this callback. The earlier "clean URL when tab
  // matches default" optimization treated BOTH 'brainlift' and
  // 'second-brain' as defaults, which silently wiped the param and
  // bounced authoring users back to the Brainlift tab when they tried to
  // open Second Brain. A consistent `?tab=` is fine — bookmarkable too.
  const setActiveTab = useCallback((tab: string) => {
    const params = new URLSearchParams(window.location.search);
    params.set('tab', tab);
    params.delete('view'); // Clear view when switching tabs
    document.querySelector('main')?.scrollTo(0, 0);
    const newSearch = params.toString();
    const newUrl = newSearch ? `?${newSearch}` : window.location.pathname;
    window.history.replaceState(null, '', newUrl);
    // Force re-render by dispatching a popstate event
    window.dispatchEvent(new PopStateEvent('popstate'));
  }, []);

  const setViewingItemId = useCallback((id: number | null) => {
    const params = new URLSearchParams(window.location.search);
    if (id) {
      params.set('view', String(id));
    } else {
      params.delete('view');
    }
    const newSearch = params.toString();
    const newUrl = newSearch ? `?${newSearch}` : window.location.pathname;
    // pushState so back button closes the expanded view
    window.history.pushState(null, '', newUrl);
    window.dispatchEvent(new PopStateEvent('popstate'));
  }, []);

  const setViewingTaskId = useCallback((id: number | null) => {
    const params = new URLSearchParams(window.location.search);
    if (id) {
      params.set('view', `task-${id}`);
    } else {
      params.delete('view');
    }
    const newSearch = params.toString();
    const newUrl = newSearch ? `?${newSearch}` : window.location.pathname;
    window.history.pushState(null, '', newUrl);
    window.dispatchEvent(new PopStateEvent('popstate'));
  }, []);

  const [showHistoryModal, setShowHistoryModal] = useState(false);
  const [showShareModal, setShowShareModal] = useState(false);
  const [showExplainerModal, setShowExplainerModal] = useState(false);

  // Onboarding setup-complete celebration: the wizard's Finish lands here
  // with ?setup=done (buildLandingLocation). Show the modal once, then strip
  // the param immediately so a refresh or back/forward doesn't re-celebrate.
  // Deletes ONLY the setup param — `tab=second-brain` must survive (see the
  // param-wiping bug note on setActiveTab below).
  const [showSetupComplete, setShowSetupComplete] = useState(false);
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get('setup') !== 'done') return;
    setShowSetupComplete(true);
    params.delete('setup');
    const newSearch = params.toString();
    window.history.replaceState(null, '', newSearch ? `?${newSearch}` : window.location.pathname);
    window.dispatchEvent(new PopStateEvent('popstate'));
  }, [searchString]);

  // Header collapse-on-scroll. The sentinel is attached to a scroll listener
  // on its scrollable ancestor with HYSTERESIS thresholds so the layout shift
  // caused by collapse can't bounce the scroll position back into the
  // un-collapse trigger zone. Collapse at scrollTop > 140, uncollapse at
  // scrollTop < 60 — the 80px deadzone absorbs the ~86px layout shift the
  // CSS transition produces.
  //
  // Earlier this used an IntersectionObserver against the sentinel directly;
  // that produced an infinite collapse/uncollapse loop because as soon as
  // .header-collapsed shrunk the chrome by ~86px the sentinel re-entered the
  // viewport, retriggering the observer mid-transition.
  const [isHeaderCollapsed, setIsHeaderCollapsed] = useState(false);
  const headerScrollCleanupRef = useRef<(() => void) | null>(null);
  const headerSentinelRef = useCallback((el: HTMLDivElement | null) => {
    headerScrollCleanupRef.current?.();
    headerScrollCleanupRef.current = null;
    if (!el) return;
    // Walk up to the nearest scrollable ancestor (the <main>).
    let scrollEl: HTMLElement | null = el.parentElement;
    while (scrollEl && scrollEl !== document.body) {
      const overflowY = getComputedStyle(scrollEl).overflowY;
      if (overflowY === 'auto' || overflowY === 'scroll') break;
      scrollEl = scrollEl.parentElement;
    }
    if (!scrollEl || scrollEl === document.body) return;
    const target = scrollEl;
    const COLLAPSE_AT = 140;
    const EXPAND_AT = 60;
    let collapsed = false;
    const onScroll = () => {
      const y = target.scrollTop;
      const next = collapsed ? y > EXPAND_AT : y > COLLAPSE_AT;
      if (next !== collapsed) {
        collapsed = next;
        setIsHeaderCollapsed(next);
      }
    };
    onScroll();
    target.addEventListener('scroll', onScroll, { passive: true });
    headerScrollCleanupRef.current = () => {
      target.removeEventListener('scroll', onScroll);
    };
  }, []);
  const [selectedFactForModal, setSelectedFactForModal] = useState<Fact | null>(null);
  const [editingAuthor, setEditingAuthor] = useState(false);
  const [authorInput, setAuthorInput] = useState('');
  const [editingTitle, setEditingTitle] = useState(false);
  const [titleInput, setTitleInput] = useState('');
  const [editingPurpose, setEditingPurpose] = useState(false);
  const [purposeInput, setPurposeInput] = useState('');
  const [showLinkingModal, setShowLinkingModal] = useState(false);
  const [showDok4LinkingModal, setShowDok4LinkingModal] = useState(false);

const { toast } = useToast();

  const {
    data,
    isLoading,
    error,
    updateAuthor,
    updateTitle,
    updatePurpose,
  } = useBrainlift(slug, isSharedView);

  // Check if user is admin for restricted features
  const { data: session } = authClient.useSession();
  const isAdmin = session?.user?.role === 'admin';

  // Get user permission from backend-enriched data
  const userPermission = data?.userPermission ?? null;
  const isOwner = userPermission === 'owner';
  const canModify = userPermission === 'owner' || userPermission === 'editor' || isAdmin;

  // Resolve activeTab here (before any early return) so the DOK1 explainer
  // auto-trigger effect below can fire on the same render that gates resolve.
  // Mirrors the post-early-return computation; `data?.phase` is defensively
  // optional-chained because data may still be loading at this point.
  const isResearchPhaseEarly = data?.phase === 'research';
  const defaultActiveTabEarly: TabKey = isResearchPhaseEarly ? 'second-brain' : 'brainlift';
  const availableTabsEarly: TabKey[] = isResearchPhaseEarly
    ? ['second-brain', 'learning', 'learning-saved', 'learning-graded']
    : ['second-brain', 'brainlift', 'facts', 'facts-redundancy', 'contradictions', 'summaries', 'insights', 'dok4', 'scratchpad', 'sprint', 'document-hub', 'learning', 'learning-saved', 'learning-graded'];
  const activeTab: TabKey = requestedTab && availableTabsEarly.includes(requestedTab)
    ? requestedTab
    : defaultActiveTabEarly;

  // DOK1 Rubric Explainer — auto-trigger on first visit to the Facts tab.
  // Owned at Dashboard level (a) to match the existing showHistoryModal /
  // showShareModal pattern and (b) so a single <GradingExplainer> instance
  // serves both the auto-trigger and the help-icon click in FactGradingPanel.
  // Gating is deliberate (see Decision 3 in spec-research):
  //   - activeTab === 'facts'      → don't fetch or fire on other tabs
  //   - !isLoadingSeen             → don't flash-open before the hook resolves
  //   - !hasSeen                   → fail-open on preference errors by design
  //   - !isMobile                  → desktop-only (matches the Tailwind hide)
  //   - !triggeredRef.current      → guards React-strict-mode double-invoke
  const {
    isLoading: isLoadingSeen,
    hasSeen,
    markSeen,
  } = useHasSeenExplainer('dok1', { enabled: activeTab === 'facts' });
  const isMobile = useIsMobile();
  const triggeredRef = useRef(false);

  useEffect(() => {
    if (
      activeTab === 'facts' &&
      !isLoadingSeen &&
      !hasSeen &&
      !isMobile &&
      !triggeredRef.current
    ) {
      triggeredRef.current = true;
      setShowExplainerModal(true);
    }
  }, [activeTab, isLoadingSeen, hasSeen, isMobile]);

const { downloadBrainliftPDF } = usePDFExport();

  const handleUpdateAuthor = (author: string) => {
    updateAuthor(author).then(() => setEditingAuthor(false));
  };

  const handleUpdateTitle = (title: string) => {
    const trimmed = title.trim();
    if (!trimmed) {
      setEditingTitle(false);
      return;
    }
    if (trimmed === data?.title) {
      setEditingTitle(false);
      return;
    }
    updateTitle(trimmed)
      .then(() => setEditingTitle(false))
      .catch((err: Error) => {
        toast({ title: 'Could not update project name', description: err.message, variant: 'destructive' });
      });
  };

  const handleUpdatePurpose = (purpose: string) => {
    const trimmed = purpose.trim();
    // Empty input clears the override on the server (falls back to `description`).
    const currentDisplayed = data?.displayPurpose ?? data?.description ?? '';
    if (trimmed === currentDisplayed) {
      setEditingPurpose(false);
      return;
    }
    updatePurpose(trimmed)
      .then(() => setEditingPurpose(false))
      .catch((err: Error) => {
        toast({ title: 'Could not update project purpose', description: err.message, variant: 'destructive' });
      });
  };

  const isNotBrainlift = data?.classification === 'not_brainlift';
  const isPartialBrainlift = data?.classification === 'partial';

  const { data: versions = [] } = useQuery<BrainliftVersion[]>({
    queryKey: ['versions', slug],
    queryFn: async () => {
      const res = await fetch(`/api/brainlifts/${slug}/versions`);
      if (!res.ok) return [];
      return res.json();
    },
    enabled: !!slug
  });

  // Human grades for facts
  const { data: humanGrades = {} } = useQuery<Record<number, { score: number | null; notes: string | null }>>({
    queryKey: ['human-grades', slug],
    queryFn: async () => {
      const res = await fetch(`/api/brainlifts/${slug}/human-grades`);
      if (!res.ok) return {};
      return res.json();
    },
    enabled: !!slug
  });

  // DOK3 Insights
  const dok3 = useDOK3Insights(slug);
  const dok3Events = useDOK3GradingEvents(slug, dok3.gradingInsights.length > 0 || dok3.linkedInsights.length > 0);

  // DOK4 SPOVs
  const dok4 = useDOK4(slug);
  const dok4Events = useDOK4GradingEvents(slug, dok4.gradingSpovs.length > 0 || dok4.pendingSpovs.length > 0);

  // Redundancy detection
  const [showRedundancyModal, setShowRedundancyModal] = useState(false);
  // Track user-selected primary fact per group (key: groupId, value: factId)
  const [selectedPrimaryFacts, setSelectedPrimaryFacts] = useState<Record<number, number>>({});

  const {
    data: redundancyData,
    updateStatus: updateRedundancyStatus,
    isUpdatingStatus: isUpdatingRedundancyStatus,
  } = useRedundancy(slug);

  const handleDownloadPDF = () => {
    if (!data) return;
    downloadBrainliftPDF(data);
  };

  const isAdminView = new URLSearchParams(searchString).get('admin') === 'true';

  // Show loading while redeeming share token
  if (isRedeeming) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 className="animate-spin" size={32} />
      </div>
    );
  }

  if (isLoading) return <div className="p-12 text-center">Loading...</div>;
  if (error || !data) return (
    <div className="p-12 text-center">
      <h1>Brainlift not found</h1>
      <p>No brainlift exists at this URL.</p>
      <Link href={LIBRARY_ROUTE_PATH}>← Back to library</Link>
    </div>
  );

  // Native brainlifts render the Builder shell instead of the legacy dashboard
  if (data.sourceType === 'native') {
    return <BuilderPage slug={slug} brainlift={data} canModify={canModify} />;
  }

  const { facts, contradictionClusters } = data;
  // activeTab and its inputs (defaultActiveTabEarly / availableTabsEarly) are
  // resolved above (before the early returns) so the DOK1 explainer effect can
  // gate on them. Re-derive here is intentionally avoided — single source of
  // truth.
  const NAV_ITEMS = buildBrainliftNavItems(data.phase);

  // Brainlift chrome: DashboardHeader rich banner is the entire <header>.
  // Cross-section navigation (back to Library) lives in the sidebar SectionNav,
  // so no breadcrumb strip is needed. Update / PDF / Share / History stay in
  // DashboardHeader's own action cluster (bottom-right of the rich row,
  // aligned with the author byline). The banner collapses on scroll via
  // .header-collapsed (header-collapse.css) toggled by an IntersectionObserver
  // watching a sentinel placed at the top of <main>.
  // Research Stream tab forces the header into its compact form regardless
  // of scroll position — the two-card hero owns the surface and the full
  // brainlift banner would dominate it.
  const forceCompactHeader = activeTab === 'learning';
  const brainliftHeader = (
    <header
      className={`bg-card border-b border-border transition-shadow ${isHeaderCollapsed || forceCompactHeader ? 'header-collapsed shadow-sm' : ''}`}
    >
      <DashboardHeader
        data={data}
        isSharedView={isSharedView}
        isNotBrainlift={isNotBrainlift}
        versions={versions}
        editingAuthor={editingAuthor}
        setEditingAuthor={setEditingAuthor}
        authorInput={authorInput}
        setAuthorInput={setAuthorInput}
        onUpdateAuthor={handleUpdateAuthor}
        editingTitle={editingTitle}
        setEditingTitle={setEditingTitle}
        titleInput={titleInput}
        setTitleInput={setTitleInput}
        onUpdateTitle={handleUpdateTitle}
        editingPurpose={editingPurpose}
        setEditingPurpose={setEditingPurpose}
        purposeInput={purposeInput}
        setPurposeInput={setPurposeInput}
        onUpdatePurpose={handleUpdatePurpose}
        setShowHistoryModal={setShowHistoryModal}
        handleDownloadPDF={handleDownloadPDF}
        isOwner={isOwner}
        isAdmin={isAdmin}
        setShowShareModal={setShowShareModal}
        canModify={canModify}
      />
    </header>
  );

  const pageContent = (
    <div className="px-4 py-4 sm:px-6 md:px-8">
      {/* Sentinel for header-collapse IntersectionObserver. When it scrolls
          above the viewport, the chrome <header> shrinks to a thin strip. */}
      <div ref={headerSentinelRef} aria-hidden="true" className="h-px" />

      {/* Not a Brainlift View */}
      {isNotBrainlift && (
        <NotBrainliftView data={data} isSharedView={isSharedView} toast={toast} />
      )}

      {/* Partial Brainlift Warning */}
      {isPartialBrainlift && (
        <div className="bg-warning-soft rounded-lg p-4 mb-6 flex items-start gap-3">
          <AlertTriangle size={20} className="shrink-0 mt-0.5" style={{ color: tokens.warning }} />
          <div>
            <div className="font-semibold" style={{ color: tokens.warning }}>Partial Brainlift</div>
            <div className="text-sm text-muted-foreground">
              This document contains {facts.filter(f => !f.isGradeable).length} non-gradeable claims (prescriptive statements or uncited claims) alongside verifiable DOK1 facts.
            </div>
          </div>
        </div>
      )}

      {/* Second Brain Tab - Research phase workspace */}
      {!isNotBrainlift && activeTab === 'second-brain' && (
        <SecondBrainTab slug={slug} brainlift={data} />
      )}

      {/* Brainlift Tab - Live Document Tree */}
      {!isNotBrainlift && activeTab === 'brainlift' && (
        <BrainliftTab
          title={data.title}
          author={data.author}
          purpose={data.displayPurpose ?? data.description}
          slug={data.slug}
          experts={data.experts ?? []}
          facts={facts}
          dok2Summaries={data.dok2Summaries ?? []}
          dok3Insights={dok3.insights}
          dok4Spovs={dok4.spovs}
          summary={data.summary}
        />
      )}

      {/* DOK1 Facts Tab */}
      {!isNotBrainlift && activeTab === 'facts' && (
        <div>
          {/* Flags/Warnings - Compact inline callouts */}
          {data?.flags && data.flags.length > 0 && (
            <div className="mb-4 flex flex-col gap-2">
              {data.flags.map((flag, index) => (
                <div
                  key={index}
                  data-testid={`flag-${index}`}
                  className="flex items-start gap-2 py-2.5 px-3.5 bg-warning-soft rounded-md text-[13px] leading-normal"
                  style={{ color: tokens.warning }}
                >
                  <AlertTriangle size={14} className="shrink-0 mt-0.5" style={{ color: tokens.warning }} />
                  <span>{flag}</span>
                </div>
              ))}
            </div>
          )}

          {/* New Fact Grading Panel */}
          <FactGradingPanel
            slug={slug}
            facts={facts}
            humanGrades={humanGrades}
            redundancyData={redundancyData}
            onViewFactFullText={(fact) => setSelectedFactForModal(fact)}
            onNavigateToRedundancy={() => setActiveTab('facts-redundancy')}
            canModify={canModify}
            isAdmin={isAdmin}
            onOpenExplainer={() => setShowExplainerModal(true)}
          />
        </div>
      )}

      {/* Redundancy Sub-Page */}
      {!isNotBrainlift && activeTab === 'facts-redundancy' && (
        <RedundancyPage
          slug={slug}
          facts={facts}
          humanGrades={humanGrades}
          redundancyData={redundancyData}
          onShowRedundancyModal={() => setShowRedundancyModal(true)}
          onViewFactFullText={(fact) => setSelectedFactForModal(fact)}
          canModify={canModify}
          setActiveTab={setActiveTab}
        />
      )}

      {/* Summaries Tab - DOK2 owner interpretations */}
      {!isNotBrainlift && activeTab === 'summaries' && (
        <SummariesTab
          summaries={data.dok2Summaries ?? []}
          facts={facts}
          setActiveTab={setActiveTab}
        />
      )}

      {/* DOK3 Insights Tab */}
      {!isNotBrainlift && activeTab === 'insights' && (
        <InsightsTab
          insights={dok3.insights}
          isLoading={dok3.isLoading}
          meanScore={dok3.meanScore}
          totalCount={dok3.totalCount}
          highQualityCount={dok3.highQualityCount}
          needsWorkCount={dok3.needsWorkCount}
          gradingInsights={dok3.gradingInsights}
          errorInsights={dok3.errorInsights}
          gradeAll={dok3.gradeAll}
          isGrading={dok3.isGrading}
          setActiveTab={setActiveTab}
          latestEvent={dok3Events.latestEvent}
          dok2Summaries={data.dok2Summaries ?? []}
          facts={facts}
          onLinkNow={() => setShowLinkingModal(true)}
        />
      )}

      {/* DOK4 SPOVs Tab */}
      {!isNotBrainlift && activeTab === 'dok4' && (
        <DOK4Tab
          spovs={dok4.spovs}
          isLoading={dok4.isLoading}
          meanScore={dok4.meanScore}
          totalCount={dok4.totalCount}
          highQualityCount={dok4.highQualityCount}
          needsWorkCount={dok4.needsWorkCount}
          gradedSpovs={dok4.gradedSpovs}
          rejectedSpovs={dok4.rejectedSpovs}
          pendingSpovs={dok4.pendingSpovs}
          errorSpovs={dok4.errorSpovs}
          gradingSpovs={dok4.gradingSpovs}
          gradeAll={dok4.gradeAll}
          isGrading={dok4.isGrading}
          retryOne={dok4.retryOne}
          latestEvent={dok4Events.latestEvent}
          dok3PendingLinkingCount={dok3.pendingInsights.length}
          pendingLinkingCount={dok4.spovs.filter(s => s.status === 'pending_linking').length}
          onLinkDok3={() => {
            setShowLinkingModal(true);
          }}
          onLinkDok4={() => setShowDok4LinkingModal(true)}
          setActiveTab={setActiveTab}
          facts={facts}
          dok2Summaries={data.dok2Summaries ?? []}
          dok3Insights={dok3.insights}
        />
      )}

      {/* Scratchpad Tab */}
      {!isNotBrainlift && activeTab === 'scratchpad' && (
        <ScratchpadTab
          items={dok3.scratchpadItems}
          isLoading={dok3.isScratchpadLoading}
        />
      )}

      {/* Sprint Tab */}
      {!isNotBrainlift && activeTab === 'sprint' && (
        <SprintTab
          slug={slug}
          viewTaskId={viewingTaskId}
          onSelectTask={setViewingTaskId}
        />
      )}

      {/* Document Hub Tab */}
      {!isNotBrainlift && activeTab === 'document-hub' && (
        <DocumentHubTab slug={slug} />
      )}

      {/* Contradictions Tab - Card-based styled design */}
      {!isNotBrainlift && activeTab === 'contradictions' && (
        <ContradictionsTab
          contradictionClusters={contradictionClusters}
          setActiveTab={setActiveTab}
        />
      )}

      {/* Research Stream Tab - AI-curated resources */}
      {!isNotBrainlift && activeTab === 'learning' && (
        <ResearchStreamTab slug={slug} phase={data.phase} canModify={canModify} setActiveTab={setActiveTab} viewingItemId={viewingItemId} setViewingItemId={setViewingItemId} />
      )}

      {/* Research Stream Sub-Pages */}
      {!isNotBrainlift && activeTab === 'learning-saved' && (
        <SavedItemsPage slug={slug} canModify={canModify} viewingItemId={viewingItemId} setViewingItemId={setViewingItemId} />
      )}
      {!isNotBrainlift && activeTab === 'learning-graded' && (
        <GradedItemsPage slug={slug} viewingItemId={viewingItemId} setViewingItemId={setViewingItemId} />
      )}

      {/* Update Modal removed: JLS-146 replaced the primary "Update" button
          with "Chat About This BrainLift". Re-grading from a fresh upload is
          no longer surfaced here. */}

      {/* Fact Detail Modal */}
      <FactDetailModal
        fact={selectedFactForModal}
        onClose={() => setSelectedFactForModal(null)}
      />

      {/* History Modal */}
      <HistoryModal
        show={showHistoryModal}
        onClose={() => setShowHistoryModal(false)}
        versions={versions}
      />

      {/* Onboarding setup-complete celebration — shown once over the Second
          Brain tab when the wizard's Finish lands here (?setup=done). */}
      <SetupCompleteModal
        show={showSetupComplete}
        onClose={() => setShowSetupComplete(false)}
      />

      {/* Redundancy Review Modal */}
      <RedundancyModal
        show={showRedundancyModal}
        onClose={() => setShowRedundancyModal(false)}
        data={redundancyData ?? null}
        selectedPrimaryFacts={selectedPrimaryFacts}
        onSelectPrimaryFact={(groupId, factId) => setSelectedPrimaryFacts(prev => ({ ...prev, [groupId]: factId }))}
        onKeep={(groupId, primaryFactId) => updateRedundancyStatus({ groupId, status: 'kept', primaryFactId })}
        onDismiss={(groupId) => updateRedundancyStatus({ groupId, status: 'dismissed' })}
        isUpdating={isUpdatingRedundancyStatus}
      />

      {/* Share Modal */}
      <ShareModal
        show={showShareModal}
        onClose={() => setShowShareModal(false)}
        slug={slug}
        canManageShares={isOwner || isAdmin}
      />

      {/* DOK1 Rubric Explainer Modal — auto-opens on first DOK1 Facts visit
          (gated by useEffect above) and reopens on demand via the help icon
          in <FactGradingPanel>'s header. */}
      <GradingExplainer
        open={showExplainerModal}
        onOpenChange={setShowExplainerModal}
        dokLevel="dok1"
        screens={dok1Screens}
        onCompleteSeen={markSeen}
      />

      {/* DOK3 Linking Modal (standalone, outside import flow) */}
      {showLinkingModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm overflow-hidden">
          <div className="bg-card rounded-xl shadow-lg border border-border flex flex-col w-[90vw] max-w-[1750px] h-[92vh] max-h-[1080px] overflow-hidden">
            <div className="flex items-center justify-between px-6 py-3 border-b border-border shrink-0">
              <h2 className="text-[14px] font-semibold text-foreground m-0">Link DOK3 Insights</h2>
              <button
                onClick={() => {
                  setShowLinkingModal(false);
                  dok3.invalidate();
                }}
                className="text-[11px] uppercase tracking-[0.2em] font-semibold text-muted-foreground bg-transparent border-0 cursor-pointer hover:text-foreground transition-colors"
              >
                Close
              </button>
            </div>
            <div className="flex-1 min-h-0">
              <DOK3LinkingUI
                slug={slug}
                dok3Count={dok3.pendingInsights.length}
                onComplete={() => {
                  setShowLinkingModal(false);
                  dok3.invalidate();
                  // If opened from DOK4 tab, transition to DOK4 linking
                  const hasPendingDok4 = dok4.spovs.some(s => s.status === 'pending_linking');
                  if (activeTab === 'dok4' && hasPendingDok4) {
                    setShowDok4LinkingModal(true);
                  } else {
                    setActiveTab('insights');
                  }
                }}
              />
            </div>
          </div>
        </div>
      )}

      {/* DOK4 Linking Modal (standalone, outside import flow) */}
      {showDok4LinkingModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm overflow-hidden">
          <div className="bg-card rounded-xl shadow-lg border border-border flex flex-col w-[90vw] max-w-[1750px] h-[92vh] max-h-[1080px] overflow-hidden">
            <div className="flex items-center justify-between px-6 py-3 border-b border-border shrink-0">
              <h2 className="text-[14px] font-semibold text-foreground m-0">Link DOK4 SPOVs</h2>
              <button
                onClick={() => {
                  setShowDok4LinkingModal(false);
                  dok4.invalidate();
                }}
                className="text-[11px] uppercase tracking-[0.2em] font-semibold text-muted-foreground bg-transparent border-0 cursor-pointer hover:text-foreground transition-colors"
              >
                Close
              </button>
            </div>
            <div className="flex-1 min-h-0">
              <DOK4LinkingUI
                slug={slug}
                spovCount={dok4.spovs.filter(s => s.status === 'pending_linking').length}
                onComplete={() => {
                  setShowDok4LinkingModal(false);
                  dok4.invalidate();
                  setActiveTab('dok4');
                }}
              />
            </div>
          </div>
        </div>
      )}
    </div>
  );

  // Shared view bypasses the unified shell entirely (no sidebar, no chrome,
  // no slot hooks). It is reached via the outer Switch's `/view/:slug` Route,
  // which renders Dashboard outside of RootLayout. Early-returns so the slot
  // hooks below are never called for the shared-view component instance.
  if (isSharedView) {
    return (
      <div className="min-h-screen bg-background text-foreground font-sans">
        {pageContent}
      </div>
    );
  }

  // Authenticated branch: register the per-page sidebar (DokNavTree) and
  // header (brainliftHeader) with the persistent RootLayout shell.
  return (
    <AuthenticatedDashboardSlots
      navItems={NAV_ITEMS}
      activeTab={activeTab}
      setActiveTab={setActiveTab}
      isAdmin={isAdmin}
      brainliftHeader={brainliftHeader}
    >
      {pageContent}
    </AuthenticatedDashboardSlots>
  );
}

interface AuthenticatedDashboardSlotsProps {
  navItems: NavItem[];
  activeTab: TabKey;
  setActiveTab: (tab: string) => void;
  isAdmin: boolean;
  brainliftHeader: React.ReactNode;
  children: React.ReactNode;
}

function AuthenticatedDashboardSlots({
  navItems,
  activeTab,
  setActiveTab,
  isAdmin,
  brainliftHeader,
  children,
}: AuthenticatedDashboardSlotsProps) {
  const sidebarSlotSpec = useMemo(
    () => ({
      label: 'Project',
      body: (
        <DokNavTree
          navItems={navItems}
          activeNavId={activeTab}
          onNavChange={setActiveTab}
          isAdmin={isAdmin}
        />
      ),
    }),
    [navItems, activeTab, setActiveTab, isAdmin],
  );
  const pageHeaderSlotSpec = useMemo(
    () => ({ custom: brainliftHeader }),
    [brainliftHeader],
  );
  useSidebarSlot(sidebarSlotSpec);
  usePageHeaderSlot(pageHeaderSlotSpec);

  return <>{children}</>;
}
