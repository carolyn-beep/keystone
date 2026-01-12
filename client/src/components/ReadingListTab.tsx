import { useState } from 'react';
import { UseMutationResult } from '@tanstack/react-query';
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
  X
} from 'lucide-react';
import { SiX } from 'react-icons/si';
import { tokens } from '@/lib/colors';
import type { Expert } from '@shared/schema';

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
  items: ReadingListItem[];
}

interface ReadingListTabProps {
  readingList: ReadingListItem[];
  categoryGroups: CategoryGroup[];
  expertsList: Expert[];
  tweetResults: TweetResults | null;
  showTweetSection: boolean;
  expertsExpanded: boolean;
  showAllExperts: boolean;
  expandedItems: Record<number, boolean>;
  localGrades: Record<number, { aligns?: string; contradicts?: string; newInfo?: string; quality?: number }>;
  tweetFeedbackState: Record<string, 'accepted' | 'rejected'>;
  isSharedView: boolean;
  grades: Array<{ readingListItemId: number; aligns?: string; contradicts?: string; newInfo?: string; quality?: number }>;
  setShowResearchModal: (show: boolean) => void;
  setShowTweetSection: (show: boolean) => void;
  setExpertsExpanded: (expanded: boolean) => void;
  setShowAllExperts: (show: boolean) => void;
  setActiveTab: (tab: string) => void;
  tweetSearchMutation: UseMutationResult<any, Error, void, unknown>;
  refreshExpertsMutation: UseMutationResult<any, Error, void, unknown>;
  toggleExpertFollowMutation: UseMutationResult<any, Error, { expertId: number; isFollowing: boolean }, unknown>;
  deleteExpertMutation: UseMutationResult<any, Error, number, unknown>;
  sourceFeedbackMutation: UseMutationResult<any, Error, any, unknown>;
  saveGradeMutation: UseMutationResult<any, Error, any, unknown>;
  toggleExpand: (itemId: number) => void;
  handleGradeChange: (itemId: number, field: string, value: string | number) => void;
  handleSaveGrade: (itemId: number) => void;
  isItemGraded: (itemId: number) => boolean;
  getGradeForItem: (itemId: number) => any;
  categorizeSource: (item: ReadingListItem) => CategoryGroup;
}

export function ReadingListTab({
  readingList,
  categoryGroups,
  expertsList,
  tweetResults,
  showTweetSection,
  expertsExpanded,
  showAllExperts,
  expandedItems,
  localGrades,
  tweetFeedbackState,
  isSharedView,
  grades,
  setShowResearchModal,
  setShowTweetSection,
  setExpertsExpanded,
  setShowAllExperts,
  setActiveTab,
  tweetSearchMutation,
  refreshExpertsMutation,
  toggleExpertFollowMutation,
  deleteExpertMutation,
  sourceFeedbackMutation,
  saveGradeMutation,
  toggleExpand,
  handleGradeChange,
  handleSaveGrade,
  isItemGraded,
  getGradeForItem,
  categorizeSource,
}: ReadingListTabProps) {

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
      <div style={{
        marginBottom: '32px',
        paddingBottom: '20px',
        borderBottom: `1px solid ${tokens.border}`,
      }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '16px' }}>
          <div>
            <h2 style={{
              fontSize: '24px',
              fontWeight: 700,
              margin: '0 0 8px 0',
              color: tokens.textPrimary
            }}>
              Reading List
            </h2>
            <p style={{
              fontSize: '15px',
              color: tokens.textSecondary,
              margin: 0,
            }}>
              Sources selected to support, challenge, or contextualize the DOK1 fact base.
            </p>
            <p style={{
              fontSize: '14px',
              color: '#0D9488',
              margin: '4px 0 0 0',
              fontWeight: 500,
            }}>
              Read selectively. Grade alignment only after review.
            </p>
          </div>
          <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap' }}>
            <button
              data-testid="button-find-sources"
              onClick={() => setShowResearchModal(true)}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
                backgroundColor: tokens.secondary,
                color: '#fff',
                border: 'none',
                borderRadius: '8px',
                padding: '10px 20px',
                fontSize: '14px',
                fontWeight: 500,
                cursor: 'pointer',
                transition: 'filter 0.15s',
              }}
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
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
                backgroundColor: '#0284C7',
                color: '#fff',
                border: 'none',
                borderRadius: '8px',
                padding: '10px 20px',
                fontSize: '14px',
                fontWeight: 500,
                cursor: tweetSearchMutation.isPending ? 'wait' : 'pointer',
                opacity: tweetSearchMutation.isPending ? 0.7 : 1,
                transition: 'filter 0.15s',
              }}
              onMouseEnter={(e) => !tweetSearchMutation.isPending && (e.currentTarget.style.filter = 'brightness(1.1)')}
              onMouseLeave={(e) => e.currentTarget.style.filter = 'brightness(1)'}
            >
              {tweetSearchMutation.isPending ? (
                <Loader2 size={16} style={{ animation: 'spin 1s linear infinite' }} />
              ) : (
                <SiX size={14} />
              )}
              {tweetSearchMutation.isPending ? 'Searching...' : 'Find on X'}
            </button>
          </div>
        </div>
      </div>

      {/* Summary Stats */}
      <div style={{
        display: 'flex',
        gap: '24px',
        padding: '16px 20px',
        backgroundColor: tokens.surfaceAlt,
        borderRadius: '8px',
        marginBottom: '32px',
        flexWrap: 'wrap',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <FileText size={18} color={tokens.primary} />
          <span style={{ fontSize: '13px', color: tokens.textSecondary }}>Total sources:</span>
          <span style={{ fontSize: '15px', fontWeight: 600, color: tokens.textPrimary }}>{readingList.length}</span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <Check size={18} color={tokens.success} />
          <span style={{ fontSize: '13px', color: tokens.textSecondary }}>Graded:</span>
          <span style={{ fontSize: '15px', fontWeight: 600, color: tokens.textPrimary }}>
            {readingList.filter((item: { id: number }) => isItemGraded(item.id)).length}/{readingList.length}
          </span>
        </div>
      </div>

      {/* Experts Section */}
      <div style={{
        marginBottom: '32px',
        padding: '20px',
        backgroundColor: tokens.surface,
        borderRadius: '12px',
        border: `1px solid ${tokens.border}`,
      }}>
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            cursor: 'pointer',
            marginBottom: expertsExpanded ? '16px' : '0',
          }}
          onClick={() => setExpertsExpanded(!expertsExpanded)}
          data-testid="button-toggle-experts"
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <Users size={20} color={tokens.primary} />
            <div>
              <h3 style={{ margin: 0, fontSize: '16px', fontWeight: 600, color: tokens.textPrimary }}>
                Experts
              </h3>
              <p style={{ margin: '2px 0 0 0', fontSize: '12px', color: tokens.textSecondary }}>
                Stack ranked by impact on this brainlift
              </p>
            </div>
            <span style={{
              padding: '2px 10px',
              borderRadius: '12px',
              fontSize: '12px',
              fontWeight: 600,
              backgroundColor: tokens.primarySoft,
              color: tokens.primary,
            }}>
              {expertsList.length} experts
            </span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <button
              data-testid="button-refresh-experts"
              onClick={(e) => {
                e.stopPropagation();
                refreshExpertsMutation.mutate();
              }}
              disabled={refreshExpertsMutation.isPending}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '6px',
                padding: '6px 12px',
                backgroundColor: tokens.surfaceAlt,
                color: tokens.textSecondary,
                border: `1px solid ${tokens.border}`,
                borderRadius: '6px',
                fontSize: '12px',
                fontWeight: 500,
                cursor: refreshExpertsMutation.isPending ? 'wait' : 'pointer',
              }}
            >
              {refreshExpertsMutation.isPending ? (
                <Loader2 size={14} style={{ animation: 'spin 1s linear infinite' }} />
              ) : (
                <RefreshCw size={14} />
              )}
              {refreshExpertsMutation.isPending ? 'Refreshing...' : 'Refresh'}
            </button>
            {expertsExpanded ? <ChevronUp size={20} color={tokens.textMuted} /> : <ChevronDown size={20} color={tokens.textMuted} />}
          </div>
        </div>

        {expertsExpanded && (
          <>
            {expertsList.length === 0 ? (
              <div style={{ textAlign: 'center', padding: '24px', color: tokens.textSecondary }}>
                <Users size={32} style={{ marginBottom: '8px', opacity: 0.5 }} />
                <p style={{ margin: '0 0 8px 0', fontSize: '14px' }}>No experts extracted yet</p>
                <p style={{ margin: 0, fontSize: '12px' }}>Click "Refresh" to extract and rank experts from this brainlift</p>
              </div>
            ) : (
              <>
                <div style={{
                  display: 'grid',
                  gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))',
                  gap: '12px',
                  alignItems: 'stretch',
                }}>
                  {(expertsList.length <= 8 ? expertsList : (showAllExperts ? expertsList : expertsList.slice(0, 6))).map((expert) => (
                    <div
                      key={expert.id}
                      data-testid={`expert-card-${expert.id}`}
                      style={{
                        padding: '16px',
                        backgroundColor: tokens.bg,
                        borderRadius: '8px',
                        border: `1px solid ${tokens.border}`,
                        display: 'flex',
                        flexDirection: 'column',
                      }}
                    >
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '10px' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                          <div style={{
                            width: '32px',
                            height: '32px',
                            borderRadius: '50%',
                            backgroundColor: tokens.primarySoft,
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                          }}>
                            <User size={16} color={tokens.primary} />
                          </div>
                          <span style={{ fontWeight: 600, fontSize: '14px', color: tokens.textPrimary }}>
                            {expert.name}
                          </span>
                        </div>
                      </div>

                      {/* Rank Score Bar */}
                      <div style={{ marginBottom: '10px' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '4px' }}>
                          <div style={{
                            flex: 1,
                            height: '6px',
                            backgroundColor: tokens.surfaceAlt,
                            borderRadius: '3px',
                            overflow: 'hidden',
                          }}>
                            <div style={{
                              width: `${expert.rankScore * 10}%`,
                              height: '100%',
                              backgroundColor: tokens.primary,
                              borderRadius: '3px',
                            }} />
                          </div>
                          <span style={{ fontSize: '12px', fontWeight: 600, color: tokens.textPrimary, minWidth: '20px' }}>
                            {expert.rankScore}
                          </span>
                        </div>
                      </div>

                      {/* Rationale */}
                      <p style={{
                        margin: '0 0 8px 0',
                        fontSize: '12px',
                        color: tokens.textSecondary,
                        lineHeight: 1.4,
                        flex: 1,
                      }}>
                        {expert.rationale}
                      </p>

                      {/* Source & Twitter */}
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '8px', marginBottom: '10px' }}>
                        <span style={{
                          fontSize: '10px',
                          padding: '2px 6px',
                          borderRadius: '4px',
                          backgroundColor: tokens.primarySoft,
                          color: tokens.primary,
                          textTransform: 'uppercase',
                          fontWeight: 600,
                        }}>
                          {expert.source === 'listed' ? 'Listed in brainlift' : 'From verification'}
                        </span>
                        {expert.twitterHandle && (
                          <a
                            href={`https://x.com/${expert.twitterHandle.replace('@', '')}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            style={{
                              fontSize: '11px',
                              color: '#0284C7',
                              textDecoration: 'none',
                              display: 'flex',
                              alignItems: 'center',
                              gap: '3px',
                            }}
                          >
                            <SiX size={10} />
                            {expert.twitterHandle}
                          </a>
                        )}
                      </div>

                      {/* Follow & Delete Buttons */}
                      <div style={{ display: 'flex', gap: '6px' }}>
                        <button
                          data-testid={`button-follow-expert-${expert.id}`}
                          onClick={() => toggleExpertFollowMutation.mutate({
                            expertId: expert.id,
                            isFollowing: !expert.isFollowing
                          })}
                          style={{
                            flex: 1,
                            padding: '6px 12px',
                            backgroundColor: expert.isFollowing ? tokens.primary : tokens.surfaceAlt,
                            color: expert.isFollowing ? tokens.onPrimary : tokens.textSecondary,
                            border: expert.isFollowing ? 'none' : `1px solid ${tokens.border}`,
                            borderRadius: '6px',
                            fontSize: '12px',
                            fontWeight: 500,
                            cursor: 'pointer',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            gap: '6px',
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
                          style={{
                            padding: '6px 10px',
                            backgroundColor: tokens.surfaceAlt,
                            color: tokens.danger,
                            border: `1px solid ${tokens.border}`,
                            borderRadius: '6px',
                            fontSize: '12px',
                            cursor: 'pointer',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                          }}
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
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      gap: '6px',
                      width: '100%',
                      marginTop: '16px',
                      padding: '10px',
                      backgroundColor: 'transparent',
                      color: tokens.primary,
                      border: 'none',
                      fontSize: '13px',
                      fontWeight: 500,
                      cursor: 'pointer',
                    }}
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
          </>
        )}
      </div>

      {/* Tweet Results Section */}
      {showTweetSection && tweetResults && (
        <div style={{
          marginBottom: '40px',
          padding: '24px',
          backgroundColor: tokens.surface,
          borderRadius: '12px',
          border: `1px solid ${tokens.border}`,
        }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
              <SiX size={20} />
              <div>
                <h3 style={{ margin: 0, fontSize: '18px', fontWeight: 600, color: tokens.textPrimary }}>
                  Relevant Tweets
                </h3>
                <p style={{ margin: '4px 0 0 0', fontSize: '13px', color: tokens.textSecondary }}>
                  {tweetResults.searchSummary}
                </p>
              </div>
            </div>
            <button
              data-testid="button-close-tweets"
              onClick={() => setShowTweetSection(false)}
              style={{ background: 'none', border: 'none', cursor: 'pointer', padding: '4px' }}
            >
              <X size={20} color={tokens.textMuted} />
            </button>
          </div>

          {tweetResults.tweets?.length === 0 ? (
            <p style={{ color: tokens.textSecondary, textAlign: 'center', padding: '20px' }}>
              No relevant tweets found. Try again later or adjust your brainlift content.
            </p>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
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
                    style={{
                      padding: '16px',
                      backgroundColor: tokens.bg,
                      borderRadius: '8px',
                      border: `1px solid ${tokens.border}`,
                    }}
                  >
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '12px', marginBottom: '12px' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        {/* DOK badge commented out for now
                        <span style={{
                          padding: '4px 10px',
                          borderRadius: '12px',
                          fontSize: '11px',
                          fontWeight: 600,
                          backgroundColor: dok.bg,
                          color: dok.color,
                        }}>
                          {dok.label}
                        </span>
                        */}
                        <span style={{ fontSize: '12px', color: tokens.textMuted }}>
                          {Math.round(tweet.relevanceScore * 100)}% relevant
                        </span>
                      </div>
                      <a
                        href={tweet.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        data-testid={`link-tweet-${tweet.id}`}
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          gap: '4px',
                          fontSize: '12px',
                          color: '#0284C7',
                          textDecoration: 'none',
                        }}
                      >
                        View on X <ExternalLink size={12} />
                      </a>
                    </div>

                    <div style={{ marginBottom: '12px' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '8px' }}>
                        <span style={{ fontWeight: 600, color: tokens.textPrimary }}>@{tweet.authorUsername}</span>
                        <span style={{ fontSize: '12px', color: tokens.textMuted }}>
                          {tweet.authorFollowers?.toLocaleString()} followers
                        </span>
                      </div>
                      <p style={{ margin: 0, fontSize: '14px', color: tokens.textPrimary, lineHeight: 1.5 }}>
                        {tweet.text}
                      </p>
                    </div>

                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px', marginBottom: '12px' }}>
                      <span style={{ fontSize: '12px', color: tokens.textSecondary }}>Matches:</span>
                      {tweet.matchedFacts?.map((factId: string) => (
                        <span
                          key={factId}
                          style={{
                            padding: '2px 8px',
                            backgroundColor: '#E0F2FE',
                            color: '#0369A1',
                            borderRadius: '4px',
                            fontSize: '11px',
                            fontWeight: 500,
                          }}
                        >
                          Fact {factId}
                        </span>
                      ))}
                    </div>

                    <p style={{ margin: 0, fontSize: '13px', color: tokens.textSecondary, fontStyle: 'italic' }}>
                      {tweet.dokRationale}
                    </p>

                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '12px' }}>
                      <div style={{ display: 'flex', gap: '16px', fontSize: '12px', color: tokens.textMuted }}>
                        <span>{tweet.likes} likes</span>
                        <span>{tweet.retweets} retweets</span>
                        <span>{tweet.replies} replies</span>
                      </div>

                      <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                        {tweetFeedbackState[tweet.id] ? (
                          <span
                            data-testid={`status-tweet-decision-${tweet.id}`}
                            style={{
                              display: 'flex',
                              alignItems: 'center',
                              gap: '4px',
                              padding: '4px 10px',
                              borderRadius: '12px',
                              fontSize: '11px',
                              fontWeight: 600,
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
                              style={{
                                display: 'flex',
                                alignItems: 'center',
                                gap: '4px',
                                padding: '6px 12px',
                                borderRadius: '6px',
                                fontSize: '12px',
                                fontWeight: 500,
                                backgroundColor: '#D1FAE5',
                                color: '#047857',
                                border: 'none',
                                cursor: 'pointer',
                                transition: 'filter 0.15s',
                              }}
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
                              style={{
                                display: 'flex',
                                alignItems: 'center',
                                gap: '4px',
                                padding: '6px 12px',
                                borderRadius: '6px',
                                fontSize: '12px',
                                fontWeight: 500,
                                backgroundColor: '#FEE2E2',
                                color: '#DC2626',
                                border: 'none',
                                cursor: 'pointer',
                                transition: 'filter 0.15s',
                              }}
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
          <div key={category.id} style={{ marginBottom: '40px' }}>
            {/* Category Header */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '8px' }}>
              <h3 style={{
                fontSize: '18px',
                fontWeight: 600,
                margin: 0,
                color: tokens.textPrimary
              }}>
                {category.name}
              </h3>
              <span style={{
                background: '#F3F4F6',
                color: '#6B7280',
                fontSize: '12px',
                padding: '4px 10px',
                borderRadius: '12px',
              }}>
                {category.items.length} source{category.items.length !== 1 ? 's' : ''}
              </span>
            </div>
            <p style={{
              fontSize: '13px',
              color: '#6B7280',
              margin: '0 0 16px 0',
            }}>
              Relates to Facts: <span style={{ color: '#0D9488', fontWeight: 500 }}>{category.facts}</span>
            </p>

            {/* Source Cards */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
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
                    style={{
                      background: 'white',
                      border: `1px solid ${tokens.border}`,
                      borderRadius: '12px',
                      padding: '20px',
                      transition: 'all 0.2s ease',
                    }}
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
                    <div style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: '12px',
                      marginBottom: '12px',
                      flexWrap: 'wrap',
                    }}>
                      <span style={{
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: '4px',
                        padding: '4px 10px',
                        borderRadius: '6px',
                        fontSize: '11px',
                        fontWeight: 600,
                        textTransform: 'uppercase',
                        letterSpacing: '0.3px',
                        background: itemTypeStyle.bg,
                        color: itemTypeStyle.color,
                      }}>
                        {itemTypeStyle.icon}
                      </span>
                      <span style={{ fontSize: '13px', color: '#6B7280' }}>
                        <span style={{ fontWeight: 500, color: '#374151' }}>{item.author}</span>
                        <span style={{ margin: '0 6px', color: '#D1D5DB' }}>•</span>
                        {item.type}
                      </span>
                      <span style={{
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: '4px',
                        fontSize: '12px',
                        color: '#6B7280',
                        background: '#F3F4F6',
                        padding: '2px 8px',
                        borderRadius: '4px',
                      }}>
                        <Clock size={12} /> ~{item.time}
                      </span>
                      {graded && (
                        <span style={{
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: '4px',
                          fontSize: '11px',
                          fontWeight: 600,
                          color: tokens.success,
                          background: '#D1FAE5',
                          padding: '2px 8px',
                          borderRadius: '4px',
                        }}>
                          <Check size={12} /> Graded
                        </span>
                      )}
                    </div>

                    {/* Source Title */}
                    <h4 style={{
                      fontSize: '16px',
                      fontWeight: 600,
                      color: '#111827',
                      margin: '0 0 8px 0',
                      lineHeight: 1.4,
                    }}>
                      {item.topic}
                    </h4>

                    {/* Source Description */}
                    <p style={{
                      fontSize: '14px',
                      color: '#4B5563',
                      lineHeight: 1.6,
                      margin: '0 0 16px 0',
                    }}>
                      <strong style={{ color: '#374151' }}>Why this matters:</strong>{' '}
                      {item.facts.length > 150 ? item.facts.substring(0, 150) + '...' : item.facts}
                    </p>

                    {/* Source Footer */}
                    <div style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      flexWrap: 'wrap',
                      gap: '12px',
                    }}>
                      {/* Fact Links */}
                      <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap' }}>
                        <span style={{ fontSize: '12px', color: '#6B7280' }}>Facts:</span>
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
                            style={{
                              background: '#F0FDFA',
                              color: '#0D9488',
                              border: '1px solid #99F6E4',
                              padding: '2px 8px',
                              borderRadius: '4px',
                              fontSize: '12px',
                              fontWeight: 500,
                              cursor: 'pointer',
                            }}
                          >
                            {factId}
                          </button>
                        ))}
                      </div>

                      {/* Action Buttons */}
                      <div style={{ display: 'flex', gap: '8px' }}>
                        <a
                          href={item.url}
                          target="_blank"
                          rel="noopener noreferrer"
                          data-testid={`link-reading-${item.id}`}
                          style={{
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: '6px',
                            padding: '8px 16px',
                            backgroundColor: tokens.primary,
                            color: 'white',
                            borderRadius: '8px',
                            fontSize: '13px',
                            fontWeight: 500,
                            textDecoration: 'none',
                          }}
                        >
                          Open source <ExternalLink size={12} />
                        </a>
                        {!isSharedView && (
                          <button
                            onClick={() => toggleExpand(item.id)}
                            data-testid={`button-grade-toggle-${item.id}`}
                            style={{
                              display: 'inline-flex',
                              alignItems: 'center',
                              gap: '6px',
                              padding: '8px 16px',
                              background: 'white',
                              color: '#374151',
                              border: `1px solid ${tokens.border}`,
                              borderRadius: '8px',
                              fontSize: '13px',
                              fontWeight: 500,
                              cursor: 'pointer',
                            }}
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

                      const pillBase = {
                        padding: '6px 14px',
                        background: 'white',
                        border: '1px solid #D1D5DB',
                        borderRadius: '20px',
                        fontSize: '13px',
                        fontWeight: 500,
                        color: '#374151',
                        cursor: 'pointer',
                      };

                      const pillSelected = {
                        ...pillBase,
                        background: '#0D9488',
                        borderColor: '#0D9488',
                        color: 'white',
                      };

                      const getQualityPillStyle = (val: number, selected: boolean) => {
                        if (!selected) return pillBase;
                        const colors: Record<number, string> = {
                          5: '#10B981', 4: '#0D9488', 3: '#EAB308', 2: '#F97316', 1: '#EF4444'
                        };
                        return { ...pillBase, background: colors[val], borderColor: colors[val], color: 'white' };
                      };

                      return (
                        <div style={{
                          background: '#F9FAFB',
                          borderTop: `1px solid ${tokens.border}`,
                          borderRadius: '0 0 12px 12px',
                          padding: '20px',
                          margin: '16px -20px -20px -20px',
                        }}>
                          {/* Aligns? */}
                          <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '12px' }}>
                            <span style={{ fontSize: '13px', fontWeight: 600, color: '#6B7280', minWidth: '90px' }}>Aligns?</span>
                            <div style={{ display: 'flex', gap: '6px' }}>
                              {['yes', 'partial', 'no'].map(val => (
                                <button
                                  key={val}
                                  onClick={() => handleGradeChange(item.id, 'aligns', val)}
                                  data-testid={`pill-aligns-${val}-${item.id}`}
                                  style={currentAligns === val ? pillSelected : pillBase}
                                >
                                  {val === 'yes' ? 'Yes' : val === 'partial' ? 'Partial' : 'No'}
                                </button>
                              ))}
                            </div>
                          </div>

                          {/* Contradicts? */}
                          <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '12px' }}>
                            <span style={{ fontSize: '13px', fontWeight: 600, color: '#6B7280', minWidth: '90px' }}>Contradicts?</span>
                            <div style={{ display: 'flex', gap: '6px' }}>
                              {['no', 'yes'].map(val => (
                                <button
                                  key={val}
                                  onClick={() => handleGradeChange(item.id, 'contradicts', val)}
                                  data-testid={`pill-contradicts-${val}-${item.id}`}
                                  style={currentContradicts === val ? pillSelected : pillBase}
                                >
                                  {val === 'no' ? 'None' : 'Yes'}
                                </button>
                              ))}
                            </div>
                          </div>

                          {/* New Info? */}
                          <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '12px' }}>
                            <span style={{ fontSize: '13px', fontWeight: 600, color: '#6B7280', minWidth: '90px' }}>New info?</span>
                            <div style={{ display: 'flex', gap: '6px' }}>
                              {['yes', 'no'].map(val => (
                                <button
                                  key={val}
                                  onClick={() => handleGradeChange(item.id, 'newInfo', val)}
                                  data-testid={`pill-newinfo-${val}-${item.id}`}
                                  style={currentNewInfo === val ? pillSelected : pillBase}
                                >
                                  {val === 'yes' ? 'Yes' : 'No'}
                                </button>
                              ))}
                            </div>
                          </div>

                          {/* Quality */}
                          <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '16px' }}>
                            <span style={{ fontSize: '13px', fontWeight: 600, color: '#6B7280', minWidth: '90px' }}>Quality</span>
                            <div style={{ display: 'flex', gap: '6px' }}>
                              {[1, 2, 3, 4, 5].map(val => (
                                <button
                                  key={val}
                                  onClick={() => handleGradeChange(item.id, 'quality', val)}
                                  data-testid={`pill-quality-${val}-${item.id}`}
                                  style={getQualityPillStyle(val, currentQuality === val)}
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
                            style={{
                              width: '100%',
                              padding: '10px 24px',
                              background: '#0D9488',
                              color: 'white',
                              border: 'none',
                              borderRadius: '8px',
                              cursor: 'pointer',
                              fontSize: '14px',
                              fontWeight: 600,
                              opacity: saveGradeMutation.isPending ? 0.7 : 1,
                            }}
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
