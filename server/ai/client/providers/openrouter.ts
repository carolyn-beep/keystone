import {
  NonRetryableError,
  RateLimitError,
  RETRYABLE_STATUS_CODES,
  RetryableError,
} from '../errors';
import { OpenAICompatibleProvider } from './base';

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
