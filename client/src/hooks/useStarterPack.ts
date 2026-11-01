import { useEffect, useRef } from 'react';
import { useQuery, useMutation } from '@tanstack/react-query';
import { apiRequest, queryClient } from '@/lib/queryClient';
import type { LearningStreamItem } from './useLearningStream';

/**
 * Data layer for the onboarding wizard's Resources step (spec 05 FR5, with
 * the 2026-06-11 opt-in-Add correction).
 *
 * Owns: the starter-pack status poll (GET, ~2.5s while `running`, stops
 * otherwise; invalidates the learning-stream queries on the `running → ready`
 * transition so survivors appear), a conflict-silent launch mutation, the pack
 * + pasted items (a wizard-scoped learning-stream query fetching ALL statuses,
 * filtered to `source IN ('starter-pack','manual')`), a promote action (the
 * existing bookmark PATCH with no categoryId — the item is mirrored into an
 * uncategorized Second Brain source and flips to `bookmarked`), a decline
 * action for pasted manual items (the existing discard PATCH), and an
 * add-resource action (the resources POST, surfacing the `duplicate` flag).
 *
 * Consumption model: pack items are RETAINED as `pending` Learning Stream
 * items when the student does nothing (the pending stream is the future Feed);
 * clicking Add promotes the item to the Second Brain. There is no decline
 * control for pack items. An item's "Added" state is therefore derived from
 * the server (`status === 'bookmarked'`), so it survives refresh and resume.
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
  // The prefix match also catches this hook's wizard-scoped child key.
  const prevStatusRef = useRef<PackStatus>('idle');
  useEffect(() => {
    if (prevStatusRef.current === 'running' && status === 'ready' && slug) {
      queryClient.invalidateQueries({ queryKey: ['learning-stream', slug] });
    }
    prevStatusRef.current = status;
  }, [status, slug]);

  // Wizard-scoped learning-stream query, fetching ALL statuses (the stream
  // tab's own query is pending-only and keeps its `['learning-stream', slug]`
  // key). Promoted pack items flip to `bookmarked` and must stay visible in
  // the step as "Added", so a pending-only fetch would drop them.
  const itemsQuery = useQuery<LearningStreamItem[]>({
    queryKey: ['learning-stream', slug, 'wizard-resources'],
    enabled: Boolean(slug),
    // Pasted manual items are inserted with placeholder metadata (URL as
    // title) that the extraction job backfills seconds later — poll while any
    // of them still awaits extraction so the row upgrades in place.
    refetchInterval: (query) =>
      (query.state.data ?? []).some(
        (it) =>
          it.source === 'manual' && it.status === 'pending' && it.extractedContent == null,
      )
        ? STATUS_POLL_MS
        : false,
    queryFn: async () => {
      const res = await fetch(`/api/brainlifts/${slug}/learning-stream`);
      if (!res.ok) throw new Error('Failed to fetch learning stream items');
      return res.json();
    },
  });

  const items = (itemsQuery.data ?? []).filter(
    (it) => it.source === 'starter-pack' || it.source === 'manual',
  );
  // Pack items: pending (retained, un-added) or bookmarked (promoted =
  // "Added"). Discarded ones are the out-of-scope filter's losers — hidden.
  const packItems = items.filter(
    (it) =>
      it.source === 'starter-pack' &&
      (it.status === 'pending' || it.status === 'bookmarked'),
  );
  const manualItems = items.filter(
    (it) => it.source === 'manual' && it.status === 'pending',
  );

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

  // Promote a pack item to the Second Brain: the existing bookmark PATCH with
  // no categoryId mirrors it into an uncategorized `sources` row and flips the
  // item to `bookmarked`. Optimism lives at the PAGE level (promotedPackIds in
  // OnboardingWizard) so the rail and the step commit together — required for
  // the shared-layoutId fly. Rejection there rolls the card back.
  const promoteMutation = useMutation({
    mutationFn: async (itemId: number) =>
      apiRequest('PATCH', `/api/brainlifts/${slug}/learning-stream/${itemId}/bookmark`),
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ['learning-stream', slug] });
      queryClient.invalidateQueries({ queryKey: ['sources', slug] });
    },
  });

  // Remove a pasted manual item (the X on the added-resources list). Pack
  // items have no decline control — untouched ones simply stay `pending`.
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
    promote: promoteMutation.mutateAsync,
    isPromoting: promoteMutation.isPending,
    decline: declineMutation.mutateAsync,
    isDeclining: declineMutation.isPending,
    addResource: addResourceMutation.mutateAsync,
    isAdding: addResourceMutation.isPending,
  };
}
