import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  logChatStreamError,
  logChatStreamStart,
  logChatTurn,
} from '../telemetry';

let logSpy: ReturnType<typeof vi.spyOn>;
let errorSpy: ReturnType<typeof vi.spyOn>;

beforeEach(() => {
  logSpy = vi.spyOn(console, 'log').mockImplementation(() => undefined);
  errorSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined);
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('chat telemetry', () => {
  it('emits a structured chat turn log payload', () => {
    logChatTurn({
      userId: 'user-1',
      conversationId: 42,
      requestedModel: 'qwen/qwen-plus',
      requestId: 'req-1',
      finishReason: 'stop',
      durationMs: 1234,
      usage: {
        promptTokens: 10,
        completionTokens: 4,
        totalTokens: 14,
      },
      timestamp: new Date('2026-04-28T12:00:00.000Z'),
    });

    expect(logSpy).toHaveBeenCalledTimes(1);
    expect(JSON.parse(logSpy.mock.calls[0][0])).toEqual({
      event: 'chat_turn',
      userId: 'user-1',
      conversationId: 42,
      requestedModel: 'qwen/qwen-plus',
      requestId: 'req-1',
      finishReason: 'stop',
      durationMs: 1234,
      usage: {
        promptTokens: 10,
        completionTokens: 4,
        totalTokens: 14,
      },
      timestamp: '2026-04-28T12:00:00.000Z',
    });
  });

  it('logs chat stream start with only the trace correlation fields', () => {
    logChatStreamStart({
      userId: 'user-1',
      conversationId: 42,
      requestedModel: 'qwen/qwen-plus',
      requestId: 'req-1',
      timestamp: new Date('2026-04-28T12:00:00.000Z'),
    });

    expect(JSON.parse(logSpy.mock.calls[0][0])).toEqual({
      event: 'chat_stream_start',
      userId: 'user-1',
      conversationId: 42,
      requestedModel: 'qwen/qwen-plus',
      requestId: 'req-1',
      timestamp: '2026-04-28T12:00:00.000Z',
    });
  });

  it('emits structured chat stream errors', () => {
    logChatStreamError({
      userId: 'user-1',
      conversationId: 42,
      requestedModel: 'qwen/qwen-plus',
      requestId: 'req-1',
      stage: 'model-stream',
      error: new Error('boom'),
      details: {
        toolCallId: 'call-1',
      },
      timestamp: new Date('2026-04-28T12:00:00.000Z'),
    });

    expect(JSON.parse(errorSpy.mock.calls[0][0])).toEqual({
      event: 'chat_stream_error',
      userId: 'user-1',
      conversationId: 42,
      requestedModel: 'qwen/qwen-plus',
      requestId: 'req-1',
      stage: 'model-stream',
      error: {
        name: 'Error',
        message: 'boom',
        stack: expect.any(String),
      },
      details: {
        toolCallId: 'call-1',
      },
      timestamp: '2026-04-28T12:00:00.000Z',
    });
  });

  it('preserves custom error fields such as Google Drive status and details', () => {
    const error = new Error('Google Drive API request failed') as Error & {
      code: string;
      status: number;
      details: string;
    };
    error.name = 'GoogleDriveServiceError';
    error.code = 'api_error';
    error.status = 503;
    error.details = '{"error":{"message":"Backend Error"}}';

    logChatStreamError({
      userId: 'user-1',
      conversationId: 42,
      requestedModel: 'qwen/qwen-plus',
      requestId: 'req-1',
      stage: 'ui-stream',
      error,
      timestamp: new Date('2026-04-28T12:00:00.000Z'),
    });

    expect(JSON.parse(errorSpy.mock.calls[0][0])).toEqual({
      event: 'chat_stream_error',
      userId: 'user-1',
      conversationId: 42,
      requestedModel: 'qwen/qwen-plus',
      requestId: 'req-1',
      stage: 'ui-stream',
      error: {
        name: 'GoogleDriveServiceError',
        message: 'Google Drive API request failed',
        stack: expect.any(String),
        code: 'api_error',
        status: 503,
        details: '{"error":{"message":"Backend Error"}}',
      },
      timestamp: '2026-04-28T12:00:00.000Z',
    });
  });

  it('swallows logging failures after writing a local error', () => {
    logSpy.mockImplementationOnce(() => {
      throw new Error('console unavailable');
    });

    expect(() =>
      logChatTurn({
        userId: 'user-1',
        conversationId: 42,
        requestedModel: 'anthropic/claude-sonnet-4.6',
        requestId: 'req-1',
        finishReason: 'stop',
        durationMs: 1,
      }),
    ).not.toThrow();

    expect(errorSpy).toHaveBeenCalledWith(
      '[chat/telemetry] Failed to record structured log:',
      expect.any(Error),
    );
  });
});
