import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  propagateAttributes: vi.fn((_attrs: unknown, fn: () => unknown) => fn()),
  nodeSdkStart: vi.fn(),
  nodeSdkShutdown: vi.fn().mockResolvedValue(undefined),
  forceFlush: vi.fn().mockResolvedValue(undefined),
  processorParams: [] as unknown[],
}));

vi.mock('@langfuse/tracing', () => ({
  propagateAttributes: (...args: [unknown, () => unknown]) => mocks.propagateAttributes(...args),
}));

vi.mock('@opentelemetry/sdk-node', () => ({
  NodeSDK: class {
    start = mocks.nodeSdkStart;
    shutdown = mocks.nodeSdkShutdown;
  },
}));

vi.mock('@langfuse/otel', () => ({
  LangfuseSpanProcessor: class {
    forceFlush = mocks.forceFlush;
    constructor(params: unknown) {
      mocks.processorParams.push(params);
    }
  },
}));

const ENV_KEYS = ['LANGFUSE_PUBLIC_KEY', 'LANGFUSE_SECRET_KEY', 'LANGFUSE_TRACING_ENVIRONMENT'] as const;
let savedEnv: Record<string, string | undefined>;

beforeEach(() => {
  savedEnv = Object.fromEntries(ENV_KEYS.map((k) => [k, process.env[k]]));
  for (const key of ENV_KEYS) delete process.env[key];
  vi.resetModules();
  mocks.propagateAttributes.mockClear();
  mocks.nodeSdkStart.mockClear();
  mocks.nodeSdkShutdown.mockClear();
  mocks.forceFlush.mockClear();
  mocks.processorParams.length = 0;
});

afterEach(() => {
  for (const key of ENV_KEYS) {
    if (savedEnv[key] === undefined) delete process.env[key];
    else process.env[key] = savedEnv[key];
  }
});

function enableLangfuse() {
  process.env.LANGFUSE_PUBLIC_KEY = 'pk-test';
  process.env.LANGFUSE_SECRET_KEY = 'sk-test';
}

describe('tracing without Langfuse keys', () => {
  it('reports disabled and never starts the SDK', async () => {
    const otel = await import('../otel');
    expect(otel.tracingEnabled()).toBe(false);
    expect(await otel.startTracing()).toBe(false);
    expect(mocks.nodeSdkStart).not.toHaveBeenCalled();
  });

  it('builds telemetry settings that keep the AI SDK quiet but still name the span', async () => {
    const otel = await import('../otel');
    const settings = otel.telemetrySettings('chat.turn', {
      userId: 'u1',
      conversationId: 42,
      brainliftId: null,
      requestId: undefined,
    });
    expect(settings).toEqual({
      isEnabled: false,
      functionId: 'chat.turn',
      metadata: { userId: 'u1', conversationId: 42 },
      recordInputs: false,
      recordOutputs: false,
    });
  });

  it('runs the wrapped function directly without touching Langfuse', async () => {
    const otel = await import('../otel');
    const result = otel.withTraceAttributes({ userId: 'u1' }, () => 'ran');
    expect(result).toBe('ran');
    expect(mocks.propagateAttributes).not.toHaveBeenCalled();
  });

  it('shutdown is a safe no-op', async () => {
    const otel = await import('../otel');
    await expect(otel.shutdownTracing()).resolves.toBeUndefined();
    expect(mocks.forceFlush).not.toHaveBeenCalled();
  });
});

describe('tracing with Langfuse keys', () => {
  beforeEach(enableLangfuse);

  it('starts the NodeSDK once with the Langfuse span processor', async () => {
    const otel = await import('../otel');
    expect(await otel.startTracing()).toBe(true);
    expect(await otel.startTracing()).toBe(true);
    expect(mocks.nodeSdkStart).toHaveBeenCalledTimes(1);
    expect(mocks.processorParams).toHaveLength(1);
  });

  it('labels traces with the configured environment', async () => {
    process.env.LANGFUSE_TRACING_ENVIRONMENT = 'demo';
    const otel = await import('../otel');
    await otel.startTracing();
    expect(mocks.processorParams[0]).toEqual({ environment: 'demo' });
  });

  it('enables recording in telemetry settings', async () => {
    const otel = await import('../otel');
    const settings = otel.telemetrySettings('research-swarm.agent', { slotIdx: 2 });
    expect(settings).toMatchObject({
      isEnabled: true,
      functionId: 'research-swarm.agent',
      metadata: { slotIdx: 2 },
      recordInputs: true,
      recordOutputs: true,
    });
  });

  it('propagates trace attributes around the wrapped call', async () => {
    const otel = await import('../otel');
    const attrs = { userId: 'u1', sessionId: 'conv-42', tags: ['chat'] };
    const result = otel.withTraceAttributes(attrs, () => 'ran');
    expect(result).toBe('ran');
    expect(mocks.propagateAttributes).toHaveBeenCalledWith(attrs, expect.any(Function));
  });

  it('flushes and shuts down the SDK', async () => {
    const otel = await import('../otel');
    await otel.startTracing();
    await otel.shutdownTracing();
    expect(mocks.forceFlush).toHaveBeenCalledTimes(1);
    expect(mocks.nodeSdkShutdown).toHaveBeenCalledTimes(1);
    // A second start after shutdown is allowed.
    expect(await otel.startTracing()).toBe(true);
    expect(mocks.nodeSdkStart).toHaveBeenCalledTimes(2);
  });
});
