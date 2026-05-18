import { useEffect, useMemo, useRef } from 'react';
import { useMutation } from '@tanstack/react-query';
import type { Brainlift, ChatConversation } from '@shared/schema';
import { apiRequest, queryClient } from '@/lib/queryClient';
import {
  CHAT_CONVERSATIONS_QUERY_KEY,
  getChatConversationQueryKey,
  normalizeChatConversation,
  type ChatConversationDetail,
  useChatConversation,
} from '@/hooks/useChatConversations';
import {
  USER_BRAINLIFTS_QUERY_KEY,
  useUserBrainlifts,
  type UserBrainlift,
} from '@/hooks/useUserBrainlifts';

export type ConversationBrainlift = Pick<Brainlift, 'id' | 'slug' | 'title' | 'phase'>;

export interface ConversationBinding {
  conversationId: number;
  brainliftId: number | null;
  brainlift: ConversationBrainlift | null;
}

export const conversationBrainliftQueryKey = (conversationId: number) =>
  ['conversation-brainlift', conversationId] as const;

function toConversationBinding(
  conversation: Pick<ChatConversation, 'id' | 'brainliftId'>,
  brainlifts: readonly UserBrainlift[],
): ConversationBinding {
  const brainliftId = conversation.brainliftId ?? null;

  return {
    conversationId: conversation.id,
    brainliftId,
    brainlift: brainliftId == null
      ? null
      : brainlifts.find((brainlift) => brainlift.id === brainliftId) ?? null,
  };
}

function updateConversationDetailBrainlift(
  conversationId: number,
  brainliftId: number | null,
) {
  queryClient.setQueryData<ChatConversationDetail>(
    getChatConversationQueryKey(conversationId),
    (current) => {
      if (!current) return current;
      return {
        ...current,
        conversation: {
          ...current.conversation,
          brainliftId,
        },
      };
    },
  );
}

export function useConversationBrainlift(conversationId: number): {
  data: ConversationBinding | undefined;
  isLoading: boolean;
  setBinding: (brainliftId: number | null) => Promise<ConversationBinding>;
} {
  const conversationQuery = useChatConversation(conversationId);
  const brainliftsQuery = useUserBrainlifts();
  const mutationSerialRef = useRef(0);

  const data = useMemo(() => {
    const conversation = conversationQuery.data?.conversation;
    if (!conversation) return undefined;
    return toConversationBinding(conversation, brainliftsQuery.data ?? []);
  }, [brainliftsQuery.data, conversationQuery.data?.conversation]);

  useEffect(() => {
    if (!data) return;
    queryClient.setQueryData(conversationBrainliftQueryKey(conversationId), data);
  }, [conversationId, data]);

  useEffect(() => {
    const boundBrainliftId = conversationQuery.data?.conversation.brainliftId ?? null;
    if (boundBrainliftId == null) return;

    const hasBoundBrainlift = brainliftsQuery.data?.some(
      (brainlift) => brainlift.id === boundBrainliftId,
    );

    if (brainliftsQuery.status === 'success' && !hasBoundBrainlift) {
      void brainliftsQuery.refetch();
    }
  }, [
    brainliftsQuery,
    brainliftsQuery.data,
    brainliftsQuery.status,
    conversationQuery.data?.conversation.brainliftId,
  ]);

  const mutation = useMutation({
    mutationFn: async (brainliftId: number | null): Promise<ConversationBinding> => {
      const response = await apiRequest(
        'PATCH',
        `/api/chat/conversations/${conversationId}/brainlift`,
        { brainliftId },
      );
      const conversation = normalizeChatConversation(
        await response.json() as Parameters<typeof normalizeChatConversation>[0],
      );
      const brainlifts = queryClient.getQueryData<UserBrainlift[]>(USER_BRAINLIFTS_QUERY_KEY)
        ?? brainliftsQuery.data
        ?? [];

      return toConversationBinding(conversation, brainlifts);
    },
    onMutate: async (brainliftId) => {
      mutationSerialRef.current += 1;
      const mutationSerial = mutationSerialRef.current;

      await Promise.all([
        queryClient.cancelQueries({ queryKey: conversationBrainliftQueryKey(conversationId) }),
        queryClient.cancelQueries({ queryKey: getChatConversationQueryKey(conversationId) }),
      ]);

      const previousBinding = queryClient.getQueryData<ConversationBinding>(
        conversationBrainliftQueryKey(conversationId),
      );
      const previousDetail = queryClient.getQueryData<ChatConversationDetail>(
        getChatConversationQueryKey(conversationId),
      );

      const optimisticConversation = previousDetail?.conversation ?? conversationQuery.data?.conversation;
      if (optimisticConversation) {
        const optimisticBinding = toConversationBinding(
          { ...optimisticConversation, brainliftId },
          brainliftsQuery.data ?? [],
        );
        queryClient.setQueryData(conversationBrainliftQueryKey(conversationId), optimisticBinding);
        updateConversationDetailBrainlift(conversationId, brainliftId);
      }

      return { previousBinding, previousDetail, mutationSerial };
    },
    onError: (_error, _brainliftId, context) => {
      if (context?.mutationSerial !== mutationSerialRef.current) {
        return;
      }

      if (context?.previousBinding) {
        queryClient.setQueryData(
          conversationBrainliftQueryKey(conversationId),
          context.previousBinding,
        );
      }
      if (context?.previousDetail) {
        queryClient.setQueryData(
          getChatConversationQueryKey(conversationId),
          context.previousDetail,
        );
      }
    },
    onSuccess: (binding, _brainliftId, context) => {
      if (context?.mutationSerial !== mutationSerialRef.current) {
        return;
      }

      queryClient.setQueryData(conversationBrainliftQueryKey(conversationId), binding);
      updateConversationDetailBrainlift(conversationId, binding.brainliftId);
    },
    onSettled: () => {
      void queryClient.invalidateQueries({
        queryKey: conversationBrainliftQueryKey(conversationId),
      });
      void queryClient.invalidateQueries({
        queryKey: getChatConversationQueryKey(conversationId),
      });
      void queryClient.invalidateQueries({
        queryKey: CHAT_CONVERSATIONS_QUERY_KEY,
      });
    },
  });

  return {
    data,
    isLoading: conversationQuery.isLoading || brainliftsQuery.isLoading,
    setBinding: mutation.mutateAsync,
  };
}
