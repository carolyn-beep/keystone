import {
  NonRetryableError,
  RateLimitError,
  RETRYABLE_STATUS_CODES,
  RetryableError,
} from '../errors';
import { OpenAICompatibleProvider } from './base';
import type { ProviderRequest } from '../types';

const OPENROUTER_URL = 'https://openrouter.ai/api/v1/chat/completions';

export class OpenRouterProvider extends OpenAICompatibleProvider {
  constructor(apiKey: string) {
    super({
      name: 'openrouter',
      endpoint: OPENROUTER_URL,
      apiKey,
    });
  }

  protected buildHeaders(): Record<string, string> {
    return {
      Authorization: `Bearer ${this.apiKey}`,
      'Content-Type': 'application/json',
    };
  }

  /**
   * Ask OpenRouter to prompt-cache Anthropic calls (automatic breakpoint mode).
   * Grader system prompts are long and identical across items, so repeated
   * grading of the same document reads the rubric from cache instead of
   * paying full input price each time. Non-Anthropic models are left alone:
   * OpenAI and Gemini cache implicitly, and the field is undocumented for
   * the rest.
   */
  protected override augmentRequestBody(
    body: Record<string, unknown>,
    request: ProviderRequest,
  ): Record<string, unknown> {
    if (request.model.startsWith('anthropic/')) {
      return { ...body, cache_control: { type: 'ephemeral' } };
    }
    return body;
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
        `OpenRouter ${status}: ${body}`,
        model,
        this.name,
        status,
        retryAfterMs,
      );
    }

    return new NonRetryableError(
      `OpenRouter ${status}: ${body}`,
      model,
      this.name,
      status,
      retryAfterMs,
    );
  }
}
