import { useMemo, useRef, useState, useCallback } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Link, useSearch } from 'wouter';
import { authClient } from '@/lib/auth-client';
import { BrainliftVersion, type Fact } from '@shared/schema';
import { AlertTriangle, FileText, Loader2, Copy, CalendarDays, FolderOpen } from 'lucide-react';
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
import { UpdateModal, FactDetailModal, HistoryModal, RedundancyModal, ShareModal } from '@/components/modals';
import { NotBrainliftView } from '@/components/NotBrainliftView';
import { BrainliftTab } from '@/components/BrainliftTab';
import { SummariesTab } from '@/components/SummariesTab';
import { InsightsTab } from '@/components/InsightsTab';
import { ScratchpadTab } from '@/components/ScratchpadTab';
import { DOK3LinkingUI } from '@/components/DOK3LinkingUI';
import { DOK4LinkingUI } from '@/components/DOK4LinkingUI';
import { LearningStreamTab } from '@/components/LearningStreamTab';
import { SavedItemsPage, GradedItemsPage } from '@/components/learning-stream';
import { ImportAgentModal } from '@/components/import-agent/ImportAgentModal';
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
import { AppShell, AppSidebar } from '@/components/layout';
import { DokNavTree, type NavItem } from '@/components/brainlift/DokNavTree';
import { BuilderPage } from '@/components/builder';

interface DashboardProps {
  slug: string;
  isSharedView?: boolean;
}

const VALID_TABS = ['brainlift', 'facts', 'facts-redundancy', 'contradictions', 'summaries', 'insights', 'dok4', 'scratchpad', 'sprint', 'document-hub', 'learning', 'learning-saved', 'learning-graded'] as const;
type TabKey = typeof VALID_TABS[number];

// Backwards compat: map old ?tab=grading to facts
const TAB_ALIASES: Record<string, string> = { grading: 'facts' };

const NAV_ITEMS: NavItem[] = [
  { id: 'brainlift', label: 'Brainlift', icon: FileText as NavItem['icon'] },
  {
    id: 'facts',
    label: 'DOK1 Facts',
    icon: PiCompassToolFill,
    children: [
      { id: 'facts-redundancy', label: 'Redundancy', icon: Copy as NavItem['icon'] },
      { id: 'contradictions', label: 'Contradictions', icon: FaBalanceScale },
    ],
  },
  { id: 'summaries', label: 'DOK2 Summaries', icon: RiQuillPenAiFill },
  { id: 'insights', label: 'DOK3 Insights', icon: DeskLampIcon },
  { id: 'dok4', label: 'DOK4 SPOVs', icon: TbTargetArrow as NavItem['icon'] },
  { id: 'scratchpad', label: 'Scratchpad', icon: ScratchpadIcon },
  { id: 'sprint', label: 'Sprint', icon: CalendarDays as NavItem['icon'] },
  { id: 'document-hub', label: 'Document Hub', icon: FolderOpen as NavItem['icon'] },
  {
    id: 'learning',
    label: 'Learning Stream',
    icon: MdDynamicFeed,
    children: [
      { id: 'learning-saved', label: 'Saved Items', icon: IoBookmarks },
      { id: 'learning-graded', label: 'Graded Items', icon: IoRibbon },
    ],
  },
];

export default function Dashboard({ slug, isSharedView = false }: DashboardProps) {
  // Handle share token redemption if ?share=TOKEN is present
  const { isRedeeming } = useShareToken();

  // URL-synced tab state using query params (?tab=grading)
  const searchString = useSearch();
  const activeTab = useMemo(() => {
    const params = new URLSearchParams(searchString);
    const raw = params.get('tab');
    const tab = raw ? (TAB_ALIASES[raw] ?? raw) : null;
    return tab && VALID_TABS.includes(tab as TabKey) ? tab : 'brainlift';
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

  const setActiveTab = useCallback((tab: string) => {
    const params = new URLSearchParams(window.location.search);
    if (tab === 'brainlift') {
      params.delete('tab'); // Clean URL for default tab
    } else {
      params.set('tab', tab);
    }
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

  const [showUpdateModal, setShowUpdateModal] = useState(false);
  const [showHistoryModal, setShowHistoryModal] = useState(false);
  const [showShareModal, setShowShareModal] = useState(false);

  // Header collapse-on-scroll. A sentinel sits at the top of pageContent;
  // when it scrolls above the viewport, the <header> chrome gets
  // .header-collapsed (CSS in client/src/header-collapse.css drives the
  // banner shrink animation, padding tightening, etc).
  //
  // Using a callback ref instead of useRef + useEffect because the sentinel
  // is rendered inside `pageContent`, which only appears after the
  // loading / error / native-source early-returns above. A useEffect with
  // empty deps would fire on mount when the sentinel doesn't exist yet, and
  // never re-attach. The callback fires whenever the sentinel element is
  // attached or detached, so the observer always tracks the live DOM node.
  const [isHeaderCollapsed, setIsHeaderCollapsed] = useState(false);
  const headerObserverRef = useRef<IntersectionObserver | null>(null);
  const headerSentinelRef = useCallback((el: HTMLDivElement | null) => {
    headerObserverRef.current?.disconnect();
    headerObserverRef.current = null;
    if (!el) return;
    const observer = new IntersectionObserver(
      ([entry]) => setIsHeaderCollapsed(!entry.isIntersecting),
      { threshold: 0 },
    );
    observer.observe(el);
    headerObserverRef.current = observer;
  }, []);
  const [updateSourceType, setUpdateSourceType] = useState<'html' | 'workflowy' | 'googledocs'>('workflowy');
  const [updateFile, setUpdateFile] = useState<File | null>(null);
  const [updateUrl, setUpdateUrl] = useState('');
  const [selectedFactForModal, setSelectedFactForModal] = useState<Fact | null>(null);
  const [editingAuthor, setEditingAuthor] = useState(false);
  const [authorInput, setAuthorInput] = useState('');
  const [editingTitle, setEditingTitle] = useState(false);
  const [titleInput, setTitleInput] = useState('');
  const [showLinkingModal, setShowLinkingModal] = useState(false);
  const [showDok4LinkingModal, setShowDok4LinkingModal] = useState(false);
  const [showAgentModal, setShowAgentModal] = useState(false);

const { toast } = useToast();

  const {
    data,
    isLoading,
    error,
    updateAuthor,
    updateTitle,
    update: updateBrainlift,
    isUpdating,
    updateError,
  } = useBrainlift(slug, isSharedView);

  // Check if user is admin for restricted features
  const { data: session } = authClient.useSession();
  const isAdmin = session?.user?.role === 'admin';

  // Get user permission from backend-enriched data
  const userPermission = data?.userPermission ?? null;
  const isOwner = userPermission === 'owner';
  const canModify = userPermission === 'owner' || userPermission === 'editor' || isAdmin;

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

  const updateMutation = {
    mutate: (formData: FormData) => {
      updateBrainlift(formData, {
        onSuccess: () => {
          setShowUpdateModal(false);
          setUpdateFile(null);
          setUpdateUrl('');
        }
      });
    },
    isPending: isUpdating,
    isError: !!updateError,
    error: updateError,
  };

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

  // Gate: if import hasn't completed, show resume banner instead of dashboard.
  // DISABLED: allowing dashboard to render even during pending imports
  // const isAgentInProgress = data.importStatus === 'pending';
  //
  // if (isAgentInProgress) {
  //   return (
  //     <>
  //       <div className="min-h-screen flex items-center justify-center bg-background p-6">
  //         <div className="bg-card rounded-xl border border-border shadow-card p-8 max-w-md w-full text-center">
  //           <h2 className="text-lg font-semibold text-foreground mb-2">
  //             Import In Progress
  //           </h2>
  //           <p className="text-sm text-muted-foreground mb-6">
  //             This BrainLift is being imported via the Import Agent. Resume the conversation to continue extracting and grading content.
  //           </p>
  //           <div className="flex flex-col gap-3 items-center">
  //             <TactileButton
  //               variant="raised"
  //               onClick={() => setShowAgentModal(true)}
  //             >
  //               Resume Import
  //             </TactileButton>
  //             <Link href="/" className="text-xs text-muted-foreground hover:text-foreground transition-colors">
  //               Back to all Brainlifts
  //             </Link>
  //           </div>
  //         </div>
  //       </div>
  //
  //       {showAgentModal && (
  //         <ImportAgentModal
  //           brainliftSlug={slug}
  //           onClose={() => setShowAgentModal(false)}
  //           onComplete={(completedSlug) => {
  //             setShowAgentModal(false);
  //             // Reload page with complete data
  //             window.location.href = `/grading/${completedSlug}`;
  //           }}
  //         />
  //       )}
  //     </>
  //   );
  // }

  // Brainlift chrome: DashboardHeader rich banner is the entire <header>.
  // Cross-section navigation (back to Library) lives in the sidebar SectionNav,
  // so no breadcrumb strip is needed. Update / PDF / Share / History stay in
  // DashboardHeader's own action cluster (bottom-right of the rich row,
  // aligned with the author byline). The banner collapses on scroll via
  // .header-collapsed (header-collapse.css) toggled by an IntersectionObserver
  // watching a sentinel placed at the top of <main>.
  const brainliftHeader = (
    <header
      className={`bg-card border-b border-border transition-shadow ${isHeaderCollapsed ? 'header-collapsed shadow-sm' : ''}`}
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
        setShowUpdateModal={setShowUpdateModal}
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

      {/* Learning Stream Tab - AI-curated resources */}
      {!isNotBrainlift && activeTab === 'learning' && (
        <LearningStreamTab slug={slug} canModify={canModify} setActiveTab={setActiveTab} viewingItemId={viewingItemId} setViewingItemId={setViewingItemId} />
      )}

      {/* Learning Stream Sub-Pages */}
      {!isNotBrainlift && activeTab === 'learning-saved' && (
        <SavedItemsPage slug={slug} canModify={canModify} viewingItemId={viewingItemId} setViewingItemId={setViewingItemId} />
      )}
      {!isNotBrainlift && activeTab === 'learning-graded' && (
        <GradedItemsPage slug={slug} viewingItemId={viewingItemId} setViewingItemId={setViewingItemId} />
      )}

      {/* Update Modal */}
      <UpdateModal
        show={showUpdateModal}
        onClose={() => setShowUpdateModal(false)}
        sourceType={updateSourceType}
        onSourceTypeChange={setUpdateSourceType}
        file={updateFile}
        onFileChange={setUpdateFile}
        url={updateUrl}
        onUrlChange={setUpdateUrl}
        onSubmit={(formData) => updateMutation.mutate(formData)}
        isSubmitting={updateMutation.isPending}
        error={updateMutation.isError ? (updateMutation.error as Error).message : undefined}
      />

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

  // Shared view bypasses the unified shell entirely (no sidebar, no chrome).
  if (isSharedView) {
    return (
      <div className="min-h-screen bg-background text-foreground font-sans">
        {pageContent}
      </div>
    );
  }

  return (
    <AppShell
      sidebar={
        <AppSidebar
          contextualLabel="Brainlift"
          contextualBody={
            <DokNavTree
              navItems={NAV_ITEMS}
              activeNavId={activeTab}
              onNavChange={setActiveTab}
              isAdmin={isAdmin}
            />
          }
        />
      }
      header={brainliftHeader}
    >
      {pageContent}
    </AppShell>
  );
}
