/**
 * Unified AI Client — Public API
 *
 * Entry points for all AI calls: callModel() and callModelWithFallback().
 * Built-in timeout, retry with exponential backoff, and CallRecord observability.
 */

import { randomUUID } from 'crypto';
import type {
  AIProvider,
  CallModelOptions,
  CallModelResult,
  CallModelWithFallbackOptions,
  CallRecord,
  CallRecorder,
  ProviderName,
  ProviderResponse,
} from './types';
import { getFireworksFallback, getModelOrThrow } from './registry';
import { FireworksProvider } from './providers/fireworks';
import { OpenRouterProvider } from './providers/openrouter';
import { getProviderBreaker } from './circuit-breaker';
import { recordFailoverEvent } from './provider-events';
import {
  AllModelsFailed,
  NonRetryableError,
  RetryableError,
  TimeoutError,
} from './errors';

const MAX_PROVIDER_RETRY_AFTER_MS = 10_000;

const providerRegistry: Partial<Record<ProviderName, AIProvider>> = {};

function requireProviderApiKey(
  envVarName: 'OPENROUTER_API_KEY' | 'FIREWORKS_API_KEY',
  provider: ProviderName,
  model: string,
): string {
  const apiKey = process.env[envVarName];
  if (!apiKey) {
    throw new NonRetryableError(
      `${envVarName} environment variable is not set`,
      model,
      provider,
      0,
    );
  }
  return apiKey;
}

function getProvider(providerName: ProviderName, model: string): AIProvider {
  const existing = providerRegistry[providerName];
  if (existing) {
    return existing;
  }

  let provider: AIProvider;
  switch (providerName) {
    case 'openrouter':
      provider = new OpenRouterProvider(
        requireProviderApiKey('OPENROUTER_API_KEY', providerName, model),
      );
      break;
    case 'fireworks':
      provider = new FireworksProvider(
        requireProviderApiKey('FIREWORKS_API_KEY', providerName, model),
      );
      break;
    default:
      throw new NonRetryableError(
        `Provider "${providerName}" is not supported by unified client runtime`,
        model,
        providerName,
        0,
      );
  }

  providerRegistry[providerName] = provider;
  return provider;
}

export function resetProviderRegistryForTests(): void {
  for (const providerName of Object.keys(providerRegistry) as ProviderName[]) {
    delete providerRegistry[providerName];
  }
}

export function setProviderForTests(providerName: ProviderName, provider: AIProvider): void {
  providerRegistry[providerName] = provider;
}

// ─── CallRecord Recorder ────────────────────────────────────────────────────

let recorder: CallRecorder = (record) => {
  console.log(JSON.stringify(record));
};

const AUDITED_DURATION_CALLERS = new Set([
  'redundancyAnalyzer',
  'dok3SourceRanker',
  'dok4InsightRanker',
  'imagePromptGenerator',
  'brainliftExtractor.chunkExtraction',
  'brainliftExtractor.contradictions',
  'builder.purposeSuggestions',
  'quizGenerator.conceptExtraction',
  'quizGenerator.questionGeneration',
  'brainliftBuilder.suggestExperts',
  'preformat.evaluation',
  'preformat.sectionClassification',
  'expertRanker.cleanup',
  'expertRanker.stackRanking',
  'experts.diagnostics',
]);

function logAuditedDurationSample(record: CallRecord): void {
  if (!AUDITED_DURATION_CALLERS.has(record.caller)) {
    return;
  }

  console.log(JSON.stringify({
    event: 'ai_duration_sample',
    caller: record.caller,
    status: record.status,
    durationMs: Math.round(record.durationMs),
    attempts: record.attempts,
    provider: record.provider,
    requestedModel: record.requestedModel,
    actualModel: record.actualModel,
    timestamp: record.timestamp.toISOString(),
    error: record.error,
  }));
}

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

    let settled = false;
    let timer: ReturnType<typeof setTimeout> | null = null;

    const cleanup = () => {
      if (signal) {
        signal.removeEventListener('abort', onAbort);
      }
      if (timer) {
        clearTimeout(timer);
      }
    };

    const onAbort = () => {
      if (settled) return;
      settled = true;
      cleanup();
      reject(new DOMException('The operation was aborted.', 'AbortError'));
    };

    timer = setTimeout(() => {
      if (settled) return;
      settled = true;
      cleanup();
      resolve();
    }, ms);

    if (signal) {
      signal.addEventListener('abort', onAbort, { once: true });
    }
  });
}

export type RetryDelayDecision =
  | { kind: 'retry'; delayMs: number }
  | { kind: 'failover'; reason: 'retry_after_exceeded' };

export function getRetryDelayDecision(input: {
  attempt: number;
  retryAfterMs?: number;
  maxRetryAfterMs: number;
}): RetryDelayDecision {
  if (input.retryAfterMs !== undefined) {
    if (input.retryAfterMs <= input.maxRetryAfterMs) {
      return {
        kind: 'retry',
        delayMs: Math.max(0, input.retryAfterMs),
      };
    }

    return {
      kind: 'failover',
      reason: 'retry_after_exceeded',
    };
  }

  return {
    kind: 'retry',
    delayMs: 100 * Math.pow(2, input.attempt),
  };
}

type FailoverReason =
  | 'retry_exhausted'
  | 'retry_after_exceeded'
  | 'non_retryable'
  | 'provider_unavailable'
  | 'circuit_open';

type InternalCallModelOptions = CallModelOptions & {
  requestedModel?: string;
  originalModel?: string;
  failedProvider?: ProviderName;
  failoverReason?: FailoverReason;
  disableProviderFallback?: boolean;
};

type ErrorMeta = {
  provider: ProviderName;
  failoverReason?: FailoverReason;
};

const ERROR_META = Symbol('ai-client-error-meta');

function attachErrorMeta<T extends Error>(error: T, meta: ErrorMeta): T {
  Object.defineProperty(error, ERROR_META, {
    value: meta,
    enumerable: false,
    configurable: true,
  });
  return error;
}

function getErrorMeta(error: unknown): ErrorMeta | undefined {
  if (!error || typeof error !== 'object') {
    return undefined;
  }
  return (error as Record<PropertyKey, ErrorMeta | undefined>)[ERROR_META];
}

type ProviderAttemptOutcome = {
  response: ProviderResponse | null;
  attempts: number;
  lastError: Error | null;
  failoverReason?: FailoverReason;
};

async function runProviderAttempts(input: {
  modelId: string;
  providerName: ProviderName;
  options: CallModelOptions;
  timeout?: number;
  maxRetries: number;
  breaker: ReturnType<typeof getProviderBreaker>;
}): Promise<ProviderAttemptOutcome> {
  let lastError: Error | null = null;
  let response: ProviderResponse | null = null;
  let attempts = 0;
  let failoverReason: FailoverReason | undefined;

  for (let attempt = 0; attempt <= input.maxRetries; attempt++) {
    attempts = attempt + 1;
    let providerInstance: AIProvider;
    try {
      providerInstance = getProvider(input.providerName, input.modelId);
    } catch (error: any) {
      lastError = error;
      if (error instanceof NonRetryableError && error.statusCode === 0) {
        failoverReason = 'provider_unavailable';
      } else {
        failoverReason = 'non_retryable';
      }
      break;
    }

    const controller = new AbortController();
    const timeoutId = input.timeout ? setTimeout(() => controller.abort(), input.timeout) : null;

    let onExternalAbort: (() => void) | null = null;
    if (input.options.signal) {
      if (input.options.signal.aborted) {
        if (timeoutId) clearTimeout(timeoutId);
        throw new DOMException('The operation was aborted.', 'AbortError');
      }
      onExternalAbort = () => controller.abort();
      input.options.signal.addEventListener('abort', onExternalAbort, { once: true });
    }

    try {
      response = await providerInstance.call({
        model: input.modelId,
        messages: input.options.messages,
        system: input.options.system,
        temperature: input.options.temperature,
        maxTokens: input.options.maxTokens,
        responseFormat: input.options.responseFormat,
        signal: controller.signal,
      });

      if (timeoutId) clearTimeout(timeoutId);
      if (onExternalAbort && input.options.signal) {
        input.options.signal.removeEventListener('abort', onExternalAbort);
      }

      if (input.options.validate) {
        try {
          input.options.validate(response.content);
        } catch (validationError: any) {
          response = null;
          throw new RetryableError(
            `Content validation failed: ${validationError.message}`,
            input.modelId,
            input.providerName,
            200,
          );
        }
      }

      break;
    } catch (error: any) {
      if (timeoutId) clearTimeout(timeoutId);
      if (onExternalAbort && input.options.signal) {
        input.options.signal.removeEventListener('abort', onExternalAbort);
      }

      if (error?.name === 'AbortError' || controller.signal.aborted) {
        if (input.options.signal?.aborted) {
          throw error;
        }
        lastError = new TimeoutError(input.modelId, input.timeout ?? 0);
        if (attempt < input.maxRetries) {
          await sleep(100 * Math.pow(2, attempt), input.options.signal);
          continue;
        }
        failoverReason = 'retry_exhausted';
        break;
      }

      if (error instanceof NonRetryableError) {
        lastError = error;
        failoverReason = error.statusCode === 0 ? 'provider_unavailable' : 'non_retryable';
        break;
      }

      if (error instanceof RetryableError) {
        lastError = error;
        if (attempt < input.maxRetries) {
          const decision = getRetryDelayDecision({
            attempt,
            retryAfterMs: error.retryAfterMs,
            maxRetryAfterMs: MAX_PROVIDER_RETRY_AFTER_MS,
          });
          if (decision.kind === 'retry') {
            await sleep(decision.delayMs, input.options.signal);
            continue;
          }
          failoverReason = 'retry_after_exceeded';
          break;
        }
        failoverReason = 'retry_exhausted';
        break;
      }

      if (error instanceof TypeError) {
        lastError = error;
        if (attempt < input.maxRetries) {
          await sleep(100 * Math.pow(2, attempt), input.options.signal);
          continue;
        }
        failoverReason = 'retry_exhausted';
        break;
      }

      lastError = error;
      failoverReason = 'non_retryable';
      break;
    }
  }

  if (response) {
    input.breaker.recordSuccess();
  } else {
    input.breaker.recordFailure();
  }

  return { response, attempts, lastError, failoverReason };
}

// ─── callModel ──────────────────────────────────────────────────────────────

/**
 * Single logical model call with built-in timeout + retry.
 *
 * For single-model callers, this includes provider failover to the mapped
 * Fireworks tier model.
 */
async function callModelInternal(options: InternalCallModelOptions): Promise<CallModelResult> {
  const modelDef = getModelOrThrow(options.model);
  const timeout = options.timeout ?? modelDef.defaultTimeout;
  const maxRetries = options.retries ?? modelDef.defaultMaxRetries ?? 0;
  const caller = options.caller ?? 'unknown';
  const requestedModel = options.requestedModel ?? options.model;

  const startTime = performance.now();
  let lastError: Error | null = null;
  let response: ProviderResponse | null = null;
  let attempts = 0;
  let failedProvider: ProviderName | undefined = options.failedProvider;
  let failoverReason: FailoverReason | undefined = options.failoverReason;
  let originalModel: string | undefined = options.originalModel;
  let activeModelDef = modelDef;
  let activeModelId = options.model;

  const primaryBreaker = getProviderBreaker(modelDef.provider);
  const primaryDecision = primaryBreaker.getDecision();

  let primaryOutcome: ProviderAttemptOutcome | null = null;
  if (primaryDecision.allow) {
    primaryOutcome = await runProviderAttempts({
      modelId: options.model,
      providerName: modelDef.provider,
      options,
      timeout,
      maxRetries,
      breaker: primaryBreaker,
    });

    attempts += primaryOutcome.attempts;
    response = primaryOutcome.response;
    lastError = primaryOutcome.lastError;
  } else {
    failoverReason = 'circuit_open';
    lastError = new NonRetryableError(
      'Provider circuit is open',
      options.model,
      modelDef.provider,
      0,
    );
  }

  if (!response && !options.disableProviderFallback && (primaryOutcome?.failoverReason || failoverReason)) {
    const fallbackModel = getFireworksFallback(options.model);
    if (fallbackModel) {
      const fallbackDef = getModelOrThrow(fallbackModel);
      const fallbackBreaker = getProviderBreaker(fallbackDef.provider);
      const fallbackDecision = fallbackBreaker.getDecision();

      if (!fallbackDecision.allow) {
        lastError = new NonRetryableError(
          'Fallback provider circuit is open',
          fallbackModel,
          fallbackDef.provider,
          0,
        );
      } else {
      const failoverOutcome = await runProviderAttempts({
        modelId: fallbackModel,
        providerName: fallbackDef.provider,
        options,
        timeout,
        maxRetries,
        breaker: fallbackBreaker,
      });
      attempts += failoverOutcome.attempts;
      response = failoverOutcome.response;
      lastError = failoverOutcome.lastError;
      failedProvider = modelDef.provider;
      failoverReason = primaryOutcome?.failoverReason ?? failoverReason;
      originalModel = options.model;
      activeModelDef = fallbackDef;
      activeModelId = fallbackModel;
      }
    }
  }

  if (!response && !failoverReason) {
    failoverReason = primaryOutcome?.failoverReason;
  }

  const durationMs = performance.now() - startTime;

  // Build CallRecord
  const record: CallRecord = {
    id: randomUUID(),
    timestamp: new Date(),
    caller,
    requestedModel,
    actualModel: response?.model ?? activeModelId,
    provider: activeModelDef.provider,
    failedProvider,
    failoverReason,
    originalModel,
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

  try {
    logAuditedDurationSample(record);
  } catch {
    // Don't let observability logging break the call
  }

  // If we have a response, return success
  if (response) {
    if (failedProvider && failoverReason) {
      try {
        recordFailoverEvent({
          caller,
          originalModel: originalModel ?? requestedModel,
          actualModel: response.model,
          failedProvider,
          failoverProvider: activeModelDef.provider,
          reason: failoverReason,
        });
      } catch {
        // Don't let event store errors break the call
      }
    }
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
  const finalError = lastError ?? new Error('callModel failed with unknown error');
  throw attachErrorMeta(finalError, {
    provider: activeModelDef.provider,
    failoverReason,
  });
}

export async function callModel(options: CallModelOptions): Promise<CallModelResult> {
  return callModelInternal(options);
}

type FallbackCandidate = {
  model: string;
  originalModel: string;
  failedProvider: ProviderName;
};

function buildFallbackCandidates(models: string[]): FallbackCandidate[] {
  const primaryModels = new Set(models);
  const seenFallbacks = new Set<string>();
  const candidates: FallbackCandidate[] = [];

  for (const model of models) {
    const fallbackModel = getFireworksFallback(model);
    if (!fallbackModel || primaryModels.has(fallbackModel) || seenFallbacks.has(fallbackModel)) {
      continue;
    }

    const modelDef = getModelOrThrow(model);
    candidates.push({
      model: fallbackModel,
      originalModel: model,
      failedProvider: modelDef.provider,
    });
    seenFallbacks.add(fallbackModel);
  }

  return candidates;
}

// ─── callModelWithFallback ──────────────────────────────────────────────────

/**
 * Tries all primary models first, then deduped Fireworks tier fallbacks.
 * This avoids consuming Fireworks fallback capacity before the caller's
 * explicit primary model list is exhausted.
 */
export async function callModelWithFallback(
  options: CallModelWithFallbackOptions,
): Promise<CallModelResult> {
  const errors: Error[] = [];
  const primaryFailures = new Map<string, ErrorMeta>();

  for (const model of options.models) {
    try {
      const result = await callModelInternal({
        ...options,
        model,
        disableProviderFallback: true,
      });
      return result;
    } catch (error: any) {
      errors.push(error);
      const meta = getErrorMeta(error);
      if (meta) {
        primaryFailures.set(model, meta);
      } else {
        const modelDef = getModelOrThrow(model);
        primaryFailures.set(model, { provider: modelDef.provider });
      }
      continue;
    }
  }

  for (const candidate of buildFallbackCandidates(options.models)) {
    const primaryFailure = primaryFailures.get(candidate.originalModel);

    try {
      const result = await callModelInternal({
        ...options,
        model: candidate.model,
        requestedModel: candidate.originalModel,
        originalModel: candidate.originalModel,
        failedProvider: primaryFailure?.provider ?? candidate.failedProvider,
        failoverReason: primaryFailure?.failoverReason,
        disableProviderFallback: true,
      });
      return result;
    } catch (error: any) {
      errors.push(error);
      continue;
    }
  }

  throw new AllModelsFailed(options.models, errors);
}
