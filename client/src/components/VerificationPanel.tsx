import { useState } from 'react';
import { useQuery, useMutation } from '@tanstack/react-query';
import { queryClient, apiRequest } from '@/lib/queryClient';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { CheckCircle, AlertCircle, Clock, ChevronDown, ChevronRight, User, Bot, RefreshCw } from 'lucide-react';
import { tokens, getScoreChipColors } from '@/lib/colors';

interface ModelScore {
  id: number;
  model: string;
  score: number | null;
  rationale: string | null;
  status: string;
  error: string | null;
}

interface Verification {
  id: number;
  factId: number;
  status: string;
  evidenceUrl: string | null;
  evidenceContent: string | null;
  consensusScore: number | null;
  confidenceLevel: string | null;
  needsReview: boolean;
  verificationNotes: string | null;
  humanOverrideScore: number | null;
  humanOverrideNotes: string | null;
  modelScores: ModelScore[];
}

interface FactWithVerification {
  id: number;
  originalId: string;
  fact: string;
  source: string | null;
  score: number;
  verification?: Verification;
}

interface VerificationSummary {
  totalFacts: number;
  verified: number;
  pending: number;
  inProgress: number;
  needsReview: number;
  byScore: Record<number, number>;
  averageConsensus: number;
  highConfidence: number;
  mediumConfidence: number;
  lowConfidence: number;
}

const MODEL_DISPLAY_NAMES: Record<string, string> = {
  'anthropic/claude-opus-4.5': 'Claude Opus 4.5',
  'google/gemini-2.5-pro': 'Gemini 2.5 Pro',
  'openai/gpt-5.2': 'ChatGPT 5.2',
  'qwen/qwen3-max': 'Qwen3-Max',
  'deepseek/deepseek-v3.2': 'DeepSeek V3.2',
};

const MODEL_COLORS: Record<string, string> = {
  'anthropic/claude-opus-4.5': '#E56B6F',
  'google/gemini-2.5-pro': '#4285F4',
  'openai/gpt-5.2': '#10A37F',
  'qwen/qwen3-max': '#6366F1',
  'deepseek/deepseek-v3.2': '#8B5CF6',
};

interface VerificationPanelProps {
  slug: string;
}

export function VerificationPanel({ slug }: VerificationPanelProps) {
  const [expandedFacts, setExpandedFacts] = useState<Record<number, boolean>>({});
  const [overrideData, setOverrideData] = useState<Record<number, { score: number; notes: string }>>({});

  const { data: verificationData, isLoading: loadingVerifications, refetch } = useQuery<{
    brainliftId: number;
    facts: FactWithVerification[];
    models: Record<string, string>;
  }>({
    queryKey: ['/api/brainlifts', slug, 'verifications'],
  });

  const { data: summary, refetch: refetchSummary } = useQuery<VerificationSummary>({
    queryKey: ['/api/brainlifts', slug, 'verification-summary'],
  });

  const verifyAllMutation = useMutation({
    mutationFn: async () => {
      return apiRequest('POST', `/api/brainlifts/${slug}/verify-all`);
    },
    onSuccess: () => {
      setTimeout(() => {
        refetch();
        refetchSummary();
      }, 2000);
    },
  });

  const verifyFactMutation = useMutation({
    mutationFn: async (factId: number) => {
      return apiRequest('POST', `/api/facts/${factId}/verify`);
    },
    onSuccess: () => {
      // Poll for updates every 2 seconds until verification completes
      const pollInterval = setInterval(() => {
        refetch();
        refetchSummary();
      }, 2000);
      
      // Stop polling after 60 seconds max
      setTimeout(() => clearInterval(pollInterval), 60000);
      
      // Initial refetch
      refetch();
      refetchSummary();
    },
  });

  const overrideMutation = useMutation({
    mutationFn: async ({ verificationId, score, notes }: { verificationId: number; score: number; notes: string }) => {
      return apiRequest('POST', `/api/verifications/${verificationId}/override`, { score, notes });
    },
    onSuccess: () => {
      refetch();
      refetchSummary();
    },
  });

  const facts = verificationData?.facts || [];

  const getStatusIcon = (status: string, needsReview: boolean) => {
    if (status === 'completed' && !needsReview) {
      return <CheckCircle size={16} style={{ color: tokens.success }} />;
    } else if (status === 'completed' && needsReview) {
      return <AlertCircle size={16} style={{ color: tokens.warning }} />;
    } else if (status === 'in_progress') {
      return <RefreshCw size={16} style={{ color: tokens.info }} className="animate-spin" />;
    }
    return <Clock size={16} style={{ color: tokens.textSecondary }} />;
  };

  const getConfidenceBadge = (level: string | null) => {
    if (level === 'high') return <Badge variant="outline" style={{ borderColor: tokens.success, color: tokens.success }}>High Confidence</Badge>;
    if (level === 'medium') return <Badge variant="outline" style={{ borderColor: tokens.warning, color: tokens.warning }}>Medium Confidence</Badge>;
    return <Badge variant="outline" style={{ borderColor: tokens.danger, color: tokens.danger }}>Low Confidence</Badge>;
  };

  const toggleFact = (factId: number) => {
    setExpandedFacts(prev => ({ ...prev, [factId]: !prev[factId] }));
  };

  if (loadingVerifications) {
    return <div style={{ padding: '40px', textAlign: 'center', color: tokens.textSecondary }}>Loading verification data...</div>;
  }

  return (
    <div>
      {summary && (
        <div className="grid grid-cols-2 sm:grid-cols-5 gap-4 mb-6">
          <Card>
            <CardContent className="p-4">
              <p style={{ color: tokens.textSecondary, fontSize: '12px', fontWeight: 500 }}>Total Facts</p>
              <p style={{ fontSize: '24px', fontWeight: 700, color: tokens.primary }}>{summary.totalFacts}</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4">
              <p style={{ color: tokens.textSecondary, fontSize: '12px', fontWeight: 500 }}>Verified</p>
              <p style={{ fontSize: '24px', fontWeight: 700, color: tokens.success }}>{summary.verified}</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4">
              <p style={{ color: tokens.textSecondary, fontSize: '12px', fontWeight: 500 }}>Needs Review</p>
              <p style={{ fontSize: '24px', fontWeight: 700, color: tokens.warning }}>{summary.needsReview}</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4">
              <p style={{ color: tokens.textSecondary, fontSize: '12px', fontWeight: 500 }}>Avg Consensus</p>
              <p style={{ fontSize: '24px', fontWeight: 700, color: tokens.info }}>{summary.averageConsensus}/5</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4">
              <p style={{ color: tokens.textSecondary, fontSize: '12px', fontWeight: 500 }}>Pending</p>
              <p style={{ fontSize: '24px', fontWeight: 700, color: tokens.textSecondary }}>{summary.pending}</p>
            </CardContent>
          </Card>
        </div>
      )}

      <div className="flex items-center justify-between gap-4 mb-4">
        <div>
          <h3 style={{ fontSize: '18px', fontWeight: 600, color: tokens.text }}>Multi-LLM Fact Verification</h3>
          <p style={{ fontSize: '13px', color: tokens.textSecondary, maxWidth: '600px' }}>
            Each fact is independently scored by 5 AI models (1-5 scale: 1=false, 5=verified). 
            The median score becomes the consensus. High disagreement flags facts for human review. 
            Click any fact to see individual model scores and override if needed.
          </p>
        </div>
        <div className="flex gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => { refetch(); refetchSummary(); }}
            data-testid="button-refresh-verifications"
          >
            <RefreshCw size={14} className="mr-1" /> Refresh
          </Button>
          <Button
            onClick={() => verifyAllMutation.mutate()}
            disabled={verifyAllMutation.isPending}
            data-testid="button-verify-all"
          >
            {verifyAllMutation.isPending ? 'Starting...' : 'Verify All Facts'}
          </Button>
        </div>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
        {facts.map((fact) => {
          const v = fact.verification;
          const isExpanded = expandedFacts[fact.id] || false;
          const finalScore = v?.humanOverrideScore || v?.consensusScore;
          const scoreColors = finalScore ? getScoreChipColors(finalScore) : null;

          return (
            <Card key={fact.id} data-testid={`verification-fact-${fact.originalId}`}>
              <Collapsible open={isExpanded} onOpenChange={() => toggleFact(fact.id)}>
                <CollapsibleTrigger asChild>
                  <div
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      padding: '12px 16px',
                      cursor: 'pointer',
                      gap: '12px',
                    }}
                    className="hover-elevate"
                  >
                    {isExpanded ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
                    
                    <span style={{ fontFamily: 'monospace', fontWeight: 600, color: tokens.primary, minWidth: '40px' }}>
                      {fact.originalId}
                    </span>

                    <span style={{ flex: 1, fontSize: '14px', color: tokens.text }}>
                      {fact.fact.slice(0, 100)}{fact.fact.length > 100 ? '...' : ''}
                    </span>

                    <div className="flex items-center gap-2">
                      {v ? (
                        <>
                          {getStatusIcon(v.status, v.needsReview)}
                          {finalScore && scoreColors && (
                            <Badge style={{ backgroundColor: scoreColors.bg, color: scoreColors.text }}>
                              {finalScore}/5
                            </Badge>
                          )}
                          {v.humanOverrideScore && (
                            <Badge variant="outline" style={{ borderColor: tokens.info, color: tokens.info }}>
                              <User size={12} className="mr-1" /> Override
                            </Badge>
                          )}
                        </>
                      ) : (
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={(e) => {
                            e.stopPropagation();
                            verifyFactMutation.mutate(fact.id);
                          }}
                          disabled={verifyFactMutation.isPending}
                          data-testid={`button-verify-${fact.originalId}`}
                        >
                          Verify
                        </Button>
                      )}
                    </div>
                  </div>
                </CollapsibleTrigger>

                <CollapsibleContent>
                  <div style={{ padding: '0 16px 16px 16px', borderTop: `1px solid ${tokens.border}` }}>
                    <div style={{ marginBottom: '16px', paddingTop: '16px' }}>
                      <p style={{ fontSize: '14px', color: tokens.text, marginBottom: '8px' }}>
                        <strong>Full Fact:</strong> {fact.fact}
                      </p>
                      {fact.source && (
                        <p style={{ fontSize: '13px', color: tokens.textSecondary }}>
                          <strong>Source:</strong> {fact.source}
                        </p>
                      )}
                    </div>

                    {v && (v.status === 'in_progress' || v.status === 'pending') && (
                      <div style={{ 
                        textAlign: 'center', 
                        padding: '32px',
                        backgroundColor: tokens.surface,
                        borderRadius: '8px',
                        marginBottom: '16px'
                      }}>
                        <RefreshCw size={32} className="animate-spin mx-auto mb-3" style={{ color: tokens.info }} />
                        <p style={{ fontWeight: 600, color: tokens.text, marginBottom: '4px' }}>Verification in progress...</p>
                        <p style={{ fontSize: '13px', color: tokens.textSecondary }}>
                          5 AI models are independently grading this fact. This typically takes 15-30 seconds.
                        </p>
                      </div>
                    )}

                    {v && v.status === 'completed' && (
                      <>
                        <div style={{ 
                          backgroundColor: tokens.surface, 
                          borderRadius: '8px', 
                          padding: '16px',
                          marginBottom: '16px'
                        }}>
                          <div className="flex items-center justify-between mb-3">
                            <h4 style={{ fontWeight: 600, color: tokens.text }}>Consensus Result</h4>
                            {v.confidenceLevel && getConfidenceBadge(v.confidenceLevel)}
                          </div>
                          
                          <div className="flex items-center gap-4 mb-3">
                            <div>
                              <p style={{ fontSize: '12px', color: tokens.textSecondary }}>Consensus Score</p>
                              <p style={{ fontSize: '28px', fontWeight: 700, color: tokens.primary }}>
                                {v.consensusScore}/5
                              </p>
                            </div>
                            {v.humanOverrideScore && (
                              <div style={{ 
                                padding: '8px 12px', 
                                backgroundColor: tokens.infoSoft, 
                                borderRadius: '8px' 
                              }}>
                                <p style={{ fontSize: '12px', color: tokens.info }}>Human Override</p>
                                <p style={{ fontSize: '20px', fontWeight: 700, color: tokens.info }}>
                                  {v.humanOverrideScore}/5
                                </p>
                              </div>
                            )}
                          </div>
                          
                          {v.verificationNotes && (
                            <p style={{ fontSize: '13px', color: tokens.textSecondary }}>
                              {v.verificationNotes}
                            </p>
                          )}
                        </div>

                        <div style={{ marginBottom: '16px' }}>
                          <h4 style={{ fontWeight: 600, color: tokens.text, marginBottom: '12px' }}>
                            Individual Model Grades
                          </h4>
                          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3">
                            {v.modelScores.map((ms) => {
                              const modelName = MODEL_DISPLAY_NAMES[ms.model] || ms.model;
                              const modelColor = MODEL_COLORS[ms.model] || tokens.primary;
                              const msScoreColors = ms.score ? getScoreChipColors(ms.score) : null;

                              return (
                                <div
                                  key={ms.id}
                                  style={{
                                    padding: '12px',
                                    borderRadius: '8px',
                                    backgroundColor: tokens.surface,
                                    border: `1px solid ${tokens.border}`,
                                  }}
                                >
                                  <div className="flex items-center gap-2 mb-2">
                                    <Bot size={14} style={{ color: modelColor }} />
                                    <span style={{ fontSize: '12px', fontWeight: 600, color: modelColor }}>
                                      {modelName}
                                    </span>
                                  </div>
                                  {ms.status === 'completed' && ms.score ? (
                                    <>
                                      <div style={{ 
                                        fontSize: '24px', 
                                        fontWeight: 700, 
                                        color: msScoreColors?.text || tokens.text,
                                        marginBottom: '4px'
                                      }}>
                                        {ms.score}/5
                                      </div>
                                      {ms.rationale && (
                                        <Tooltip>
                                          <TooltipTrigger asChild>
                                            <p style={{ 
                                              fontSize: '11px', 
                                              color: tokens.textSecondary, 
                                              lineHeight: 1.4,
                                              cursor: 'pointer',
                                            }}>
                                              {ms.rationale.slice(0, 100)}{ms.rationale.length > 100 ? '...' : ''}
                                            </p>
                                          </TooltipTrigger>
                                          <TooltipContent 
                                            side="bottom" 
                                            className="max-w-[300px]"
                                            style={{ 
                                              backgroundColor: tokens.bg, 
                                              color: tokens.text,
                                              border: `1px solid ${tokens.border}`,
                                              padding: '12px',
                                              fontSize: '12px',
                                              lineHeight: 1.5,
                                            }}
                                          >
                                            <p><strong>{modelName}</strong></p>
                                            <p style={{ marginTop: '8px' }}>{ms.rationale}</p>
                                          </TooltipContent>
                                        </Tooltip>
                                      )}
                                    </>
                                  ) : ms.status === 'failed' ? (
                                    <div style={{ fontSize: '12px', color: tokens.danger }}>
                                      Failed: {ms.error?.slice(0, 50)}
                                    </div>
                                  ) : (
                                    <div style={{ fontSize: '12px', color: tokens.textSecondary }}>
                                      Pending...
                                    </div>
                                  )}
                                </div>
                              );
                            })}
                          </div>
                        </div>

                        {v.needsReview && !v.humanOverrideScore && (
                          <div style={{ 
                            backgroundColor: tokens.warningSoft, 
                            borderRadius: '8px', 
                            padding: '16px',
                            marginTop: '16px'
                          }}>
                            <h4 style={{ fontWeight: 600, color: tokens.warning, marginBottom: '12px' }}>
                              Human Review Required
                            </h4>
                            <p style={{ fontSize: '13px', color: tokens.text, marginBottom: '12px' }}>
                              The AI models disagreed significantly. Please set a final score.
                            </p>
                            <div className="flex items-center gap-3">
                              <div className="flex gap-1">
                                {[1, 2, 3, 4, 5].map((score) => (
                                  <button
                                    key={score}
                                    onClick={() => setOverrideData(prev => ({
                                      ...prev,
                                      [v.id]: { ...prev[v.id], score, notes: prev[v.id]?.notes || '' }
                                    }))}
                                    style={{
                                      width: '36px',
                                      height: '36px',
                                      borderRadius: '8px',
                                      border: overrideData[v.id]?.score === score 
                                        ? `2px solid ${tokens.primary}` 
                                        : `1px solid ${tokens.border}`,
                                      backgroundColor: overrideData[v.id]?.score === score 
                                        ? tokens.primarySoft 
                                        : 'white',
                                      fontWeight: 600,
                                      color: tokens.text,
                                      cursor: 'pointer',
                                    }}
                                    data-testid={`button-override-score-${score}`}
                                  >
                                    {score}
                                  </button>
                                ))}
                              </div>
                              <input
                                type="text"
                                placeholder="Notes (optional)"
                                value={overrideData[v.id]?.notes || ''}
                                onChange={(e) => setOverrideData(prev => ({
                                  ...prev,
                                  [v.id]: { ...prev[v.id], score: prev[v.id]?.score || 0, notes: e.target.value }
                                }))}
                                style={{
                                  flex: 1,
                                  padding: '8px 12px',
                                  borderRadius: '8px',
                                  border: `1px solid ${tokens.border}`,
                                  fontSize: '14px',
                                }}
                                data-testid="input-override-notes"
                              />
                              <Button
                                onClick={() => {
                                  const data = overrideData[v.id];
                                  if (data?.score) {
                                    overrideMutation.mutate({
                                      verificationId: v.id,
                                      score: data.score,
                                      notes: data.notes || '',
                                    });
                                  }
                                }}
                                disabled={!overrideData[v.id]?.score || overrideMutation.isPending}
                                data-testid="button-submit-override"
                              >
                                {overrideMutation.isPending ? 'Saving...' : 'Set Score'}
                              </Button>
                            </div>
                          </div>
                        )}
                      </>
                    )}

                    {!v && (
                      <div style={{ textAlign: 'center', padding: '20px' }}>
                        <Button
                          onClick={() => verifyFactMutation.mutate(fact.id)}
                          disabled={verifyFactMutation.isPending}
                          data-testid={`button-verify-detail-${fact.originalId}`}
                        >
                          {verifyFactMutation.isPending ? 'Verifying...' : 'Start Verification'}
                        </Button>
                      </div>
                    )}
                  </div>
                </CollapsibleContent>
              </Collapsible>
            </Card>
          );
        })}
      </div>
    </div>
  );
}
