/**
 * Unified AI Client — OpenRouter Provider
 *
 * Implements the AIProvider interface for OpenRouter's OpenAI-compatible API.
 * Handles request construction, response parsing, usage/cost extraction,
 * and error classification.
 */

import type {
  AIProvider,
  ProviderRequest,
  ProviderResponse,
  ResponseFormat,
} from '../types';
import {
  RetryableError,
  NonRetryableError,
  RateLimitError,
  RETRYABLE_STATUS_CODES,
} from '../errors';

const OPENROUTER_URL = 'https://openrouter.ai/api/v1/chat/completions';

/**
 * Maps our ResponseFormat to OpenRouter's expected format.
 */
function mapResponseFormat(format: ResponseFormat): Record<string, unknown> {
  if (format.type === 'json_object') {
    return { type: 'json_object' };
  }
  // json_schema format
  return {
    type: 'json_schema',
    json_schema: {
      name: format.jsonSchema.name,
      strict: format.jsonSchema.strict ?? true,
      schema: format.jsonSchema.schema,
    },
  };
}

export class OpenRouterProvider implements AIProvider {
  name = 'openrouter' as const;
  private apiKey: string;

  constructor(apiKey: string) {
    this.apiKey = apiKey;
  }

  async call(request: ProviderRequest): Promise<ProviderResponse> {
    // Build messages array, prepending system message if provided
    const messages: Array<{ role: string; content: string }> = [];
    if (request.system) {
      messages.push({ role: 'system', content: request.system });
    }
    messages.push(...request.messages);

    // Build request body
    const body: Record<string, unknown> = {
      model: request.model,
      messages,
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

    // Make the API call
    const response = await fetch(OPENROUTER_URL, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${this.apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
      signal: request.signal,
    });

    // Handle error responses
    if (!response.ok) {
      const errorText = await response.text();
      const { status } = response;

      if (status === 429) {
        throw new RateLimitError(request.model);
      }
      if (RETRYABLE_STATUS_CODES.has(status)) {
        throw new RetryableError(
          `OpenRouter ${status}: ${errorText}`,
          request.model,
          status,
        );
      }
      throw new NonRetryableError(
        `OpenRouter ${status}: ${errorText}`,
        request.model,
        status,
      );
    }

    // Parse successful response
    const data = await response.json();

    // Validate response structure
    const choice = data.choices?.[0];
    if (!choice?.message?.content) {
      throw new RetryableError(
        'Empty or malformed response from OpenRouter (no content in choices)',
        request.model,
        200,
      );
    }

    // Map usage fields from snake_case to camelCase
    const usage = data.usage
      ? {
          promptTokens: data.usage.prompt_tokens,
          completionTokens: data.usage.completion_tokens,
          totalTokens: data.usage.total_tokens,
        }
      : undefined;

    // Extract cost from usage
    const costUsd = data.usage?.cost;

    return {
      content: choice.message.content,
      model: data.model ?? request.model,
      usage,
      costUsd,
    };
  }
}
