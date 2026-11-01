import { useMemo } from 'react';
import { useChatRuntime, AssistantChatTransport } from '@assistant-ui/react-ai-sdk';

/**
 * Hook that creates an assistant-ui runtime connected to the discussion endpoint.
 * Resets conversation when itemId changes via transport key.
 * In builder mode, passes builderContext to enable item-aware tool branching.
 */
export function useDiscussion(slug: string, itemId: number, builderMode?: boolean) {
  const transport = useMemo(
    () =>
      new AssistantChatTransport({
        api: `/api/brainlifts/${slug}/discussion`,
        credentials: 'include',
        body: builderMode
          ? { itemId, builderContext: { mode: 'builder' } }
          : { itemId },
      }),
    [slug, itemId, builderMode]
  );

  const runtime = useChatRuntime({ transport });

  return runtime;
}
