import { useQuery, useMutation } from '@tanstack/react-query';
import { queryClient } from '@/lib/queryClient';
import { useToast } from '@/hooks/use-toast';

interface RedundancyData {
  groups: Array<{
    id: number;
    groupName: string;
    factIds: number[];
    primaryFactId: number | null;
    similarityScore: string;
    reason: string;
    status: string;
    facts: Array<{ id: number; originalId: string; fact: string; score: number; summary?: string }>;
    primaryFact?: { id: number; originalId: string; fact: string; score: number; summary?: string };
  }>;
  stats: {
    totalFacts: number;
    uniqueFactCount: number;
    redundantFactCount: number;
    pendingReview: number;
  };
}

export function useRedundancy(brainliftId: string | undefined) {
  const { toast } = useToast();

  const query = useQuery<RedundancyData>({
    queryKey: ['redundancy', brainliftId],
    queryFn: async () => {
      const res = await fetch(`/api/brainlifts/${brainliftId}/redundancy`);
      if (!res.ok) return { groups: [], stats: { totalFacts: 0, uniqueFactCount: 0, redundantFactCount: 0, pendingReview: 0 } };
      return res.json();
    },
    enabled: !!brainliftId
  });

  const analyzeMutation = useMutation({
    mutationFn: async () => {
      const res = await fetch(`/api/brainlifts/${brainliftId}/analyze-redundancy`, {
        method: 'POST',
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.message || 'Failed to analyze');
      }
      return res.json();
    },
    onSuccess: (data) => {
      query.refetch();
      toast({
        title: 'Redundancy Analysis Complete',
        description: data.message || `Found ${data.redundancyGroups?.length || 0} redundancy groups`,
      });
    },
    onError: (error: Error) => {
      toast({
        title: 'Analysis Failed',
        description: error.message || 'Failed to analyze redundancy. Please try again.',
        variant: 'destructive',
      });
    }
  });

  const updateStatusMutation = useMutation({
    mutationFn: async ({ groupId, status, primaryFactId }: { groupId: number; status: string; primaryFactId?: number }) => {
      const res = await fetch(`/api/brainlifts/${brainliftId}/redundancy-groups/${groupId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status, primaryFactId }),
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.message || 'Failed to update');
      }
      return res.json();
    },
    onSuccess: (_, variables) => {
      query.refetch();
      // Also refetch main brainlift data if we deleted facts
      if (variables.status === 'kept' && variables.primaryFactId) {
        queryClient.invalidateQueries({ queryKey: ['brainlift', brainliftId] });
      }
      toast({
        title: variables.status === 'kept' ? 'Facts Deduplicated' : 'Redundancy Updated',
        description: variables.status === 'kept' ? 'Redundant facts removed, primary fact kept.' : 'Status updated successfully',
      });
    },
    onError: (error: Error) => {
      toast({
        title: 'Update Failed',
        description: error.message || 'Failed to update redundancy status',
        variant: 'destructive',
      });
    }
  });

  return {
    data: query.data,
    refetch: query.refetch,
    analyze: analyzeMutation.mutate,
    isAnalyzing: analyzeMutation.isPending,
    updateStatus: updateStatusMutation.mutate,
    isUpdatingStatus: updateStatusMutation.isPending,
  };
}
