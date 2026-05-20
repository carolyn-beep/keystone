import { useEffect, useRef, useState } from 'react';
import { AssistantRuntimeProvider, useThread, useThreadRuntime } from '@assistant-ui/react';
import { Thread } from '@assistant-ui/react-ui';
import type { UIMessage } from 'ai';
import type { ChatModelId } from '@shared/chat-models';
import { OPENER_PROMPT } from '@/chat/chat-opener';
import { brand } from '@/brand';
import { authClient } from '@/lib/auth-client';
import { queryClient } from '@/lib/queryClient';
import {
  CHAT_CONVERSATIONS_QUERY_KEY,
  getChatConversationQueryKey,
} from '@/hooks/useChatConversations';
import { useNativeChatRuntime } from '@/hooks/useNativeChatRuntime';
import { useComposerDraft } from '@/hooks/useComposerDraft';
import { buildNativeChatThreadConfig } from './native-chat-thread-config';
import { ChatComposerSettingsProvider } from './ChatComposer';
import { ChatHistoryLoader } from './ChatHistoryLoader';

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
 * Module-level guard for the `initialAskMessage` (JLS-146 "Chat About This
 * BrainLift" path). Same rationale as `firedOpenerForConversation`.
 */
const firedAskForConversation = new Set<number>();

/**
 * Renders nothing. Fires the opener exactly once when three conditions hold:
 *
 *   1. The conversation is flagged `needsOpener` server-side (set at
 *      conversation-creation time when the user had zero prior conversations).
 *   2. No initial messages are present (the conversation is brand-new).
 *   3. We have not already fired for this conversation in the current session
 *      (module-level Set guard).
 *
 * Brand behaviour differs:
 *   - AlphaX: appends a synthetic ASSISTANT message with hardcoded welcome
 *     text personalized with the student's first name. The AI SDK adapter's
 *     `onNew` callback still fires a request to `/api/chat/stream`, but the
 *     server detects "last message is assistant" and short-circuits without
 *     calling a model — so no extra paragraph follows. The synthetic stays
 *     in `chatHelpers.messages` so the student's next reply ships with it
 *     in the request payload.
 *   - Brainlift Central: appends an invisible USER message (`[OPENER]`) which
 *     the model responds to per its system prompt's journey-stage heuristics.
 *     `FilteringUserMessage` hides the user message from the visible thread.
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
  const { data: session } = authClient.useSession();
  const fullName = session?.user?.name ?? null;

  useEffect(() => {
    if (!needsOpener) return;
    if (hasInitialMessages) return;
    if (firedOpenerForConversation.has(conversationId)) return;
    firedOpenerForConversation.add(conversationId);

    if (brand.syntheticOpenerText) {
      const firstName = fullName?.trim().split(/\s+/)[0] ?? null;
      threadRuntime.append({
        role: 'assistant',
        content: [{ type: 'text', text: brand.syntheticOpenerText(firstName) }],
      });
      return;
    }

    threadRuntime.append({
      role: 'user',
      content: [{ type: 'text', text: OPENER_PROMPT }],
    });
  }, [conversationId, hasInitialMessages, needsOpener, threadRuntime, fullName]);

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

/**
 * Renders nothing. Fires `runtime.append({ role: 'user', text: askMessage })`
 * exactly once when the conversation was opened via the "Chat About This
 * BrainLift" button on a BrainLift page. The ask message is a real user
 * message (visible in the thread, persisted to the DB); the agent reads it
 * and calls `get_brainlift_assessment` to load the BrainLift context.
 *
 * Mutually exclusive with `OpenerTrigger` — the parent guarantees only one
 * is armed for a given conversation.
 */
function AskTrigger({
  conversationId,
  hasInitialMessages,
  askMessage,
}: {
  conversationId: number;
  hasInitialMessages: boolean;
  askMessage: string | null;
}) {
  const threadRuntime = useThreadRuntime();

  useEffect(() => {
    if (!askMessage) return;
    if (hasInitialMessages) return;
    if (firedAskForConversation.has(conversationId)) return;
    firedAskForConversation.add(conversationId);

    threadRuntime.append({
      role: 'user',
      content: [{ type: 'text', text: askMessage }],
    });
  }, [askMessage, conversationId, hasInitialMessages, threadRuntime]);

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
  /**
   * Cursor for `loadOlder` infinite scroll. `null` means the initial fetch
   * returned the full history (no more pages). See `ChatHistoryLoader`.
   */
  initialNextBeforeId?: number | null;
  modelId: ChatModelId;
  onModelIdChange: (next: ChatModelId) => void;
  /** Server-driven flag: this conversation should be opened by the chat opener. */
  needsOpener: boolean;
  /**
   * "Chat About This BrainLift" entrypoint: when set, fires this string as
   * the first visible user message on mount (once). Mutually exclusive with
   * `needsOpener` at the parent level.
   */
  initialAskMessage?: string | null;
  /**
   * Notified exactly once after a draft chat is lazy-created on first send.
   * Parent uses this to refresh the conversation list and push the new URL.
   */
  onLazyCreated?: (conversationId: number) => void;
  /** Optional message to send automatically once on conversation entry (Skills Try-it-out `?send=`). */
  initialUserMessage?: string | null;
}

/**
 * Renderless: keeps the chat composer's draft text persisted in localStorage
 * per conversation. Lives inside `AssistantRuntimeProvider` so the hook can
 * call `useComposerRuntime` / `useThread`. Mirrors `ConversationQueryInvalidator`.
 */
function ComposerDraftSync({
  conversationId,
}: {
  conversationId: number | null;
}) {
  useComposerDraft(conversationId);
  return null;
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
  initialNextBeforeId = null,
  modelId,
  onModelIdChange,
  needsOpener,
  initialAskMessage = null,
  onLazyCreated,
  initialUserMessage = null,
}: NativeChatThreadProps) {
  const threadContainerRef = useRef<HTMLDivElement>(null);

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

  // Draft-mode pending brainlift binding. Held locally so the picker can
  // be set BEFORE any DB row exists; the runtime PATCHes it onto the new
  // conversation immediately after lazy-create (before the first message
  // is sent) so the chat route's mode resolver sees the binding from turn
  // one. Cleared on draft -> bound promotion to avoid re-binding on
  // subsequent picker changes (those go through the normal PATCH path).
  const [pendingDraftBrainliftId, setPendingDraftBrainliftId] = useState<number | null>(null);
  const pendingDraftBrainliftIdRef = useRef<number | null>(null);
  useEffect(() => {
    pendingDraftBrainliftIdRef.current = pendingDraftBrainliftId;
  }, [pendingDraftBrainliftId]);

  const runtime = useNativeChatRuntime({
    conversationId,
    initialMessages,
    modelId,
    onLazyCreated: (id) => {
      setEffectiveConvId(id);
      setPendingDraftBrainliftId(null);
      onLazyCreated?.(id);
    },
    getPendingDraftBrainliftId: () => pendingDraftBrainliftIdRef.current,
  });

  const hasInitialMessages = Boolean(initialMessages && initialMessages.length > 0);

  return (
    <AssistantRuntimeProvider runtime={runtime}>
      <ChatComposerSettingsProvider
        modelId={modelId}
        onModelIdChange={onModelIdChange}
        conversationId={effectiveConvId}
        pendingDraftBrainliftId={pendingDraftBrainliftId}
        setPendingDraftBrainliftId={setPendingDraftBrainliftId}
      >
        <div
          ref={threadContainerRef}
          className="native-chat-thread relative flex h-full min-h-0 flex-col bg-transparent"
        >
          <ConversationQueryInvalidator conversationId={effectiveConvId} />
          <ComposerDraftSync conversationId={effectiveConvId} />
          <ChatHistoryLoader
            containerRef={threadContainerRef}
            conversationId={effectiveConvId}
            initialNextBeforeId={initialNextBeforeId}
          />
          {effectiveConvId !== null && (
            <>
              <OpenerTrigger
                conversationId={effectiveConvId}
                hasInitialMessages={hasInitialMessages}
                needsOpener={needsOpener}
              />
              <AskTrigger
                conversationId={effectiveConvId}
                hasInitialMessages={hasInitialMessages}
                askMessage={initialAskMessage}
              />
            </>
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
