import { useQuery } from '@tanstack/react-query';

interface PurposeSuggestionsResponse {
  suggestions: string[];
}

/**
 * Fetches purpose suggestions for a given topic.
 * Returns empty array on failure (non-blocking).
 * Only fires when topic is provided (enabled guard).
 */
export function usePurposeSuggestions(topic: string | null) {
  return useQuery({
    queryKey: ['purpose-suggestions', topic],
    queryFn: async (): Promise<string[]> => {
      if (!topic) return [];

      try {
        const res = await fetch('/api/brainlifts/native/purpose-suggestions', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ topic }),
        });

        if (!res.ok) return [];

        const data: PurposeSuggestionsResponse = await res.json();
        return data.suggestions ?? [];
      } catch {
        return [];
      }
    },
    enabled: !!topic && topic.trim().length >= 10,
    staleTime: 5 * 60 * 1000, // Cache suggestions for 5 minutes
    retry: false, // Don't retry on failure -- just hide suggestions
  });
}
