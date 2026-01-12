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
      return <CheckCircle size={16} className="text-success" />;
    } else if (status === 'completed' && needsReview) {
      return <AlertCircle size={16} className="text-warning" />;
    } else if (status === 'in_progress') {
      return <RefreshCw size={16} className="text-info animate-spin" />;
    }
    return <Clock size={16} className="text-muted-foreground" />;
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
    return <div className="p-10 text-center text-muted-foreground">Loading verification data...</div>;
  }

  return (
    <div>
      {summary && (
        <div className="grid grid-cols-2 sm:grid-cols-5 gap-4 mb-6">
          <Card>
            <CardContent className="p-4">
              <p className="text-muted-foreground text-xs font-medium">Total Facts</p>
              <p className="text-2xl font-bold text-primary">{summary.totalFacts}</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4">
              <p className="text-muted-foreground text-xs font-medium">Verified</p>
              <p className="text-2xl font-bold text-success">{summary.verified}</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4">
              <p className="text-muted-foreground text-xs font-medium">Needs Review</p>
              <p className="text-2xl font-bold text-warning">{summary.needsReview}</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4">
              <p className="text-muted-foreground text-xs font-medium">Avg Consensus</p>
              <p className="text-2xl font-bold text-info">{summary.averageConsensus}/5</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4">
              <p className="text-muted-foreground text-xs font-medium">Pending</p>
              <p className="text-2xl font-bold text-muted-foreground">{summary.pending}</p>
            </CardContent>
          </Card>
        </div>
      )}

      <div className="flex items-center justify-between gap-4 mb-4">
        <div>
          <h3 className="text-lg font-semibold text-foreground">Multi-LLM Fact Verification</h3>
          <p className="text-[13px] text-muted-foreground max-w-[600px]">
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

      <div className="flex flex-col gap-2">
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
                    className="flex items-center px-4 py-3 cursor-pointer gap-3 hover-elevate"
                  >
                    {isExpanded ? <ChevronDown size={16} /> : <ChevronRight size={16} />}

                    <span className="font-mono font-semibold text-primary min-w-[40px]">
                      {fact.originalId}
                    </span>

                    <span className="flex-1 text-sm text-foreground">
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
                  <div className="px-4 pb-4" style={{ borderTop: `1px solid ${tokens.border}` }}>
                    <div className="mb-4 pt-4">
                      <p className="text-sm text-foreground mb-2">
                        <strong>Full Fact:</strong> {fact.fact}
                      </p>
                      {fact.source && (
                        <p className="text-[13px] text-muted-foreground">
                          <strong>Source:</strong> {fact.source}
                        </p>
                      )}
                    </div>

                    {v && (v.status === 'in_progress' || v.status === 'pending') && (
                      <div className="text-center p-8 bg-card rounded-lg mb-4">
                        <RefreshCw size={32} className="animate-spin mx-auto mb-3 text-info" />
                        <p className="font-semibold text-foreground mb-1">Verification in progress...</p>
                        <p className="text-[13px] text-muted-foreground">
                          5 AI models are independently grading this fact. This typically takes 15-30 seconds.
                        </p>
                      </div>
                    )}

                    {v && v.status === 'completed' && (
                      <>
                        <div className="bg-card rounded-lg p-4 mb-4">
                          <div className="flex items-center justify-between mb-3">
                            <h4 className="font-semibold text-foreground">Consensus Result</h4>
                            {v.confidenceLevel && getConfidenceBadge(v.confidenceLevel)}
                          </div>

                          <div className="flex items-center gap-4 mb-3">
                            <div>
                              <p className="text-xs text-muted-foreground">Consensus Score</p>
                              <p className="text-[28px] font-bold text-primary">
                                {v.consensusScore}/5
                              </p>
                            </div>
                            {v.humanOverrideScore && (
                              <div className="px-3 py-2 bg-info-soft rounded-lg">
                                <p className="text-xs text-info">Human Override</p>
                                <p className="text-xl font-bold text-info">
                                  {v.humanOverrideScore}/5
                                </p>
                              </div>
                            )}
                          </div>

                          {v.verificationNotes && (
                            <p className="text-[13px] text-muted-foreground">
                              {v.verificationNotes}
                            </p>
                          )}
                        </div>

                        <div className="mb-4">
                          <h4 className="font-semibold text-foreground mb-3">
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
                                  className="p-3 rounded-lg bg-card"
                                  style={{ border: `1px solid ${tokens.border}` }}
                                >
                                  <div className="flex items-center gap-2 mb-2">
                                    <Bot size={14} style={{ color: modelColor }} />
                                    <span className="text-xs font-semibold" style={{ color: modelColor }}>
                                      {modelName}
                                    </span>
                                  </div>
                                  {ms.status === 'completed' && ms.score ? (
                                    <>
                                      <div
                                        className="text-2xl font-bold mb-1"
                                        style={{ color: msScoreColors?.text || tokens.text }}
                                      >
                                        {ms.score}/5
                                      </div>
                                      {ms.rationale && (
                                        <Tooltip>
                                          <TooltipTrigger asChild>
                                            <p className="text-[11px] text-muted-foreground leading-[1.4] cursor-pointer">
                                              {ms.rationale.slice(0, 100)}{ms.rationale.length > 100 ? '...' : ''}
                                            </p>
                                          </TooltipTrigger>
                                          <TooltipContent
                                            side="bottom"
                                            className="max-w-[300px] p-3 text-xs leading-normal"
                                            style={{
                                              backgroundColor: tokens.bg,
                                              color: tokens.text,
                                              border: `1px solid ${tokens.border}`,
                                            }}
                                          >
                                            <p><strong>{modelName}</strong></p>
                                            <p className="mt-2">{ms.rationale}</p>
                                          </TooltipContent>
                                        </Tooltip>
                                      )}
                                    </>
                                  ) : ms.status === 'failed' ? (
                                    <div className="text-xs text-destructive">
                                      Failed: {ms.error?.slice(0, 50)}
                                    </div>
                                  ) : (
                                    <div className="text-xs text-muted-foreground">
                                      Pending...
                                    </div>
                                  )}
                                </div>
                              );
                            })}
                          </div>
                        </div>

                        {v.needsReview && !v.humanOverrideScore && (
                          <div className="bg-warning-soft rounded-lg p-4 mt-4">
                            <h4 className="font-semibold text-warning mb-3">
                              Human Review Required
                            </h4>
                            <p className="text-[13px] text-foreground mb-3">
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
                                    className="w-9 h-9 rounded-lg font-semibold cursor-pointer"
                                    style={{
                                      border: overrideData[v.id]?.score === score
                                        ? `2px solid ${tokens.primary}`
                                        : `1px solid ${tokens.border}`,
                                      backgroundColor: overrideData[v.id]?.score === score
                                        ? tokens.primarySoft
                                        : 'white',
                                      color: tokens.text,
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
                                className="flex-1 px-3 py-2 rounded-lg text-sm"
                                style={{ border: `1px solid ${tokens.border}` }}
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
                      <div className="text-center p-5">
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
