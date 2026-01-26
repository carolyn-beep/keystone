import { useQuery, useMutation } from '@tanstack/react-query';
import { queryClient, apiRequest } from '@/lib/queryClient';
import { toast } from '@/hooks/use-toast';

export interface UserShare {
  id: number;
  userId: string;
  userName: string;
  userEmail: string;
  permission: 'viewer' | 'editor';
  createdAt: string;
}

export interface TokenShare {
  token: string;
  permission: 'viewer' | 'editor';
  createdAt: string;
}

export interface SharesData {
  userShares: UserShare[];
  tokenShare: TokenShare | null;
}

export function useShares(slug: string, enabled: boolean = true) {
  const queryKey = ['brainlift-shares', slug];

  // Fetch shares
  const { data: shares, isLoading } = useQuery<SharesData>({
    queryKey,
    queryFn: async () => {
      const res = await apiRequest('GET', `/api/brainlifts/${slug}/shares`);
      return res.json();
    },
    enabled,
  });

  // Create user share
  const createShareMutation = useMutation({
    mutationFn: async ({ identifier, permission }: { identifier: string; permission: 'viewer' | 'editor' }) => {
      const res = await apiRequest('POST', `/api/brainlifts/${slug}/shares`, {
        identifier,
        permission,
      });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey });
      toast({
        title: 'Share created',
        description: 'User has been granted access to this brainlift.',
      });
    },
    onError: (error: Error) => {
      toast({
        title: 'Failed to create share',
        description: error.message,
        variant: 'destructive',
      });
    },
  });

  // Update share permission
  const updatePermissionMutation = useMutation({
    mutationFn: async ({ shareId, permission }: { shareId: number; permission: 'viewer' | 'editor' }) => {
      const res = await apiRequest('PATCH', `/api/brainlifts/${slug}/shares/${shareId}`, {
        permission,
      });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey });
      toast({
        title: 'Permission updated',
        description: 'User permission has been changed.',
      });
    },
    onError: (error: Error) => {
      toast({
        title: 'Failed to update permission',
        description: error.message,
        variant: 'destructive',
      });
    },
  });

  // Delete share
  const deleteShareMutation = useMutation({
    mutationFn: async (shareId: number) => {
      await apiRequest('DELETE', `/api/brainlifts/${slug}/shares/${shareId}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey });
      toast({
        title: 'Access revoked',
        description: 'User no longer has access to this brainlift.',
      });
    },
    onError: (error: Error) => {
      toast({
        title: 'Failed to revoke access',
        description: error.message,
        variant: 'destructive',
      });
    },
  });

  // Get or create share token
  const getOrCreateTokenMutation = useMutation({
    mutationFn: async (permission: 'viewer' | 'editor') => {
      const res = await apiRequest('POST', `/api/brainlifts/${slug}/share-token`, {
        permission,
      });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey });
      toast({
        title: 'Share link created',
        description: 'You can now share this link with others.',
      });
    },
    onError: (error: Error) => {
      toast({
        title: 'Failed to create share link',
        description: error.message,
        variant: 'destructive',
      });
    },
  });

  return {
    shares,
    isLoading,
    createShare: createShareMutation.mutateAsync,
    isCreating: createShareMutation.isPending,
    updatePermission: updatePermissionMutation.mutateAsync,
    isUpdating: updatePermissionMutation.isPending,
    deleteShare: deleteShareMutation.mutateAsync,
    isDeleting: deleteShareMutation.isPending,
    getOrCreateToken: getOrCreateTokenMutation.mutateAsync,
    isCreatingToken: getOrCreateTokenMutation.isPending,
  };
}
