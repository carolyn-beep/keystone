import type { ProviderRequest } from '../types';
import {
  NonRetryableError,
  RateLimitError,
  RETRYABLE_STATUS_CODES,
  RetryableError,
} from '../errors';
import { OpenAICompatibleProvider } from './base';

const FIREWORKS_URL = 'https://api.fireworks.ai/inference/v1/chat/completions';

function buildSchemaInstruction(request: ProviderRequest): string {
  const schemaJson = JSON.stringify(request.responseFormat?.type === 'json_schema'
    ? request.responseFormat.jsonSchema.schema
    : {});

  return [
    'Return only valid JSON that strictly conforms to the schema below.',
    'Do not include markdown, prose, or extra keys.',
    `Schema: ${schemaJson}`,
  ].join('\n');
}

export class FireworksProvider extends OpenAICompatibleProvider {
  constructor(apiKey: string) {
    super({
      name: 'fireworks',
      endpoint: FIREWORKS_URL,
      apiKey,
    });
  }

  protected buildHeaders(): Record<string, string> {
    return {
      Authorization: `Bearer ${this.apiKey}`,
      'Content-Type': 'application/json',
    };
  }

  protected override augmentRequestBody(
    body: Record<string, unknown>,
    request: ProviderRequest,
  ): Record<string, unknown> {
    if (request.responseFormat?.type !== 'json_schema') {
      return body;
    }

    const messages = Array.isArray(body.messages)
      ? [...body.messages]
      : [];

    messages.push({
      role: 'system',
      content: buildSchemaInstruction(request),
    });

    return {
      ...body,
      messages,
    };
  }

  protected override classifyError(
    status: number,
    body: string,
    retryAfterMs: number | undefined,
    model: string,
  ): Error {
    if (status === 429) {
      return new RateLimitError(model, this.name, retryAfterMs);
    }

    if (RETRYABLE_STATUS_CODES.has(status)) {
      return new RetryableError(
        `Fireworks ${status}: ${body}`,
        model,
        this.name,
        status,
        retryAfterMs,
      );
    }

    return new NonRetryableError(
      `Fireworks ${status}: ${body}`,
      model,
      this.name,
      status,
      retryAfterMs,
    );
  }
}
