import { useMemo } from 'react';
import { useChatRuntime, AssistantChatTransport } from '@assistant-ui/react-ai-sdk';

/**
 * Hook that creates an assistant-ui runtime connected to the import agent endpoint.
 * Resets conversation when slug changes via transport key.
 */
export function useImportAgent(slug: string) {
  const transport = useMemo(
    () =>
      new AssistantChatTransport({
        api: `/api/brainlifts/${slug}/import-agent`,
        credentials: 'include',
      }),
    [slug]
  );

  const runtime = useChatRuntime({ transport });

  return runtime;
}
