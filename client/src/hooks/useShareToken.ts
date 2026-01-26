import { useEffect } from 'react';
import { useMutation } from '@tanstack/react-query';
import { useSearch, useLocation } from 'wouter';
import { apiRequest, queryClient } from '@/lib/queryClient';
import { toast } from '@/hooks/use-toast';

export function useShareToken() {
  const searchString = useSearch();
  const [, setLocation] = useLocation();

  const redeemTokenMutation = useMutation({
    mutationFn: async (token: string) => {
      const res = await apiRequest('POST', '/api/shares/validate-token', { token });
      return res.json();
    },
    onSuccess: (data) => {
      // Invalidate brainlift queries so the user gets the latest data
      queryClient.invalidateQueries({ queryKey: ['brainlift'] });
      queryClient.invalidateQueries({ queryKey: ['/api/brainlifts'] });

      toast({
        title: 'Access granted',
        description: `You now have ${data.permission} access to ${data.brainliftTitle}.`,
      });

      // Clean up URL by removing the share token
      const params = new URLSearchParams(window.location.search);
      params.delete('share');
      const newSearch = params.toString();
      const newUrl = newSearch ? `${window.location.pathname}?${newSearch}` : window.location.pathname;
      window.history.replaceState(null, '', newUrl);
    },
    onError: (error: Error) => {
      toast({
        title: 'Invalid share link',
        description: error.message || 'This share link is invalid or has expired.',
        variant: 'destructive',
      });

      // Redirect to home after a delay
      setTimeout(() => {
        setLocation('/');
      }, 2000);
    },
  });

  useEffect(() => {
    const params = new URLSearchParams(searchString);
    const token = params.get('share');

    if (token && !redeemTokenMutation.isPending) {
      redeemTokenMutation.mutate(token);
    }
  }, [searchString]); // Only run when search string changes

  return {
    isRedeeming: redeemTokenMutation.isPending,
  };
}
