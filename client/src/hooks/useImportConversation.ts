import { useQuery } from '@tanstack/react-query';
import { getQueryFn } from '@/lib/queryClient';
import type { UIMessage } from 'ai';

interface ConversationResponse {
  conversation: {
    messages: UIMessage[];
    currentPhase: string;
    updatedAt: string;
  } | null;
}

export function useImportConversation(slug: string | null) {
  const query = useQuery<ConversationResponse>({
    queryKey: [`/api/brainlifts/${slug}/import-agent/conversation`],
    queryFn: getQueryFn({ on401: 'throw' }),
    enabled: !!slug,
    staleTime: Infinity,
  });

  return {
    messages: query.data?.conversation?.messages ?? null,
    currentPhase: query.data?.conversation?.currentPhase ?? null,
    isLoading: query.isLoading,
  };
}
