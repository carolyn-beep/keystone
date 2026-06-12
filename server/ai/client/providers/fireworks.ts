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
    let next = body;

    // gpt-oss is a reasoning model: by default it spends the completion budget on
    // chain-of-thought, which starves `content` on tight-maxTokens callers (e.g.
    // the 80/150-token plain-text summarizers) and yields an empty response. As a
    // tier fallback we want answers, not reasoning, so cap reasoning effort low.
    // Verified 2026-06-12: with effort=low gpt-oss-120b returns clean content in
    // ~40 tokens; full-reasoning models on other tiers are left untouched.
    if (request.model.includes('gpt-oss')) {
      next = { ...next, reasoning_effort: 'low' };
    }

    if (request.responseFormat?.type !== 'json_schema') {
      return next;
    }

    const messages = Array.isArray(next.messages)
      ? [...next.messages]
      : [];

    messages.push({
      role: 'system',
      content: buildSchemaInstruction(request),
    });

    return {
      ...next,
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
