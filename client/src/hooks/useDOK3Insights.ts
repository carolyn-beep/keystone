import { useQuery, useMutation } from '@tanstack/react-query';
import { queryClient } from '@/lib/queryClient';
import { useMemo } from 'react';

export interface DOK3InsightWithLinks {
  id: number;
  brainliftId: number;
  text: string;
  workflowyNodeId: string | null;
  status: string;
  score: number | null;
  frameworkName: string | null;
  frameworkDescription: string | null;
  criteriaBreakdown: Record<string, { assessment: string; evidence: string }> | null;
  rationale: string | null;
  feedback: string | null;
  foundationIntegrityIndex: string | null;
  dok1FoundationScore: string | null;
  dok2SynthesisScore: string | null;
  traceabilityFlagged: boolean;
  traceabilityFlaggedSource: string | null;
  evaluatorModel: string | null;
  sourceRankings: Record<string, number> | null;
  gradedAt: string | null;
  createdAt: string;
  linkedDok2SummaryIds: number[];
}

export function useDOK3Insights(slug: string) {
  const queryKey = ['dok3-insights', slug];

  const query = useQuery<DOK3InsightWithLinks[]>({
    queryKey,
    queryFn: async () => {
      const res = await fetch(`/api/brainlifts/${slug}/dok3-insights`);
      if (!res.ok) throw new Error('Failed to fetch DOK3 insights');
      return res.json();
    },
    enabled: !!slug,
  });

  const scratchpadQuery = useQuery<DOK3InsightWithLinks[]>({
    queryKey: ['dok3-scratchpad', slug],
    queryFn: async () => {
      const res = await fetch(`/api/brainlifts/${slug}/dok3-scratchpad`);
      if (!res.ok) throw new Error('Failed to fetch DOK3 scratchpad');
      return res.json();
    },
    enabled: !!slug,
  });

  // Derived data
  const insights = query.data ?? [];

  const derived = useMemo(() => {
    const gradedInsights = insights.filter(i => i.status === 'graded');
    const pendingInsights = insights.filter(i => i.status === 'pending_linking');
    const errorInsights = insights.filter(i => i.status === 'error');
    const gradingInsights = insights.filter(i => i.status === 'grading');
    const linkedInsights = insights.filter(i => i.status === 'linked');

    const scores = gradedInsights
      .map(i => i.score)
      .filter((s): s is number => s !== null);
    const meanScore = scores.length > 0
      ? scores.reduce((a, b) => a + b, 0) / scores.length
      : null;

    const highQualityCount = scores.filter(s => s >= 4).length;
    const needsWorkCount = scores.filter(s => s <= 2).length;

    return {
      gradedInsights,
      pendingInsights,
      errorInsights,
      gradingInsights,
      linkedInsights,
      meanScore,
      totalCount: insights.length,
      highQualityCount,
      needsWorkCount,
    };
  }, [insights]);

  // Mutations
  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey });
    queryClient.invalidateQueries({ queryKey: ['dok3-scratchpad', slug] });
  };

  const linkMutation = useMutation({
    mutationFn: async ({ insightId, dok2SummaryIds }: { insightId: number; dok2SummaryIds: number[] }) => {
      const res = await fetch(`/api/brainlifts/${slug}/dok3-insights/${insightId}/link`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ dok2SummaryIds }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.message || 'Failed to link insight');
      }
      return res.json();
    },
    onSuccess: invalidate,
  });

  const scratchpadMutation = useMutation({
    mutationFn: async (insightId: number) => {
      const res = await fetch(`/api/brainlifts/${slug}/dok3-insights/${insightId}/scratchpad`, {
        method: 'POST',
      });
      if (!res.ok) throw new Error('Failed to scratchpad insight');
      return res.json();
    },
    onSuccess: invalidate,
  });

  const unscratchpadMutation = useMutation({
    mutationFn: async (insightId: number) => {
      const res = await fetch(`/api/brainlifts/${slug}/dok3-insights/${insightId}/unscratchpad`, {
        method: 'POST',
      });
      if (!res.ok) throw new Error('Failed to unscratchpad insight');
      return res.json();
    },
    onSuccess: invalidate,
  });

  const gradeAllMutation = useMutation({
    mutationFn: async () => {
      const res = await fetch(`/api/brainlifts/${slug}/dok3-insights/grade`, {
        method: 'POST',
      });
      if (!res.ok) throw new Error('Failed to queue grading');
      return res.json() as Promise<{ queued: number }>;
    },
    onSuccess: invalidate,
  });

  return {
    insights,
    scratchpadItems: scratchpadQuery.data ?? [],
    isLoading: query.isLoading,
    isScratchpadLoading: scratchpadQuery.isLoading,
    ...derived,
    link: linkMutation.mutateAsync,
    isLinking: linkMutation.isPending,
    scratchpad: scratchpadMutation.mutateAsync,
    isScratchpadding: scratchpadMutation.isPending,
    unscratchpad: unscratchpadMutation.mutateAsync,
    isUnscratchpadding: unscratchpadMutation.isPending,
    gradeAll: gradeAllMutation.mutateAsync,
    isGrading: gradeAllMutation.isPending,
    invalidate,
  };
}
