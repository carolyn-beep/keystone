import type {
  LanguageModelV2,
  LanguageModelV2CallOptions,
  LanguageModelV2Content,
  LanguageModelV2FinishReason,
  LanguageModelV2Message,
  LanguageModelV2StreamPart,
  LanguageModelV2Usage,
  SharedV2Headers,
} from '@ai-sdk/provider';
import { CHAT_MODELS, DEFAULT_CHAT_MODEL_ID, isChatModelId, type ChatModelId } from '@shared/chat-models';
import { MODEL_REGISTRY } from '../client/registry';

const OPENROUTER_URL = 'https://openrouter.ai/api/v1/chat/completions';

type OpenAIMessage =
  | { role: 'system'; content: string }
  | { role: 'user'; content: string }
  | {
      role: 'assistant';
      content: string | null;
      tool_calls?: Array<{
        id: string;
        type: 'function';
        function: {
          name: string;
          arguments: string;
        };
      }>;
    }
  | {
      role: 'tool';
      tool_call_id: string;
      content: string;
    };

function headersToRecord(headers: Headers | undefined): SharedV2Headers | undefined {
  if (!headers) {
    return undefined;
  }

  const result: SharedV2Headers = {};
  headers.forEach((value, key) => {
    result[key] = value;
  });
  return result;
}

function assertSupportedContentPart(part: unknown): void {
  if (!part || typeof part !== 'object') {
    return;
  }

  if ((part as { type?: unknown }).type === 'file') {
    throw new Error('Native chat provider does not support file message parts');
  }
}

function stringifyToolOutput(output: unknown): string {
  if (!output || typeof output !== 'object') {
    return String(output ?? '');
  }

  const typedOutput = output as { type?: unknown; value?: unknown; reason?: unknown };
  if (typedOutput.type === 'text' && typeof typedOutput.value === 'string') {
    return typedOutput.value;
  }
  if (typedOutput.type === 'error-text' && typeof typedOutput.value === 'string') {
    return typedOutput.value;
  }
  if (typedOutput.type === 'execution-denied' && typeof typedOutput.reason === 'string') {
    return typedOutput.reason;
  }

  return JSON.stringify(output);
}

function messagePartsToText(message: LanguageModelV2Message): string {
  if (message.role === 'system') {
    return message.content;
  }

  return message.content
    .map((part) => {
      assertSupportedContentPart(part);

      if (part.type === 'text' || part.type === 'reasoning') {
        return part.text;
      }
      if (part.type === 'tool-result') {
        return stringifyToolOutput(part.output);
      }
      return '';
    })
    .filter((value) => value.length > 0)
    .join('\n\n');
}

function toOpenAIMessages(prompt: LanguageModelV2CallOptions['prompt']): OpenAIMessage[] {
  const messages: OpenAIMessage[] = [];

  for (const message of prompt) {
    switch (message.role) {
      case 'system':
        messages.push({
          role: 'system',
          content: message.content,
        });
        break;

      case 'user':
        messages.push({
          role: 'user',
          content: messagePartsToText(message),
        });
        break;

      case 'assistant': {
        const textContent = message.content
          .filter((part) => part.type === 'text' || part.type === 'reasoning')
          .map((part) => part.text)
          .join('\n\n');

        const toolCalls = message.content
          .filter((part) => part.type === 'tool-call')
          .map((part) => ({
            id: part.toolCallId,
            type: 'function' as const,
            function: {
              name: part.toolName,
              arguments: JSON.stringify(part.input ?? {}),
            },
          }));

        messages.push({
          role: 'assistant',
          content: textContent.length > 0 ? textContent : null,
          ...(toolCalls.length > 0 ? { tool_calls: toolCalls } : {}),
        });
        break;
      }

      case 'tool':
        for (const part of message.content) {
          if (part.type !== 'tool-result') {
            continue;
          }

          messages.push({
            role: 'tool',
            tool_call_id: part.toolCallId,
            content: stringifyToolOutput(part.output),
          });
        }
        break;
    }
  }

  return messages;
}

function toOpenAITools(options: LanguageModelV2CallOptions) {
  return options.tools
    ?.filter((tool) => tool.type === 'function')
    .map((tool) => ({
      type: 'function',
      function: {
        name: tool.name,
        description: tool.description,
        parameters: tool.inputSchema,
      },
    }));
}

function toOpenAIToolChoice(options: LanguageModelV2CallOptions) {
  switch (options.toolChoice?.type) {
    case 'none':
      return 'none';
    case 'required':
      return 'required';
    case 'tool':
      return {
        type: 'function',
        function: {
          name: options.toolChoice.toolName,
        },
      };
    case 'auto':
    case undefined:
      return 'auto';
  }
}

function toResponseFormat(options: LanguageModelV2CallOptions) {
  if (!options.responseFormat || options.responseFormat.type !== 'json') {
    return undefined;
  }

  if (!options.responseFormat.schema) {
    return { type: 'json_object' };
  }

  return {
    type: 'json_schema',
    json_schema: {
      name: options.responseFormat.name ?? 'result',
      strict: true,
      schema: options.responseFormat.schema,
    },
  };
}

function buildRequestBody(modelId: string, options: LanguageModelV2CallOptions, stream: boolean) {
  const body: Record<string, unknown> = {
    model: modelId,
    messages: toOpenAIMessages(options.prompt),
  };

  if (stream) {
    body.stream = true;
    body.stream_options = { include_usage: true };
  }
  if (options.temperature != null) {
    body.temperature = options.temperature;
  }
  if (options.maxOutputTokens != null) {
    body.max_tokens = options.maxOutputTokens;
  }
  if (options.stopSequences?.length) {
    body.stop = options.stopSequences;
  }
  if (options.topP != null) {
    body.top_p = options.topP;
  }
  if (options.topK != null) {
    body.top_k = options.topK;
  }
  if (options.presencePenalty != null) {
    body.presence_penalty = options.presencePenalty;
  }
  if (options.frequencyPenalty != null) {
    body.frequency_penalty = options.frequencyPenalty;
  }
  if (options.seed != null) {
    body.seed = options.seed;
  }

  const tools = toOpenAITools(options);
  if (tools && tools.length > 0) {
    body.tools = tools;
    body.tool_choice = toOpenAIToolChoice(options);
  }

  const responseFormat = toResponseFormat(options);
  if (responseFormat) {
    body.response_format = responseFormat;
  }

  return body;
}

function extractTextContent(content: unknown): string {
  if (typeof content === 'string') {
    return content;
  }

  if (Array.isArray(content)) {
    return content
      .map((part) => {
        if (!part || typeof part !== 'object') {
          return '';
        }
        const text = (part as { text?: unknown }).text;
        return typeof text === 'string' ? text : '';
      })
      .filter((text) => text.length > 0)
      .join('\n\n');
  }

  return '';
}

function normalizeUsage(usage: Record<string, unknown> | undefined): LanguageModelV2Usage {
  return {
    inputTokens: typeof usage?.prompt_tokens === 'number' ? usage.prompt_tokens : undefined,
    outputTokens: typeof usage?.completion_tokens === 'number' ? usage.completion_tokens : undefined,
    totalTokens: typeof usage?.total_tokens === 'number' ? usage.total_tokens : undefined,
  };
}

function mapFinishReason(value: string | null | undefined): LanguageModelV2FinishReason {
  switch (value) {
    case 'stop':
      return 'stop';
    case 'length':
      return 'length';
    case 'content_filter':
      return 'content-filter';
    case 'tool_calls':
      return 'tool-calls';
    case 'error':
      return 'error';
    case 'other':
      return 'other';
    default:
      return 'unknown';
  }
}

class OpenRouterChatLanguageModel implements LanguageModelV2 {
  readonly specificationVersion = 'v2' as const;
  readonly provider = 'openrouter';
  readonly supportedUrls = {};

  constructor(readonly modelId: ChatModelId) {}

  private get apiKey(): string {
    const apiKey = process.env.OPENROUTER_API_KEY;
    if (!apiKey) {
      throw new Error('OPENROUTER_API_KEY environment variable is not set');
    }
    return apiKey;
  }

  private async fetchResponse(
    options: LanguageModelV2CallOptions,
    stream: boolean,
  ): Promise<{ response: Response; requestBody: Record<string, unknown> }> {
    const requestBody = buildRequestBody(this.modelId, options, stream);

    const response = await fetch(OPENROUTER_URL, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${this.apiKey}`,
        'Content-Type': 'application/json',
        ...(options.headers ?? {}),
      },
      body: JSON.stringify(requestBody),
      signal: options.abortSignal,
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`OpenRouter ${response.status}: ${errorText}`);
    }

    return {
      response,
      requestBody,
    };
  }

  async doGenerate(options: LanguageModelV2CallOptions) {
    const { response, requestBody } = await this.fetchResponse(options, false);
    const payload = await response.json();
    const choice = payload?.choices?.[0];
    const message = choice?.message ?? {};
    const textContent = extractTextContent(message.content);
    const content: LanguageModelV2Content[] = [];

    if (textContent.length > 0) {
      content.push({
        type: 'text',
        text: textContent,
      });
    }

    if (Array.isArray(message.tool_calls)) {
      for (const toolCall of message.tool_calls) {
        content.push({
          type: 'tool-call',
          toolCallId: toolCall.id,
          toolName: toolCall.function?.name ?? 'unknown',
          input: toolCall.function?.arguments ?? '{}',
        });
      }
    }

    return {
      content,
      finishReason: mapFinishReason(choice?.finish_reason ?? 'stop'),
      usage: normalizeUsage(payload?.usage),
      request: {
        body: requestBody,
      },
      response: {
        id: payload?.id,
        timestamp: new Date(),
        modelId: payload?.model ?? this.modelId,
        headers: headersToRecord(response.headers),
        body: payload,
      },
      warnings: [],
    };
  }

  async doStream(options: LanguageModelV2CallOptions) {
    const { response, requestBody } = await this.fetchResponse(options, true);
    const responseHeaders = headersToRecord(response.headers);
    const responseBody = response.body as ReadableStream<Uint8Array> | null;
    if (!responseBody) {
      throw new Error('OpenRouter stream response did not include a body');
    }

    const modelId = this.modelId;

    const stream = new ReadableStream<LanguageModelV2StreamPart>({
      async start(controller) {
        const reader = responseBody.getReader();
        const decoder = new TextDecoder();
        let buffer = '';
        let textStarted = false;
        let textEnded = false;
        let responseMetadataSent = false;
        let finishSent = false;
        let pendingFinishReason: LanguageModelV2FinishReason | undefined;
        let pendingUsage: LanguageModelV2Usage | undefined;
        const textId = 'text-1';
        const pendingToolCalls = new Map<number, {
          id: string;
          toolName?: string;
          input: string;
          emittedInputLength: number;
          started: boolean;
          completed: boolean;
        }>();

        const flushToolCallProgress = (toolCallState: {
          id: string;
          toolName?: string;
          input: string;
          emittedInputLength: number;
          started: boolean;
          completed: boolean;
        }) => {
          if (!toolCallState.started && toolCallState.toolName) {
            toolCallState.started = true;
            controller.enqueue({
              type: 'tool-input-start',
              id: toolCallState.id,
              toolName: toolCallState.toolName,
            });
          }

          if (
            toolCallState.started
            && toolCallState.emittedInputLength < toolCallState.input.length
          ) {
            controller.enqueue({
              type: 'tool-input-delta',
              id: toolCallState.id,
              delta: toolCallState.input.slice(toolCallState.emittedInputLength),
            });
            toolCallState.emittedInputLength = toolCallState.input.length;
          }
        };

        const finalizePendingToolCalls = () => {
          for (const toolCallState of Array.from(pendingToolCalls.values())) {
            if (toolCallState.completed) {
              continue;
            }

            if (!toolCallState.started) {
              toolCallState.started = true;
              controller.enqueue({
                type: 'tool-input-start',
                id: toolCallState.id,
                toolName: toolCallState.toolName ?? 'unknown',
              });
            }

            if (toolCallState.emittedInputLength < toolCallState.input.length) {
              controller.enqueue({
                type: 'tool-input-delta',
                id: toolCallState.id,
                delta: toolCallState.input.slice(toolCallState.emittedInputLength),
              });
              toolCallState.emittedInputLength = toolCallState.input.length;
            }

            controller.enqueue({
              type: 'tool-input-end',
              id: toolCallState.id,
            });
            controller.enqueue({
              type: 'tool-call',
              toolCallId: toolCallState.id,
              toolName: toolCallState.toolName ?? 'unknown',
              input: toolCallState.input.length > 0 ? toolCallState.input : '{}',
            });
            toolCallState.completed = true;
          }
        };

        const emitFinish = (
          finishReason: LanguageModelV2FinishReason,
          usage: LanguageModelV2Usage | undefined,
        ) => {
          if (finishSent) return;
          finishSent = true;
          controller.enqueue({
            type: 'finish',
            finishReason,
            usage: usage ?? normalizeUsage(undefined),
          });
        };

        const processRawEvent = (rawEvent: string) => {
          const dataLines = rawEvent
            .split('\n')
            .filter((line) => line.startsWith('data:'))
            .map((line) => line.slice(5).trim());

          if (dataLines.length === 0) {
            return;
          }

          const event = dataLines.join('\n');
          if (event === '[DONE]') {
            return;
          }

          const payload = JSON.parse(event) as Record<string, unknown>;
          if (payload.usage && typeof payload.usage === 'object') {
            pendingUsage = normalizeUsage(payload.usage as Record<string, unknown>);
            if (pendingFinishReason) {
              emitFinish(pendingFinishReason, pendingUsage);
            }
          }

          const choice = Array.isArray(payload.choices)
            ? (payload.choices[0] as Record<string, unknown> | undefined)
            : undefined;
          const delta = choice?.delta as Record<string, unknown> | undefined;

          if (!responseMetadataSent && (typeof payload.id === 'string' || typeof payload.model === 'string')) {
            responseMetadataSent = true;
            controller.enqueue({
              type: 'response-metadata',
              id: typeof payload.id === 'string' ? payload.id : undefined,
              modelId: typeof payload.model === 'string' ? payload.model : modelId,
              timestamp: new Date(),
            });
          }

          const deltaContent = typeof delta?.content === 'string'
            ? delta.content
            : extractTextContent(delta?.content);

          if (deltaContent.length > 0) {
            if (!textStarted) {
              textStarted = true;
              controller.enqueue({
                type: 'text-start',
                id: textId,
              });
            }

            controller.enqueue({
              type: 'text-delta',
              id: textId,
              delta: deltaContent,
            });
          }

          const deltaToolCalls = Array.isArray(delta?.tool_calls)
            ? delta.tool_calls
            : [];

          if (deltaToolCalls.length > 0 && textStarted && !textEnded) {
            controller.enqueue({
              type: 'text-end',
              id: textId,
            });
            textEnded = true;
          }

          for (const [fallbackIndex, rawToolCall] of Array.from(deltaToolCalls.entries())) {
            if (!rawToolCall || typeof rawToolCall !== 'object') {
              continue;
            }

            const typedToolCall = rawToolCall as {
              index?: unknown;
              id?: unknown;
              function?: {
                name?: unknown;
                arguments?: unknown;
              };
            };

            const toolCallIndex = typeof typedToolCall.index === 'number'
              ? typedToolCall.index
              : fallbackIndex;
            const toolCallId = typeof typedToolCall.id === 'string' && typedToolCall.id.length > 0
              ? typedToolCall.id
              : `tool-call-${toolCallIndex + 1}`;

            let toolCallState = pendingToolCalls.get(toolCallIndex);
            if (!toolCallState) {
              toolCallState = {
                id: toolCallId,
                input: '',
                emittedInputLength: 0,
                started: false,
                completed: false,
              };
              pendingToolCalls.set(toolCallIndex, toolCallState);
            }

            if (!toolCallState.toolName && typeof typedToolCall.function?.name === 'string') {
              toolCallState.toolName = typedToolCall.function.name;
            }

            if (typeof typedToolCall.function?.arguments === 'string') {
              toolCallState.input += typedToolCall.function.arguments;
            }

            flushToolCallProgress(toolCallState);
          }

          const finishReason = typeof choice?.finish_reason === 'string'
            ? choice.finish_reason
            : undefined;

          if (finishReason && !finishSent) {
            pendingFinishReason = mapFinishReason(finishReason);

            if (textStarted && !textEnded) {
              controller.enqueue({
                type: 'text-end',
                id: textId,
              });
              textEnded = true;
            }

            finalizePendingToolCalls();
            if (pendingUsage) {
              emitFinish(pendingFinishReason, pendingUsage);
            }
          }
        };

        controller.enqueue({
          type: 'stream-start',
          warnings: [],
        });

        try {
          while (true) {
            const { done, value } = await reader.read();
            if (done) {
              break;
            }

            buffer += decoder.decode(value, { stream: true });

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

          if (!finishSent) {
            if (textStarted && !textEnded) {
              controller.enqueue({
                type: 'text-end',
                id: textId,
              });
              textEnded = true;
            }

            finalizePendingToolCalls();
            emitFinish(
              pendingFinishReason ?? (pendingToolCalls.size > 0 ? 'tool-calls' : 'unknown'),
              pendingUsage,
            );
          }

          controller.close();
        } catch (error) {
          controller.error(error);
        }
      },
    });

    return {
      stream,
      request: {
        body: requestBody,
      },
      response: {
        headers: responseHeaders,
      },
    };
  }
}

export function getChatModel(modelId: string = DEFAULT_CHAT_MODEL_ID): LanguageModelV2 {
  const isAllowedHiddenModel = MODEL_REGISTRY[modelId]?.provider === 'fireworks';
  if (!isChatModelId(modelId) && !isAllowedHiddenModel) {
    const supported = [...CHAT_MODELS.map((model) => model.id), ...Object.keys(MODEL_REGISTRY).filter((id) => MODEL_REGISTRY[id].provider === 'fireworks')].join(', ');
    throw new Error(`Unsupported chat model "${modelId}". Supported models: ${supported}`);
  }

  return new OpenRouterChatLanguageModel(modelId as ChatModelId);
}
