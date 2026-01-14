import { useState, useMemo } from 'react';
import { UseMutationResult, useMutation } from '@tanstack/react-query';
import {
  Search,
  Check,
  ChevronDown,
  ChevronUp,
  ExternalLink,
  Loader2,
  FileText,
  Clock,
  ThumbsUp,
  ThumbsDown,
  Users,
  User,
  Trash2,
  RefreshCw,
  X,
  AlertTriangle,
  Info,
  AlertCircle
} from 'lucide-react';
import { SiX } from 'react-icons/si';
import { tokens } from '@/lib/colors';
import { useToast } from '@/hooks/use-toast';
import { queryClient } from '@/lib/queryClient';
import type { Expert, ReadingListGrade } from '@shared/schema';

// Types
interface ReadingListItem {
  id: number;
  author: string;
  topic: string;
  facts: string;
  type: string;
  time: string;
  url: string;
}

interface TweetResult {
  id: string;
  text: string;
  url: string;
  authorUsername: string;
  authorFollowers: number;
  dokLevel: number;
  relevanceScore: number;
  matchedFacts: string[];
  dokRationale: string;
  likes: number;
  retweets: number;
  replies: number;
}

interface TweetResults {
  searchSummary: string;
  tweets: TweetResult[];
}

interface CategoryGroup {
  id: number;
  name: string;
  facts: string;
  keywords: string[];
  items: ReadingListItem[];
  gradedCount?: number;
}

interface ExpertDiagnostic {
  code: string;
  severity: 'error' | 'warning' | 'info';
  message: string;
  details?: string;
  affectedExperts?: string[];
}

interface ExpertDiagnostics {
  isValid: boolean;
  diagnostics: ExpertDiagnostic[];
  summary: {
    expertsFound: number;
    expertsWithStructuredFields: number;
    expertsWithSocialLinks: number;
    hasRequiredFields: boolean;
  };
}

interface ReadingListTabProps {
  readingList: ReadingListItem[];
  expertsList: Expert[];
  expertDiagnostics: ExpertDiagnostics | null;
  tweetResults: TweetResults | null;
  showTweetSection: boolean;
  showAllExperts: boolean;
  isSharedView: boolean;
  grades: ReadingListGrade[];
  slug: string;
  setShowResearchModal: (show: boolean) => void;
  setShowTweetSection: (show: boolean) => void;
  setShowAllExperts: (show: boolean) => void;
  setActiveTab: (tab: string) => void;
  tweetSearchMutation: UseMutationResult<any, Error, void, unknown>;
  refreshExpertsMutation: UseMutationResult<any, Error, void, unknown>;
  toggleExpertFollowMutation: UseMutationResult<any, Error, { expertId: number; isFollowing: boolean }, unknown>;
  deleteExpertMutation: UseMutationResult<any, Error, number, unknown>;
}

export function ReadingListTab({
  readingList,
  expertsList,
  expertDiagnostics,
  tweetResults,
  showTweetSection,
  showAllExperts,
  isSharedView,
  grades,
  slug,
  setShowResearchModal,
  setShowTweetSection,
  setShowAllExperts,
  setActiveTab,
  tweetSearchMutation,
  refreshExpertsMutation,
  toggleExpertFollowMutation,
  deleteExpertMutation,
}: ReadingListTabProps) {
  const { toast } = useToast();

  // Local state for grading
  const [expandedItems, setExpandedItems] = useState<Record<number, boolean>>({});
  const [localGrades, setLocalGrades] = useState<Record<number, { aligns?: string; contradicts?: string; newInfo?: string; quality?: number }>>({});
  const [tweetFeedbackState, setTweetFeedbackState] = useState<Record<string, 'accepted' | 'rejected'>>({});

  // Grading helper functions
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

  const toggleExpand = (itemId: number) => {
    setExpandedItems(prev => ({ ...prev, [itemId]: !prev[itemId] }));
  };

  // Save grade mutation
  const saveGradeMutation = useMutation({
    mutationFn: async (gradeData: { readingListItemId: number; aligns?: string; contradicts?: string; newInfo?: string; quality?: number }) => {
      const res = await fetch(`/api/brainlifts/${slug}/grades`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(gradeData),
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.message || 'Failed to save grade');
      }
      return res.json();
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ['grades', slug] });
      setLocalGrades(prev => {
        const updated = { ...prev };
        delete updated[variables.readingListItemId];
        return updated;
      });
    }
  });

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

  // Source feedback mutation
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

  const categorizeSource = (item: ReadingListItem): CategoryGroup => {
    const searchText = `${item.author} ${item.topic} ${item.facts}`.toLowerCase();
    for (const cat of readingCategories) {
      if (cat.keywords.some(kw => searchText.includes(kw.toLowerCase()))) {
        return cat as CategoryGroup;
      }
    }
    return { id: 8, name: 'Other', facts: 'various', keywords: [], items: [] };
  };

  // Build category groups
  const categoryGroups = useMemo(() => {
    const groups = readingCategories.map(cat => ({
      ...cat,
      items: readingList.filter(item => categorizeSource(item).id === cat.id),
      gradedCount: readingList.filter(item => categorizeSource(item).id === cat.id && isItemGraded(item.id)).length,
    }));

    const uncategorizedItems = readingList.filter(item => categorizeSource(item).id === 8);
    if (uncategorizedItems.length > 0) {
      groups.push({
        id: 8, name: 'Other', facts: 'various', keywords: [],
        items: uncategorizedItems,
        gradedCount: uncategorizedItems.filter(item => isItemGraded(item.id)).length,
      });
    }

    return groups;
  }, [readingList, grades]);

  // Helper to get styling for different source types
  const getSourceTypeStyle = (type: string) => {
    const lower = type.toLowerCase();
    if (lower.includes('blog')) return { bg: '#DBEAFE', color: '#1D4ED8', icon: 'Blog' };
    if (lower.includes('magazine') || lower.includes('atlantic')) return { bg: '#FCE7F3', color: '#BE185D', icon: 'Magazine' };
    if (lower.includes('research') || lower.includes('paper') || lower.includes('study')) return { bg: '#D1FAE5', color: '#047857', icon: 'Research' };
    if (lower.includes('policy')) return { bg: '#FEF3C7', color: '#B45309', icon: 'Policy' };
    if (lower.includes('podcast')) return { bg: '#EDE9FE', color: '#6D28D9', icon: 'Podcast' };
    if (lower.includes('video') || lower.includes('youtube')) return { bg: '#FEE2E2', color: '#DC2626', icon: 'Video' };
    if (lower.includes('twitter') || lower.includes('x.com')) return { bg: '#E0F2FE', color: '#000000', icon: 'X' };
    if (lower.includes('substack')) return { bg: '#FFEDD5', color: '#EA580C', icon: 'Substack' };
    return { bg: '#F3F4F6', color: '#6B7280', icon: type };
  };

  return (
    <div className="max-w-[1200px] mx-auto">
      {/* Page Header */}
      <div className="mb-8 pb-5" style={{ borderBottom: `1px solid ${tokens.border}` }}>
        <div className="flex justify-between items-start flex-wrap gap-4">
          <div>
            <h2 className="text-2xl font-bold m-0 mb-2 text-foreground">
              Reading List
            </h2>
            <p className="text-[15px] text-muted-foreground m-0">
              Sources selected to support, challenge, or contextualize the DOK1 fact base.
            </p>
            <p className="text-sm text-[#0D9488] mt-1 mb-0 font-medium">
              Read selectively. Grade alignment only after review.
            </p>
          </div>
          <div className="flex gap-3 flex-wrap">
            <button
              data-testid="button-find-sources"
              onClick={() => setShowResearchModal(true)}
              className="flex items-center gap-2 border-none rounded-lg px-5 py-2.5 text-sm font-medium cursor-pointer transition-[filter] duration-150"
              style={{ backgroundColor: tokens.secondary, color: '#fff' }}
              onMouseEnter={(e) => e.currentTarget.style.filter = 'brightness(1.1)'}
              onMouseLeave={(e) => e.currentTarget.style.filter = 'brightness(1)'}
            >
              <Search size={16} />
              Find Sources
            </button>
            <button
              data-testid="button-find-tweets"
              onClick={() => tweetSearchMutation.mutate()}
              disabled={tweetSearchMutation.isPending}
              className="flex items-center gap-2 bg-[#0284C7] text-white border-none rounded-lg px-5 py-2.5 text-sm font-medium transition-[filter] duration-150"
              style={{
                cursor: tweetSearchMutation.isPending ? 'wait' : 'pointer',
                opacity: tweetSearchMutation.isPending ? 0.7 : 1,
              }}
              onMouseEnter={(e) => !tweetSearchMutation.isPending && (e.currentTarget.style.filter = 'brightness(1.1)')}
              onMouseLeave={(e) => e.currentTarget.style.filter = 'brightness(1)'}
            >
              {tweetSearchMutation.isPending ? (
                <Loader2 size={16} className="animate-spin" />
              ) : (
                <SiX size={14} />
              )}
              {tweetSearchMutation.isPending ? 'Searching...' : 'Find on X'}
            </button>
          </div>
        </div>
      </div>

      {/* Summary Stats */}
      <div className="flex gap-6 px-5 py-4 bg-sidebar rounded-lg mb-8 flex-wrap">
        <div className="flex items-center gap-2">
          <FileText size={18} color={tokens.primary} />
          <span className="text-[13px] text-muted-foreground">Total sources:</span>
          <span className="text-[15px] font-semibold text-foreground">{readingList.length}</span>
        </div>
        <div className="flex items-center gap-2">
          <Check size={18} color={tokens.success} />
          <span className="text-[13px] text-muted-foreground">Graded:</span>
          <span className="text-[15px] font-semibold text-foreground">
            {readingList.filter((item: { id: number }) => isItemGraded(item.id)).length}/{readingList.length}
          </span>
        </div>
      </div>

      {/* Experts Section */}
      <div className="mb-8 p-5 bg-card rounded-xl" style={{ border: `1px solid ${tokens.border}` }}>
        <div
          className="flex justify-between items-center mb-4"
          data-testid="experts-header"
        >
          <div className="flex items-center gap-3">
            <Users size={20} color={tokens.primary} />
            <div>
              <h3 className="m-0 text-base font-semibold text-foreground">
                Experts
              </h3>
              <p className="mt-0.5 mb-0 text-xs text-muted-foreground">
                Stack ranked by impact on this brainlift
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <span className="h-7 px-3 rounded-xl text-sm font-semibold bg-accent text-primary flex items-center select-none">
              {expertsList.length} experts
            </span>
            {/* Expert Diagnostics Indicator */}
            {(() => {
              if (!expertDiagnostics || expertDiagnostics.diagnostics.length === 0) return null;

              // Filter out redundant "X/X experts lack structured fields" when all experts lack them
              // (the "No experts have structured fields" diagnostic already covers this case)
              const filteredDiagnostics = expertDiagnostics.diagnostics.filter(d => {
                const match = d.message.match(/^(\d+)\/(\d+) experts lack structured fields$/);
                if (match && match[1] === match[2]) return false; // X/X means all, skip it
                return true;
              });

              if (filteredDiagnostics.length === 0) return null;

              const hasError = filteredDiagnostics.some(d => d.severity === 'error');
              const hasWarning = filteredDiagnostics.some(d => d.severity === 'warning');

              return (
                <div className="relative group">
                  <div
                    className="h-7 px-3 rounded-xl text-sm flex items-center gap-1.5 select-none"
                    style={{
                      backgroundColor: hasError
                        ? 'rgba(239, 68, 68, 0.1)'
                        : hasWarning
                          ? 'rgba(245, 158, 11, 0.1)'
                          : 'rgba(59, 130, 246, 0.1)',
                      color: hasError
                        ? '#ef4444'
                        : hasWarning
                          ? '#f59e0b'
                          : '#3b82f6',
                      animation: hasError
                        ? 'subtle-glow-error 2s ease-in-out infinite'
                        : hasWarning
                          ? 'subtle-glow-warning 2s ease-in-out infinite'
                          : 'none',
                    }}
                  >
                    {hasError ? (
                      <AlertCircle size={14} />
                    ) : hasWarning ? (
                      <AlertTriangle size={14} />
                    ) : (
                      <Info size={14} />
                    )}
                    <span>{filteredDiagnostics.length} {filteredDiagnostics.length === 1 ? 'issue' : 'issues'}</span>
                  </div>
                  {/* Tooltip */}
                  <div className="absolute right-0 top-full mt-2 w-72 p-3 bg-popover rounded-lg shadow-lg border border-border opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all z-50">
                    <p className="text-xs font-semibold text-foreground mb-2">Expert Section Diagnostics</p>
                    <div className="space-y-2">
                      {filteredDiagnostics.map((d, i) => (
                        <div key={i} className="flex items-start gap-2">
                          {d.severity === 'error' ? (
                            <AlertCircle size={12} className="mt-0.5 text-red-500 shrink-0" />
                          ) : d.severity === 'warning' ? (
                            <AlertTriangle size={12} className="mt-0.5 text-amber-500 shrink-0" />
                          ) : (
                            <Info size={12} className="mt-0.5 text-blue-500 shrink-0" />
                          )}
                          <div>
                            <p className="text-xs text-foreground">{d.message}</p>
                            {d.details && <p className="text-[10px] text-muted-foreground mt-0.5">{d.details}</p>}
                          </div>
                        </div>
                      ))}
                    </div>
                    <a
                      href="https://workflowy.com/s/experts/DQ4A494Kp6Q1oq4L"
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex items-center justify-center gap-1.5 w-full mt-3 py-1.5 text-xs font-medium text-primary bg-accent rounded-md hover:bg-accent/80 transition-colors"
                    >
                      Review Experts Template
                      <ExternalLink size={12} />
                    </a>
                  </div>
                </div>
              );
            })()}
            <button
              data-testid="button-refresh-experts"
              onClick={() => refreshExpertsMutation.mutate()}
              disabled={refreshExpertsMutation.isPending}
              className="flex items-center justify-center w-7 h-7 rounded-xl bg-accent text-primary group/refresh"
              style={{ cursor: refreshExpertsMutation.isPending ? 'wait' : 'pointer' }}
              title="Refresh experts"
            >
              {refreshExpertsMutation.isPending ? (
                <Loader2 size={14} className="animate-spin" />
              ) : (
                <RefreshCw size={14} className="group-hover/refresh:animate-spin" />
              )}
            </button>
          </div>
        </div>

        {expertsList.length === 0 ? (
              <div className="text-center p-6 text-muted-foreground">
                <Users size={32} className="mb-2 opacity-50" />
                <p className="m-0 mb-2 text-sm">No experts extracted yet</p>
                <p className="m-0 text-xs">Click "Refresh" to extract and rank experts from this brainlift</p>
              </div>
            ) : (
              <>
                <div className="grid gap-3 items-stretch" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))' }}>
                  {(expertsList.length <= 8 ? expertsList : (showAllExperts ? expertsList : expertsList.slice(0, 6))).map((expert) => (
                    <div
                      key={expert.id}
                      data-testid={`expert-card-${expert.id}`}
                      className="p-4 bg-background rounded-lg flex flex-col"
                      style={{ border: `1px solid ${tokens.border}` }}
                    >
                      <div className="flex justify-between items-start mb-2.5">
                        <div className="flex items-center gap-2">
                          <div className="w-8 h-8 rounded-full bg-accent flex items-center justify-center">
                            <User size={16} color={tokens.primary} />
                          </div>
                          <span className="font-semibold text-sm text-foreground">
                            {expert.name}
                          </span>
                        </div>
                      </div>

                      {/* Rank Score Bar */}
                      <div className="mb-2.5">
                        <div className="flex items-center gap-2 mb-1">
                          <div className="flex-1 h-1.5 bg-sidebar rounded overflow-hidden">
                            <div
                              className="h-full bg-primary rounded"
                              style={{ width: expert.rankScore ? `${expert.rankScore * 10}%` : '0%' }}
                            />
                          </div>
                          <span className="text-xs font-semibold text-foreground min-w-[20px]">
                            {expert.rankScore ?? '—'}
                          </span>
                        </div>
                      </div>

                      {/* Rationale */}
                      <p className="m-0 mb-2 text-xs text-muted-foreground leading-[1.4] flex-1">
                        {expert.rationale ?? 'Unranked'}
                      </p>

                      {/* Source & Twitter */}
                      <div className="flex items-center justify-between gap-2 mb-2.5">
                        <span className="text-[10px] py-0.5 px-1.5 rounded bg-accent text-primary uppercase font-semibold">
                          {expert.source === 'listed' ? 'Listed in brainlift' : 'From verification'}
                        </span>
                        {expert.twitterHandle && (
                          <a
                            href={`https://x.com/${expert.twitterHandle.replace('@', '')}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-[11px] text-[#0284C7] no-underline flex items-center gap-1"
                          >
                            <SiX size={10} />
                            {expert.twitterHandle}
                          </a>
                        )}
                      </div>

                      {/* Follow & Delete Buttons */}
                      <div className="flex gap-1.5">
                        <button
                          data-testid={`button-follow-expert-${expert.id}`}
                          onClick={() => toggleExpertFollowMutation.mutate({
                            expertId: expert.id,
                            isFollowing: !expert.isFollowing
                          })}
                          className="flex-1 px-3 py-1.5 rounded-md text-xs font-medium cursor-pointer flex items-center justify-center gap-1.5"
                          style={{
                            backgroundColor: expert.isFollowing ? tokens.primary : tokens.surfaceAlt,
                            color: expert.isFollowing ? tokens.onPrimary : tokens.textSecondary,
                            border: expert.isFollowing ? 'none' : `1px solid ${tokens.border}`,
                          }}
                        >
                          {expert.isFollowing ? (
                            <>
                              <Check size={12} />
                              Following
                            </>
                          ) : (
                            'Follow'
                          )}
                        </button>
                        <button
                          data-testid={`button-delete-expert-${expert.id}`}
                          onClick={() => {
                            if (confirm(`Remove ${expert.name} from expert list?`)) {
                              deleteExpertMutation.mutate(expert.id);
                            }
                          }}
                          className="px-2.5 py-1.5 bg-sidebar text-destructive rounded-md text-xs cursor-pointer flex items-center justify-center"
                          style={{ border: `1px solid ${tokens.border}` }}
                          title="Remove expert"
                        >
                          <Trash2 size={12} />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>

                {expertsList.length > 8 && (
                  <button
                    data-testid="button-show-all-experts"
                    onClick={() => setShowAllExperts(!showAllExperts)}
                    className="flex items-center justify-center gap-1.5 w-full mt-4 p-2.5 bg-transparent text-primary border-none text-[13px] font-medium cursor-pointer"
                  >
                    {showAllExperts ? (
                      <>Show less <ChevronUp size={14} /></>
                    ) : (
                      <>Show all {expertsList.length} experts <ChevronDown size={14} /></>
                    )}
                  </button>
                )}
              </>
            )}
      </div>

      {/* Tweet Results Section */}
      {showTweetSection && tweetResults && (
        <div className="mb-10 p-6 bg-card rounded-xl" style={{ border: `1px solid ${tokens.border}` }}>
          <div className="flex justify-between items-center mb-5">
            <div className="flex items-center gap-3">
              <SiX size={20} />
              <div>
                <h3 className="m-0 text-lg font-semibold text-foreground">
                  Relevant Tweets
                </h3>
                <p className="mt-1 mb-0 text-[13px] text-muted-foreground">
                  {tweetResults.searchSummary}
                </p>
              </div>
            </div>
            <button
              data-testid="button-close-tweets"
              onClick={() => setShowTweetSection(false)}
              className="bg-transparent border-none cursor-pointer p-1"
            >
              <X size={20} color={tokens.textMuted} />
            </button>
          </div>

          {tweetResults.tweets?.length === 0 ? (
            <p className="text-muted-foreground text-center p-5">
              No relevant tweets found. Try again later or adjust your brainlift content.
            </p>
          ) : (
            <div className="flex flex-col gap-4">
              {tweetResults.tweets?.map((tweet: any) => {
                const dokColors: Record<number, { bg: string; color: string; label: string }> = {
                  1: { bg: '#DBEAFE', color: '#1D4ED8', label: 'DOK1 - Recall' },
                  2: { bg: '#D1FAE5', color: '#047857', label: 'DOK2 - Application' },
                  3: { bg: '#FEF3C7', color: '#B45309', label: 'DOK3 - Synthesis' },
                };
                const dok = dokColors[tweet.dokLevel] || dokColors[1];

                return (
                  <div
                    key={tweet.id}
                    data-testid={`tweet-card-${tweet.id}`}
                    className="p-4 bg-background rounded-lg"
                    style={{ border: `1px solid ${tokens.border}` }}
                  >
                    <div className="flex justify-between items-start gap-3 mb-3">
                      <div className="flex items-center gap-2">
                        {/* DOK badge commented out for now
                        <span className="py-1 px-2.5 rounded-xl text-[11px] font-semibold" style={{
                          backgroundColor: dok.bg,
                          color: dok.color,
                        }}>
                          {dok.label}
                        </span>
                        */}
                        <span className="text-xs text-muted-foreground">
                          {Math.round(tweet.relevanceScore * 100)}% relevant
                        </span>
                      </div>
                      <a
                        href={tweet.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        data-testid={`link-tweet-${tweet.id}`}
                        className="flex items-center gap-1 text-xs text-[#0284C7] no-underline"
                      >
                        View on X <ExternalLink size={12} />
                      </a>
                    </div>

                    <div className="mb-3">
                      <div className="flex items-center gap-2 mb-2">
                        <span className="font-semibold text-foreground">@{tweet.authorUsername}</span>
                        <span className="text-xs text-muted-foreground">
                          {tweet.authorFollowers?.toLocaleString()} followers
                        </span>
                      </div>
                      <p className="m-0 text-sm text-foreground leading-normal">
                        {tweet.text}
                      </p>
                    </div>

                    <div className="flex flex-wrap gap-2 mb-3">
                      <span className="text-xs text-muted-foreground">Matches:</span>
                      {tweet.matchedFacts?.map((factId: string) => (
                        <span
                          key={factId}
                          className="py-0.5 px-2 bg-[#E0F2FE] text-[#0369A1] rounded text-[11px] font-medium"
                        >
                          Fact {factId}
                        </span>
                      ))}
                    </div>

                    <p className="m-0 text-[13px] text-muted-foreground italic">
                      {tweet.dokRationale}
                    </p>

                    <div className="flex justify-between items-center mt-3">
                      <div className="flex gap-4 text-xs text-muted-foreground">
                        <span>{tweet.likes} likes</span>
                        <span>{tweet.retweets} retweets</span>
                        <span>{tweet.replies} replies</span>
                      </div>

                      <div className="flex gap-2 items-center">
                        {tweetFeedbackState[tweet.id] ? (
                          <span
                            data-testid={`status-tweet-decision-${tweet.id}`}
                            className="flex items-center gap-1 py-1 px-2.5 rounded-xl text-[11px] font-semibold"
                            style={{
                              backgroundColor: tweetFeedbackState[tweet.id] === 'accepted' ? '#D1FAE5' : '#FEE2E2',
                              color: tweetFeedbackState[tweet.id] === 'accepted' ? '#047857' : '#DC2626',
                            }}
                          >
                            {tweetFeedbackState[tweet.id] === 'accepted' ? (
                              <><ThumbsUp size={12} /> Accepted</>
                            ) : (
                              <><ThumbsDown size={12} /> Rejected</>
                            )}
                          </span>
                        ) : (
                          <>
                            <button
                              data-testid={`button-tweet-accept-${tweet.id}`}
                              onClick={() => sourceFeedbackMutation.mutate({
                                sourceId: tweet.id,
                                sourceType: 'tweet',
                                title: tweet.authorUsername,
                                snippet: tweet.text,
                                url: tweet.url,
                                decision: 'accepted',
                              })}
                              disabled={sourceFeedbackMutation.isPending}
                              className="flex items-center gap-1 px-3 py-1.5 rounded-md text-xs font-medium bg-[#D1FAE5] text-[#047857] border-none cursor-pointer transition-[filter] duration-150"
                              onMouseEnter={(e) => e.currentTarget.style.filter = 'brightness(0.95)'}
                              onMouseLeave={(e) => e.currentTarget.style.filter = 'brightness(1)'}
                            >
                              <ThumbsUp size={12} /> Accept
                            </button>
                            <button
                              data-testid={`button-tweet-reject-${tweet.id}`}
                              onClick={() => sourceFeedbackMutation.mutate({
                                sourceId: tweet.id,
                                sourceType: 'tweet',
                                title: tweet.authorUsername,
                                snippet: tweet.text,
                                url: tweet.url,
                                decision: 'rejected',
                              })}
                              disabled={sourceFeedbackMutation.isPending}
                              className="flex items-center gap-1 px-3 py-1.5 rounded-md text-xs font-medium bg-[#FEE2E2] text-[#DC2626] border-none cursor-pointer transition-[filter] duration-150"
                              onMouseEnter={(e) => e.currentTarget.style.filter = 'brightness(0.95)'}
                              onMouseLeave={(e) => e.currentTarget.style.filter = 'brightness(1)'}
                            >
                              <ThumbsDown size={12} /> Reject
                            </button>
                          </>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* Sections grouped by category */}
      {categoryGroups.filter(cat => cat.items.length > 0).map(category => {
        const typeStyle = (type: string) => getSourceTypeStyle(type);

        return (
          <div key={category.id} className="mb-10">
            {/* Category Header */}
            <div className="flex items-center gap-3 mb-2">
              <h3 className="text-lg font-semibold m-0 text-foreground">
                {category.name}
              </h3>
              <span className="bg-[#F3F4F6] text-[#6B7280] text-xs py-1 px-2.5 rounded-xl">
                {category.items.length} source{category.items.length !== 1 ? 's' : ''}
              </span>
            </div>
            <p className="text-[13px] text-[#6B7280] m-0 mb-4">
              Relates to Facts: <span className="text-[#0D9488] font-medium">{category.facts}</span>
            </p>

            {/* Source Cards */}
            <div className="flex flex-col gap-4">
              {category.items.map((item) => {
                const isExpanded = expandedItems[item.id];
                const existingGrade = getGradeForItem(item.id);
                const localGrade = localGrades[item.id] || {};
                const graded = isItemGraded(item.id);
                const relatedFacts = categorizeSource(item);
                const itemTypeStyle = getSourceTypeStyle(item.type);

                return (
                  <div
                    key={item.id}
                    data-testid={`card-reading-${item.id}`}
                    className="bg-white rounded-xl p-5 transition-all duration-200"
                    style={{ border: `1px solid ${tokens.border}` }}
                    onMouseEnter={(e) => {
                      e.currentTarget.style.borderColor = '#0D9488';
                      e.currentTarget.style.boxShadow = '0 4px 12px rgba(13, 148, 136, 0.1)';
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.borderColor = tokens.border;
                      e.currentTarget.style.boxShadow = 'none';
                    }}
                  >
                    {/* Source Header Row */}
                    <div className="flex items-center gap-3 mb-3 flex-wrap">
                      <span
                        className="inline-flex items-center gap-1 py-1 px-2.5 rounded-md text-[11px] font-semibold uppercase tracking-wider"
                        style={{
                          background: itemTypeStyle.bg,
                          color: itemTypeStyle.color,
                        }}
                      >
                        {itemTypeStyle.icon}
                      </span>
                      <span className="text-[13px] text-[#6B7280]">
                        <span className="font-medium text-[#374151]">{item.author}</span>
                        <span className="mx-1.5 text-[#D1D5DB]">•</span>
                        {item.type}
                      </span>
                      <span className="inline-flex items-center gap-1 text-xs text-[#6B7280] bg-[#F3F4F6] py-0.5 px-2 rounded">
                        <Clock size={12} /> ~{item.time}
                      </span>
                      {graded && (
                        <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-success bg-[#D1FAE5] py-0.5 px-2 rounded">
                          <Check size={12} /> Graded
                        </span>
                      )}
                    </div>

                    {/* Source Title */}
                    <h4 className="text-base font-semibold text-[#111827] m-0 mb-2 leading-[1.4]">
                      {item.topic}
                    </h4>

                    {/* Source Description */}
                    <p className="text-sm text-[#4B5563] leading-normal m-0 mb-4">
                      <strong className="text-[#374151]">Why this matters:</strong>{' '}
                      {item.facts.length > 150 ? item.facts.substring(0, 150) + '...' : item.facts}
                    </p>

                    {/* Source Footer */}
                    <div className="flex items-center justify-between flex-wrap gap-3">
                      {/* Fact Links */}
                      <div className="flex items-center gap-1.5 flex-wrap">
                        <span className="text-xs text-[#6B7280]">Facts:</span>
                        {relatedFacts.facts.split(', ').map((factId, i) => (
                          <button
                            key={i}
                            onClick={() => {
                              setActiveTab('grading');
                              setTimeout(() => {
                                const el = document.getElementById(`fact-${factId}`);
                                el?.scrollIntoView({ behavior: 'smooth', block: 'center' });
                              }, 100);
                            }}
                            className="bg-[#F0FDFA] text-[#0D9488] border border-[#99F6E4] py-0.5 px-2 rounded text-xs font-medium cursor-pointer"
                          >
                            {factId}
                          </button>
                        ))}
                      </div>

                      {/* Action Buttons */}
                      <div className="flex gap-2">
                        <a
                          href={item.url}
                          target="_blank"
                          rel="noopener noreferrer"
                          data-testid={`link-reading-${item.id}`}
                          className="inline-flex items-center gap-1.5 px-4 py-2 bg-primary text-white rounded-lg text-[13px] font-medium no-underline"
                        >
                          Open source <ExternalLink size={12} />
                        </a>
                        {!isSharedView && (
                          <button
                            onClick={() => toggleExpand(item.id)}
                            data-testid={`button-grade-toggle-${item.id}`}
                            className="inline-flex items-center gap-1.5 px-4 py-2 bg-white text-[#374151] rounded-lg text-[13px] font-medium cursor-pointer"
                            style={{ border: `1px solid ${tokens.border}` }}
                          >
                            Grade {isExpanded ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
                          </button>
                        )}
                      </div>
                    </div>

                    {/* Grading Form - Pill-based Design */}
                    {isExpanded && (() => {
                      const currentAligns = localGrade.aligns ?? existingGrade?.aligns ?? '';
                      const currentContradicts = localGrade.contradicts ?? existingGrade?.contradicts ?? '';
                      const currentNewInfo = localGrade.newInfo ?? existingGrade?.newInfo ?? '';
                      const currentQuality = localGrade.quality ?? existingGrade?.quality ?? '';

                      const pillBase = 'py-1.5 px-3.5 bg-white border border-[#D1D5DB] rounded-full text-[13px] font-medium text-[#374151] cursor-pointer';
                      const pillSelected = 'py-1.5 px-3.5 bg-[#0D9488] border border-[#0D9488] rounded-full text-[13px] font-medium text-white cursor-pointer';

                      const getQualityPillStyle = (val: number, selected: boolean) => {
                        if (!selected) return pillBase;
                        const colors: Record<number, string> = {
                          5: '#10B981', 4: '#0D9488', 3: '#EAB308', 2: '#F97316', 1: '#EF4444'
                        };
                        return { backgroundColor: colors[val], borderColor: colors[val], color: 'white' };
                      };

                      return (
                        <div
                          className="bg-[#F9FAFB] rounded-b-xl p-5 -mx-5 -mb-5 mt-4"
                          style={{ borderTop: `1px solid ${tokens.border}` }}
                        >
                          {/* Aligns? */}
                          <div className="flex items-center gap-3 mb-3">
                            <span className="text-[13px] font-semibold text-[#6B7280] min-w-[90px]">Aligns?</span>
                            <div className="flex gap-1.5">
                              {['yes', 'partial', 'no'].map(val => (
                                <button
                                  key={val}
                                  onClick={() => handleGradeChange(item.id, 'aligns', val)}
                                  data-testid={`pill-aligns-${val}-${item.id}`}
                                  className={currentAligns === val ? pillSelected : pillBase}
                                >
                                  {val === 'yes' ? 'Yes' : val === 'partial' ? 'Partial' : 'No'}
                                </button>
                              ))}
                            </div>
                          </div>

                          {/* Contradicts? */}
                          <div className="flex items-center gap-3 mb-3">
                            <span className="text-[13px] font-semibold text-[#6B7280] min-w-[90px]">Contradicts?</span>
                            <div className="flex gap-1.5">
                              {['no', 'yes'].map(val => (
                                <button
                                  key={val}
                                  onClick={() => handleGradeChange(item.id, 'contradicts', val)}
                                  data-testid={`pill-contradicts-${val}-${item.id}`}
                                  className={currentContradicts === val ? pillSelected : pillBase}
                                >
                                  {val === 'no' ? 'None' : 'Yes'}
                                </button>
                              ))}
                            </div>
                          </div>

                          {/* New Info? */}
                          <div className="flex items-center gap-3 mb-3">
                            <span className="text-[13px] font-semibold text-[#6B7280] min-w-[90px]">New info?</span>
                            <div className="flex gap-1.5">
                              {['yes', 'no'].map(val => (
                                <button
                                  key={val}
                                  onClick={() => handleGradeChange(item.id, 'newInfo', val)}
                                  data-testid={`pill-newinfo-${val}-${item.id}`}
                                  className={currentNewInfo === val ? pillSelected : pillBase}
                                >
                                  {val === 'yes' ? 'Yes' : 'No'}
                                </button>
                              ))}
                            </div>
                          </div>

                          {/* Quality */}
                          <div className="flex items-center gap-3 mb-4">
                            <span className="text-[13px] font-semibold text-[#6B7280] min-w-[90px]">Quality</span>
                            <div className="flex gap-1.5">
                              {[1, 2, 3, 4, 5].map(val => (
                                <button
                                  key={val}
                                  onClick={() => handleGradeChange(item.id, 'quality', val)}
                                  data-testid={`pill-quality-${val}-${item.id}`}
                                  className={pillBase}
                                  style={currentQuality === val ? getQualityPillStyle(val, true) : undefined}
                                >
                                  {val}
                                </button>
                              ))}
                            </div>
                          </div>

                          {/* Save Button */}
                          <button
                            onClick={() => handleSaveGrade(item.id)}
                            data-testid={`button-save-grade-${item.id}`}
                            disabled={saveGradeMutation.isPending}
                            className="w-full px-6 py-2.5 bg-[#0D9488] text-white border-none rounded-lg cursor-pointer text-sm font-semibold"
                            style={{ opacity: saveGradeMutation.isPending ? 0.7 : 1 }}
                          >
                            {saveGradeMutation.isPending ? 'Saving...' : 'Save Grade'}
                          </button>
                        </div>
                      );
                    })()}
                  </div>
                );
              })}
            </div>
          </div>
        );
      })}
    </div>
  );
}
