import { useQuery } from '@tanstack/react-query';
import type { ProviderHealthResponse } from '@shared/provider-health-types';

export function useProviderHealth({ enabled = true }: { enabled?: boolean } = {}) {
  return useQuery<ProviderHealthResponse>({
    queryKey: ['admin', 'provider-health'],
    queryFn: async () => {
      const res = await fetch('/api/admin/providers');
      if (!res.ok) {
        throw new Error('Failed to load provider health');
      }
      return res.json() as Promise<ProviderHealthResponse>;
    },
    enabled,
    staleTime: 30_000,
  });
}
