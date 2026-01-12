import { useState, useMemo } from 'react';
import { useQuery, useMutation } from '@tanstack/react-query';
import { Link } from 'wouter';
import { BrainliftData, ReadingListGrade, BrainliftVersion, CLASSIFICATION, type Expert, type Fact } from '@shared/schema';
import { ChevronUp, ExternalLink, Download, RefreshCw, History, X, Upload, Search, Plus, Loader2, AlertTriangle, FileText, Clock, ThumbsUp, ThumbsDown, Users, User, Trash2, CheckCircle } from 'lucide-react';
import { SiX } from 'react-icons/si';
import { tokens, getScoreChipColors } from '@/lib/colors';
import { useToast } from '@/hooks/use-toast';
import { useBrainlift } from '@/hooks/useBrainlift';
import { useExperts } from '@/hooks/useExperts';
import { useRedundancy } from '@/hooks/useRedundancy';
import { useResearch } from '@/hooks/useResearch';
import { VerificationPanel } from '@/components/VerificationPanel';
import { ModelAccuracyPanel } from '@/components/ModelAccuracyPanel';
import { FactGradingPanel } from '@/components/fact-grading';
import { DashboardHeader } from '@/components/DashboardHeader';
import { ContradictionsTab } from '@/components/ContradictionsTab';
import { ReadingListTab } from '@/components/ReadingListTab';
import { UpdateModal, FactDetailModal, HistoryModal, RedundancyModal, ResearchModal, AddResourceModal } from '@/components/modals';
import { NotBrainliftView } from '@/components/NotBrainliftView';
import { BrainliftTab } from '@/components/BrainliftTab';
import { usePDFExport } from '@/hooks/usePDFExport';

interface DashboardProps {
  slug: string;
  isSharedView?: boolean;
}

export default function Dashboard({ slug, isSharedView = false }: DashboardProps) {
  const [activeTab, setActiveTab] = useState('brainlift');

  const [expandedFacts, setExpandedFacts] = useState<number[]>([]);
  const [showUpdateModal, setShowUpdateModal] = useState(false);
  const [showHistoryModal, setShowHistoryModal] = useState(false);
  const [updateSourceType, setUpdateSourceType] = useState<'pdf' | 'docx' | 'html' | 'text' | 'workflowy' | 'googledocs'>('pdf');
  const [updateFile, setUpdateFile] = useState<File | null>(null);
  const [updateUrl, setUpdateUrl] = useState('');
  const [updateText, setUpdateText] = useState('');
  const [showResearchModal, setShowResearchModal] = useState(false);
  const [showAddResourceModal, setShowAddResourceModal] = useState(false);
  const [tweetResults, setTweetResults] = useState<any>(null);
  const [showTweetSection, setShowTweetSection] = useState(false);
  const [expertsExpanded, setExpertsExpanded] = useState(true);
  const [showAllExperts, setShowAllExperts] = useState(false);
  const [selectedFactForModal, setSelectedFactForModal] = useState<Fact | null>(null);
  const [editingAuthor, setEditingAuthor] = useState(false);
  const [authorInput, setAuthorInput] = useState('');

const { toast } = useToast();

  const {
    data,
    isLoading,
    error,
    updateAuthor,
    isUpdatingAuthor,
    update: updateBrainlift,
    isUpdating,
    updateError,
  } = useBrainlift(slug, isSharedView);

const { downloadBrainliftPDF } = usePDFExport();

  const { tweetSearchMutation } = useResearch(slug, {
    onTweetSearchSuccess: (tweetData) => {
      setTweetResults(tweetData);
      setShowTweetSection(true);
      if (tweetData.tweets?.length === 0) {
        toast({
          title: 'No relevant tweets found',
          description: tweetData.searchSummary || 'Try again later or with different brainlift content.',
        });
      }
    },
    onTweetSearchError: (err: Error) => {
      toast({
        title: 'Tweet search failed',
        description: err.message || 'Could not search Twitter. Please check your API key.',
        variant: 'destructive',
      });
    },
  });

  const updateAuthorMutation = {
    mutateAsync: async (author: string) => {
      await updateAuthor(author);
      setEditingAuthor(false);
    },
    isPending: isUpdatingAuthor,
  };

  const isNotBrainlift = data?.classification === 'not_brainlift';
  const isPartialBrainlift = data?.classification === 'partial';

  const { data: grades = [] } = useQuery<ReadingListGrade[]>({
    queryKey: ['grades', slug],
    queryFn: async () => {
      const res = await fetch(`/api/brainlifts/${slug}/grades`);
      if (!res.ok) return [];
      return res.json();
    },
    enabled: !!slug
  });

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
    refetch: refetchRedundancy,
    analyze: analyzeRedundancy,
    isAnalyzing: isAnalyzingRedundancy,
    updateStatus: updateRedundancyStatus,
    isUpdatingStatus: isUpdatingRedundancyStatus,
  } = useRedundancy(slug);

  const expertsList = data?.experts || [];
  const { refreshMutation: refreshExpertsMutation, toggleFollowMutation: toggleExpertFollowMutation, deleteMutation: deleteExpertMutation } = useExperts(slug);

  const updateMutation = {
    mutate: (formData: FormData) => {
      updateBrainlift(formData, {
        onSuccess: () => {
          setShowUpdateModal(false);
          setUpdateFile(null);
          setUpdateUrl('');
          setUpdateText('');
        }
      });
    },
    isPending: isUpdating,
    isError: !!updateError,
    error: updateError,
  };

  const handleDownloadPDF = () => {
    if (!data) return;
    downloadBrainliftPDF(data, grades);
  };

  if (isLoading) return <div className="p-12 text-center">Loading...</div>;
  if (error || !data) return (
    <div style={{ padding: '48px', textAlign: 'center' }}>
      <h1>Brainlift not found</h1>
      <p>No brainlift exists at this URL.</p>
      <Link href="/">← Back to home</Link>
    </div>
  );

  const { title, description, facts, contradictionClusters, readingList, summary } = data;

  return (
    <div style={{
      minHeight: '100vh',
      backgroundColor: tokens.bg,
      color: tokens.textPrimary,
      fontFamily: "'Inter', -apple-system, BlinkMacSystemFont, sans-serif",
    }}>
      <DashboardHeader
        data={data}
        isSharedView={isSharedView}
        isNotBrainlift={isNotBrainlift}
        activeTab={activeTab}
        setActiveTab={setActiveTab}
        versions={versions}
        editingAuthor={editingAuthor}
        setEditingAuthor={setEditingAuthor}
        authorInput={authorInput}
        setAuthorInput={setAuthorInput}
        updateAuthorMutation={updateAuthorMutation}
        setShowUpdateModal={setShowUpdateModal}
        setShowHistoryModal={setShowHistoryModal}
        handleDownloadPDF={handleDownloadPDF}
      />

      {/* Main Content */}
      <main className="px-4 py-4 sm:px-6 md:px-8">
        
        {/* Not a Brainlift View */}
        {isNotBrainlift && (
          <NotBrainliftView data={data} isSharedView={isSharedView} toast={toast} />
        )}

        {/* Partial Brainlift Warning */}
        {isPartialBrainlift && (
          <div style={{
            backgroundColor: tokens.warningSoft,
            borderRadius: '8px',
            padding: '16px',
            marginBottom: '24px',
            display: 'flex',
            alignItems: 'flex-start',
            gap: '12px',
          }}>
            <AlertTriangle size={20} style={{ color: tokens.warning, flexShrink: 0, marginTop: '2px' }} />
            <div>
              <div style={{ fontWeight: 600, color: tokens.warning }}>Partial Brainlift</div>
              <div style={{ fontSize: '14px', color: tokens.textSecondary }}>
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
              <div style={{ marginBottom: '16px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
                {data.flags.map((flag, index) => (
                  <div
                    key={index}
                    data-testid={`flag-${index}`}
                    style={{
                      display: 'flex',
                      alignItems: 'flex-start',
                      gap: '8px',
                      padding: '10px 14px',
                      backgroundColor: tokens.warningSoft,
                      borderRadius: '6px',
                      fontSize: '13px',
                      color: tokens.warning,
                      lineHeight: 1.5,
                    }}
                  >
                    <AlertTriangle size={14} style={{ color: tokens.warning, flexShrink: 0, marginTop: '2px' }} />
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
              onAnalyzeRedundancy={() => analyzeRedundancy()}
              isAnalyzingRedundancy={isAnalyzingRedundancy}
              onViewFactFullText={(fact) => setSelectedFactForModal(fact)}
            />
          </div>
        )}

        {/* AI Verification Tab - Multi-LLM Fact Verification */}
        {!isNotBrainlift && activeTab === 'verification' && (
          <div className="max-w-[1200px] mx-auto">
            <VerificationPanel slug={slug} />
          </div>
        )}

        {/* Model Accuracy Analytics Tab */}
        {!isNotBrainlift && activeTab === 'analytics' && (
          <div className="max-w-[1200px] mx-auto">
            <ModelAccuracyPanel />
          </div>
        )}

        {/* Contradictions Tab - Card-based styled design */}
        {!isNotBrainlift && activeTab === 'contradictions' && (
          <ContradictionsTab
            contradictionClusters={contradictionClusters}
            setActiveTab={setActiveTab}
          />
        )}

        {/* Reading List Tab - Card-based Design */}
        {!isNotBrainlift && activeTab === 'reading' && (
          <ReadingListTab
            slug={slug}
            readingList={readingList}
            expertsList={expertsList}
            tweetResults={tweetResults}
            showTweetSection={showTweetSection}
            expertsExpanded={expertsExpanded}
            showAllExperts={showAllExperts}
            isSharedView={isSharedView}
            grades={grades}
            setShowResearchModal={setShowResearchModal}
            setShowTweetSection={setShowTweetSection}
            setExpertsExpanded={setExpertsExpanded}
            setShowAllExperts={setShowAllExperts}
            setActiveTab={setActiveTab}
            tweetSearchMutation={tweetSearchMutation}
            refreshExpertsMutation={refreshExpertsMutation}
            toggleExpertFollowMutation={toggleExpertFollowMutation}
            deleteExpertMutation={deleteExpertMutation}
          />
        )}

      </main>

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
        text={updateText}
        onTextChange={setUpdateText}
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
        data={redundancyData}
        selectedPrimaryFacts={selectedPrimaryFacts}
        onSelectPrimaryFact={(groupId, factId) => setSelectedPrimaryFacts(prev => ({ ...prev, [groupId]: factId }))}
        onKeep={(groupId, primaryFactId) => updateRedundancyStatus({ groupId, status: 'kept', primaryFactId })}
        onDismiss={(groupId) => updateRedundancyStatus({ groupId, status: 'dismissed' })}
        isUpdating={isUpdatingRedundancyStatus}
      />

      {/* Research Modal */}
      <ResearchModal
        show={showResearchModal}
        onClose={() => setShowResearchModal(false)}
        slug={slug}
      />

      {/* Manual Add Resource Modal */}
      <AddResourceModal
        show={showAddResourceModal}
        onClose={() => setShowAddResourceModal(false)}
        slug={slug}
      />
    </div>
  );
}
