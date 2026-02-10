import { useState, useMemo, useCallback } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Link, useSearch } from 'wouter';
import { authClient } from '@/lib/auth-client';
import { BrainliftVersion, type Fact } from '@shared/schema';
import { AlertTriangle, FileText, Loader2 } from 'lucide-react';
import { PiCompassToolFill } from 'react-icons/pi';
import { RiQuillPenAiFill } from 'react-icons/ri';
import { FaBalanceScale } from 'react-icons/fa';
import { MdDynamicFeed } from 'react-icons/md';
import { IoBookmarks, IoRibbon } from 'react-icons/io5';
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
import { LearningStreamTab } from '@/components/LearningStreamTab';
import { SavedItemsPage, GradedItemsPage } from '@/components/learning-stream';
import { usePDFExport } from '@/hooks/usePDFExport';
import { useShareToken } from '@/hooks/useShareToken';
import { SidebarLayout, AppSidebar, type NavItem } from '@/components/layout';

interface DashboardProps {
  slug: string;
  isSharedView?: boolean;
}

const VALID_TABS = ['brainlift', 'grading', 'contradictions', 'learning', 'learning-saved', 'learning-graded', 'summaries'] as const;
type TabKey = typeof VALID_TABS[number];

const NAV_ITEMS: NavItem[] = [
  { id: 'brainlift', label: 'Brainlift', icon: FileText },
  { id: 'grading', label: 'DOK1 Facts', icon: PiCompassToolFill },
  { id: 'summaries', label: 'DOK2 Summaries', icon: RiQuillPenAiFill },
  { id: 'contradictions', label: 'Contradictions', icon: FaBalanceScale },
  {
    id: 'learning',
    label: 'Learning Stream',
    icon: MdDynamicFeed,
    adminOnly: true,
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
    const tab = params.get('tab');
    return tab && VALID_TABS.includes(tab as TabKey) ? tab : 'grading';
  }, [searchString]);

  const setActiveTab = useCallback((tab: string) => {
    const params = new URLSearchParams(window.location.search);
    if (tab === 'grading') {
      params.delete('tab'); // Clean URL for default tab
    } else {
      params.set('tab', tab);
    }
    const newSearch = params.toString();
    const newUrl = newSearch ? `?${newSearch}` : window.location.pathname;
    window.history.replaceState(null, '', newUrl);
    // Force re-render by dispatching a popstate event
    window.dispatchEvent(new PopStateEvent('popstate'));
  }, []);

  const [showUpdateModal, setShowUpdateModal] = useState(false);
  const [showHistoryModal, setShowHistoryModal] = useState(false);
  const [showShareModal, setShowShareModal] = useState(false);
  const [updateSourceType, setUpdateSourceType] = useState<'html' | 'workflowy' | 'googledocs'>('workflowy');
  const [updateFile, setUpdateFile] = useState<File | null>(null);
  const [updateUrl, setUpdateUrl] = useState('');
  const [selectedFactForModal, setSelectedFactForModal] = useState<Fact | null>(null);
  const [editingAuthor, setEditingAuthor] = useState(false);
  const [authorInput, setAuthorInput] = useState('');

const { toast } = useToast();

  const {
    data,
    isLoading,
    error,
    updateAuthor,
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

  // Preserve admin param when navigating back
  const isAdminView = new URLSearchParams(searchString).get('admin') === 'true';
  const backLink = isAdminView ? '/?admin=true' : '/';

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
      <Link href="/">← Back to home</Link>
    </div>
  );

  const { facts, contradictionClusters } = data;

  return (
    <SidebarLayout
      sidebar={
        !isSharedView ? (
          <AppSidebar
            navItems={NAV_ITEMS}
            activeNavId={activeTab}
            onNavChange={setActiveTab}
            backLink={{ href: backLink, label: 'All Brainlifts' }}
            isAdmin={isAdmin}
          />
        ) : null
      }
      header={
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
          setShowUpdateModal={setShowUpdateModal}
          setShowHistoryModal={setShowHistoryModal}
          handleDownloadPDF={handleDownloadPDF}
          isOwner={isOwner}
          setShowShareModal={setShowShareModal}
          canModify={canModify}
        />
      }
    >
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

      {/* Brainlift Tab - Original Document */}
      {!isNotBrainlift && activeTab === 'brainlift' && (
        <BrainliftTab
          originalContent={data.originalContent}
          sourceType={data.sourceType}
          slug={data.slug}
        />
      )}

      {/* Grading Tab */}
      {!isNotBrainlift && activeTab === 'grading' && (
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
            onShowRedundancyModal={() => setShowRedundancyModal(true)}
            onViewFactFullText={(fact) => setSelectedFactForModal(fact)}
            canModify={canModify}
          />
        </div>
      )}

      {/* Summaries Tab - DOK2 owner interpretations */}
      {!isNotBrainlift && activeTab === 'summaries' && (
        <SummariesTab
          summaries={data.dok2Summaries ?? []}
          facts={facts}
          setActiveTab={setActiveTab}
        />
      )}

      {/* Contradictions Tab - Card-based styled design */}
      {!isNotBrainlift && activeTab === 'contradictions' && (
        <ContradictionsTab
          contradictionClusters={contradictionClusters}
          setActiveTab={setActiveTab}
        />
      )}

      {/* Learning Stream Tab - AI-curated resources (Admin only) */}
      {!isNotBrainlift && activeTab === 'learning' && isAdmin && (
        <LearningStreamTab slug={slug} canModify={canModify} setActiveTab={setActiveTab} />
      )}

      {/* Learning Stream Sub-Pages (Admin only) */}
      {!isNotBrainlift && activeTab === 'learning-saved' && isAdmin && (
        <SavedItemsPage slug={slug} canModify={canModify} />
      )}
      {!isNotBrainlift && activeTab === 'learning-graded' && isAdmin && (
        <GradedItemsPage slug={slug} />
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
        isOwner={isOwner}
      />
    </SidebarLayout>
  );
}
