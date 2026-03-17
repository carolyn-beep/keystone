import { useMutation } from '@tanstack/react-query';
import { queryClient } from '@/lib/queryClient';

interface CreateNativeBrainliftInput {
  topic: string;
  purpose: string;
  owner?: string | null;
}

interface CreateNativeBrainliftResponse {
  brainlift: {
    id: number;
    slug: string;
    title: string;
    description: string;
  };
  nativeDetails: {
    id: number;
    brainliftId: number;
  };
}

export function useCreateNativeBrainlift() {
  return useMutation({
    mutationFn: async (input: CreateNativeBrainliftInput): Promise<CreateNativeBrainliftResponse> => {
      const res = await fetch('/api/brainlifts/native', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(input),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({ message: 'Failed to create brainlift' }));
        throw new Error(data.message || 'Failed to create brainlift');
      }

      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/brainlifts'] });
    },
  });
}
