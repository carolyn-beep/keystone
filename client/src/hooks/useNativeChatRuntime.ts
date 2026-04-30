import { useMemo } from 'react';
import { AssistantChatTransport, useChatRuntime } from '@assistant-ui/react-ai-sdk';
import type { UIMessage } from 'ai';

export interface UseNativeChatRuntimeArgs {
  conversationId: number;
  modelId: string;
  initialMessages?: UIMessage[] | null;
}

export interface NativeChatRuntimeConfig {
  transport: {
    api: string;
    credentials: 'include';
    body: {
      conversationId: number;
      config: {
        modelName: string;
      };
    };
  };
  messages?: UIMessage[];
}

export function buildNativeChatRuntimeConfig({
  conversationId,
  modelId,
  initialMessages,
}: UseNativeChatRuntimeArgs): NativeChatRuntimeConfig {
  const config: NativeChatRuntimeConfig = {
    transport: {
      api: '/api/chat/stream',
      credentials: 'include',
      body: {
        conversationId,
        config: {
          modelName: modelId,
        },
      },
    },
  };

  if (initialMessages && initialMessages.length > 0) {
    config.messages = initialMessages;
  }

  return config;
}

export function useNativeChatRuntime(args: UseNativeChatRuntimeArgs) {
  const runtimeConfig = useMemo(
    () => buildNativeChatRuntimeConfig(args),
    [args.conversationId, args.initialMessages, args.modelId],
  );

  const transport = useMemo(
    () => new AssistantChatTransport(runtimeConfig.transport),
    [
      runtimeConfig.transport.api,
      runtimeConfig.transport.body.config.modelName,
      runtimeConfig.transport.body.conversationId,
    ],
  );

  return useChatRuntime({
    transport,
    ...(runtimeConfig.messages ? { messages: runtimeConfig.messages } : {}),
  });
}
