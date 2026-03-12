/**
 * Unified AI Client — Public API
 *
 * Entry points for all AI calls: callModel() and callModelWithFallback().
 * Built-in timeout, retry with exponential backoff, and CallRecord observability.
 */

import { randomUUID } from 'crypto';
import type {
  CallModelOptions,
  CallModelWithFallbackOptions,
  CallModelResult,
  CallRecord,
  CallRecorder,
  ProviderResponse,
} from './types';
import { getModelOrThrow } from './registry';
import { OpenRouterProvider } from './providers/openrouter';
import {
  NonRetryableError,
  RetryableError,
  TimeoutError,
  AllModelsFailed,
} from './errors';

// ─── Provider Singleton ────────────────────────────────────────────────────

let provider: OpenRouterProvider | null = null;

function getProvider(): OpenRouterProvider {
  if (!provider) {
    const apiKey = process.env.OPENROUTER_API_KEY;
    if (!apiKey) {
      throw new NonRetryableError(
        'OPENROUTER_API_KEY environment variable is not set',
        'unknown',
        0,
      );
    }
    provider = new OpenRouterProvider(apiKey);
  }
  return provider;
}

// ─── CallRecord Recorder ────────────────────────────────────────────────────

let recorder: CallRecorder = (record) => {
  console.log(JSON.stringify(record));
};

/**
 * Swaps the global CallRecord recorder.
 * Default recorder logs structured JSON to console.
 */
export function setCallRecorder(newRecorder: CallRecorder): void {
  recorder = newRecorder;
}

// ─── Sleep Utility ──────────────────────────────────────────────────────────

function sleep(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) {
      reject(new DOMException('The operation was aborted.', 'AbortError'));
      return;
    }

    const timer = setTimeout(resolve, ms);

    if (signal) {
      const onAbort = () => {
        clearTimeout(timer);
        reject(new DOMException('The operation was aborted.', 'AbortError'));
      };
      signal.addEventListener('abort', onAbort, { once: true });
      // Clean up listener when sleep completes normally
      const originalResolve = resolve;
      resolve = () => {
        signal.removeEventListener('abort', onAbort);
        originalResolve();
      };
    }
  });
}

// ─── callModel ──────────────────────────────────────────────────────────────

/**
 * Single model call with built-in timeout + retry.
 *
 * Looks up model in registry for defaults, creates per-attempt AbortController
 * with timeout, retries on retryable errors with exponential backoff.
 */
export async function callModel(options: CallModelOptions): Promise<CallModelResult> {
  const modelDef = getModelOrThrow(options.model);
  const timeout = options.timeout ?? modelDef.defaultTimeout ?? 60_000;
  const maxRetries = options.retries ?? modelDef.defaultMaxRetries ?? 2;
  const caller = options.caller ?? 'unknown';

  const startTime = performance.now();
  let lastError: Error | null = null;
  let response: ProviderResponse | null = null;
  let attempts = 0;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    attempts = attempt + 1;

    // Create per-attempt AbortController with timeout
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeout);

    // Link external signal if provided
    let onExternalAbort: (() => void) | null = null;
    if (options.signal) {
      if (options.signal.aborted) {
        clearTimeout(timeoutId);
        throw new DOMException('The operation was aborted.', 'AbortError');
      }
      onExternalAbort = () => controller.abort();
      options.signal.addEventListener('abort', onExternalAbort, { once: true });
    }

    try {
      const providerInstance = getProvider();
      response = await providerInstance.call({
        model: options.model,
        messages: options.messages,
        system: options.system,
        temperature: options.temperature,
        maxTokens: options.maxTokens,
        responseFormat: options.responseFormat,
        signal: controller.signal,
      });

      clearTimeout(timeoutId);
      if (onExternalAbort && options.signal) {
        options.signal.removeEventListener('abort', onExternalAbort);
      }

      // Success — break out of retry loop
      break;
    } catch (error: any) {
      clearTimeout(timeoutId);
      if (onExternalAbort && options.signal) {
        options.signal.removeEventListener('abort', onExternalAbort);
      }

      // Check if this was an abort (external signal or timeout)
      if (error?.name === 'AbortError' || controller.signal.aborted) {
        // Check if it was an external abort
        if (options.signal?.aborted) {
          throw error;
        }
        // It was a timeout
        lastError = new TimeoutError(options.model, timeout);
        if (attempt < maxRetries) {
          await sleep(100 * Math.pow(2, attempt), options.signal);
          continue;
        }
        break;
      }

      // Non-retryable errors — throw immediately
      if (error instanceof NonRetryableError) {
        lastError = error;
        break;
      }

      // Retryable errors — retry if attempts remain
      if (error instanceof RetryableError || error instanceof TypeError) {
        lastError = error;
        if (attempt < maxRetries) {
          await sleep(100 * Math.pow(2, attempt), options.signal);
          continue;
        }
        break;
      }

      // Unknown error — treat as non-retryable
      lastError = error;
      break;
    }
  }

  const durationMs = performance.now() - startTime;

  // Build CallRecord
  const record: CallRecord = {
    id: randomUUID(),
    timestamp: new Date(),
    caller,
    requestedModel: options.model,
    actualModel: response?.model ?? options.model,
    provider: modelDef.provider,
    status: response ? 'success' : 'error',
    error: response ? undefined : (lastError?.message ?? 'Unknown error'),
    durationMs,
    attempts,
    usage: response?.usage,
    costUsd: response?.costUsd,
    temperature: options.temperature,
    maxTokens: options.maxTokens,
  };

  // Emit CallRecord
  try {
    recorder(record);
  } catch {
    // Don't let recorder errors break the call
  }

  // If we have a response, return success
  if (response) {
    return {
      content: response.content,
      model: response.model,
      usage: response.usage,
      costUsd: response.costUsd,
      durationMs,
      attempts,
    };
  }

  // Otherwise throw the last error
  throw lastError ?? new Error('callModel failed with unknown error');
}

// ─── callModelWithFallback ──────────────────────────────────────────────────

/**
 * Fallback chain: tries models in order, returns first success.
 * Each model gets its own full retry cycle.
 */
export async function callModelWithFallback(
  options: CallModelWithFallbackOptions,
): Promise<CallModelResult> {
  const errors: Error[] = [];

  for (const model of options.models) {
    try {
      const result = await callModel({ ...options, model });
      return result;
    } catch (error: any) {
      errors.push(error);
      continue;
    }
  }

  throw new AllModelsFailed(options.models, errors);
}
