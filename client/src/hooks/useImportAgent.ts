import { useMemo } from 'react';
import { useChatRuntime, AssistantChatTransport } from '@assistant-ui/react-ai-sdk';
import type { UIMessage } from 'ai';

/**
 * Hook that creates an assistant-ui runtime connected to the import agent endpoint.
 * Resets conversation when slug changes via transport key.
 * Optionally accepts initialMessages for session resume.
 */
export function useImportAgent(slug: string, initialMessages?: UIMessage[] | null) {
  const transport = useMemo(
    () =>
      new AssistantChatTransport({
        api: `/api/brainlifts/${slug}/import-agent`,
        credentials: 'include',
      }),
    [slug]
  );

  const runtime = useChatRuntime({
    transport,
    ...(initialMessages ? { messages: initialMessages } : {}),
  });

  return runtime;
}
