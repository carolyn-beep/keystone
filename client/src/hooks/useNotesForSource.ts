/**
 * useNotesForSource — reader-scoped notes hook.
 *
 * Powers the Notes pane in `ExpandedItemView`. Posts to the atomic
 * `POST /api/brainlifts/:slug/notes/from-reader` endpoint (spec 01) so the
 * composer can save a note against a bookmarked source OR a not-yet-
 * bookmarked Research Stream item in one round-trip.
 *
 * Cache key shape is shared with `useNotes` via `getNotesQueryKey` so the
 * Second Brain Notes tab co-updates without separate plumbing. When the
 * first save auto-bookmarks the source, the hook additionally invalidates
 * `['sources', slug]` and `['learning-stream', slug]` so the reader's
 * bookmark icon flips and the source appears in Second Brain.
 *
 * Returned `data` is reversed client-side (newest-first per FEATURE.md
 * decision #13). The underlying cache stays ascending — the canonical
 * order the SB Notes tab assumes.
 */

import { useMemo } from 'react';
import { useMutation, useQuery } from '@tanstack/react-query';
import { apiRequest, queryClient } from '@/lib/queryClient';
import type { Note, Source } from '@/types/second-brain';
import { getNotesQueryKey } from './useNotes';

// ─── Types ──────────────────────────────────────────────────────────────────

export interface UseNotesForSourceArgs {
  slug: string;
  /** Pass when the source already exists. */
  sourceId?: number;
  /** Pass when the source has not been auto-bookmarked yet. */
  learningStreamItemId?: number;
}

export interface CreateNoteFromReaderInput {
  content: string;
  categoryId?: number;
  categoryName?: string;
}

export interface CreateNoteFromReaderResponse {
  note: Note;
  source: Source;
  category: { id: number; name: string };
  autoBookmarked: boolean;
}

export interface UpdateNoteInput {
  content?: string;
  categoryId?: number | null;
}

export interface UseNotesForSourceResult {
  /** Newest-first (client-side reversal of the server's asc(createdAt) sort). */
  data: Note[];
  isLoading: boolean;
  error: unknown;
  createNote: (input: CreateNoteFromReaderInput) => Promise<CreateNoteFromReaderResponse>;
  updateNote: (id: number, patch: UpdateNoteInput) => Promise<Note>;
  deleteNote: (id: number) => Promise<void>;
  isCreating: boolean;
}

// ─── URL helper ─────────────────────────────────────────────────────────────

function notesUrl(slug: string, sourceId: number): string {
  const url = new URL(`/api/brainlifts/${slug}/notes`, window.location.origin);
  url.searchParams.set('sourceId', String(sourceId));
  return `${url.pathname}${url.search}`;
}

// ─── Hook ───────────────────────────────────────────────────────────────────

export function useNotesForSource(args: UseNotesForSourceArgs): UseNotesForSourceResult {
  const { slug, sourceId, learningStreamItemId } = args;
  const queryKey = getNotesQueryKey(slug, sourceId);

  const query = useQuery<Note[]>({
    queryKey,
    queryFn: async () => {
      // Caller-guard via `enabled` ensures sourceId is a number here.
      const res = await fetch(notesUrl(slug, sourceId as number), {
        credentials: 'include',
      });
      if (!res.ok) throw new Error('Failed to fetch notes');
      const payload = await res.json();
      return Array.isArray(payload) ? payload : payload.notes ?? [];
    },
    enabled: !!slug && typeof sourceId === 'number',
  });

  const createMutation = useMutation({
    mutationFn: async (input: CreateNoteFromReaderInput): Promise<CreateNoteFromReaderResponse> => {
      const payload: Record<string, unknown> = { content: input.content };
      if (typeof sourceId === 'number') {
        payload.sourceId = sourceId;
      } else if (typeof learningStreamItemId === 'number') {
        payload.learningStreamItemId = learningStreamItemId;
      }
      if (typeof input.categoryId === 'number') {
        payload.categoryId = input.categoryId;
      } else if (typeof input.categoryName === 'string') {
        payload.categoryName = input.categoryName;
      }
      const res = await apiRequest(
        'POST',
        `/api/brainlifts/${slug}/notes/from-reader`,
        payload,
      );
      return (await res.json()) as CreateNoteFromReaderResponse;
    },
    onSuccess: (response) => {
      // Append to the cache for the resolved source id. The cache stays
      // ascending; we reverse at read time below.
      const realSourceKey = getNotesQueryKey(slug, response.source.id);
      queryClient.setQueryData<Note[]>(realSourceKey, (current = []) => [
        ...current.filter((item) => item.id !== response.note.id),
        response.note,
      ]);
      queryClient.invalidateQueries({ queryKey: ['notes', slug] });
      if (response.autoBookmarked) {
        queryClient.invalidateQueries({ queryKey: ['sources', slug] });
        queryClient.invalidateQueries({ queryKey: ['learning-stream', slug] });
        queryClient.invalidateQueries({ queryKey: ['learning-stream-stats', slug] });
      }
    },
  });

  const updateMutation = useMutation({
    mutationFn: async ({ id, patch }: { id: number; patch: UpdateNoteInput }): Promise<Note> => {
      const res = await apiRequest('PATCH', `/api/brainlifts/${slug}/notes/${id}`, patch);
      return (await res.json()) as Note;
    },
    onSuccess: (note) => {
      queryClient.setQueryData<Note[]>(queryKey, (current = []) =>
        current.map((item) => (item.id === note.id ? { ...item, ...note } : item)),
      );
      queryClient.invalidateQueries({ queryKey: ['notes', slug] });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: number): Promise<void> => {
      await apiRequest('DELETE', `/api/brainlifts/${slug}/notes/${id}`);
    },
    onSuccess: (_result, id) => {
      queryClient.setQueryData<Note[]>(queryKey, (current = []) =>
        current.filter((item) => item.id !== id),
      );
      queryClient.invalidateQueries({ queryKey: ['notes', slug] });
    },
  });

  // Reverse for newest-first consumption.
  const reversed = useMemo<Note[]>(() => {
    const rows = query.data ?? [];
    return [...rows].reverse();
  }, [query.data]);

  return {
    data: reversed,
    isLoading: query.isLoading,
    error: query.error,
    createNote: (input: CreateNoteFromReaderInput) => createMutation.mutateAsync(input),
    updateNote: (id: number, patch: UpdateNoteInput) => updateMutation.mutateAsync({ id, patch }),
    deleteNote: (id: number) => deleteMutation.mutateAsync(id),
    isCreating: createMutation.isPending,
  };
}
