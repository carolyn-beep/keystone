import { useEffect, useRef, useState } from 'react';
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
 * Module-level guard for AutoSendTrigger (Skills Try-it-out / Sprint plan
 * "?send=" auto-send). Same rationale as `firedOpenerForConversation`.
 */
const firedAutoSendForConversation = new Set<number>();

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
  /**
   * `null` means DRAFT: no chat_conversations row exists yet. The runtime
   * lazy-creates one on the first `submit-message` send. Once created, the
   * `onLazyCreated` callback fires with the new ID and the parent should
   * update routing/state accordingly.
   *
   * Number means normal: every send addresses this ID.
   */
  conversationId: number | null;
  initialMessages?: UIMessage[] | null;
  modelId: ChatModelId;
  onModelIdChange: (next: ChatModelId) => void;
  /** Server-driven flag: this conversation should be opened by the chat opener. */
  needsOpener: boolean;
  /**
   * Notified exactly once after a draft chat is lazy-created on first send.
   * Parent uses this to refresh the conversation list and push the new URL.
   */
  onLazyCreated?: (conversationId: number) => void;
  /** Optional message to send automatically once on conversation entry (Skills Try-it-out `?send=`). */
  initialUserMessage?: string | null;
}

function ConversationQueryInvalidator({
  conversationId,
}: {
  conversationId: number | null;
}) {
  const isRunning = useThread((state) => state.isRunning);
  const previousRunningRef = useRef(false);

  useEffect(() => {
    if (previousRunningRef.current && !isRunning) {
      queryClient.invalidateQueries({
        queryKey: CHAT_CONVERSATIONS_QUERY_KEY,
      });
      // In draft mode (conversationId still null) we have nothing scoped to
      // invalidate yet — the lazy-create handler invalidates the list once
      // the new ID is known.
      if (conversationId !== null) {
        queryClient.invalidateQueries({
          queryKey: getChatConversationQueryKey(conversationId),
        });
      }
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
  onLazyCreated,
  initialUserMessage = null,
}: NativeChatThreadProps) {
  // Track the "effective" conversation ID for child components (triggers,
  // query invalidator). Starts at the prop, gets promoted to the
  // lazy-created ID after a draft submit. We don't propagate the new ID
  // back through props because the parent typically only learns of it
  // through `onLazyCreated` (which may navigate the URL after the stream).
  const [effectiveConvId, setEffectiveConvId] = useState<number | null>(conversationId);

  useEffect(() => {
    if (conversationId !== null) {
      setEffectiveConvId(conversationId);
    }
  }, [conversationId]);

  const runtime = useNativeChatRuntime({
    conversationId,
    initialMessages,
    modelId,
    onLazyCreated: (id) => {
      setEffectiveConvId(id);
      onLazyCreated?.(id);
    },
  });

  const hasInitialMessages = Boolean(initialMessages && initialMessages.length > 0);

  return (
    <AssistantRuntimeProvider runtime={runtime}>
      <ChatComposerSettingsProvider
        modelId={modelId}
        onModelIdChange={onModelIdChange}
      >
        <div className="native-chat-thread flex h-full min-h-0 flex-col bg-transparent">
          <ConversationQueryInvalidator conversationId={effectiveConvId} />
          {effectiveConvId !== null && (
            <OpenerTrigger
              conversationId={effectiveConvId}
              hasInitialMessages={hasInitialMessages}
              needsOpener={needsOpener}
            />
          )}
          {effectiveConvId !== null && (
            <AutoSendTrigger
              conversationId={effectiveConvId}
              hasInitialMessages={hasInitialMessages}
              message={initialUserMessage}
            />
          )}
          <Thread {...nativeChatThreadConfig} />
        </div>
      </ChatComposerSettingsProvider>
    </AssistantRuntimeProvider>
  );
}
