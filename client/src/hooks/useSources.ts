import { useMutation, useQuery } from '@tanstack/react-query';
import { apiRequest, queryClient } from '@/lib/queryClient';
import type { CreateSourceInput, Source, UpdateSourceInput } from '@/types/second-brain';

export const getSourcesQueryKey = (slug: string) => ['sources', slug] as const;

async function readJson<T>(response: Response): Promise<T> {
  return response.json() as Promise<T>;
}

function invalidateSources(slug: string) {
  queryClient.invalidateQueries({ queryKey: getSourcesQueryKey(slug) });
  queryClient.invalidateQueries({ queryKey: ['categories', slug] });
}

export function useSources(slug: string) {
  const query = useQuery<Source[]>({
    queryKey: getSourcesQueryKey(slug),
    queryFn: async () => {
      const res = await fetch(`/api/brainlifts/${slug}/sources`, {
        credentials: 'include',
      });
      if (!res.ok) throw new Error('Failed to fetch sources');
      const payload = await res.json();
      return Array.isArray(payload) ? payload : payload.sources ?? [];
    },
    enabled: !!slug,
  });

  const createMutation = useMutation({
    mutationFn: async (input: CreateSourceInput): Promise<Source> => {
      const res = await apiRequest('POST', `/api/brainlifts/${slug}/sources`, input);
      return readJson<Source>(res);
    },
    onSuccess: (source) => {
      queryClient.setQueryData<Source[]>(getSourcesQueryKey(slug), (current = []) => {
        const withoutDuplicate = current.filter((item) => item.id !== source.id && item.url !== source.url);
        return [...withoutDuplicate, source];
      });
      invalidateSources(slug);
    },
  });

  const updateMutation = useMutation({
    mutationFn: async ({ id, patch }: { id: number; patch: UpdateSourceInput }): Promise<Source> => {
      const res = await apiRequest('PATCH', `/api/brainlifts/${slug}/sources/${id}`, patch);
      return readJson<Source>(res);
    },
    onSuccess: (source) => {
      queryClient.setQueryData<Source[]>(getSourcesQueryKey(slug), (current = []) =>
        current.map((item) => (item.id === source.id ? { ...item, ...source } : item)),
      );
      invalidateSources(slug);
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: number): Promise<void> => {
      await apiRequest('DELETE', `/api/brainlifts/${slug}/sources/${id}`);
    },
    onSuccess: (_result, id) => {
      queryClient.setQueryData<Source[]>(getSourcesQueryKey(slug), (current = []) =>
        current.filter((item) => item.id !== id),
      );
      invalidateSources(slug);
      queryClient.invalidateQueries({ queryKey: ['notes', slug] });
    },
  });

  // Spec 03 FR4 — bulk delete. Drops the selected ids from the cached
  // list and invalidates the notes query so per-source linked-notes
  // counts re-render (some notes may have been linked to deleted sources).
  const bulkDeleteMutation = useMutation({
    mutationFn: async (ids: number[]): Promise<void> => {
      await apiRequest('POST', `/api/brainlifts/${slug}/sources/bulk-delete`, { ids });
    },
    onSuccess: (_result, ids) => {
      const idSet = new Set(ids);
      queryClient.setQueryData<Source[]>(getSourcesQueryKey(slug), (current = []) =>
        current.filter((item) => !idSet.has(item.id)),
      );
      invalidateSources(slug);
      queryClient.invalidateQueries({ queryKey: ['notes', slug] });
    },
  });

  // Spec 03 FR4 — bulk recategorize. Patches categoryId on the cached
  // rows in place, then invalidates sources + categories so per-category
  // counts re-render.
  const bulkRecategorizeMutation = useMutation({
    mutationFn: async (
      { ids, categoryId }: { ids: number[]; categoryId: number },
    ): Promise<{ updated: number }> => {
      const res = await apiRequest(
        'POST',
        `/api/brainlifts/${slug}/sources/bulk-recategorize`,
        { ids, categoryId },
      );
      return readJson<{ updated: number }>(res);
    },
    onSuccess: (_result, { ids, categoryId }) => {
      const idSet = new Set(ids);
      queryClient.setQueryData<Source[]>(getSourcesQueryKey(slug), (current = []) =>
        current.map((item) => (idSet.has(item.id) ? { ...item, categoryId } : item)),
      );
      invalidateSources(slug);
    },
  });

  return {
    data: query.data,
    isLoading: query.isLoading,
    error: query.error,
    createSource: (input: CreateSourceInput) => createMutation.mutateAsync(input),
    updateSource: (id: number, patch: UpdateSourceInput) => updateMutation.mutateAsync({ id, patch }),
    deleteSource: (id: number) => deleteMutation.mutateAsync(id),
    bulkDeleteSources: (ids: number[]) => bulkDeleteMutation.mutateAsync(ids),
    bulkRecategorizeSources: ({ ids, categoryId }: { ids: number[]; categoryId: number }) =>
      bulkRecategorizeMutation.mutateAsync({ ids, categoryId }),
    isCreating: createMutation.isPending,
    isUpdating: updateMutation.isPending,
    isDeleting: deleteMutation.isPending,
    isBulkDeleting: bulkDeleteMutation.isPending,
    isBulkRecategorizing: bulkRecategorizeMutation.isPending,
  };
}
