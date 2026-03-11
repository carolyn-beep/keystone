import { useMutation } from '@tanstack/react-query';
import { queryClient } from '@/lib/queryClient';

interface DOK4Link {
  dok3InsightId: number;
  isPrimary: boolean;
}

interface LinkParams {
  spovId: number;
  links: DOK4Link[];
}

interface LinkResponse {
  spov: unknown;
  gradingQueued: boolean;
}

export function useDOK4Linking(slug: string) {
  const linkMutation = useMutation({
    mutationFn: async ({ spovId, links }: LinkParams): Promise<LinkResponse> => {
      const res = await fetch(`/api/brainlifts/${slug}/dok4-spovs/${spovId}/link`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ links }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.message || 'Failed to link SPOV');
      }
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['dok4-spovs', slug] });
    },
  });

  return {
    link: linkMutation.mutateAsync,
    isLinking: linkMutation.isPending,
  };
}
