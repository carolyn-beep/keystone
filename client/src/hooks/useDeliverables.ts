import { useState } from 'react';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import type { DeliverableListItem, DeliverableListResponse, PlanHistoryItem } from '@shared/routes';

export type PlanFilterValue = number | 'all' | 'plan' | 'standalone';

export function sortDeliverablesNewestFirst(items: DeliverableListItem[]): DeliverableListItem[] {
  return [...items].sort((a, b) => {
    const createdAtDiff = new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
    if (createdAtDiff !== 0) return createdAtDiff;
    return b.id - a.id;
  });
}

export function buildDeliverablesUrl(slug: string, selectedPlanId: PlanFilterValue): string {
  const search = new URLSearchParams();
  if (selectedPlanId === 'plan') {
    search.set('scope', 'plan');
  } else if (selectedPlanId === 'standalone') {
    search.set('scope', 'hub');
  } else if (selectedPlanId !== 'all') {
    search.set('planId', String(selectedPlanId));
  }

  const queryString = search.toString();
  return queryString
    ? `/api/brainlifts/${slug}/deliverables?${queryString}`
    : `/api/brainlifts/${slug}/deliverables`;
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
      const url = buildDeliverablesUrl(slug, selectedPlanId);

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
    // Keep the previous list visible while a new filter refetches so the
    // tab does not unmount and the dropdown stays open.
    placeholderData: keepPreviousData,
  });

  return {
    plans: plansQuery.data ?? [],
    deliverables: deliverablesQuery.data ?? [],
    selectedPlanId,
    setSelectedPlanId,
    isLoading: plansQuery.isPending || deliverablesQuery.isPending,
    error: (plansQuery.error as Error | null) ?? (deliverablesQuery.error as Error | null),
  };
}
