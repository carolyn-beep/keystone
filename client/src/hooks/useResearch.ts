import { useMutation } from '@tanstack/react-query';

interface UseResearchOptions {
  onResearchSuccess?: (data: any) => void;
  onTweetSearchSuccess?: (data: any) => void;
  onTweetSearchError?: (error: Error) => void;
}

export function useResearch(brainliftSlug: string, options?: UseResearchOptions) {
  const researchMutation = useMutation({
    mutationFn: async ({ mode, query }: { mode: 'quick' | 'deep'; query?: string }) => {
      const res = await fetch(`/api/brainlifts/${brainliftSlug}/research`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ mode: mode === 'deep' ? 'deep' : 'quick', query }),
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.message || 'Research failed');
      }
      return res.json();
    },
    onSuccess: options?.onResearchSuccess,
  });

  const tweetSearchMutation = useMutation({
    mutationFn: async () => {
      const res = await fetch(`/api/brainlifts/${brainliftSlug}/tweets`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.message || 'Tweet search failed');
      }
      return res.json();
    },
    onSuccess: options?.onTweetSearchSuccess,
    onError: options?.onTweetSearchError,
  });

  return {
    research: researchMutation.mutateAsync,
    isResearching: researchMutation.isPending,
    researchData: researchMutation.data,
    searchTweets: tweetSearchMutation.mutateAsync,
    isSearchingTweets: tweetSearchMutation.isPending,
    tweetResults: tweetSearchMutation.data,
    researchMutation,
    tweetSearchMutation,
  };
}
