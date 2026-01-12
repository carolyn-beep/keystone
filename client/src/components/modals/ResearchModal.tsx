import { useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import { X, Search, Loader2, Plus, ThumbsUp, ThumbsDown, Users } from 'lucide-react';
import { tokens } from '@/lib/colors';
import { useResearch } from '@/hooks/useResearch';
import { queryClient, apiRequest } from '@/lib/queryClient';

const getTypeColor = (type: string) => {
  if (type === 'Twitter') return tokens.info;
  if (type === 'Substack') return tokens.warning;
  if (type === 'Blog') return tokens.secondary;
  return tokens.info;
};

interface ResearchResource {
  type: string;
  author: string;
  title?: string;
  topic?: string;
  time: string;
  summary?: string;
  relevance?: string;
  url: string;
}

interface ResearchResults {
  searchSummary: string;
  resources?: ResearchResource[];
  suggestedResearchers?: Array<{
    name: string;
    affiliation: string;
    focus: string;
    similarTo: string;
  }>;
}

interface ResearchModalProps {
  show: boolean;
  onClose: () => void;
  slug: string;
}

export function ResearchModal({
  show,
  onClose,
  slug,
}: ResearchModalProps) {
  const [mode, setMode] = useState<'quick' | 'deep'>('quick');
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<ResearchResults | null>(null);
  const [feedbackState, setFeedbackState] = useState<Record<string, 'accepted' | 'rejected'>>({});

  const { researchMutation } = useResearch(slug, {
    onResearchSuccess: (resData) => {
      setResults(resData);
    },
    onTweetSearchSuccess: () => {},
    onTweetSearchError: () => {},
  });

  const addResourceMutation = useMutation({
    mutationFn: async (resource: ResearchResource) => {
      return apiRequest('POST', `/api/brainlifts/${slug}/reading-list`, {
        type: resource.type,
        author: resource.author,
        topic: resource.title || resource.topic || '',
        time: resource.time,
        facts: resource.summary || resource.relevance || '',
        url: resource.url,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['brainlift', slug] });
    }
  });

  const feedbackMutation = useMutation({
    mutationFn: async (feedback: { url: string; decision: 'accepted' | 'rejected'; resource: ResearchResource }) => {
      const res = await fetch(`/api/brainlifts/${slug}/feedback`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sourceId: feedback.url,
          sourceType: 'research',
          title: feedback.resource.title || feedback.resource.topic || '',
          snippet: feedback.resource.summary || '',
          url: feedback.url,
          decision: feedback.decision,
        }),
      });
      if (!res.ok) throw new Error('Failed to save feedback');
      return { url: feedback.url, decision: feedback.decision };
    },
    onSuccess: (data) => {
      setFeedbackState(prev => ({ ...prev, [data.url]: data.decision }));
    }
  });

  const onAccept = (resource: ResearchResource) => {
    feedbackMutation.mutate({ url: resource.url, decision: 'accepted', resource });
  };

  const onReject = (resource: ResearchResource) => {
    feedbackMutation.mutate({ url: resource.url, decision: 'rejected', resource });
  };

  const isSavingFeedback = feedbackMutation.isPending;

  const handleClose = () => {
    setResults(null);
    setQuery('');
    onClose();
  };

  if (!show) return null;

  return (
    <div style={{
      position: 'fixed',
      top: 0,
      left: 0,
      right: 0,
      bottom: 0,
      backgroundColor: tokens.overlay,
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      zIndex: 1000,
    }}>
      <div
        className="p-4 sm:p-8 w-[95%] max-w-[700px] max-h-[90vh] overflow-auto rounded-xl"
        style={{ backgroundColor: tokens.surface }}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px' }}>
          <h2 style={{ fontSize: '20px', fontWeight: 700, margin: 0, color: tokens.primary }}>
            <Search size={20} style={{ marginRight: '8px', verticalAlign: 'middle' }} />
            Find New Resources
          </h2>
          <button
            data-testid="button-close-research-modal"
            onClick={handleClose}
            style={{ background: 'none', border: 'none', cursor: 'pointer', padding: '4px' }}
          >
            <X size={20} />
          </button>
        </div>

        <p style={{ color: tokens.textSecondary, fontSize: '14px', marginBottom: '20px' }}>
          Search the web for Substacks, Twitter threads, academic papers, and other resources related to this brainlift.
        </p>

        <div style={{ marginBottom: '20px' }}>
          <label style={{ display: 'block', marginBottom: '8px', fontWeight: 500, fontSize: '14px' }}>Research Mode</label>
          <div style={{ display: 'flex', gap: '12px' }}>
            <button
              data-testid="button-research-quick"
              onClick={() => setMode('quick')}
              style={{
                flex: 1,
                padding: '12px 16px',
                borderRadius: '8px',
                border: mode === 'quick' ? `2px solid ${tokens.secondary}` : `1px solid ${tokens.border}`,
                backgroundColor: mode === 'quick' ? tokens.secondary + '10' : tokens.surface,
                cursor: 'pointer',
                textAlign: 'left',
              }}
            >
              <p style={{ margin: 0, fontWeight: 600, color: tokens.textPrimary }}>Quick Search</p>
              <p style={{ margin: '4px 0 0', fontSize: '13px', color: tokens.textSecondary }}>Find popular resources fast</p>
            </button>
            <button
              data-testid="button-research-deep"
              onClick={() => setMode('deep')}
              style={{
                flex: 1,
                padding: '12px 16px',
                borderRadius: '8px',
                border: mode === 'deep' ? `2px solid ${tokens.secondary}` : `1px solid ${tokens.border}`,
                backgroundColor: mode === 'deep' ? tokens.secondary + '10' : tokens.surface,
                cursor: 'pointer',
                textAlign: 'left',
              }}
            >
              <p style={{ margin: 0, fontWeight: 600, color: tokens.textPrimary }}>Deep Research</p>
              <p style={{ margin: '4px 0 0', fontSize: '13px', color: tokens.textSecondary }}>Academic papers & expert analysis</p>
            </button>
          </div>
        </div>

        {mode === 'deep' && (
          <div style={{ marginBottom: '20px' }}>
            <label style={{ display: 'block', marginBottom: '8px', fontWeight: 500, fontSize: '14px' }}>
              Specific Research Focus (optional)
            </label>
            <input
              data-testid="input-research-query"
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="e.g., 'studies on phonics instruction' or 'counter-arguments to direct instruction'"
              style={{
                width: '100%',
                padding: '10px 12px',
                borderRadius: '6px',
                border: `1px solid ${tokens.border}`,
                fontSize: '14px',
              }}
            />
          </div>
        )}

        <button
          data-testid="button-start-research"
          onClick={() => researchMutation.mutate({ mode, query: query || undefined })}
          disabled={researchMutation.isPending}
          style={{
            width: '100%',
            padding: '14px 20px',
            backgroundColor: tokens.secondary,
            color: tokens.surface,
            border: 'none',
            borderRadius: '8px',
            cursor: researchMutation.isPending ? 'wait' : 'pointer',
            fontSize: '15px',
            fontWeight: 600,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: '8px',
            opacity: researchMutation.isPending ? 0.7 : 1,
          }}
        >
          {researchMutation.isPending ? (
            <>
              <Loader2 size={18} style={{ animation: 'spin 1s linear infinite' }} />
              Searching the web...
            </>
          ) : (
            <>
              <Search size={18} />
              Search for Resources
            </>
          )}
        </button>

        {researchMutation.isError && (
          <div style={{ marginTop: '16px', padding: '12px', backgroundColor: tokens.dangerSoft, borderRadius: '8px', color: tokens.danger, fontSize: '14px' }}>
            {(researchMutation.error as Error).message}
          </div>
        )}

        {results && (
          <div style={{ marginTop: '24px' }}>
            <div style={{
              padding: '16px',
              backgroundColor: tokens.secondary + '10',
              borderRadius: '8px',
              marginBottom: '20px',
              borderLeft: `4px solid ${tokens.secondary}`,
            }}>
              <p style={{ margin: 0, fontSize: '14px', color: tokens.textPrimary }}>
                <strong>Summary:</strong> {results.searchSummary}
              </p>
            </div>

            <h3 style={{ fontSize: '16px', fontWeight: 600, marginBottom: '16px', color: tokens.primary }}>
              Found {results.resources?.length || 0} Resources
            </h3>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
              {results.resources?.map((resource, index) => (
                <div
                  key={index}
                  style={{
                    border: `1px solid ${tokens.border}`,
                    borderRadius: '8px',
                    padding: '16px',
                    backgroundColor: tokens.surface,
                  }}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '12px' }}>
                    <div style={{ flex: 1 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '8px' }}>
                        <span style={{
                          padding: '4px 10px',
                          backgroundColor: getTypeColor(resource.type) + '15',
                          color: getTypeColor(resource.type),
                          borderRadius: '20px',
                          fontSize: '11px',
                          fontWeight: 600,
                        }}>{resource.type}</span>
                        <span style={{ color: tokens.textSecondary, fontSize: '12px' }}>{resource.time}</span>
                      </div>
                      <p style={{ margin: '0 0 4px', fontWeight: 600, fontSize: '15px', color: tokens.textPrimary }}>
                        {resource.title || resource.topic}
                      </p>
                      <p style={{ margin: '0 0 8px', fontSize: '13px', color: tokens.textSecondary }}>
                        by {resource.author}
                      </p>
                      <p style={{ margin: '0 0 8px', fontSize: '13px', color: tokens.textPrimary }}>
                        {resource.summary}
                      </p>
                      <a
                        href={resource.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        style={{ fontSize: '12px', color: tokens.info, textDecoration: 'none' }}
                      >
                        {resource.url}
                      </a>
                    </div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', alignItems: 'flex-end' }}>
                      <button
                        data-testid={`button-add-resource-${index}`}
                        onClick={() => addResourceMutation.mutate(resource)}
                        disabled={addResourceMutation.isPending}
                        style={{
                          padding: '8px 12px',
                          backgroundColor: tokens.success,
                          color: tokens.surface,
                          border: 'none',
                          borderRadius: '6px',
                          cursor: 'pointer',
                          fontSize: '13px',
                          fontWeight: 500,
                          display: 'flex',
                          alignItems: 'center',
                          gap: '4px',
                          whiteSpace: 'nowrap',
                        }}
                      >
                        <Plus size={14} />
                        Add
                      </button>

                      <div style={{ display: 'flex', gap: '6px' }}>
                        {feedbackState[resource.url] ? (
                          <span
                            data-testid={`status-resource-decision-${index}`}
                            style={{
                              display: 'flex',
                              alignItems: 'center',
                              gap: '4px',
                              padding: '4px 8px',
                              borderRadius: '8px',
                              fontSize: '10px',
                              fontWeight: 600,
                              backgroundColor: feedbackState[resource.url] === 'accepted' ? '#D1FAE5' : '#FEE2E2',
                              color: feedbackState[resource.url] === 'accepted' ? '#047857' : '#DC2626',
                            }}
                          >
                            {feedbackState[resource.url] === 'accepted' ? (
                              <><ThumbsUp size={10} /> Accepted</>
                            ) : (
                              <><ThumbsDown size={10} /> Rejected</>
                            )}
                          </span>
                        ) : (
                          <>
                            <button
                              data-testid={`button-resource-accept-${index}`}
                              onClick={() => onAccept(resource)}
                              disabled={isSavingFeedback}
                              style={{
                                display: 'flex',
                                alignItems: 'center',
                                gap: '3px',
                                padding: '4px 8px',
                                borderRadius: '4px',
                                fontSize: '10px',
                                fontWeight: 500,
                                backgroundColor: '#D1FAE5',
                                color: '#047857',
                                border: 'none',
                                cursor: 'pointer',
                              }}
                            >
                              <ThumbsUp size={10} />
                            </button>
                            <button
                              data-testid={`button-resource-reject-${index}`}
                              onClick={() => onReject(resource)}
                              disabled={isSavingFeedback}
                              style={{
                                display: 'flex',
                                alignItems: 'center',
                                gap: '3px',
                                padding: '4px 8px',
                                borderRadius: '4px',
                                fontSize: '10px',
                                fontWeight: 500,
                                backgroundColor: '#FEE2E2',
                                color: '#DC2626',
                                border: 'none',
                                cursor: 'pointer',
                              }}
                            >
                              <ThumbsDown size={10} />
                            </button>
                          </>
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>

            {results.suggestedResearchers && results.suggestedResearchers.length > 0 && (
              <div style={{ marginTop: '24px' }}>
                <h3 style={{
                  fontSize: '16px',
                  fontWeight: 600,
                  marginBottom: '16px',
                  color: tokens.secondary,
                  display: 'flex',
                  alignItems: 'center',
                  gap: '8px',
                }}>
                  <Users size={18} />
                  Similar Researchers to Explore
                </h3>
                <div style={{
                  display: 'grid',
                  gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))',
                  gap: '12px'
                }}>
                  {results.suggestedResearchers.map((researcher, idx) => (
                    <div
                      key={idx}
                      data-testid={`card-suggested-researcher-${idx}`}
                      style={{
                        padding: '14px',
                        borderRadius: '8px',
                        backgroundColor: tokens.surface,
                        border: `1px solid ${tokens.border}`,
                      }}
                    >
                      <p style={{
                        margin: '0 0 4px',
                        fontWeight: 600,
                        fontSize: '14px',
                        color: tokens.textPrimary
                      }}>
                        {researcher.name}
                      </p>
                      <p style={{
                        margin: '0 0 6px',
                        fontSize: '12px',
                        color: tokens.textSecondary
                      }}>
                        {researcher.affiliation}
                      </p>
                      <p style={{
                        margin: '0 0 8px',
                        fontSize: '12px',
                        color: tokens.textPrimary,
                        fontStyle: 'italic',
                      }}>
                        {researcher.focus}
                      </p>
                      <p style={{
                        margin: 0,
                        fontSize: '11px',
                        color: tokens.textSecondary,
                        padding: '6px 8px',
                        backgroundColor: tokens.secondary + '10',
                        borderRadius: '4px',
                      }}>
                        Similar to: {researcher.similarTo}
                      </p>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
