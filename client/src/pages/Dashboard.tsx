import { useState, useMemo } from 'react';
import { useQuery, useMutation } from '@tanstack/react-query';
import { Link } from 'wouter';
import { BrainliftData, ReadingListGrade, BrainliftVersion, CLASSIFICATION, type Expert, type Fact } from '@shared/schema';
import { ChevronUp, ExternalLink, Download, RefreshCw, History, X, Upload, Search, Plus, Loader2, AlertTriangle, FileText, Clock, ThumbsUp, ThumbsDown, Users, User, Trash2, CheckCircle } from 'lucide-react';
import { SiX } from 'react-icons/si';
import { queryClient, apiRequest } from '@/lib/queryClient';
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
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';

interface DashboardProps {
  slug: string;
  isSharedView?: boolean;
}

export default function Dashboard({ slug, isSharedView = false }: DashboardProps) {
  const [activeTab, setActiveTab] = useState('brainlift');
  const [selectedCluster, setSelectedCluster] = useState<number | null>(null);
  const [readingFilter, setReadingFilter] = useState<'all' | 'graded' | 'ungraded'>('all');
  
  const [expandedItems, setExpandedItems] = useState<Record<number, boolean>>({});
  const [expandedFacts, setExpandedFacts] = useState<number[]>([]);
  const [localGrades, setLocalGrades] = useState<Record<number, { aligns?: string; contradicts?: string; newInfo?: string; quality?: number }>>({});
  const [showUpdateModal, setShowUpdateModal] = useState(false);
  const [showHistoryModal, setShowHistoryModal] = useState(false);
  const [updateSourceType, setUpdateSourceType] = useState<'pdf' | 'docx' | 'html' | 'text' | 'workflowy' | 'googledocs'>('pdf');
  const [updateFile, setUpdateFile] = useState<File | null>(null);
  const [updateUrl, setUpdateUrl] = useState('');
  const [updateText, setUpdateText] = useState('');
  const [showResearchModal, setShowResearchModal] = useState(false);
  const [researchMode, setResearchMode] = useState<'quick' | 'deep'>('quick');
  const [researchQuery, setResearchQuery] = useState('');
  const [researchResults, setResearchResults] = useState<any>(null);
  const [showAddResourceModal, setShowAddResourceModal] = useState(false);
  const [manualResource, setManualResource] = useState({
    type: 'Article',
    author: '',
    topic: '',
    time: '10 min',
    facts: '',
    url: '',
  });
  const [tweetResults, setTweetResults] = useState<any>(null);
  const [showTweetSection, setShowTweetSection] = useState(false);
  const [tweetFeedbackState, setTweetFeedbackState] = useState<Record<string, 'accepted' | 'rejected'>>({});
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
    saveGrade,
    isSavingGrade,
  } = useBrainlift(slug, isSharedView);

  const { researchMutation, tweetSearchMutation } = useResearch(slug, {
    onResearchSuccess: (resData) => {
      setResearchResults(resData);
    },
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

  const toggleExpand = (itemId: number) => {
    setExpandedItems(prev => ({ ...prev, [itemId]: !prev[itemId] }));
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

  const saveGradeMutation = {
    mutate: (gradeData: { readingListItemId: number; aligns?: string; contradicts?: string; newInfo?: string; quality?: number }) => {
      saveGrade(gradeData, {
        onSuccess: () => {
          setLocalGrades(prev => {
            const updated = { ...prev };
            delete updated[gradeData.readingListItemId];
            return updated;
          });
        }
      });
    },
    isPending: isSavingGrade,
  };

  const addResourceMutation = useMutation({
    mutationFn: async (resource: { type: string; author: string; topic: string; time: string; facts: string; url: string }) => {
      return apiRequest('POST', `/api/brainlifts/${slug}/reading-list`, resource);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['brainlift', slug] });
    }
  });

  const sourceFeedbackMutation = useMutation({
    mutationFn: async (feedback: { sourceId: string; sourceType: 'tweet' | 'research'; title: string; snippet: string; url: string; decision: 'accepted' | 'rejected' }) => {
      const res = await fetch(`/api/brainlifts/${slug}/feedback`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(feedback),
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.message || 'Failed to save feedback');
      }
      return res.json();
    },
    onSuccess: (_, variables) => {
      setTweetFeedbackState(prev => ({
        ...prev,
        [variables.sourceId]: variables.decision,
      }));
      const sourceLabel = variables.sourceType === 'tweet' ? 'Tweet' : 'Source';
      toast({
        title: variables.decision === 'accepted' ? `${sourceLabel} accepted` : `${sourceLabel} rejected`,
        description: 'Your feedback helps improve future searches.',
      });
    },
    onError: (err: Error) => {
      toast({
        title: 'Failed to save feedback',
        description: err.message,
        variant: 'destructive',
      });
    }
  });

  const getGradeForItem = (itemId: number) => {
    return grades.find(g => g.readingListItemId === itemId);
  };

  const isItemGraded = (itemId: number) => {
    const grade = getGradeForItem(itemId);
    return grade && (grade.aligns || grade.contradicts || grade.newInfo || grade.quality);
  };

  const handleGradeChange = (itemId: number, field: string, value: string | number) => {
    setLocalGrades(prev => ({
      ...prev,
      [itemId]: { ...prev[itemId], [field]: value }
    }));
  };

  const handleSaveGrade = (itemId: number) => {
    const local = localGrades[itemId] || {};
    const existing = getGradeForItem(itemId);
    saveGradeMutation.mutate({
      readingListItemId: itemId,
      aligns: local.aligns ?? existing?.aligns ?? undefined,
      contradicts: local.contradicts ?? existing?.contradicts ?? undefined,
      newInfo: local.newInfo ?? existing?.newInfo ?? undefined,
      quality: local.quality ?? existing?.quality ?? undefined,
    });
  };

  const handleDownloadPDF = () => {
    if (!data) return;
    
    const doc = new jsPDF();
    const pageWidth = doc.internal.pageSize.getWidth();
    const marginLeft = 14;
    const marginRight = 14;
    const maxWidth = pageWidth - marginLeft - marginRight;
    let y = 20;

    doc.setFontSize(20);
    doc.setTextColor(30, 58, 95);
    const titleLines = doc.splitTextToSize(data.title, maxWidth);
    doc.text(titleLines, marginLeft, y);
    y += titleLines.length * 8 + 4;

    doc.setFontSize(11);
    doc.setTextColor(100, 116, 139);
    const descLines = doc.splitTextToSize(data.description, maxWidth);
    doc.text(descLines, marginLeft, y);
    y += descLines.length * 5 + 3;
    
    if (data.author) {
      doc.setTextColor(13, 148, 136);
      doc.text(`By ${data.author}`, marginLeft, y);
      y += 8;
    } else {
      y += 3;
    }

    doc.setFontSize(14);
    doc.setTextColor(30, 58, 95);
    doc.text('Summary', marginLeft, y);
    y += 7;

    doc.setFontSize(10);
    doc.setTextColor(51, 65, 85);
    doc.text(`Total Facts: ${data.summary.totalFacts}  |  Mean Score: ${data.summary.meanScore}`, marginLeft, y);
    y += 5;
    doc.text(`Highly Verified (5/5): ${data.summary.score5Count}  |  With Contradictions: ${data.summary.contradictionCount}`, marginLeft, y);
    y += 10;

    doc.setFontSize(14);
    doc.setTextColor(30, 58, 95);
    doc.text('Facts', marginLeft, y);
    y += 4;

    const sortedFacts = [...data.facts].sort((a, b) => b.score - a.score || a.originalId.localeCompare(b.originalId));
    
    autoTable(doc, {
      startY: y,
      head: [['Fact ID', 'Fact (as written)', 'Correctness (1-5)', 'Verification Notes']],
      body: sortedFacts.map(f => {
        const scoreLabel = f.score === 5 ? 'Verified' : f.score === 4 ? 'Mostly Verified' : f.score === 3 ? 'Partially Verified' : f.score === 2 ? 'Weakly Verified' : 'Not Verified';
        const contradictionNote = f.contradicts ? ` [Contradicts: ${f.contradicts}]` : '';
        return [
          f.originalId,
          f.fact,
          `${f.score} - ${scoreLabel}`,
          (f.note || 'No verification notes') + contradictionNote,
        ];
      }),
      styles: { fontSize: 7, cellPadding: 3, overflow: 'linebreak' },
      headStyles: { fillColor: [30, 58, 138], textColor: 255 },
      columnStyles: {
        0: { cellWidth: 18 },
        1: { cellWidth: 55 },
        2: { cellWidth: 28 },
        3: { cellWidth: 'auto' },
      },
      margin: { left: marginLeft, right: marginRight },
    });

    y = (doc as any).lastAutoTable.finalY + 12;

    if (y > 250) {
      doc.addPage();
      y = 20;
    }
    
    doc.setFontSize(14);
    doc.setTextColor(30, 58, 95);
    doc.text('Contradiction Clusters', marginLeft, y);
    y += 4;

    if (data.contradictionClusters.length > 0) {
      autoTable(doc, {
        startY: y,
        head: [['Cluster', 'Tension', 'Status', 'Fact IDs', 'Claims']],
        body: data.contradictionClusters.map(c => [
          c.name,
          c.tension,
          c.status,
          (c.factIds as string[]).join(', '),
          (c.claims as string[]).join('; '),
        ]),
        styles: { fontSize: 7, cellPadding: 3, overflow: 'linebreak' },
        headStyles: { fillColor: [245, 158, 11], textColor: 255 },
        columnStyles: {
          0: { cellWidth: 35 },
          1: { cellWidth: 45 },
          2: { cellWidth: 22 },
          3: { cellWidth: 22 },
          4: { cellWidth: 'auto' },
        },
        margin: { left: marginLeft, right: marginRight },
      });
      y = (doc as any).lastAutoTable.finalY + 12;
    } else {
      y += 4;
      doc.setFontSize(10);
      doc.setTextColor(100, 116, 139);
      doc.text('No contradictions identified in this analysis.', marginLeft, y);
      y += 12;
    }

    if (y > 250) {
      doc.addPage();
      y = 20;
    }

    doc.setFontSize(14);
    doc.setTextColor(30, 58, 95);
    doc.text('Reading List', marginLeft, y);
    y += 4;

    if (data.readingList.length > 0) {
      const readingListLinks: { url: string; x: number; y: number; width: number; height: number }[] = [];
      
      autoTable(doc, {
        startY: y,
        head: [['Type', 'Author', 'Topic', 'Aligns', 'Contradicts', 'New Info', 'Quality', 'Link']],
        body: data.readingList.map(r => {
          const grade = grades.find(g => g.readingListItemId === r.id);
          return [
            r.type,
            r.author,
            r.topic,
            grade?.aligns || '-',
            grade?.contradicts || '-',
            grade?.newInfo || '-',
            grade?.quality ? `${grade.quality}/5` : '-',
            r.url ? 'Open' : '-',
          ];
        }),
        styles: { fontSize: 6, cellPadding: 2, overflow: 'linebreak' },
        headStyles: { fillColor: [13, 148, 136], textColor: 255, fontSize: 6 },
        columnStyles: {
          0: { cellWidth: 18 },
          1: { cellWidth: 25 },
          2: { cellWidth: 'auto' },
          3: { cellWidth: 18 },
          4: { cellWidth: 18 },
          5: { cellWidth: 18 },
          6: { cellWidth: 14 },
          7: { cellWidth: 14, textColor: [59, 130, 246] },
        },
        margin: { left: marginLeft, right: marginRight },
        didDrawCell: (cellData: any) => {
          if (cellData.section === 'body' && cellData.column.index === 7) {
            const item = data.readingList[cellData.row.index];
            if (item?.url) {
              readingListLinks.push({
                url: item.url,
                x: cellData.cell.x,
                y: cellData.cell.y,
                width: cellData.cell.width,
                height: cellData.cell.height,
              });
            }
          }
        },
      });

      readingListLinks.forEach(link => {
        doc.link(link.x, link.y, link.width, link.height, { url: link.url });
      });
    } else {
      y += 4;
      doc.setFontSize(10);
      doc.setTextColor(100, 116, 139);
      doc.text('No reading list items available.', marginLeft, y);
    }

    doc.save(`${data.slug}-brainlift.pdf`);
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

  // Reading List categorization
  const readingCategories = [
    { id: 1, name: 'Student Motivation', facts: '1.1, 2.1', keywords: ['motivat', 'interest', 'choice', 'engagement', 'Writing Gap', 'What Motivates'] },
    { id: 2, name: 'Explicit Instruction', facts: '1.2, 2.2, 2.3, 2.4', keywords: ['Writing Revolution', 'Six Principles', 'Hochman', 'TWR', 'sentence', 'explicit'] },
    { id: 3, name: 'Cognitive Load', facts: '3.1-3.5', keywords: ['cognitive', 'working memory', 'CLT', 'load', 'Hendrick', 'Ashman', 'Wiliam'] },
    { id: 4, name: 'Knowledge-Building', facts: '4.1-4.3', keywords: ['knowledge', 'writing to learn', 'Graham', 'elaboration', 'Shanahan'] },
    { id: 5, name: 'Mathemagenic', facts: '5.1-5.2', keywords: ['mathemagenic', 'transfer', 'Rothkopf', 'Kirschner', 'Stockard', 'Direct Instruction'] },
    { id: 6, name: 'Wise Feedback', facts: '6.1-6.2', keywords: ['wise feedback', 'Yeager', 'mentor', 'identity', 'Huberman'] },
    { id: 7, name: 'PCK', facts: '7.1-7.3', keywords: ['PCK', 'Shulman', 'pedagogical content', 'WWC', 'Practice Guide', 'Evidence Based'] },
  ];

  const categorizeSource = (item: typeof readingList[0]) => {
    const searchText = `${item.author} ${item.topic} ${item.facts}`.toLowerCase();
    for (const cat of readingCategories) {
      if (cat.keywords.some(kw => searchText.includes(kw.toLowerCase()))) {
        return cat;
      }
    }
    return { id: 8, name: 'Other', facts: 'various', keywords: [] as string[] };
  };

  // Build category groups
  const categoryGroups = readingCategories.map(cat => ({
    ...cat,
    items: readingList.filter(item => categorizeSource(item).id === cat.id),
    gradedCount: readingList.filter(item => categorizeSource(item).id === cat.id && isItemGraded(item.id)).length,
  }));
  
  const uncategorizedItems = readingList.filter(item => categorizeSource(item).id === 8);
  if (uncategorizedItems.length > 0) {
    categoryGroups.push({ 
      id: 8, name: 'Other', facts: 'various', keywords: [] as string[], 
      items: uncategorizedItems,
      gradedCount: uncategorizedItems.filter(item => isItemGraded(item.id)).length,
    });
  }

  // Add "All Sources" as the first option (id: 0)
  const allSourcesCluster = {
    id: 0,
    name: 'All Sources',
    facts: 'all',
    keywords: [] as string[],
    items: readingList,
    gradedCount: readingList.filter(item => isItemGraded(item.id)).length,
  };
  
  const groupedSources = [allSourcesCluster, ...categoryGroups];

  // Default to "All Sources" (id: 0)
  const activeCluster = selectedCluster ?? 0;
  const currentCluster = groupedSources.find(c => c.id === activeCluster) || allSourcesCluster;
  
  const filteredItems = currentCluster?.items.filter(item => {
    if (readingFilter === 'graded') return isItemGraded(item.id);
    if (readingFilter === 'ungraded') return !isItemGraded(item.id);
    return true;
  }) || [];
  
  const totalGraded = readingList.filter(item => isItemGraded(item.id)).length;

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
            readingList={readingList}
            categoryGroups={categoryGroups}
            expertsList={expertsList}
            tweetResults={tweetResults}
            showTweetSection={showTweetSection}
            expertsExpanded={expertsExpanded}
            showAllExperts={showAllExperts}
            expandedItems={expandedItems}
            localGrades={localGrades}
            tweetFeedbackState={tweetFeedbackState}
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
            sourceFeedbackMutation={sourceFeedbackMutation}
            saveGradeMutation={saveGradeMutation}
            toggleExpand={toggleExpand}
            handleGradeChange={handleGradeChange}
            handleSaveGrade={handleSaveGrade}
            isItemGraded={isItemGraded}
            getGradeForItem={getGradeForItem}
            categorizeSource={categorizeSource}
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
        onClose={() => {
          setShowResearchModal(false);
          setResearchResults(null);
          setResearchQuery('');
        }}
        mode={researchMode}
        onModeChange={setResearchMode}
        query={researchQuery}
        onQueryChange={setResearchQuery}
        onStartResearch={() => researchMutation.mutate({ mode: researchMode, query: researchQuery || undefined })}
        isSearching={researchMutation.isPending}
        results={researchResults}
        onAddResource={(resource) => addResourceMutation.mutate({
          type: resource.type,
          author: resource.author,
          topic: resource.title || resource.topic || '',
          time: resource.time,
          facts: resource.summary || resource.relevance || '',
          url: resource.url,
        })}
        isAddingResource={addResourceMutation.isPending}
        onAccept={(resource) => sourceFeedbackMutation.mutate({
          sourceId: resource.url,
          sourceType: 'research',
          title: resource.title || resource.topic || '',
          snippet: resource.summary || '',
          url: resource.url,
          decision: 'accepted',
        })}
        onReject={(resource) => sourceFeedbackMutation.mutate({
          sourceId: resource.url,
          sourceType: 'research',
          title: resource.title || resource.topic || '',
          snippet: resource.summary || '',
          url: resource.url,
          decision: 'rejected',
        })}
        isSavingFeedback={sourceFeedbackMutation.isPending}
        feedbackState={tweetFeedbackState}
        error={researchMutation.isError ? (researchMutation.error as Error).message : undefined}
      />

      {/* Manual Add Resource Modal */}
      <AddResourceModal
        show={showAddResourceModal}
        onClose={() => setShowAddResourceModal(false)}
        resource={manualResource}
        onResourceChange={setManualResource}
        onSubmit={() => {
          addResourceMutation.mutate(manualResource, {
            onSuccess: () => {
              setShowAddResourceModal(false);
              setManualResource({
                type: 'Article',
                author: '',
                topic: '',
                time: '10 min',
                facts: '',
                url: '',
              });
            }
          });
        }}
        isSubmitting={addResourceMutation.isPending}
      />
    </div>
  );
}
