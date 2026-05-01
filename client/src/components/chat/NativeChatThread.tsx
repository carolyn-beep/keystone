import { useEffect, useRef } from 'react';
import { AssistantRuntimeProvider, useThread, useThreadRuntime } from '@assistant-ui/react';
import { Thread } from '@assistant-ui/react-ui';
import type { UIMessage } from 'ai';
import type { ChatModelId } from '@shared/chat-models';
import { OPENER_PROMPT } from '@/chat/chat-opener';
import { queryClient } from '@/lib/queryClient';
import {
  CHAT_CONVERSATIONS_QUERY_KEY,
  getChatConversationQueryKey,
} from '@/hooks/useChatConversations';
import { useNativeChatRuntime } from '@/hooks/useNativeChatRuntime';
import { buildNativeChatThreadConfig } from './native-chat-thread-config';
import { ChatComposerSettingsProvider } from './ChatComposer';

/**
 * Module-level guard. Ensures the opener prompt fires at most once per
 * conversation across StrictMode double-mount, HMR, and parent remounts.
 * Lives at module scope on purpose — surviving unmount/remount within the
 * session is the desired behavior. See client/src/chat/chat-opener.ts.
 */
const firedOpenerForConversation = new Set<number>();

/**
 * Renders nothing. Fires `runtime.append(OPENER_PROMPT)` exactly once when
 * three conditions hold:
 *
 *   1. The conversation is flagged `needsOpener` server-side (set at
 *      conversation-creation time when the user had zero prior conversations).
 *   2. No initial messages are present (the conversation is brand-new).
 *   3. We have not already fired for this conversation in the current session
 *      (module-level Set guard).
 *
 * Lives inside the runtime provider so it can call `useThreadRuntime()`.
 * See client/src/chat/chat-opener.ts.
 */
function OpenerTrigger({
  conversationId,
  hasInitialMessages,
  needsOpener,
}: {
  conversationId: number;
  hasInitialMessages: boolean;
  needsOpener: boolean;
}) {
  const threadRuntime = useThreadRuntime();

  useEffect(() => {
    if (!needsOpener) return;
    if (hasInitialMessages) return;
    if (firedOpenerForConversation.has(conversationId)) return;
    firedOpenerForConversation.add(conversationId);

    threadRuntime.append({
      role: 'user',
      content: [{ type: 'text', text: OPENER_PROMPT }],
    });
  }, [conversationId, hasInitialMessages, needsOpener, threadRuntime]);

  return null;
}

const nativeChatThreadConfig = buildNativeChatThreadConfig();

interface NativeChatThreadProps {
  conversationId: number;
  initialMessages?: UIMessage[] | null;
  modelId: ChatModelId;
  onModelIdChange: (next: ChatModelId) => void;
  /** Server-driven flag: this conversation should be opened by the chat opener. */
  needsOpener: boolean;
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
  needsOpener,
}: NativeChatThreadProps) {
  const runtime = useNativeChatRuntime({
    conversationId,
    initialMessages,
    modelId,
  });

  const hasInitialMessages = Boolean(initialMessages && initialMessages.length > 0);

  return (
    <AssistantRuntimeProvider runtime={runtime}>
      <ChatComposerSettingsProvider modelId={modelId} onModelIdChange={onModelIdChange}>
        <div className="native-chat-thread flex h-full min-h-0 flex-col bg-transparent">
          <ConversationQueryInvalidator conversationId={conversationId} />
          <OpenerTrigger
            conversationId={conversationId}
            hasInitialMessages={hasInitialMessages}
            needsOpener={needsOpener}
          />
          <Thread {...nativeChatThreadConfig} />
        </div>
      </ChatComposerSettingsProvider>
    </AssistantRuntimeProvider>
  );
}
