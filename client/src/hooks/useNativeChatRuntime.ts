import { useEffect, useMemo, useRef } from 'react';
import { AssistantChatTransport, useChatRuntime } from '@assistant-ui/react-ai-sdk';
import { lastAssistantMessageIsCompleteWithToolCalls, type UIMessage } from 'ai';
import { apiRequest, queryClient } from '@/lib/queryClient';
import {
  CHAT_CONVERSATIONS_QUERY_KEY,
  getChatConversationQueryKey,
  normalizeChatConversation,
  sortChatConversationsByRecency,
  type ChatConversationDetail,
} from './useChatConversations';
import type { ChatConversation } from '@shared/schema';

export interface UseNativeChatRuntimeArgs {
  /**
   * When `null`, the runtime is in DRAFT mode: no DB row exists yet. The
   * first `submit-message` send will lazy-create a `chat_conversations`
   * row via `POST /api/chat/conversations`, then forward the stream
   * request using the new ID. Subsequent sends reuse the cached ID.
   *
   * When a number, normal mode: every send addresses that ID.
   */
  conversationId: number | null;
  modelId: string;
  initialMessages?: UIMessage[] | null;
  /**
   * Called once after a lazy-create succeeds. The parent uses this to
   * update its own `selectedConversationId` state and (optionally) push
   * the new URL. Not called when `conversationId` was already non-null
   * at mount time.
   */
  onLazyCreated?: (conversationId: number) => void;
  /**
   * Read each time a lazy-create resolves. When non-null, the runtime
   * PATCHes `chat_conversations.brainlift_id` immediately after the row is
   * created and **before** the first chat request is sent — so the chat
   * route resolves mode against the bound brainlift on the very first
   * turn. Returning null is the unbound default.
   *
   * Held as a getter (not a value) so the runtime never needs to be
   * rebuilt when the picker selection changes mid-draft.
   */
  getPendingDraftBrainliftId?: () => number | null;
}

async function applyPendingBrainliftBinding(
  conversationId: number,
  brainliftId: number,
): Promise<{ conversationId: number; brainliftId: number | null } | null> {
  const response = await apiRequest(
    'PATCH',
    `/api/chat/conversations/${conversationId}/brainlift`,
    { brainliftId },
  );
  const data = (await response.json()) as {
    conversation?: Parameters<typeof normalizeChatConversation>[0];
  } | Parameters<typeof normalizeChatConversation>[0];
  const raw = (data as { conversation?: Parameters<typeof normalizeChatConversation>[0] })
    .conversation ?? (data as Parameters<typeof normalizeChatConversation>[0]);
  const updated = normalizeChatConversation(raw);

  // The per-conversation detail cache was seeded by the create POST with the
  // freshly-inserted (unbound) row. Without this write the picker reads
  // `brainliftId: null` from cache during the first stream and only
  // self-heals when `ConversationQueryInvalidator` refetches on stream-done.
  // Writing the bound row here keeps the picker in sync from turn one.
  queryClient.setQueryData<ChatConversationDetail | undefined>(
    getChatConversationQueryKey(updated.id),
    (current) => (current ? { ...current, conversation: updated } : current),
  );

  return {
    conversationId: updated.id,
    brainliftId: updated.brainliftId ?? null,
  };
}

async function createConversationRow(): Promise<number> {
  const response = await apiRequest('POST', '/api/chat/conversations', {});
  const data = (await response.json()) as { conversation: Parameters<typeof normalizeChatConversation>[0] };
  const conversation = normalizeChatConversation(data.conversation);

  // Seed the TanStack caches the same way `useCreateChatConversation`
  // would: so the freshly-created row appears in the sidebar list
  // immediately, and `useChatConversation(id)` finds an empty detail
  // entry without a wasted GET round-trip.
  queryClient.setQueryData<ChatConversation[]>(
    CHAT_CONVERSATIONS_QUERY_KEY,
    (current) =>
      sortChatConversationsByRecency([
        conversation,
        ...(current ?? []).filter((c) => c.id !== conversation.id),
      ]),
  );
  queryClient.setQueryData<ChatConversationDetail>(
    getChatConversationQueryKey(conversation.id),
    {
      conversation,
      messages: [],
      pagination: { nextBeforeId: null },
    },
  );

  return conversation.id;
}

interface PreparedSendBody {
  api?: string;
  headers?: HeadersInit;
  credentials?: RequestCredentials;
  body: {
    messages: unknown;
    conversationId: number;
    config: { modelName: string };
  };
}

/**
 * Factory that returns a `prepareSendMessagesRequest`-compatible function
 * plus a `getConversationId()` accessor. Pure, framework-free — the React
 * hook below wires it up with refs/state, but exporting it lets tests
 * exercise the lazy-create flow without rendering.
 */
export function createLazyConversationPrepareSend(opts: {
  /** Returns the current conversationId (null = draft). */
  getConversationId: () => number | null;
  /** Assigns the lazily-created conversationId. */
  setConversationId: (id: number) => void;
  /** Returns the current model id (read each send so model swaps work). */
  getModelId: () => string;
  /** Optional notification when a new conversation row was just created. */
  onLazyCreated?: (id: number) => void;
  /** Override for the conversation-create network call (tests). */
  createConversation?: () => Promise<number>;
  /**
   * Read after a fresh row is inserted: if non-null, the runtime PATCHes
   * the binding immediately so the very first chat request resolves mode
   * against the bound brainlift.
   */
  getPendingDraftBrainliftId?: () => number | null;
  /** Override for the binding PATCH (tests). */
  applyPendingBinding?: (conversationId: number, brainliftId: number) => Promise<void>;
}) {
  let inFlight: Promise<number> | null = null;

  const ensureConversationId = async (): Promise<number> => {
    const existing = opts.getConversationId();
    if (existing !== null) return existing;

    if (!inFlight) {
      inFlight = (opts.createConversation ?? createConversationRow)()
        .then(async (newId) => {
          const pending = opts.getPendingDraftBrainliftId?.() ?? null;
          if (pending !== null) {
            try {
              if (opts.applyPendingBinding) {
                await opts.applyPendingBinding(newId, pending);
              } else {
                await applyPendingBrainliftBinding(newId, pending);
              }
            } catch (err) {
              // Surfacing this to the user is non-trivial from inside the
              // runtime; log so devs can diagnose. The chat request still
              // proceeds against the unbound row — the user can re-pick
              // from the now-bound picker.
              // eslint-disable-next-line no-console
              console.error('[chat] lazy-bind brainlift failed', err);
            }
          }
          opts.setConversationId(newId);
          opts.onLazyCreated?.(newId);
          return newId;
        })
        .finally(() => {
          inFlight = null;
        });
    }
    return inFlight;
  };

  const prepareSendMessagesRequest = async (args: {
    messages: unknown;
    api?: string;
    headers?: HeadersInit;
    credentials?: RequestCredentials;
  }): Promise<PreparedSendBody> => {
    const id = await ensureConversationId();
    return {
      api: args.api,
      headers: args.headers,
      credentials: args.credentials,
      body: {
        messages: args.messages,
        conversationId: id,
        config: { modelName: opts.getModelId() },
      },
    };
  };

  return { prepareSendMessagesRequest, ensureConversationId };
}

export function useNativeChatRuntime(args: UseNativeChatRuntimeArgs) {
  const { conversationId, modelId, initialMessages, onLazyCreated, getPendingDraftBrainliftId } = args;

  // The "live" conversation ID for this runtime instance. Held in a ref so
  // the transport (which is created exactly once) can read the latest value
  // inside `prepareSendMessagesRequest` without re-instantiating.
  const conversationIdRef = useRef<number | null>(conversationId);

  // Keep the ref in sync if a prop update arrives (e.g. parent transitions
  // from `null` to a concrete ID after lazy-create). We never DOWNGRADE a
  // concrete ID back to null — once a runtime instance has a real ID, it
  // belongs to that conversation for the rest of its lifetime.
  useEffect(() => {
    if (conversationId !== null && conversationIdRef.current !== conversationId) {
      conversationIdRef.current = conversationId;
    }
  }, [conversationId]);

  const modelIdRef = useRef(modelId);
  useEffect(() => {
    modelIdRef.current = modelId;
  }, [modelId]);

  const onLazyCreatedRef = useRef(onLazyCreated);
  useEffect(() => {
    onLazyCreatedRef.current = onLazyCreated;
  }, [onLazyCreated]);

  const getPendingDraftBrainliftIdRef = useRef(getPendingDraftBrainliftId);
  useEffect(() => {
    getPendingDraftBrainliftIdRef.current = getPendingDraftBrainliftId;
  }, [getPendingDraftBrainliftId]);

  const transport = useMemo(() => {
    const { prepareSendMessagesRequest } = createLazyConversationPrepareSend({
      getConversationId: () => conversationIdRef.current,
      setConversationId: (id) => {
        conversationIdRef.current = id;
      },
      getModelId: () => modelIdRef.current,
      onLazyCreated: (id) => onLazyCreatedRef.current?.(id),
      getPendingDraftBrainliftId: () =>
        getPendingDraftBrainliftIdRef.current?.() ?? null,
    });
    return new AssistantChatTransport({
      api: '/api/chat/stream',
      credentials: 'include',
      // The static body is unused; `prepareSendMessagesRequest` is the
      // source of truth for each request payload.
      body: {},
      prepareSendMessagesRequest,
    });
    // Transport is created exactly once per runtime instance. ID and model
    // are read through refs so we never need to rebuild it.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return useChatRuntime({
    transport,
    ...(initialMessages && initialMessages.length > 0 ? { messages: initialMessages } : {}),
    // Auto-resubmit the conversation once every tool call in the latest
    // assistant turn has a result. This is what makes client-resolved tools
    // (e.g. `ask_user_question`) auto-continue after the user submits.
    // Server-`execute` tools resolve in-stream and never reach this hook.
    sendAutomaticallyWhen: lastAssistantMessageIsCompleteWithToolCalls,
  });
}
