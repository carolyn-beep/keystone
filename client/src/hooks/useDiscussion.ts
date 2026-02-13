import { useMemo } from 'react';
import { useChatRuntime, AssistantChatTransport } from '@assistant-ui/react-ai-sdk';

/**
 * Hook that creates an assistant-ui runtime connected to the discussion endpoint.
 * Resets conversation when itemId changes via transport key.
 */
export function useDiscussion(slug: string, itemId: number) {
  const transport = useMemo(
    () =>
      new AssistantChatTransport({
        api: `/api/brainlifts/${slug}/discussion`,
        credentials: 'include',
        body: { itemId },
      }),
    [slug, itemId]
  );

  const runtime = useChatRuntime({ transport });

  return runtime;
}
