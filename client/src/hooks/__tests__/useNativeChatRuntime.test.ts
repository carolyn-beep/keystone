import { describe, expect, it } from 'vitest';
import type { UIMessage } from 'ai';
import { DEFAULT_CHAT_MODEL_ID } from '@shared/chat-models';
import { buildNativeChatRuntimeConfig } from '../useNativeChatRuntime';

const storedMessages = [
  {
    id: 'msg-1',
    role: 'user',
    parts: [{ type: 'text', text: 'Hello there' }],
  },
] as unknown as UIMessage[];

describe('native chat runtime config', () => {
  it('targets the native chat stream endpoint with the selected conversation and model', () => {
    expect(
      buildNativeChatRuntimeConfig({
        conversationId: 17,
        modelId: DEFAULT_CHAT_MODEL_ID,
      }),
    ).toEqual({
      transport: {
        api: '/api/chat/stream',
        credentials: 'include',
        body: {
          conversationId: 17,
          config: {
            modelName: DEFAULT_CHAT_MODEL_ID,
          },
        },
      },
    });
  });

  it('hydrates stored messages when conversation history is available', () => {
    expect(
      buildNativeChatRuntimeConfig({
        conversationId: 17,
        modelId: DEFAULT_CHAT_MODEL_ID,
        initialMessages: storedMessages,
      }),
    ).toEqual({
      transport: {
        api: '/api/chat/stream',
        credentials: 'include',
        body: {
          conversationId: 17,
          config: {
            modelName: DEFAULT_CHAT_MODEL_ID,
          },
        },
      },
      messages: storedMessages,
    });
  });
});
