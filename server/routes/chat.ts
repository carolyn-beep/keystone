import { Router, type Request, type Response } from 'express';
import {
  convertToModelMessages,
  createUIMessageStream,
  generateId,
  pipeUIMessageStreamToResponse,
  stepCountIs,
  streamText,
  type UIMessage,
} from 'ai';
import { isSyntheticAlphaXAssistantOpener } from '@shared/alphax-synthetic-opener';
import { DEFAULT_CHAT_MODEL_ID, isChatModelId } from '@shared/chat-models';
import { requireAuth } from '../middleware/auth';
import { asyncHandler, BadRequestError, NotFoundError } from '../middleware/error-handler';
import { storage } from '../storage';
import { getChatModel } from '../ai/chat/provider';
import { buildChatSystemPromptFromRegistry } from '../ai/chat/system-prompt';
import { generateChatTitle, shouldGenerateChatTitle } from '../ai/chat/title';
import {
  logAskUserSubmitBlocked,
  logChatStreamError,
  logChatStreamStart,
  logChatTurn,
} from '../ai/chat/telemetry';
import { buildNativeChatTools } from '../ai/chat/tools';
import type { ChatMode, ConversationContext } from '../brand/types';

export const chatRouter = Router();

function parseConversationId(rawValue: string): number {
  const conversationId = Number.parseInt(rawValue, 10);
  if (!Number.isFinite(conversationId)) {
    throw new BadRequestError('Invalid conversation ID');
  }
  return conversationId;
}

function parseOptionalNumber(rawValue: unknown, label: string): number | undefined {
  if (rawValue == null) {
    return undefined;
  }

  const parsed = Number.parseInt(String(rawValue), 10);
  if (!Number.isFinite(parsed)) {
    throw new BadRequestError(`Invalid ${label}`);
  }

  return parsed;
}

function normalizeOptionalTitle(value: unknown): string | undefined {
  if (value == null) {
    return undefined;
  }

  if (typeof value !== 'string') {
    throw new BadRequestError('title must be a string');
  }

  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

export async function listChatConversationsHandler(req: Request, res: Response): Promise<void> {
  const limit = parseOptionalNumber(req.query.limit, 'limit');
  const conversations = await storage.listChatConversations(req.authContext!.userId, { limit });
  res.json({ conversations });
}

export async function createChatConversationHandler(req: Request, res: Response): Promise<void> {
  const conversation = await storage.createChatConversation(req.authContext!.userId, {
    title: normalizeOptionalTitle((req.body as { title?: unknown })?.title),
  });

  res.status(201).json({ conversation });
}

export async function getChatConversationHandler(req: Request, res: Response): Promise<void> {
  const conversationId = parseConversationId(req.params.id);
  const limit = parseOptionalNumber(req.query.limit, 'limit');
  const beforeId = parseOptionalNumber(req.query.beforeId, 'beforeId');

  const conversation = await storage.getChatConversation(conversationId, req.authContext!.userId);
  if (!conversation) {
    throw new NotFoundError('Conversation not found');
  }

  const pagination = await storage.listChatMessages(conversationId, req.authContext!.userId, {
    limit,
    beforeId,
  });

  res.json({
    conversation,
    messages: pagination.messages,
    pagination: {
      nextBeforeId: pagination.nextBeforeId,
    },
  });
}

export async function renameChatConversationHandler(req: Request, res: Response): Promise<void> {
  const conversationId = parseConversationId(req.params.id);
  const title = normalizeOptionalTitle((req.body as { title?: unknown })?.title);
  if (!title) {
    throw new BadRequestError('title is required');
  }

  const conversation = await storage.renameChatConversation(
    conversationId,
    req.authContext!.userId,
    title,
  );

  if (!conversation) {
    throw new NotFoundError('Conversation not found');
  }

  res.json({ conversation });
}

export async function deleteChatConversationHandler(req: Request, res: Response): Promise<void> {
  const conversationId = parseConversationId(req.params.id);
  const deleted = await storage.deleteChatConversation(conversationId, req.authContext!.userId);
  if (!deleted) {
    throw new NotFoundError('Conversation not found');
  }

  res.json({ deleted: true });
}

export async function setConversationBrainliftHandler(req: Request, res: Response): Promise<void> {
  const conversationId = parseConversationId(req.params.id);
  const rawBrainliftId = (req.body as { brainliftId?: unknown }).brainliftId;

  if (rawBrainliftId !== null && typeof rawBrainliftId !== 'number') {
    throw new BadRequestError('brainliftId must be a number or null');
  }

  if (typeof rawBrainliftId === 'number' && !Number.isFinite(rawBrainliftId)) {
    throw new BadRequestError('brainliftId must be a number or null');
  }

  const brainliftId = rawBrainliftId === null ? null : rawBrainliftId;
  if (brainliftId !== null) {
    const targetBrainlift = await storage.getBrainliftById(brainliftId);
    if (!targetBrainlift) {
      throw new BadRequestError('Brainlift not found');
    }
  }

  const conversation = await storage.setConversationBrainlift(
    conversationId,
    brainliftId,
    req.authContext!.userId,
  );

  res.json(conversation);
}

export async function streamChatHandler(req: Request, res: Response): Promise<void> {
  const body = req.body as {
    conversationId?: unknown;
    messages?: unknown;
    config?: {
      modelName?: unknown;
    };
  };

  if (typeof body.conversationId !== 'number' || !Number.isFinite(body.conversationId)) {
    throw new BadRequestError('conversationId must be a number');
  }

  if (!Array.isArray(body.messages)) {
    throw new BadRequestError('messages array is required');
  }

  const requestedModel = typeof body.config?.modelName === 'string'
    ? body.config.modelName
    : DEFAULT_CHAT_MODEL_ID;

  if (!isChatModelId(requestedModel)) {
    throw new BadRequestError(
      `Unsupported chat model "${requestedModel}"`,
    );
  }

  const userId = req.authContext!.userId;
  const conversation = await storage.getChatConversation(body.conversationId, userId);
  if (!conversation) {
    throw new NotFoundError('Conversation not found');
  }

  const messages = body.messages as UIMessage[];

  // Opener short-circuit: only the exact synthetic AlphaX welcome should be
  // swallowed here. Any other assistant-last message must continue normally;
  // client-resolved tools resume with assistant-last `tool-*` messages, and
  // future plain assistant messages should not be silently dropped.
  const lastMessage = messages.at(-1);
  if (isSyntheticAlphaXAssistantOpener(lastMessage)) {
    const stream = createUIMessageStream({
      execute: async () => {
        // Intentionally empty — no model call, no parts written.
      },
    });
    pipeUIMessageStreamToResponse({ response: res, stream });
    return;
  }

  const binding = await storage.getConversationBrainlift(conversation.id);
  const conversationContext: ConversationContext = {
    conversationId: conversation.id,
    brainliftId: binding?.brainliftId ?? null,
    brainlift: binding?.brainlift ?? null,
  };
  const mode: ChatMode = conversationContext.brainlift?.phase === 'authoring'
    ? 'authoring'
    : 'research';

  if (mode === 'research' && conversationContext.brainliftId != null) {
    conversationContext.secondBrainSummary = await storage.getSecondBrainSummary(
      conversationContext.brainliftId,
    );
  }
  const userContext = await storage.getChatUserContext(userId);
  const systemPrompt = await buildChatSystemPromptFromRegistry({
    userContext,
    authContext: req.authContext!,
    mode,
    conversation: conversationContext,
  });
  const tools = buildNativeChatTools(req.authContext!, mode, conversationContext);
  const requestId = generateId();
  const traceContext = {
    userId,
    conversationId: conversation.id,
    requestedModel,
    requestId,
  };

  logChatStreamStart(traceContext);

  const incomingMessageIds = new Set(messages.map((message) => message.id));

  const startedAt = Date.now();
  let usageSnapshot:
    | {
        promptTokens?: number;
        completionTokens?: number;
        totalTokens?: number;
      }
    | undefined;
  let finishReasonSnapshot: string | undefined;

  const result = streamText({
    model: getChatModel(requestedModel),
    system: systemPrompt,
    messages: await convertToModelMessages(messages),
    tools,
    stopWhen: stepCountIs(30),
    onError: async ({ error }) => {
      logChatStreamError({
        ...traceContext,
        stage: 'model-stream',
        error,
      });
    },
    onFinish: async ({ finishReason, usage }) => {
      finishReasonSnapshot = finishReason;
      usageSnapshot = {
        promptTokens: usage.inputTokens,
        completionTokens: usage.outputTokens,
        totalTokens: usage.totalTokens,
      };
    },
  });

  result.pipeUIMessageStreamToResponse(res, {
    originalMessages: messages,
    generateMessageId: generateId,
    onError: (error) => {
      logChatStreamError({
        ...traceContext,
        stage: 'ui-stream',
        error,
      });
      return 'An error occurred while streaming the chat response.';
    },
    onFinish: async ({ messages: finalizedMessages, finishReason }) => {
      const stampedMessages = (finalizedMessages as unknown as Array<{
        id: string;
        role: string;
        parts: unknown[];
        metadata?: unknown;
      }>).map((message) => {
        if (incomingMessageIds.has(message.id)) {
          return message;
        }
        const existingMetadata = (message.metadata && typeof message.metadata === 'object')
          ? message.metadata as Record<string, unknown>
          : {};
        return {
          ...message,
          metadata: { ...existingMetadata, requestId },
        };
      });

      try {
        await storage.syncChatMessages(
          conversation.id,
          userId,
          stampedMessages,
        );

        if (shouldGenerateChatTitle({
          currentTitle: conversation.title,
          messages: stampedMessages,
        })) {
          try {
            const title = await generateChatTitle(stampedMessages);
            await storage.renameChatConversationIfTitle(
              conversation.id,
              userId,
              'New chat',
              title,
            );
          } catch (error) {
            logChatStreamError({
              ...traceContext,
              stage: 'generate-chat-title',
              error,
            });
          }
        }
      } catch (error) {
        logChatStreamError({
          ...traceContext,
          stage: 'sync-finalized-messages',
          error,
        });
      }

      logChatTurn({
        ...traceContext,
        finishReason: finishReason ?? finishReasonSnapshot ?? 'unknown',
        durationMs: Date.now() - startedAt,
        usage: usageSnapshot,
      });
    },
  });
}

chatRouter.get(
  '/api/chat/conversations',
  requireAuth,
  asyncHandler(listChatConversationsHandler),
);

chatRouter.post(
  '/api/chat/conversations',
  requireAuth,
  asyncHandler(createChatConversationHandler),
);

chatRouter.get(
  '/api/chat/conversations/:id',
  requireAuth,
  asyncHandler(getChatConversationHandler),
);

chatRouter.patch(
  '/api/chat/conversations/:id',
  requireAuth,
  asyncHandler(renameChatConversationHandler),
);

chatRouter.patch(
  '/api/chat/conversations/:id/brainlift',
  requireAuth,
  asyncHandler(setConversationBrainliftHandler),
);

chatRouter.delete(
  '/api/chat/conversations/:id',
  requireAuth,
  asyncHandler(deleteChatConversationHandler),
);

chatRouter.post(
  '/api/chat/stream',
  requireAuth,
  asyncHandler(streamChatHandler),
);

export async function logAskUserSubmitBlockedHandler(
  req: Request,
  res: Response,
): Promise<void> {
  const userId = req.authContext!.userId;
  const body = req.body as {
    conversationId?: number | string | null;
    toolCallId?: unknown;
    questions?: unknown;
  };

  if (typeof body.toolCallId !== 'string' || body.toolCallId.length === 0) {
    throw new BadRequestError('toolCallId is required');
  }
  if (!Array.isArray(body.questions) || body.questions.length === 0) {
    throw new BadRequestError('questions[] is required');
  }

  const conversationId = typeof body.conversationId === 'number'
    ? body.conversationId
    : typeof body.conversationId === 'string' && /^\d+$/.test(body.conversationId)
      ? Number.parseInt(body.conversationId, 10)
      : null;

  const answeredCount = body.questions.reduce<number>((count, rawQuestion) => {
    const question = (rawQuestion ?? {}) as Record<string, unknown>;
    return question.answered === true ? count + 1 : count;
  }, 0);

  logAskUserSubmitBlocked({
    userId,
    conversationId,
    toolCallId: body.toolCallId,
    questionCount: body.questions.length,
    answeredCount,
  });

  res.json({ ok: true });
}

chatRouter.post(
  '/api/chat/diagnostics/ask-user-blocked',
  requireAuth,
  asyncHandler(logAskUserSubmitBlockedHandler),
);
