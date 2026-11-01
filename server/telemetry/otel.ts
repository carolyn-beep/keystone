/**
 * OpenTelemetry tracing for LLM calls, exported to Langfuse.
 *
 * The Vercel AI SDK emits a span tree for every streamText/generateText call
 * (one span per step, per tool call, per model request) when a call passes
 * `experimental_telemetry.isEnabled`. This module turns that on only when a
 * Langfuse project is configured, so the default deploy keeps today's
 * console logging and pays nothing extra.
 *
 * Enable by setting LANGFUSE_PUBLIC_KEY + LANGFUSE_SECRET_KEY (and
 * LANGFUSE_BASE_URL for a region other than EU cloud). Call `startTracing()`
 * once at boot before the first model call, and `shutdownTracing()` during
 * graceful shutdown so buffered spans are flushed.
 */

import { propagateAttributes } from '@langfuse/tracing';

type SdkHandle = { shutdown(): Promise<void> };
type SpanProcessorHandle = { forceFlush(): Promise<void> };

let sdk: SdkHandle | null = null;
let spanProcessor: SpanProcessorHandle | null = null;
let started = false;

export function tracingEnabled(): boolean {
  return Boolean(process.env.LANGFUSE_PUBLIC_KEY && process.env.LANGFUSE_SECRET_KEY);
}

/**
 * Registers a Node tracer provider with the Langfuse span processor.
 * No-op (returns false) when Langfuse keys are absent or tracing already runs.
 * Dependencies are loaded lazily so a deploy without tracing never touches them.
 *
 * Trace-only on purpose: `@opentelemetry/sdk-trace-node` instead of the full
 * `sdk-node` bundle, which drags in metrics and log exporters (gRPC, protobuf)
 * this app never uses and that carried most of its dependency advisories.
 */
export async function startTracing(): Promise<boolean> {
  if (started || !tracingEnabled()) {
    return started;
  }

  const [{ NodeTracerProvider }, { LangfuseSpanProcessor }] = await Promise.all([
    import('@opentelemetry/sdk-trace-node'),
    import('@langfuse/otel'),
  ]);

  const processor = new LangfuseSpanProcessor({
    environment: process.env.LANGFUSE_TRACING_ENVIRONMENT ?? process.env.NODE_ENV ?? 'development',
  });
  const provider = new NodeTracerProvider({ spanProcessors: [processor] });
  provider.register();

  spanProcessor = processor;
  sdk = provider;
  started = true;
  console.log('[Tracing] Langfuse span export enabled');
  return true;
}

/** Flushes buffered spans and stops the SDK. Safe to call when tracing is off. */
export async function shutdownTracing(): Promise<void> {
  if (!started) return;
  try {
    await spanProcessor?.forceFlush();
    await sdk?.shutdown();
  } catch (error) {
    console.error('[Tracing] Shutdown failed', error);
  } finally {
    started = false;
    sdk = null;
    spanProcessor = null;
  }
}

/** Metadata values the AI SDK accepts on a telemetry span. */
export type TelemetryMetadata = Record<string, string | number | boolean | null | undefined>;

/**
 * Builds the `experimental_telemetry` option for an AI SDK call.
 * `functionId` names the span tree in Langfuse ("chat.turn",
 * "research-swarm.agent"); metadata becomes searchable span attributes.
 * Prompts and completions are recorded only when tracing is on, so nothing
 * is captured in a deploy without Langfuse.
 */
export function telemetrySettings(functionId: string, metadata: TelemetryMetadata = {}) {
  const defined: Record<string, string | number | boolean> = {};
  for (const [key, value] of Object.entries(metadata)) {
    if (value !== undefined && value !== null) {
      defined[key] = value;
    }
  }
  const enabled = tracingEnabled();
  return {
    isEnabled: enabled,
    functionId,
    metadata: defined,
    recordInputs: enabled,
    recordOutputs: enabled,
  };
}

type TraceAttributes = Parameters<typeof propagateAttributes>[0];

/**
 * Runs `fn` so that every span it creates (including async continuations)
 * carries the given Langfuse trace attributes: userId, sessionId, tags, …
 * Falls through to a plain call when tracing is disabled.
 */
export function withTraceAttributes<T>(attributes: TraceAttributes, fn: () => T): T {
  if (!tracingEnabled()) {
    return fn();
  }
  return propagateAttributes(attributes, fn);
}
