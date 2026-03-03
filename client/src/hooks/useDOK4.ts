import { useQuery, useMutation } from '@tanstack/react-query';
import { queryClient } from '@/lib/queryClient';
import { useMemo } from 'react';
import type { DOK4SpovWithLinks } from '@shared/dok4-types';

export function useDOK4(slug: string) {
  const queryKey = ['dok4-spovs', slug];

  const query = useQuery<DOK4SpovWithLinks[]>({
    queryKey,
    queryFn: async () => {
      const res = await fetch(`/api/brainlifts/${slug}/dok4-spovs`);
      if (!res.ok) throw new Error('Failed to fetch DOK4 SPOVs');
      return res.json();
    },
    enabled: !!slug,
  });

  const spovs = query.data ?? [];

  const derived = useMemo(() => {
    const gradedSpovs = spovs.filter(s => s.status === 'graded');
    const rejectedSpovs = spovs.filter(s => s.status === 'rejected');
    const pendingSpovs = spovs.filter(s => s.status === 'pending_linking' || s.status === 'linked');
    const errorSpovs = spovs.filter(s => s.status === 'error');
    const gradingSpovs = spovs.filter(s => s.status === 'grading');

    const scores = gradedSpovs
      .map(s => s.score)
      .filter((s): s is number => s !== null);
    const meanScore = scores.length > 0
      ? scores.reduce((a, b) => a + b, 0) / scores.length
      : null;

    const highQualityCount = scores.filter(s => s >= 4).length;
    const needsWorkCount = scores.filter(s => s <= 2).length;

    return {
      gradedSpovs,
      rejectedSpovs,
      pendingSpovs,
      errorSpovs,
      gradingSpovs,
      meanScore,
      totalCount: spovs.length,
      highQualityCount,
      needsWorkCount,
    };
  }, [spovs]);

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey });
  };

  const gradeAllMutation = useMutation({
    mutationFn: async () => {
      const res = await fetch(`/api/brainlifts/${slug}/dok4-spovs/grade`, {
        method: 'POST',
      });
      if (!res.ok) throw new Error('Failed to queue DOK4 grading');
      return res.json() as Promise<{ queued: number }>;
    },
    onSuccess: invalidate,
  });

  const retryOneMutation = useMutation({
    mutationFn: async (spovId: number) => {
      const res = await fetch(`/api/brainlifts/${slug}/dok4-spovs/${spovId}/retry`, {
        method: 'POST',
      });
      if (!res.ok) throw new Error('Failed to retry DOK4 grading');
      return res.json();
    },
    onSuccess: invalidate,
  });

  return {
    spovs,
    isLoading: query.isLoading,
    ...derived,
    gradeAll: gradeAllMutation.mutateAsync,
    isGrading: gradeAllMutation.isPending,
    retryOne: retryOneMutation.mutateAsync,
    isRetrying: retryOneMutation.isPending,
    invalidate,
  };
}
