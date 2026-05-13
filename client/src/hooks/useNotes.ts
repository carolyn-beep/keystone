import { useMutation, useQuery } from '@tanstack/react-query';
import { apiRequest, queryClient } from '@/lib/queryClient';
import type { CreateNoteInput, Note, UpdateNoteInput } from '@/types/second-brain';

export const getNotesQueryKey = (slug: string, sourceId?: number | null) =>
  ['notes', slug, sourceId === undefined ? 'all' : sourceId] as const;

function notesUrl(slug: string, sourceId?: number | null): string {
  const url = new URL(`/api/brainlifts/${slug}/notes`, window.location.origin);
  if (sourceId !== undefined) {
    url.searchParams.set('sourceId', sourceId === null ? 'null' : String(sourceId));
  }
  return `${url.pathname}${url.search}`;
}

function invalidateNotes(slug: string) {
  queryClient.invalidateQueries({ queryKey: ['notes', slug] });
}

export function useNotes(slug: string, opts: { sourceId?: number | null } = {}) {
  const sourceId = opts.sourceId;
  const queryKey = getNotesQueryKey(slug, sourceId);

  const query = useQuery<Note[]>({
    queryKey,
    queryFn: async () => {
      const res = await fetch(notesUrl(slug, sourceId), {
        credentials: 'include',
      });
      if (!res.ok) throw new Error('Failed to fetch notes');
      const payload = await res.json();
      return Array.isArray(payload) ? payload : payload.notes ?? [];
    },
    enabled: !!slug,
  });

  const createMutation = useMutation({
    mutationFn: async (input: CreateNoteInput): Promise<Note> => {
      const res = await apiRequest('POST', `/api/brainlifts/${slug}/notes`, input);
      return res.json() as Promise<Note>;
    },
    onMutate: async (input) => {
      await queryClient.cancelQueries({ queryKey });
      const previous = queryClient.getQueryData<Note[]>(queryKey);
      const optimistic: Note = {
        id: -Date.now(),
        brainliftId: 0,
        sourceId: input.sourceId ?? null,
        categoryId: input.categoryId ?? null,
        content: input.content,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };
      queryClient.setQueryData<Note[]>(queryKey, (current = []) => [...current, optimistic]);
      return { previous };
    },
    onError: (_error, _input, context) => {
      queryClient.setQueryData(queryKey, context?.previous);
    },
    onSuccess: (note) => {
      queryClient.setQueryData<Note[]>(queryKey, (current = []) => [
        ...current.filter((item) => item.id > 0 && item.id !== note.id),
        note,
      ]);
      invalidateNotes(slug);
    },
  });

  const updateMutation = useMutation({
    mutationFn: async ({ id, patch }: { id: number; patch: UpdateNoteInput }): Promise<Note> => {
      const res = await apiRequest('PATCH', `/api/brainlifts/${slug}/notes/${id}`, patch);
      return res.json() as Promise<Note>;
    },
    onSuccess: (note) => {
      queryClient.setQueryData<Note[]>(queryKey, (current = []) =>
        current.map((item) => (item.id === note.id ? { ...item, ...note } : item)),
      );
      invalidateNotes(slug);
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
      invalidateNotes(slug);
    },
  });

  return {
    data: query.data,
    isLoading: query.isLoading,
    error: query.error,
    createNote: (input: CreateNoteInput) => createMutation.mutateAsync(input),
    updateNote: (id: number, patch: UpdateNoteInput) => updateMutation.mutateAsync({ id, patch }),
    deleteNote: (id: number) => deleteMutation.mutateAsync(id),
    isCreating: createMutation.isPending,
    isUpdating: updateMutation.isPending,
    isDeleting: deleteMutation.isPending,
  };
}
