type ChatTurnUsage = {
  promptTokens?: number;
  completionTokens?: number;
  totalTokens?: number;
};

export interface ChatTraceContext {
  userId: string;
  conversationId: number;
  requestedModel: string;
  requestId: string;
}

export interface ChatTurnLogPayload extends ChatTraceContext {
  finishReason: string;
  durationMs: number;
  usage?: ChatTurnUsage;
  timestamp?: Date;
}

export interface ChatStreamStartPayload extends ChatTraceContext {
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

export function logChatStreamStart(payload: ChatStreamStartPayload): void {
  emitChatLog(console.log, 'chat_stream_start', {
    userId: payload.userId,
    conversationId: payload.conversationId,
    requestedModel: payload.requestedModel,
    requestId: payload.requestId,
  }, payload.timestamp);
}

export function logChatStreamError(payload: ChatStreamErrorPayload): void {
  emitChatLog(console.error, 'chat_stream_error', {
    userId: payload.userId,
    conversationId: payload.conversationId,
    requestedModel: payload.requestedModel,
    requestId: payload.requestId,
    stage: payload.stage,
    error: normalizeError(payload.error),
    details: payload.details,
  }, payload.timestamp);
}

export interface AskUserSubmitBlockedPayload {
  userId: string;
  conversationId: number | null;
  toolCallId: string;
  questionCount: number;
  answeredCount: number;
  timestamp?: Date;
}

/**
 * Logged when a user clicks Submit on an `ask_user_question` form but the
 * client-side gate refuses (at least one required question unanswered).
 * Question text lives in chat_messages.parts once the turn syncs; this log
 * only carries counts so support can spot "form was blocked" patterns. Grep
 * keys: `event=ask_user_submit_blocked`, `userId`, `conversationId`, `toolCallId`.
 */
export function logAskUserSubmitBlocked(payload: AskUserSubmitBlockedPayload): void {
  emitChatLog(console.log, 'ask_user_submit_blocked', {
    userId: payload.userId,
    conversationId: payload.conversationId,
    toolCallId: payload.toolCallId,
    questionCount: payload.questionCount,
    answeredCount: payload.answeredCount,
  }, payload.timestamp);
}

export function logChatTurn(payload: ChatTurnLogPayload): void {
  emitChatLog(console.log, 'chat_turn', {
    userId: payload.userId,
    conversationId: payload.conversationId,
    requestedModel: payload.requestedModel,
    requestId: payload.requestId,
    finishReason: payload.finishReason,
    durationMs: payload.durationMs,
    usage: payload.usage,
  }, payload.timestamp);
}
