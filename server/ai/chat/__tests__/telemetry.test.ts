import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  consumeChatUiMessageStream,
  logChatModelChunk,
  logChatStreamError,
  logChatStreamStart,
  logChatTurn,
} from '../telemetry';

function makeStringStream(chunks: string[]): ReadableStream<string> {
  return new ReadableStream({
    start(controller) {
      for (const chunk of chunks) {
        controller.enqueue(chunk);
      }
      controller.close();
    },
  });
}

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

  it('logs chat stream setup with exposed tool names', () => {
    logChatStreamStart({
      userId: 'user-1',
      conversationId: 42,
      requestedModel: 'qwen/qwen-plus',
      messageCount: 3,
      toolNames: ['get_template', 'create_brainlift'],
      timestamp: new Date('2026-04-28T12:00:00.000Z'),
    });

    expect(JSON.parse(logSpy.mock.calls[0][0])).toEqual({
      event: 'chat_stream_start',
      userId: 'user-1',
      conversationId: 42,
      requestedModel: 'qwen/qwen-plus',
      messageCount: 3,
      toolNames: ['get_template', 'create_brainlift'],
      timestamp: '2026-04-28T12:00:00.000Z',
    });
  });

  it('logs model tool-call chunks with summarized inputs', () => {
    logChatModelChunk(
      {
        userId: 'user-1',
        conversationId: 42,
        requestedModel: 'qwen/qwen-plus',
      },
      {
        type: 'tool-call',
        toolCallId: 'call-1',
        toolName: 'get_template',
        input: '{"slug":"brainlift"}',
      },
    );

    expect(JSON.parse(logSpy.mock.calls[0][0])).toEqual({
      event: 'chat_model_chunk',
      userId: 'user-1',
      conversationId: 42,
      requestedModel: 'qwen/qwen-plus',
      chunkType: 'tool-call',
      toolCallId: 'call-1',
      toolName: 'get_template',
      inputPreview: '{"slug":"brainlift"}',
      timestamp: expect.any(String),
    });
  });

  it('logs user-visible UI tool chunks from the SSE stream', async () => {
    await consumeChatUiMessageStream(
      {
        userId: 'user-1',
        conversationId: 42,
        requestedModel: 'qwen/qwen-plus',
      },
      makeStringStream([
        'data: {"type":"tool-input-start","toolCallId":"call-1","toolName":"get_template"}\n\n',
        'data: {"type":"tool-input-available","toolCallId":"call-1","toolName":"get_template","input":{"slug":"brainlift"}}\n\n',
        'data: {"type":"tool-output-available","toolCallId":"call-1","output":{"template":"# Brainlift"}}\n\n',
        'data: {"type":"finish","finishReason":"tool-calls"}\n\n',
      ]),
    );

    expect(logSpy).toHaveBeenCalledTimes(4);
    expect(JSON.parse(logSpy.mock.calls[0][0])).toEqual({
      event: 'chat_ui_chunk',
      userId: 'user-1',
      conversationId: 42,
      requestedModel: 'qwen/qwen-plus',
      chunkType: 'tool-input-start',
      toolCallId: 'call-1',
      toolName: 'get_template',
      timestamp: expect.any(String),
    });
    expect(JSON.parse(logSpy.mock.calls[1][0])).toEqual({
      event: 'chat_ui_chunk',
      userId: 'user-1',
      conversationId: 42,
      requestedModel: 'qwen/qwen-plus',
      chunkType: 'tool-input-available',
      toolCallId: 'call-1',
      toolName: 'get_template',
      inputPreview: '{"slug":"brainlift"}',
      timestamp: expect.any(String),
    });
    expect(JSON.parse(logSpy.mock.calls[2][0])).toEqual({
      event: 'chat_ui_chunk',
      userId: 'user-1',
      conversationId: 42,
      requestedModel: 'qwen/qwen-plus',
      chunkType: 'tool-output-available',
      toolCallId: 'call-1',
      outputPreview: '{"template":"# Brainlift"}',
      timestamp: expect.any(String),
    });
    expect(JSON.parse(logSpy.mock.calls[3][0])).toEqual({
      event: 'chat_ui_chunk',
      userId: 'user-1',
      conversationId: 42,
      requestedModel: 'qwen/qwen-plus',
      chunkType: 'finish',
      finishReason: 'tool-calls',
      timestamp: expect.any(String),
    });
  });

  it('emits structured chat stream errors', () => {
    logChatStreamError({
      userId: 'user-1',
      conversationId: 42,
      requestedModel: 'qwen/qwen-plus',
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
      stage: 'ui-stream',
      error,
      timestamp: new Date('2026-04-28T12:00:00.000Z'),
    });

    expect(JSON.parse(errorSpy.mock.calls[0][0])).toEqual({
      event: 'chat_stream_error',
      userId: 'user-1',
      conversationId: 42,
      requestedModel: 'qwen/qwen-plus',
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
