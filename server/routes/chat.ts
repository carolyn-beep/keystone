import { Router, type Request, type Response } from 'express';
import { convertToModelMessages, generateId, stepCountIs, streamText, type UIMessage } from 'ai';
import { DEFAULT_CHAT_MODEL_ID, isChatModelId } from '@shared/chat-models';
import { requireAuth } from '../middleware/auth';
import { asyncHandler, BadRequestError, NotFoundError } from '../middleware/error-handler';
import { storage } from '../storage';
import { getChatModel } from '../ai/chat/provider';
import { buildChatSystemPromptFromRegistry } from '../ai/chat/system-prompt';
import { generateChatTitle, shouldGenerateChatTitle } from '../ai/chat/title';
import {
  consumeChatUiMessageStream,
  logChatModelChunk,
  logChatStreamError,
  logChatStreamStart,
  logChatTurn,
} from '../ai/chat/telemetry';
import { buildNativeChatTools } from '../ai/chat/tools';

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
  const userContext = await storage.getChatUserContext(userId);
  const systemPrompt = await buildChatSystemPromptFromRegistry({ userContext });
  const tools = buildNativeChatTools(req.authContext!);
  const traceContext = {
    userId,
    conversationId: conversation.id,
    requestedModel,
  };

  logChatStreamStart({
    ...traceContext,
    messageCount: messages.length,
    toolNames: Object.keys(tools),
  });

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
    onChunk: async ({ chunk }) => {
      logChatModelChunk(traceContext, chunk);
    },
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
    consumeSseStream: ({ stream }) => consumeChatUiMessageStream(traceContext, stream),
    onError: (error) => {
      logChatStreamError({
        ...traceContext,
        stage: 'ui-stream',
        error,
      });
      return 'An error occurred while streaming the chat response.';
    },
    onFinish: async ({ messages: finalizedMessages, finishReason }) => {
      try {
        await storage.syncChatMessages(
          conversation.id,
          userId,
          finalizedMessages as unknown as Array<{
            id: string;
            role: string;
            parts: unknown[];
            metadata?: unknown;
          }>,
        );

        const storedMessages = finalizedMessages as unknown as Array<{
          id: string;
          role: string;
          parts: unknown[];
          metadata?: unknown;
        }>;

        if (shouldGenerateChatTitle({
          currentTitle: conversation.title,
          messages: storedMessages,
        })) {
          try {
            const title = await generateChatTitle(storedMessages);
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
