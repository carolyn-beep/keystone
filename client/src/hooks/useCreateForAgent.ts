import { useMutation } from '@tanstack/react-query';
import { apiRequest } from '@/lib/queryClient';

export function useCreateForAgent() {
  return useMutation({
    mutationFn: async (params: { url: string; sourceType: string }) => {
      const res = await apiRequest('POST', '/api/brainlifts/create-for-agent', params);
      return res.json() as Promise<{ slug: string; title: string; id: number }>;
    },
  });
}
