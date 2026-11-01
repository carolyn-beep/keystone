import type { AIProvider, Message, ProviderName, ProviderRequest, ProviderResponse, ResponseFormat } from '../types';
import {
  RETRYABLE_STATUS_CODES,
  RetryableError,
} from '../errors';

export interface OpenAICompatibleProviderConfig {
  name: ProviderName;
  endpoint: string;
  apiKey: string;
}

function mapResponseFormat(format: ResponseFormat): Record<string, unknown> {
  if (format.type === 'json_object') {
    return { type: 'json_object' };
  }

  return {
    type: 'json_schema',
    json_schema: {
      name: format.jsonSchema.name,
      strict: format.jsonSchema.strict ?? true,
      schema: format.jsonSchema.schema,
    },
  };
}

function extractMessageContent(message: unknown): string | null {
  if (typeof message === 'string') {
    return message;
  }

  if (!Array.isArray(message)) {
    return null;
  }

  const textSegments = message
    .map((segment) => {
      if (!segment || typeof segment !== 'object') {
        return null;
      }
      const text = (segment as { text?: unknown }).text;
      return typeof text === 'string' ? text : null;
    })
    .filter((text): text is string => typeof text === 'string');

  if (textSegments.length === 0) {
    return null;
  }

  return textSegments.join('\n').trim();
}

export function parseRetryAfterMs(headerValue: string | null): number | undefined {
  if (!headerValue) {
    return undefined;
  }

  const seconds = Number(headerValue);
  if (Number.isFinite(seconds)) {
    return Math.max(0, Math.round(seconds * 1000));
  }

  const absoluteDateMs = Date.parse(headerValue);
  if (Number.isNaN(absoluteDateMs)) {
    return undefined;
  }

  return Math.max(0, absoluteDateMs - Date.now());
}

export abstract class OpenAICompatibleProvider implements AIProvider {
  readonly name: ProviderName;
  protected readonly apiKey: string;
  protected readonly endpoint: string;

  constructor(config: OpenAICompatibleProviderConfig) {
    this.name = config.name;
    this.apiKey = config.apiKey;
    this.endpoint = config.endpoint;
  }

  protected buildMessages(request: ProviderRequest): Message[] {
    const messages: Message[] = [];
    if (request.system) {
      messages.push({ role: 'system', content: request.system });
    }
    messages.push(...request.messages);
    return messages;
  }

  protected buildRequestBody(request: ProviderRequest): Record<string, unknown> {
    const body: Record<string, unknown> = {
      model: request.model,
      messages: this.buildMessages(request),
    };

    if (request.temperature !== undefined) {
      body.temperature = request.temperature;
    }
    if (request.maxTokens !== undefined) {
      body.max_tokens = request.maxTokens;
    }
    if (request.responseFormat) {
      body.response_format = mapResponseFormat(request.responseFormat);
    }

    return this.augmentRequestBody(body, request);
  }

  protected augmentRequestBody(
    body: Record<string, unknown>,
    _request: ProviderRequest,
  ): Record<string, unknown> {
    return body;
  }

  protected abstract buildHeaders(): Record<string, string>;

  protected classifyError(
    status: number,
    body: string,
    retryAfterMs: number | undefined,
    model: string,
  ): Error {
    if (RETRYABLE_STATUS_CODES.has(status)) {
      return new RetryableError(
        `${this.name} ${status}: ${body}`,
        model,
        this.name,
        status,
        retryAfterMs,
      );
    }

    return new Error(`${this.name} ${status}: ${body}`);
  }

  async call(request: ProviderRequest): Promise<ProviderResponse> {
    const response = await fetch(this.endpoint, {
      method: 'POST',
      headers: this.buildHeaders(),
      body: JSON.stringify(this.buildRequestBody(request)),
      signal: request.signal,
    });

    if (!response.ok) {
      const errorText = await response.text();
      const retryAfterMs = parseRetryAfterMs(response.headers.get('retry-after'));
      throw this.classifyError(
        response.status,
        errorText,
        retryAfterMs,
        request.model,
      );
    }

    const data = await response.json();
    const choice = data?.choices?.[0];
    const content = extractMessageContent(choice?.message?.content);

    if (!content) {
      throw new RetryableError(
        `Empty or malformed response from ${this.name} (no content in choices)`,
        request.model,
        this.name,
        200,
      );
    }

    const usage = data.usage
      ? {
          promptTokens: data.usage.prompt_tokens,
          completionTokens: data.usage.completion_tokens,
          totalTokens: data.usage.total_tokens,
        }
      : undefined;

    return {
      content,
      model: data.model ?? request.model,
      usage,
      costUsd: data.usage?.cost,
    };
  }
}
