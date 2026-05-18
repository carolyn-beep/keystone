/**
 * useKnowledgeTree — data hook for Phase 3 Knowledge Tree list view.
 *
 * Fetches GET /knowledge-tree and exposes mutations for:
 * - skipItem (discard pending item)
 * - openItem (bookmark pending item)
 * - addSource (create manual source)
 * - relaunchResearch (trigger new research swarm)
 */

import { useQuery, useMutation } from '@tanstack/react-query';
import { queryClient, apiRequest } from '@/lib/queryClient';
import type { LearningStreamItem } from '@/hooks/useLearningStream';

// ─── Types ──────────────────────────────────────────────────────────────────

export interface SavedItemView {
  id: number;
  title: string;
  url: string;
  type: string;
  author: string;
  excerpt: string;
  createdAt: string;
  factCount: number;
  summaryCount: number;
  hasSavedMinimum: boolean;
  categoryId: number | null;
  categoryName: string | null;
}

interface CategoryView {
  id: number;
  brainliftId: number;
  name: string;
  sortOrder: number | null;
  createdAt: string;
}

interface KnowledgeTreeResponse {
  unprocessed: LearningStreamItem[];
  triaged: LearningStreamItem[];
  saved: SavedItemView[];
  categories: CategoryView[];
  research: { isRunning: boolean; canRelaunch: boolean };
  phase3: { unlocked: boolean; justUnlocked: boolean };
}

interface ManualSourceInput {
  url: string;
  title: string;
}

interface ManualSourceResponse {
  learningStreamItem: LearningStreamItem;
  openDetail: { itemId: number };
}

// ─── Cache Invalidation ─────────────────────────────────────────────────────

function invalidateKnowledgeTree(slug: string) {
  queryClient.invalidateQueries({ queryKey: ['knowledge-tree', slug] });
}

function invalidateAll(slug: string) {
  queryClient.invalidateQueries({ queryKey: ['knowledge-tree', slug] });
  queryClient.invalidateQueries({ queryKey: ['learning-stream-stats', slug] });
  queryClient.invalidateQueries({ queryKey: ['learning-stream', slug] });
}

// ─── Hook ───────────────────────────────────────────────────────────────────

export function useKnowledgeTree(slug: string) {
  const query = useQuery<KnowledgeTreeResponse>({
    queryKey: ['knowledge-tree', slug],
    queryFn: async () => {
      const res = await fetch(`/api/brainlifts/${slug}/knowledge-tree`);
      if (!res.ok) throw new Error('Failed to fetch knowledge tree');
      return res.json();
    },
    enabled: !!slug,
    refetchInterval: (query) => {
      const data = query.state.data as KnowledgeTreeResponse | undefined;
      if (data?.research.isRunning) return 4000;
      return false;
    },
  });

  // Skip (discard) an unprocessed item
  const skipMutation = useMutation({
    mutationFn: async (itemId: number) => {
      return apiRequest('PATCH', `/api/brainlifts/${slug}/learning-stream/${itemId}/discard`);
    },
    onSuccess: () => invalidateKnowledgeTree(slug),
  });

  // Open (bookmark) an unprocessed item
  const openMutation = useMutation({
    mutationFn: async (itemId: number) => {
      return apiRequest('PATCH', `/api/brainlifts/${slug}/learning-stream/${itemId}/bookmark`);
    },
    onSuccess: () => invalidateKnowledgeTree(slug),
  });

  // Add manual source
  const addSourceMutation = useMutation<ManualSourceResponse, Error, ManualSourceInput>({
    mutationFn: async (data: ManualSourceInput) => {
      const res = await fetch(`/api/brainlifts/${slug}/knowledge-tree/manual-source`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      });
      if (res.status === 409) {
        const err = await res.json();
        throw new Error(err.message || 'A source with this URL already exists.');
      }
      if (!res.ok) {
        const err = await res.json().catch(() => ({ message: 'Failed to add source' }));
        throw new Error(err.message || 'Failed to add source');
      }
      return res.json();
    },
    onSuccess: () => invalidateKnowledgeTree(slug),
  });

  // Re-launch research swarm (empty body = let orchestrator plan from project data).
  const relaunchMutation = useMutation({
    mutationFn: async () => {
      return apiRequest('POST', `/api/brainlifts/${slug}/learning-stream/launch`, {});
    },
    onSuccess: () => invalidateAll(slug),
  });

  return {
    // Data
    unprocessed: query.data?.unprocessed ?? [],
    triaged: query.data?.triaged ?? [],
    saved: query.data?.saved ?? [],
    categories: query.data?.categories ?? [],
    research: query.data?.research ?? { isRunning: false, canRelaunch: false },
    phase3: query.data?.phase3 ?? { unlocked: false, justUnlocked: false },
    isLoading: query.isLoading,
    error: query.error,

    // Mutations
    skipItem: skipMutation.mutateAsync,
    openItem: openMutation.mutateAsync,
    addSource: addSourceMutation.mutateAsync,
    relaunchResearch: relaunchMutation.mutateAsync,

    // Loading states
    isSkipping: skipMutation.isPending,
    isOpening: openMutation.isPending,
    isAddingSource: addSourceMutation.isPending,
    isRelaunching: relaunchMutation.isPending,
    addSourceError: addSourceMutation.error,
  };
}
