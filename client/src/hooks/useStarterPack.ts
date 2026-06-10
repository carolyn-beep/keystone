import { useEffect, useRef } from 'react';
import { useQuery, useMutation } from '@tanstack/react-query';
import { apiRequest, queryClient } from '@/lib/queryClient';
import type { LearningStreamItem } from './useLearningStream';

/**
 * Data layer for the onboarding wizard's Resources step (spec 05 FR5).
 *
 * Owns: the starter-pack status poll (GET, ~2.5s while `running`, stops
 * otherwise; invalidates the learning-stream query on the `running → ready`
 * transition so survivors appear), a conflict-silent launch mutation, the pack
 * + pasted items (derived from the existing pending learning-stream query,
 * filtered to `source IN ('starter-pack','manual')`), a decline action (the
 * existing discard PATCH), and an add-resource action (the resources POST,
 * surfacing the `duplicate` flag).
 *
 * The launch is best-effort: a 409 (already running / already generated) or any
 * failure is swallowed — the pack never blocks the wizard.
 */

type PackStatus = 'idle' | 'running' | 'ready';

const STATUS_POLL_MS = 2500;

export interface AddResourceResult {
  item: LearningStreamItem;
  duplicate: boolean;
}

export function useStarterPack(slug: string | undefined) {
  const statusQuery = useQuery<{ status: PackStatus }>({
    queryKey: ['starter-pack-status', slug],
    enabled: Boolean(slug),
    refetchInterval: (query) =>
      query.state.data?.status === 'running' ? STATUS_POLL_MS : false,
    queryFn: async () => {
      const res = await apiRequest('GET', `/api/brainlifts/${slug}/onboarding/starter-pack`);
      return (await res.json()) as { status: PackStatus };
    },
  });

  const status: PackStatus = statusQuery.data?.status ?? 'idle';

  // Invalidate the learning-stream items once the pack settles to `ready`
  // (the filter has finished pruning), so survivors show up in the list.
  const prevStatusRef = useRef<PackStatus>('idle');
  useEffect(() => {
    if (prevStatusRef.current === 'running' && status === 'ready' && slug) {
      queryClient.invalidateQueries({ queryKey: ['learning-stream', slug] });
    }
    prevStatusRef.current = status;
  }, [status, slug]);

  // The pending learning-stream items (same query the stream uses), narrowed to
  // pack + pasted manual items.
  const itemsQuery = useQuery<LearningStreamItem[]>({
    queryKey: ['learning-stream', slug],
    enabled: Boolean(slug),
    queryFn: async () => {
      const res = await fetch(`/api/brainlifts/${slug}/learning-stream?status=pending`);
      if (!res.ok) throw new Error('Failed to fetch learning stream items');
      return res.json();
    },
  });

  const items = (itemsQuery.data ?? []).filter(
    (it) => it.source === 'starter-pack' || it.source === 'manual',
  );
  const packItems = items.filter((it) => it.source === 'starter-pack');
  const manualItems = items.filter((it) => it.source === 'manual');

  const launchMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest('POST', `/api/brainlifts/${slug}/onboarding/starter-pack`);
      return (await res.json()) as { runId: number };
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['starter-pack-status', slug] });
    },
  });

  /** Fire the launch, swallowing 409s/errors (best-effort, never blocks). */
  const launch = () => {
    if (!slug) return;
    launchMutation.mutateAsync().catch(() => {
      /* conflict / failure is expected and ignored — the pack is best-effort. */
    });
  };

  const declineMutation = useMutation({
    mutationFn: async (itemId: number) =>
      apiRequest('PATCH', `/api/brainlifts/${slug}/learning-stream/${itemId}/discard`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['learning-stream', slug] });
    },
  });

  const addResourceMutation = useMutation({
    mutationFn: async (url: string): Promise<AddResourceResult> => {
      const res = await apiRequest('POST', `/api/brainlifts/${slug}/onboarding/resources`, { url });
      return (await res.json()) as AddResourceResult;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['learning-stream', slug] });
    },
  });

  return {
    status,
    packItems,
    manualItems,
    isLoading: itemsQuery.isLoading,
    launch,
    decline: declineMutation.mutateAsync,
    isDeclining: declineMutation.isPending,
    addResource: addResourceMutation.mutateAsync,
    isAdding: addResourceMutation.isPending,
  };
}
