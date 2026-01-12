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
    <div
      className="fixed inset-0 flex items-center justify-center z-[1000]"
      style={{ backgroundColor: tokens.overlay }}
    >
      <div
        className="p-4 sm:p-8 w-[95%] max-w-[700px] max-h-[90vh] overflow-auto rounded-xl"
        style={{ backgroundColor: tokens.surface }}
      >
        <div className="flex justify-between items-center mb-6">
          <h2 className="text-xl font-bold m-0" style={{ color: tokens.primary }}>
            <Search size={20} className="mr-2 align-middle inline" />
            Find New Resources
          </h2>
          <button
            data-testid="button-close-research-modal"
            onClick={handleClose}
            className="bg-none border-none cursor-pointer p-1"
          >
            <X size={20} />
          </button>
        </div>

        <p className="text-sm mb-5" style={{ color: tokens.textSecondary }}>
          Search the web for Substacks, Twitter threads, academic papers, and other resources related to this brainlift.
        </p>

        <div className="mb-5">
          <label className="block mb-2 font-medium text-sm">Research Mode</label>
          <div className="flex gap-3">
            <button
              data-testid="button-research-quick"
              onClick={() => setMode('quick')}
              className="flex-1 px-4 py-3 rounded-lg cursor-pointer text-left"
              style={{
                border: mode === 'quick' ? `2px solid ${tokens.secondary}` : `1px solid ${tokens.border}`,
                backgroundColor: mode === 'quick' ? tokens.secondary + '10' : tokens.surface,
              }}
            >
              <p className="m-0 font-semibold" style={{ color: tokens.textPrimary }}>Quick Search</p>
              <p className="mt-1 text-[13px]" style={{ color: tokens.textSecondary }}>Find popular resources fast</p>
            </button>
            <button
              data-testid="button-research-deep"
              onClick={() => setMode('deep')}
              className="flex-1 px-4 py-3 rounded-lg cursor-pointer text-left"
              style={{
                border: mode === 'deep' ? `2px solid ${tokens.secondary}` : `1px solid ${tokens.border}`,
                backgroundColor: mode === 'deep' ? tokens.secondary + '10' : tokens.surface,
              }}
            >
              <p className="m-0 font-semibold" style={{ color: tokens.textPrimary }}>Deep Research</p>
              <p className="mt-1 text-[13px]" style={{ color: tokens.textSecondary }}>Academic papers & expert analysis</p>
            </button>
          </div>
        </div>

        {mode === 'deep' && (
          <div className="mb-5">
            <label className="block mb-2 font-medium text-sm">
              Specific Research Focus (optional)
            </label>
            <input
              data-testid="input-research-query"
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="e.g., 'studies on phonics instruction' or 'counter-arguments to direct instruction'"
              className="w-full px-3 py-2.5 rounded-md text-sm"
              style={{
                border: `1px solid ${tokens.border}`,
              }}
            />
          </div>
        )}

        <button
          data-testid="button-start-research"
          onClick={() => researchMutation.mutate({ mode, query: query || undefined })}
          disabled={researchMutation.isPending}
          className="w-full px-5 py-3.5 border-none rounded-lg text-[15px] font-semibold flex items-center justify-center gap-2"
          style={{
            backgroundColor: tokens.secondary,
            color: tokens.surface,
            cursor: researchMutation.isPending ? 'wait' : 'pointer',
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
          <div className="mt-4 p-3 rounded-lg text-sm" style={{ backgroundColor: tokens.dangerSoft, color: tokens.danger }}>
            {(researchMutation.error as Error).message}
          </div>
        )}

        {results && (
          <div className="mt-6">
            <div
              className="p-4 rounded-lg mb-5"
              style={{
                backgroundColor: tokens.secondary + '10',
                borderLeft: `4px solid ${tokens.secondary}`,
              }}
            >
              <p className="m-0 text-sm" style={{ color: tokens.textPrimary }}>
                <strong>Summary:</strong> {results.searchSummary}
              </p>
            </div>

            <h3 className="text-base font-semibold mb-4" style={{ color: tokens.primary }}>
              Found {results.resources?.length || 0} Resources
            </h3>

            <div className="flex flex-col gap-3">
              {results.resources?.map((resource, index) => (
                <div
                  key={index}
                  className="rounded-lg p-4"
                  style={{
                    border: `1px solid ${tokens.border}`,
                    backgroundColor: tokens.surface,
                  }}
                >
                  <div className="flex justify-between items-start gap-3">
                    <div className="flex-1">
                      <div className="flex items-center gap-2 mb-2">
                        <span
                          className="px-2.5 py-1 rounded-full text-[11px] font-semibold"
                          style={{
                            backgroundColor: getTypeColor(resource.type) + '15',
                            color: getTypeColor(resource.type),
                          }}
                        >{resource.type}</span>
                        <span className="text-xs" style={{ color: tokens.textSecondary }}>{resource.time}</span>
                      </div>
                      <p className="m-0 mb-1 font-semibold text-[15px]" style={{ color: tokens.textPrimary }}>
                        {resource.title || resource.topic}
                      </p>
                      <p className="m-0 mb-2 text-[13px]" style={{ color: tokens.textSecondary }}>
                        by {resource.author}
                      </p>
                      <p className="m-0 mb-2 text-[13px]" style={{ color: tokens.textPrimary }}>
                        {resource.summary}
                      </p>
                      <a
                        href={resource.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-xs no-underline"
                        style={{ color: tokens.info }}
                      >
                        {resource.url}
                      </a>
                    </div>
                    <div className="flex flex-col gap-2 items-end">
                      <button
                        data-testid={`button-add-resource-${index}`}
                        onClick={() => addResourceMutation.mutate(resource)}
                        disabled={addResourceMutation.isPending}
                        className="px-3 py-2 border-none rounded-md cursor-pointer text-[13px] font-medium flex items-center gap-1 whitespace-nowrap"
                        style={{
                          backgroundColor: tokens.success,
                          color: tokens.surface,
                        }}
                      >
                        <Plus size={14} />
                        Add
                      </button>

                      <div className="flex gap-1.5">
                        {feedbackState[resource.url] ? (
                          <span
                            data-testid={`status-resource-decision-${index}`}
                            className="flex items-center gap-1 px-2 py-1 rounded-lg text-[10px] font-semibold"
                            style={{
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
                              className="flex items-center gap-0.5 px-2 py-1 rounded text-[10px] font-medium border-none cursor-pointer"
                              style={{
                                backgroundColor: '#D1FAE5',
                                color: '#047857',
                              }}
                            >
                              <ThumbsUp size={10} />
                            </button>
                            <button
                              data-testid={`button-resource-reject-${index}`}
                              onClick={() => onReject(resource)}
                              disabled={isSavingFeedback}
                              className="flex items-center gap-0.5 px-2 py-1 rounded text-[10px] font-medium border-none cursor-pointer"
                              style={{
                                backgroundColor: '#FEE2E2',
                                color: '#DC2626',
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
              <div className="mt-6">
                <h3
                  className="text-base font-semibold mb-4 flex items-center gap-2"
                  style={{ color: tokens.secondary }}
                >
                  <Users size={18} />
                  Similar Researchers to Explore
                </h3>
                <div className="grid grid-cols-[repeat(auto-fill,minmax(280px,1fr))] gap-3">
                  {results.suggestedResearchers.map((researcher, idx) => (
                    <div
                      key={idx}
                      data-testid={`card-suggested-researcher-${idx}`}
                      className="p-3.5 rounded-lg"
                      style={{
                        backgroundColor: tokens.surface,
                        border: `1px solid ${tokens.border}`,
                      }}
                    >
                      <p
                        className="m-0 mb-1 font-semibold text-sm"
                        style={{ color: tokens.textPrimary }}
                      >
                        {researcher.name}
                      </p>
                      <p
                        className="m-0 mb-1.5 text-xs"
                        style={{ color: tokens.textSecondary }}
                      >
                        {researcher.affiliation}
                      </p>
                      <p
                        className="m-0 mb-2 text-xs italic"
                        style={{ color: tokens.textPrimary }}
                      >
                        {researcher.focus}
                      </p>
                      <p
                        className="m-0 text-[11px] px-2 py-1.5 rounded"
                        style={{
                          color: tokens.textSecondary,
                          backgroundColor: tokens.secondary + '10',
                        }}
                      >
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
