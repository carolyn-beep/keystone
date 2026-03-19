/**
 * useCategories — data hook for category CRUD in the Knowledge Tree.
 *
 * Provides mutations for:
 * - create (add new category)
 * - update (rename/reorder category)
 * - remove (delete category, items become uncategorized)
 * - assignItem (reassign LS item to a category or uncategorized)
 *
 * All mutations invalidate both ['categories', slug] and ['knowledge-tree', slug]
 * to keep the knowledge tree list and category data in sync.
 */

import { useQuery, useMutation } from '@tanstack/react-query';
import { queryClient, apiRequest } from '@/lib/queryClient';

// ─── Types ──────────────────────────────────────────────────────────────────

export interface CategoryResponse {
  id: number;
  name: string;
  sortOrder: number | null;
  sourceCount: number;
}

// ─── Cache Invalidation ─────────────────────────────────────────────────────

function invalidateCategoryQueries(slug: string) {
  queryClient.invalidateQueries({ queryKey: ['categories', slug] });
  queryClient.invalidateQueries({ queryKey: ['knowledge-tree', slug] });
}

// ─── Hook ───────────────────────────────────────────────────────────────────

export function useCategories(slug: string) {
  const query = useQuery<CategoryResponse[]>({
    queryKey: ['categories', slug],
    queryFn: async () => {
      const res = await fetch(`/api/brainlifts/${slug}/categories`);
      if (!res.ok) throw new Error('Failed to fetch categories');
      return res.json();
    },
    enabled: !!slug,
  });

  // Create a new category
  const createMutation = useMutation({
    mutationFn: async (name: string): Promise<CategoryResponse> => {
      const res = await apiRequest('POST', `/api/brainlifts/${slug}/categories`, { name });
      return res.json();
    },
    onSuccess: () => invalidateCategoryQueries(slug),
  });

  // Update (rename/reorder) a category
  const updateMutation = useMutation({
    mutationFn: async ({ id, fields }: { id: number; fields: { name?: string; sortOrder?: number | null } }) => {
      return apiRequest('PATCH', `/api/brainlifts/${slug}/categories/${id}`, fields);
    },
    onSuccess: () => invalidateCategoryQueries(slug),
  });

  // Delete a category
  const removeMutation = useMutation({
    mutationFn: async (id: number) => {
      return apiRequest('DELETE', `/api/brainlifts/${slug}/categories/${id}`);
    },
    onSuccess: () => invalidateCategoryQueries(slug),
  });

  // Assign an item to a category (or uncategorized)
  const assignItemMutation = useMutation({
    mutationFn: async ({ itemId, categoryId }: { itemId: number; categoryId: number | null }) => {
      return apiRequest('PATCH', `/api/brainlifts/${slug}/learning-stream/${itemId}/category`, { categoryId });
    },
    onSuccess: () => invalidateCategoryQueries(slug),
  });

  return {
    // Data
    categories: query.data ?? [],
    isLoading: query.isLoading,
    error: query.error,

    // Mutations
    createCategory: async (name: string) => createMutation.mutateAsync(name),
    update: async (id: number, fields: { name?: string; sortOrder?: number | null }) => {
      await updateMutation.mutateAsync({ id, fields });
    },
    remove: async (id: number) => { await removeMutation.mutateAsync(id); },
    assignItem: async (itemId: number, categoryId: number | null) => {
      await assignItemMutation.mutateAsync({ itemId, categoryId });
    },

    // Loading states
    isCreating: createMutation.isPending,
    isUpdating: updateMutation.isPending,
    isRemoving: removeMutation.isPending,
    isAssigning: assignItemMutation.isPending,
  };
}
