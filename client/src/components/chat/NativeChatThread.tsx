import { useEffect, useRef } from 'react';
import { AssistantRuntimeProvider, useThread, useThreadRuntime } from '@assistant-ui/react';
import { Thread } from '@assistant-ui/react-ui';
import type { UIMessage } from 'ai';
import type { ChatModelId } from '@shared/chat-models';
import {
  markChatOpenerSent,
  OPENER_PROMPT,
  shouldSendChatOpener,
} from '@/chat/chat-opener';
import { queryClient } from '@/lib/queryClient';
import {
  CHAT_CONVERSATIONS_QUERY_KEY,
  getChatConversationQueryKey,
} from '@/hooks/useChatConversations';
import { useNativeChatRuntime } from '@/hooks/useNativeChatRuntime';
import { buildNativeChatThreadConfig } from './native-chat-thread-config';
import { ChatComposerSettingsProvider } from './ChatComposer';

/**
 * Module-level guard. Ensures auto-send prompts fire at most once per
 * conversation across StrictMode double-mount, HMR, and parent remounts.
 */
const firedAutoSendForConversation = new Set<number>();

function OpenerTrigger({
  hasInitialMessages,
  shouldConsiderOpener,
  userId,
}: {
  hasInitialMessages: boolean;
  shouldConsiderOpener: boolean;
  userId: string | null;
}) {
  const threadRuntime = useThreadRuntime();

  useEffect(() => {
    if (!shouldConsiderOpener) return;
    if (hasInitialMessages) return;
    if (!userId) return;
    if (!shouldSendChatOpener(userId)) return;
    markChatOpenerSent(userId);

    threadRuntime.append({
      role: 'user',
      content: [{ type: 'text', text: OPENER_PROMPT }],
    });
  }, [hasInitialMessages, shouldConsiderOpener, threadRuntime, userId]);

  return null;
}

/**
 * Auto-sends a user message exactly once when entering a conversation.
 * Used for "Try it out" on Skills and "Generate Sprint Plan" on the sprint
 * tab — both navigate to `/?c=ID&send=...` and expect the message to fire
 * without further interaction.
 */
function AutoSendTrigger({
  conversationId,
  hasInitialMessages,
  message,
}: {
  conversationId: number;
  hasInitialMessages: boolean;
  message: string | null;
}) {
  const threadRuntime = useThreadRuntime();

  useEffect(() => {
    if (!message) return;
    if (hasInitialMessages) return;
    if (firedAutoSendForConversation.has(conversationId)) return;
    firedAutoSendForConversation.add(conversationId);

    threadRuntime.append({
      role: 'user',
      content: [{ type: 'text', text: message }],
    });
  }, [conversationId, hasInitialMessages, message, threadRuntime]);

  return null;
}

const nativeChatThreadConfig = buildNativeChatThreadConfig();

interface NativeChatThreadProps {
  conversationId: number;
  initialMessages?: UIMessage[] | null;
  modelId: ChatModelId;
  onModelIdChange: (next: ChatModelId) => void;
  userId: string | null;
  /** True only for empty conversations auto-created from the bare chat homepage. */
  shouldConsiderOpener: boolean;
  /** Optional message to send automatically once on conversation entry. */
  initialUserMessage?: string | null;
}

function ConversationQueryInvalidator({
  conversationId,
}: {
  conversationId: number;
}) {
  const isRunning = useThread((state) => state.isRunning);
  const previousRunningRef = useRef(false);

  useEffect(() => {
    if (previousRunningRef.current && !isRunning) {
      queryClient.invalidateQueries({
        queryKey: CHAT_CONVERSATIONS_QUERY_KEY,
      });
      queryClient.invalidateQueries({
        queryKey: getChatConversationQueryKey(conversationId),
      });
    }

    previousRunningRef.current = isRunning;
  }, [conversationId, isRunning]);

  return null;
}

export function NativeChatThread({
  conversationId,
  initialMessages,
  modelId,
  onModelIdChange,
  userId,
  shouldConsiderOpener,
  initialUserMessage = null,
}: NativeChatThreadProps) {
  const runtime = useNativeChatRuntime({
    conversationId,
    initialMessages,
    modelId,
  });

  const hasInitialMessages = Boolean(initialMessages && initialMessages.length > 0);

  return (
    <AssistantRuntimeProvider runtime={runtime}>
      <ChatComposerSettingsProvider
        modelId={modelId}
        onModelIdChange={onModelIdChange}
      >
        <div className="native-chat-thread flex h-full min-h-0 flex-col bg-transparent">
          <ConversationQueryInvalidator conversationId={conversationId} />
          <OpenerTrigger
            hasInitialMessages={hasInitialMessages}
            shouldConsiderOpener={shouldConsiderOpener}
            userId={userId}
          />
          <AutoSendTrigger
            conversationId={conversationId}
            hasInitialMessages={hasInitialMessages}
            message={initialUserMessage}
          />
          <Thread {...nativeChatThreadConfig} />
        </div>
      </ChatComposerSettingsProvider>
    </AssistantRuntimeProvider>
  );
}
