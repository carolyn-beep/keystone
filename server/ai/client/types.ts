/**
 * Unified AI Client — Type Definitions
 *
 * All types for model registry, call options, results,
 * observability records, and provider interface.
 */

// --- Model Registry ---

export type ModelTier = 'premium' | 'standard' | 'fast' | 'budget';
export type ProviderName =
  | 'openrouter'
  | 'anthropic'
  | 'openai'
  | 'google'
  | 'fireworks';

export interface ModelDef {
  id: string;
  provider: ProviderName;
  tier: ModelTier;
  displayName: string;
  defaultTimeout?: number;
  defaultMaxRetries?: number;
  costPer1kInput?: number;
  costPer1kOutput?: number;
}

// --- Call Options ---

export interface Message {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

export interface JsonSchemaFormat {
  type: 'json_schema';
  jsonSchema: {
    name: string;
    strict?: boolean;
    schema: Record<string, unknown>;
  };
}

export interface JsonObjectFormat {
  type: 'json_object';
}

export type ResponseFormat = JsonSchemaFormat | JsonObjectFormat;

export interface CallModelOptions {
  model: string;
  messages: Message[];
  system?: string;
  temperature?: number;
  maxTokens?: number;
  responseFormat?: ResponseFormat;
  timeout?: number;
  retries?: number;
  signal?: AbortSignal;
  caller?: string;
  validate?: (content: string) => void;
}

export interface CallModelWithFallbackOptions extends Omit<CallModelOptions, 'model'> {
  models: string[];
}

// --- Call Result ---

export interface CallModelResult {
  content: string;
  model: string;
  usage?: {
    promptTokens: number;
    completionTokens: number;
    totalTokens: number;
  };
  costUsd?: number;
  durationMs: number;
  attempts: number;
}

// --- Observability ---

export interface CallRecord {
  id: string;
  timestamp: Date;
  caller: string;
  requestedModel: string;
  actualModel: string;
  provider: ProviderName;
  failedProvider?: ProviderName;
  failoverReason?: 'retry_exhausted' | 'retry_after_exceeded' | 'non_retryable' | 'provider_unavailable' | 'circuit_open';
  originalModel?: string;
  status: 'success' | 'error';
  error?: string;
  durationMs: number;
  attempts: number;
  usage?: {
    promptTokens: number;
    completionTokens: number;
    totalTokens: number;
  };
  costUsd?: number;
  temperature?: number;
  maxTokens?: number;
}

export type CallRecorder = (record: CallRecord) => void;

// --- Provider Interface ---

export interface ProviderRequest {
  model: string;
  messages: Message[];
  system?: string;
  temperature?: number;
  maxTokens?: number;
  responseFormat?: ResponseFormat;
  signal?: AbortSignal;
}

export interface ProviderResponse {
  content: string;
  model: string;
  usage?: {
    promptTokens: number;
    completionTokens: number;
    totalTokens: number;
  };
  costUsd?: number;
}

export interface AIProvider {
  name: ProviderName;
  call(request: ProviderRequest): Promise<ProviderResponse>;
}
