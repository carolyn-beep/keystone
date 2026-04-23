import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import type { DeliverableListItem, DeliverableListResponse, PlanHistoryItem } from '@shared/routes';

export type PlanFilterValue = number | 'all';

export function sortDeliverablesNewestFirst(items: DeliverableListItem[]): DeliverableListItem[] {
  return [...items].sort((a, b) => {
    const createdAtDiff = new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
    if (createdAtDiff !== 0) return createdAtDiff;
    return b.id - a.id;
  });
}

export interface UseDeliverablesResult {
  plans: PlanHistoryItem[];
  deliverables: DeliverableListItem[];
  selectedPlanId: PlanFilterValue;
  setSelectedPlanId: (value: PlanFilterValue) => void;
  isLoading: boolean;
  error: Error | null;
}

export function useDeliverables(slug: string): UseDeliverablesResult {
  const [selectedPlanId, setSelectedPlanId] = useState<PlanFilterValue>('all');

  const plansQuery = useQuery<PlanHistoryItem[]>({
    queryKey: ['sprint', slug, 'plans'],
    queryFn: async () => {
      const res = await fetch(`/api/brainlifts/${slug}/plans`, {
        credentials: 'include',
      });
      if (!res.ok) {
        throw new Error('Failed to fetch sprint plans');
      }
      return res.json();
    },
    enabled: !!slug,
  });

  const deliverablesQuery = useQuery<DeliverableListItem[]>({
    queryKey: ['sprint', slug, 'deliverables', selectedPlanId],
    queryFn: async () => {
      const search = new URLSearchParams();
      if (selectedPlanId !== 'all') {
        search.set('planId', String(selectedPlanId));
      }

      const queryString = search.toString();
      const url = queryString
        ? `/api/brainlifts/${slug}/deliverables?${queryString}`
        : `/api/brainlifts/${slug}/deliverables`;

      const res = await fetch(url, {
        credentials: 'include',
      });

      if (!res.ok) {
        throw new Error('Failed to fetch deliverables');
      }

      const payload = (await res.json()) as DeliverableListResponse;
      return sortDeliverablesNewestFirst(payload.deliverables);
    },
    enabled: !!slug,
  });

  return {
    plans: plansQuery.data ?? [],
    deliverables: deliverablesQuery.data ?? [],
    selectedPlanId,
    setSelectedPlanId,
    isLoading: plansQuery.isLoading || deliverablesQuery.isLoading,
    error: (plansQuery.error as Error | null) ?? (deliverablesQuery.error as Error | null),
  };
}
