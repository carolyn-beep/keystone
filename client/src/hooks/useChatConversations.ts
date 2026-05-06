import { useMutation, useQuery } from '@tanstack/react-query';
import type { UIMessage } from 'ai';
import type { ChatConversation } from '@shared/schema';
import { apiRequest, queryClient } from '@/lib/queryClient';

type JsonDate = string | Date;

interface ChatConversationDto extends Omit<ChatConversation, 'createdAt' | 'updatedAt' | 'lastMessageAt'> {
  createdAt: JsonDate;
  updatedAt: JsonDate;
  lastMessageAt: JsonDate | null;
}

interface ChatConversationsResponse {
  conversations: ChatConversationDto[];
}

export interface ChatConversationDetail {
  conversation: ChatConversation;
  messages: UIMessage[];
  pagination: {
    nextBeforeId: number | null;
  };
}

interface ChatConversationDetailResponse {
  conversation: ChatConversationDto;
  messages: UIMessage[];
  pagination: {
    nextBeforeId: number | null;
  };
}

export interface ChatConversationSelection {
  selectedConversationId: number | null;
  shouldCreateConversation: boolean;
}

export const CHAT_CONVERSATIONS_QUERY_KEY = ['chat-conversations'] as const;

export function getChatConversationQueryKey(conversationId: number) {
  return ['chat-conversation', conversationId] as const;
}

function asDate(value: JsonDate | null): Date | null {
  if (!value) {
    return null;
  }

  return value instanceof Date ? value : new Date(value);
}

function normalizeChatConversation(conversation: ChatConversationDto): ChatConversation {
  return {
    ...conversation,
    createdAt: asDate(conversation.createdAt) ?? new Date(),
    updatedAt: asDate(conversation.updatedAt) ?? new Date(),
    lastMessageAt: asDate(conversation.lastMessageAt),
  };
}

async function fetchJson<T>(url: string): Promise<T> {
  const response = await fetch(url, {
    credentials: 'include',
  });

  if (!response.ok) {
    const message = (await response.text()) || response.statusText;
    throw new Error(message);
  }

  return response.json() as Promise<T>;
}

function getUpdatedAtTimestamp(updatedAt: Date | string | null | undefined): number {
  if (!updatedAt) {
    return 0;
  }

  return new Date(updatedAt).getTime();
}

export function sortChatConversationsByRecency<T extends { id: number; updatedAt: Date | string | null | undefined }>(
  conversations: readonly T[],
): T[] {
  return [...conversations].sort((left, right) => {
    const updatedDelta = getUpdatedAtTimestamp(right.updatedAt) - getUpdatedAtTimestamp(left.updatedAt);
    if (updatedDelta !== 0) {
      return updatedDelta;
    }

    return right.id - left.id;
  });
}

export function parseSelectedConversationId(search: string): number | null {
  const params = new URLSearchParams(search.startsWith('?') ? search.slice(1) : search);
  const rawId = params.get('c');
  if (!rawId) {
    return null;
  }

  const conversationId = Number.parseInt(rawId, 10);
  if (!Number.isFinite(conversationId) || conversationId <= 0) {
    return null;
  }

  return conversationId;
}

export function resolveChatConversationSelection({
  search,
  conversations,
}: {
  search: string;
  conversations: readonly ChatConversation[];
}): ChatConversationSelection {
  const requestedConversationId = parseSelectedConversationId(search);

  // Trust the URL: if `?c=ID` is present, select it. The detail query handles
  // 404s for invalid IDs via the existing "Thread unavailable" error state.
  // Checking against the cached conversations list here caused a race with
  // mutations that create the conversation server-side (e.g. skills "Try it
  // out") — the cache hadn't refetched yet, so we'd auto-create a second
  // conversation and drop other query params like `&send=`.
  if (requestedConversationId != null) {
    return {
      selectedConversationId: requestedConversationId,
      shouldCreateConversation: false,
    };
  }

  // Bare `/` (no `?c=` in the URL) is the homepage landing surface. ChatHome
  // consumes `shouldCreateConversation` to create a fresh empty conversation;
  // NativeChatThread decides whether the opener is due for this user.
  return {
    selectedConversationId: null,
    shouldCreateConversation: true,
  };
}

export function resolveNextConversationSelectionAfterDelete({
  deletedConversationId,
  selectedConversationId,
  conversations,
}: {
  deletedConversationId: number;
  selectedConversationId: number | null;
  conversations: readonly ChatConversation[];
}): ChatConversationSelection {
  const remainingConversations = conversations.filter(
    (conversation) => conversation.id !== deletedConversationId,
  );

  if (
    selectedConversationId != null
    && selectedConversationId !== deletedConversationId
    && remainingConversations.some((conversation) => conversation.id === selectedConversationId)
  ) {
    return {
      selectedConversationId,
      shouldCreateConversation: false,
    };
  }

  if (remainingConversations.length > 0) {
    return {
      selectedConversationId: sortChatConversationsByRecency(remainingConversations)[0]!.id,
      shouldCreateConversation: false,
    };
  }

  return {
    selectedConversationId: null,
    shouldCreateConversation: true,
  };
}

function upsertConversation(
  conversations: ChatConversation[] | undefined,
  nextConversation: ChatConversation,
): ChatConversation[] {
  return sortChatConversationsByRecency([
    nextConversation,
    ...(conversations ?? []).filter((conversation) => conversation.id !== nextConversation.id),
  ]);
}

export function useChatConversations() {
  return useQuery({
    queryKey: CHAT_CONVERSATIONS_QUERY_KEY,
    queryFn: async () => {
      const data = await fetchJson<ChatConversationsResponse>('/api/chat/conversations');
      return sortChatConversationsByRecency(
        data.conversations.map(normalizeChatConversation),
      );
    },
  });
}

export function useChatConversation(conversationId: number | null) {
  return useQuery({
    queryKey: getChatConversationQueryKey(conversationId ?? 0),
    enabled: conversationId != null,
    queryFn: async (): Promise<ChatConversationDetail> => {
      const data = await fetchJson<ChatConversationDetailResponse>(
        `/api/chat/conversations/${conversationId}`,
      );

      return {
        conversation: normalizeChatConversation(data.conversation),
        messages: data.messages,
        pagination: data.pagination,
      };
    },
  });
}

export function useCreateChatConversation() {
  return useMutation({
    mutationFn: async (input?: { title?: string }) => {
      const response = await apiRequest('POST', '/api/chat/conversations', input ?? {});
      const data = await response.json() as { conversation: ChatConversationDto };
      return normalizeChatConversation(data.conversation);
    },
    onSuccess: (conversation) => {
      queryClient.setQueryData<ChatConversation[]>(
        CHAT_CONVERSATIONS_QUERY_KEY,
        (current) => upsertConversation(current, conversation),
      );
      queryClient.setQueryData<ChatConversationDetail>(
        getChatConversationQueryKey(conversation.id),
        {
          conversation,
          messages: [],
          pagination: {
            nextBeforeId: null,
          },
        },
      );
    },
  });
}

export function useRenameChatConversation() {
  return useMutation({
    mutationFn: async ({
      conversationId,
      title,
    }: {
      conversationId: number;
      title: string;
    }) => {
      const response = await apiRequest('PATCH', `/api/chat/conversations/${conversationId}`, {
        title,
      });
      const data = await response.json() as { conversation: ChatConversationDto };
      return normalizeChatConversation(data.conversation);
    },
    onSuccess: (conversation) => {
      queryClient.setQueryData<ChatConversation[]>(
        CHAT_CONVERSATIONS_QUERY_KEY,
        (current) => upsertConversation(current, conversation),
      );
      queryClient.setQueryData<ChatConversationDetail | undefined>(
        getChatConversationQueryKey(conversation.id),
        (current) => {
          if (!current) {
            return undefined;
          }

          return {
            ...current,
            conversation,
          };
        },
      );
    },
  });
}

export function useDeleteChatConversation() {
  return useMutation({
    mutationFn: async ({ conversationId }: { conversationId: number }) => {
      await apiRequest('DELETE', `/api/chat/conversations/${conversationId}`);
      return { conversationId };
    },
    onSuccess: ({ conversationId }) => {
      queryClient.setQueryData<ChatConversation[]>(
        CHAT_CONVERSATIONS_QUERY_KEY,
        (current) => (current ?? []).filter((conversation) => conversation.id !== conversationId),
      );
      queryClient.removeQueries({
        queryKey: getChatConversationQueryKey(conversationId),
      });
    },
  });
}
