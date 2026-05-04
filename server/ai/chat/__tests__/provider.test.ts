import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { getChatModel } from '../provider';
import { DEFAULT_CHAT_MODEL_ID } from '@shared/chat-models';

function makeSseStream(chunks: string[]): ReadableStream<Uint8Array> {
  const encoder = new TextEncoder();

  return new ReadableStream({
    start(controller) {
      for (const chunk of chunks) {
        controller.enqueue(encoder.encode(chunk));
      }
      controller.close();
    },
  });
}

async function readStreamParts(stream: ReadableStream<unknown>) {
  const reader = stream.getReader();
  const parts: unknown[] = [];

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    parts.push(value);
  }

  return parts;
}

let originalFetch: typeof globalThis.fetch;
let originalApiKey: string | undefined;

beforeEach(() => {
  originalFetch = globalThis.fetch;
  originalApiKey = process.env.OPENROUTER_API_KEY;
  process.env.OPENROUTER_API_KEY = 'test-openrouter-api-key';
});

afterEach(() => {
  globalThis.fetch = originalFetch;
  process.env.OPENROUTER_API_KEY = originalApiKey;
  vi.restoreAllMocks();
});

describe('getChatModel', () => {
  it('returns the curated default model when no ID is provided', () => {
    const model = getChatModel();
    expect(model.modelId).toBe(DEFAULT_CHAT_MODEL_ID);
    expect(model.provider).toBe('openrouter');
    expect(model.specificationVersion).toBe('v2');
  });

  it('rejects model IDs that are outside the curated chat list', () => {
    expect(() => getChatModel('google/gemini-2.0-flash-001')).toThrow(
      'Unsupported chat model',
    );
  });

  it('sends OpenRouter-compatible requests for non-streaming calls', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      headers: new Headers(),
      json: async () => ({
        id: 'resp-1',
        model: 'qwen/qwen-plus',
        choices: [{ message: { content: 'Hello from OpenRouter' } }],
        usage: {
          prompt_tokens: 12,
          completion_tokens: 8,
          total_tokens: 20,
        },
      }),
    });
    globalThis.fetch = fetchMock as typeof globalThis.fetch;

    const model = getChatModel('qwen/qwen-plus');
    const result = await model.doGenerate({
      prompt: [
        { role: 'system', content: 'You are precise.' },
        {
          role: 'user',
          content: [{ type: 'text', text: 'Say hello' }],
        },
      ],
    });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, options] = fetchMock.mock.calls[0];
    expect(url).toBe('https://openrouter.ai/api/v1/chat/completions');
    expect(options.method).toBe('POST');

    const body = JSON.parse(options.body);
    expect(body.stream).toBeUndefined();
    expect(body.model).toBe('qwen/qwen-plus');
    expect(body.messages).toEqual([
      { role: 'system', content: 'You are precise.' },
      { role: 'user', content: 'Say hello' },
    ]);

    expect(result.finishReason).toBe('stop');
    expect(result.content).toEqual([{ type: 'text', text: 'Hello from OpenRouter' }]);
    expect(result.usage).toEqual({
      inputTokens: 12,
      outputTokens: 8,
      totalTokens: 20,
    });
  });

  it('parses OpenRouter SSE responses into AI SDK stream parts', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      headers: new Headers({ 'content-type': 'text/event-stream' }),
      body: makeSseStream([
        'data: {"id":"resp-1","model":"anthropic/claude-haiku-4.5","choices":[{"delta":{"content":"Hel"}}]}\n\n',
        'data: {"choices":[{"delta":{"content":"lo"}}]}\n\n',
        'data: {"choices":[{"finish_reason":"stop"}],"usage":{"prompt_tokens":5,"completion_tokens":2,"total_tokens":7}}\n\n',
        'data: [DONE]\n\n',
      ]),
    });
    globalThis.fetch = fetchMock as typeof globalThis.fetch;

    const model = getChatModel('anthropic/claude-haiku-4.5');
    const { stream } = await model.doStream({
      prompt: [
        {
          role: 'user',
          content: [{ type: 'text', text: 'Stream a greeting' }],
        },
      ],
    });

    const parts = await readStreamParts(stream);
    expect(parts).toEqual([
      { type: 'stream-start', warnings: [] },
      {
        type: 'response-metadata',
        id: 'resp-1',
        modelId: 'anthropic/claude-haiku-4.5',
        timestamp: expect.any(Date),
      },
      { type: 'text-start', id: 'text-1' },
      { type: 'text-delta', id: 'text-1', delta: 'Hel' },
      { type: 'text-delta', id: 'text-1', delta: 'lo' },
      { type: 'text-end', id: 'text-1' },
      {
        type: 'finish',
        finishReason: 'stop',
        usage: {
          inputTokens: 5,
          outputTokens: 2,
          totalTokens: 7,
        },
      },
    ]);
  });

  it('parses streamed tool calls into AI SDK tool input and tool call parts', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      headers: new Headers({ 'content-type': 'text/event-stream' }),
      body: makeSseStream([
        'data: {"id":"resp-2","model":"qwen/qwen-plus","choices":[{"delta":{"tool_calls":[{"index":0,"id":"call_1","type":"function","function":{"name":"get_template","arguments":"{\\"slug\\":\\""}}]}}]}\n\n',
        'data: {"choices":[{"delta":{"tool_calls":[{"index":0,"function":{"arguments":"brainlift\\"}"}}]}}]}\n\n',
        'data: {"choices":[{"finish_reason":"tool_calls"}],"usage":{"prompt_tokens":9,"completion_tokens":3,"total_tokens":12}}\n\n',
        'data: [DONE]\n\n',
      ]),
    });
    globalThis.fetch = fetchMock as typeof globalThis.fetch;

    const model = getChatModel('qwen/qwen-plus');
    const { stream } = await model.doStream({
      prompt: [
        {
          role: 'user',
          content: [{ type: 'text', text: 'Create a brainlift from the template' }],
        },
      ],
    });

    const parts = await readStreamParts(stream);
    expect(parts).toEqual([
      { type: 'stream-start', warnings: [] },
      {
        type: 'response-metadata',
        id: 'resp-2',
        modelId: 'qwen/qwen-plus',
        timestamp: expect.any(Date),
      },
      {
        type: 'tool-input-start',
        id: 'call_1',
        toolName: 'get_template',
      },
      {
        type: 'tool-input-delta',
        id: 'call_1',
        delta: '{"slug":"',
      },
      {
        type: 'tool-input-delta',
        id: 'call_1',
        delta: 'brainlift"}',
      },
      {
        type: 'tool-input-end',
        id: 'call_1',
      },
      {
        type: 'tool-call',
        toolCallId: 'call_1',
        toolName: 'get_template',
        input: '{"slug":"brainlift"}',
      },
      {
        type: 'finish',
        finishReason: 'tool-calls',
        usage: {
          inputTokens: 9,
          outputTokens: 3,
          totalTokens: 12,
        },
      },
    ]);
  });

  it('preserves visible text before a streamed tool call', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      headers: new Headers({ 'content-type': 'text/event-stream' }),
      body: makeSseStream([
        'data: {"id":"resp-3","model":"qwen/qwen-plus","choices":[{"delta":{"content":"Let me grab the template. "}}]}\n\n',
        'data: {"choices":[{"delta":{"tool_calls":[{"index":0,"id":"call_2","type":"function","function":{"name":"get_template","arguments":"{}"}}]}}]}\n\n',
        'data: {"choices":[{"finish_reason":"tool_calls"}],"usage":{"prompt_tokens":11,"completion_tokens":4,"total_tokens":15}}\n\n',
        'data: [DONE]\n\n',
      ]),
    });
    globalThis.fetch = fetchMock as typeof globalThis.fetch;

    const model = getChatModel('qwen/qwen-plus');
    const { stream } = await model.doStream({
      prompt: [
        {
          role: 'user',
          content: [{ type: 'text', text: 'Create a new brainlift' }],
        },
      ],
    });

    const parts = await readStreamParts(stream);
    expect(parts).toEqual([
      { type: 'stream-start', warnings: [] },
      {
        type: 'response-metadata',
        id: 'resp-3',
        modelId: 'qwen/qwen-plus',
        timestamp: expect.any(Date),
      },
      { type: 'text-start', id: 'text-1' },
      { type: 'text-delta', id: 'text-1', delta: 'Let me grab the template. ' },
      { type: 'text-end', id: 'text-1' },
      {
        type: 'tool-input-start',
        id: 'call_2',
        toolName: 'get_template',
      },
      {
        type: 'tool-input-delta',
        id: 'call_2',
        delta: '{}',
      },
      {
        type: 'tool-input-end',
        id: 'call_2',
      },
      {
        type: 'tool-call',
        toolCallId: 'call_2',
        toolName: 'get_template',
        input: '{}',
      },
      {
        type: 'finish',
        finishReason: 'tool-calls',
        usage: {
          inputTokens: 11,
          outputTokens: 4,
          totalTokens: 15,
        },
      },
    ]);
  });
});
