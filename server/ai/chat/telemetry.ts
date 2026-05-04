import type { TextStreamPart, ToolSet, UIMessageChunk } from 'ai';

type ChatTurnUsage = {
  promptTokens?: number;
  completionTokens?: number;
  totalTokens?: number;
};

export interface ChatTraceContext {
  userId: string;
  conversationId: number;
  requestedModel: string;
}

export interface ChatTurnLogPayload extends ChatTraceContext {
  finishReason: string;
  durationMs: number;
  usage?: ChatTurnUsage;
  timestamp?: Date;
}

export interface ChatStreamStartPayload extends ChatTraceContext {
  messageCount: number;
  toolNames: string[];
  timestamp?: Date;
}

export interface ChatStreamErrorPayload extends ChatTraceContext {
  stage: string;
  error: unknown;
  details?: Record<string, unknown>;
  timestamp?: Date;
}

function toIsoTimestamp(timestamp?: Date): string {
  return (timestamp ?? new Date()).toISOString();
}

function summarizeText(value: string, maxLength = 220): string {
  const normalized = value.trim();
  if (normalized.length <= maxLength) {
    return normalized;
  }
  return `${normalized.slice(0, maxLength).trimEnd()}…`;
}

function summarizeValue(value: unknown, maxLength = 220): string | undefined {
  if (value == null) {
    return undefined;
  }

  const serialized = typeof value === 'string'
    ? value
    : safeJsonStringify(value);

  if (!serialized) {
    return undefined;
  }

  return summarizeText(serialized, maxLength);
}

function normalizeError(error: unknown): Record<string, unknown> {
  if (error instanceof Error) {
    const normalized: Record<string, unknown> = {
      name: error.name,
      message: error.message,
      stack: error.stack,
    };

    const extendedError = error as Error & {
      code?: unknown;
      status?: unknown;
      details?: unknown;
      cause?: unknown;
    };

    if (extendedError.code !== undefined) {
      normalized.code = extendedError.code;
    }
    if (extendedError.status !== undefined) {
      normalized.status = extendedError.status;
    }
    if (extendedError.details !== undefined) {
      normalized.details = extendedError.details;
    }
    if (extendedError.cause !== undefined) {
      normalized.cause = extendedError.cause instanceof Error
        ? {
            name: extendedError.cause.name,
            message: extendedError.cause.message,
            stack: extendedError.cause.stack,
          }
        : extendedError.cause;
    }

    return normalized;
  }

  return {
    message: String(error),
  };
}

function safeJsonStringify(value: unknown): string | undefined {
  try {
    return JSON.stringify(value);
  } catch {
    return undefined;
  }
}

function emitChatLog(
  writer: typeof console.log | typeof console.error,
  event: string,
  payload: Record<string, unknown>,
  timestamp?: Date,
): void {
  try {
    writer(JSON.stringify({
      event,
      ...payload,
      timestamp: toIsoTimestamp(timestamp),
    }));
  } catch (error) {
    try {
      console.error('[chat/telemetry] Failed to record structured log:', error);
    } catch {
      // Swallow logging failures.
    }
  }
}

function shouldLogModelChunk(chunk: TextStreamPart<ToolSet>): boolean {
  return chunk.type === 'tool-input-start'
    || chunk.type === 'tool-call'
    || chunk.type === 'tool-result'
    || chunk.type === 'tool-error'
    || chunk.type === 'tool-output-denied';
}

function shouldLogUiChunk(chunk: UIMessageChunk): boolean {
  return chunk.type === 'start'
    || chunk.type === 'tool-input-start'
    || chunk.type === 'tool-input-available'
    || chunk.type === 'tool-input-error'
    || chunk.type === 'tool-output-available'
    || chunk.type === 'tool-output-error'
    || chunk.type === 'tool-output-denied'
    || chunk.type === 'finish'
    || chunk.type === 'error';
}

function summarizeModelChunk(chunk: TextStreamPart<ToolSet>): Record<string, unknown> {
  switch (chunk.type) {
    case 'tool-input-start':
      return {
        chunkType: chunk.type,
        toolCallId: chunk.id,
        toolName: chunk.toolName,
      };

    case 'tool-call':
      return {
        chunkType: chunk.type,
        toolCallId: chunk.toolCallId,
        toolName: chunk.toolName,
        inputPreview: summarizeValue(chunk.input),
      };

    case 'tool-result':
      return {
        chunkType: chunk.type,
        toolCallId: chunk.toolCallId,
        toolName: chunk.toolName,
        outputPreview: summarizeValue(chunk.output),
        preliminary: chunk.preliminary,
      };

    case 'tool-error':
      return {
        chunkType: chunk.type,
        toolCallId: chunk.toolCallId,
        toolName: chunk.toolName,
        inputPreview: summarizeValue(chunk.input),
        error: normalizeError(chunk.error),
      };

    case 'tool-output-denied':
      return {
        chunkType: chunk.type,
        toolCallId: chunk.toolCallId,
        toolName: chunk.toolName,
      };

    default:
      return {
        chunkType: chunk.type,
      };
  }
}

function summarizeUiChunk(chunk: UIMessageChunk): Record<string, unknown> {
  switch (chunk.type) {
    case 'start':
      return {
        chunkType: chunk.type,
        messageId: chunk.messageId,
      };

    case 'tool-input-start':
      return {
        chunkType: chunk.type,
        toolCallId: chunk.toolCallId,
        toolName: chunk.toolName,
      };

    case 'tool-input-available':
      return {
        chunkType: chunk.type,
        toolCallId: chunk.toolCallId,
        toolName: chunk.toolName,
        inputPreview: summarizeValue(chunk.input),
      };

    case 'tool-input-error':
      return {
        chunkType: chunk.type,
        toolCallId: chunk.toolCallId,
        toolName: chunk.toolName,
        inputPreview: summarizeValue(chunk.input),
        errorText: chunk.errorText,
      };

    case 'tool-output-available':
      return {
        chunkType: chunk.type,
        toolCallId: chunk.toolCallId,
        outputPreview: summarizeValue(chunk.output),
        preliminary: chunk.preliminary,
      };

    case 'tool-output-error':
      return {
        chunkType: chunk.type,
        toolCallId: chunk.toolCallId,
        errorText: chunk.errorText,
      };

    case 'tool-output-denied':
      return {
        chunkType: chunk.type,
        toolCallId: chunk.toolCallId,
      };

    case 'finish':
      return {
        chunkType: chunk.type,
        finishReason: chunk.finishReason,
      };

    case 'error':
      return {
        chunkType: chunk.type,
        errorText: chunk.errorText,
      };

    default:
      return {
        chunkType: chunk.type,
      };
  }
}

function parseUiChunkEvent(rawEvent: string): UIMessageChunk | null {
  const dataLines = rawEvent
    .split('\n')
    .filter((line) => line.startsWith('data:'))
    .map((line) => line.slice(5).trim());

  if (dataLines.length === 0) {
    return null;
  }

  const payload = dataLines.join('\n');
  if (payload === '[DONE]') {
    return null;
  }

  return JSON.parse(payload) as UIMessageChunk;
}

export function logChatStreamStart(payload: ChatStreamStartPayload): void {
  emitChatLog(console.log, 'chat_stream_start', {
    userId: payload.userId,
    conversationId: payload.conversationId,
    requestedModel: payload.requestedModel,
    messageCount: payload.messageCount,
    toolNames: payload.toolNames,
  }, payload.timestamp);
}

export function logChatModelChunk(
  context: ChatTraceContext,
  chunk: TextStreamPart<ToolSet>,
): void {
  if (!shouldLogModelChunk(chunk)) {
    return;
  }

  emitChatLog(console.log, 'chat_model_chunk', {
    userId: context.userId,
    conversationId: context.conversationId,
    requestedModel: context.requestedModel,
    ...summarizeModelChunk(chunk),
  });
}

export function logChatStreamError(payload: ChatStreamErrorPayload): void {
  emitChatLog(console.error, 'chat_stream_error', {
    userId: payload.userId,
    conversationId: payload.conversationId,
    requestedModel: payload.requestedModel,
    stage: payload.stage,
    error: normalizeError(payload.error),
    details: payload.details,
  }, payload.timestamp);
}

export async function consumeChatUiMessageStream(
  context: ChatTraceContext,
  stream: ReadableStream<string>,
): Promise<void> {
  const reader = stream.getReader();
  let buffer = '';

  const processRawEvent = (rawEvent: string) => {
    let chunk: UIMessageChunk | null = null;

    try {
      chunk = parseUiChunkEvent(rawEvent);
    } catch (error) {
      logChatStreamError({
        ...context,
        stage: 'ui-stream-parse',
        error,
        details: {
          rawEvent: summarizeText(rawEvent),
        },
      });
      return;
    }

    if (!chunk || !shouldLogUiChunk(chunk)) {
      return;
    }

    emitChatLog(console.log, 'chat_ui_chunk', {
      userId: context.userId,
      conversationId: context.conversationId,
      requestedModel: context.requestedModel,
      ...summarizeUiChunk(chunk),
    });
  };

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) {
        break;
      }

      buffer += value;

      let boundaryIndex = buffer.indexOf('\n\n');
      while (boundaryIndex >= 0) {
        const rawEvent = buffer.slice(0, boundaryIndex).trim();
        buffer = buffer.slice(boundaryIndex + 2);

        if (rawEvent.length > 0) {
          processRawEvent(rawEvent);
        }

        boundaryIndex = buffer.indexOf('\n\n');
      }
    }

    const tail = buffer.trim();
    if (tail.length > 0) {
      processRawEvent(tail);
    }
  } catch (error) {
    logChatStreamError({
      ...context,
      stage: 'ui-stream-consume',
      error,
    });
  } finally {
    reader.releaseLock();
  }
}

export function logChatTurn(payload: ChatTurnLogPayload): void {
  emitChatLog(console.log, 'chat_turn', {
    userId: payload.userId,
    conversationId: payload.conversationId,
    requestedModel: payload.requestedModel,
    finishReason: payload.finishReason,
    durationMs: payload.durationMs,
    usage: payload.usage,
  }, payload.timestamp);
}
