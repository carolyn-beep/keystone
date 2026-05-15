import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  callModelWithFallback: vi.fn(),
  buildSwarmContext: vi.fn(),
}));

vi.mock('../../client', () => ({
  callModelWithFallback: (...args: unknown[]) => mocks.callModelWithFallback(...args),
}));

vi.mock('../context-builder', () => ({
  buildSwarmContext: (...args: unknown[]) => mocks.buildSwarmContext(...args),
}));

const contextFixture = {
  phase: 'research',
  brainlift: {
    id: 1,
    title: 'Carmack Brainlift',
    displayPurpose: 'Understand AI compilers',
    facts: [],
    experts: [],
    spovExcerpts: [],
  },
  secondBrain: {
    totalSources: 1,
    totalNotes: 1,
    categories: [],
    sources: [],
    notes: [],
  },
  followedExperts: [],
  existingUrls: [],
  renderedDigest: '## Second Brain\nSB-primary digest',
  digestCharCount: 32,
};

const validRunSpec = {
  agents: [
    { type: 'Substack', focus: 'Substack focus' },
    { type: 'AcademicPaper', focus: 'Academic focus' },
    { type: 'Twitter', focus: 'Twitter focus' },
    { type: 'Video', focus: 'Video focus' },
    { type: 'Podcast', focus: 'Podcast focus' },
  ],
};

describe('orchestrate', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    delete process.env.SWARM_VERBOSE_LOG;
    mocks.buildSwarmContext.mockResolvedValue(contextFixture);
  });

  it('uses Opus 4.7 once on the happy path', async () => {
    mocks.callModelWithFallback.mockResolvedValue({
      content: JSON.stringify(validRunSpec),
      model: 'anthropic/claude-opus-4.7',
      usage: { promptTokens: 10, completionTokens: 20, totalTokens: 30 },
      durationMs: 123,
      attempts: 1,
    });
    const { orchestrate } = await import('../orchestrator');

    const result = await orchestrate(1, {});

    expect(mocks.callModelWithFallback).toHaveBeenCalledOnce();
    expect(mocks.callModelWithFallback).toHaveBeenCalledWith(expect.objectContaining({
      models: ['anthropic/claude-opus-4.7', 'anthropic/claude-sonnet-4.6', 'qwen/qwen-plus'],
      caller: 'researchStreamV2.orchestrator',
      retries: 0,
    }));
    expect(result).toMatchObject({
      runSpec: validRunSpec,
      modelUsed: 'anthropic/claude-opus-4.7',
      usedDefault: false,
      usage: { inputTokens: 10, outputTokens: 20 },
    });
  });

  it('includes run request constraints in the system prompt', async () => {
    mocks.callModelWithFallback.mockResolvedValue({
      content: JSON.stringify(validRunSpec),
      model: 'anthropic/claude-opus-4.7',
      usage: { promptTokens: 1, completionTokens: 1, totalTokens: 2 },
      durationMs: 123,
      attempts: 1,
    });
    const { orchestrate } = await import('../orchestrator');

    await orchestrate(1, {
      topic: 'Carmack on AI compilers',
      preferredTypes: ['Podcast', 'Podcast', 'AcademicPaper'],
      slotOverrides: [{ type: 'Podcast', focus: 'Lex Fridman interviews' }],
      notes: 'post-2022 only',
    });

    const system = mocks.callModelWithFallback.mock.calls[0][0].system;
    expect(system).toContain('Slot 1: type MUST be Podcast; focus MUST include "Lex Fridman interviews"');
    expect(system).toContain('Preferred type distribution (soft preference): Podcast, Podcast, AcademicPaper');
    expect(system).toContain('Notes (verbatim): post-2022 only');
    expect(system).toContain('## Second Brain');
    expect(system).toContain('Each focus must be specialized to this exact project data');
    expect(system).toContain('Do not produce generic focuses');
    expect(system).toContain('Return only valid JSON');
  });

  it('logs orchestrator prompts, reasoning, tokens, and fan-out instructions when SWARM_VERBOSE_LOG is enabled', async () => {
    process.env.SWARM_VERBOSE_LOG = 'true';
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    mocks.callModelWithFallback.mockResolvedValue({
      content: JSON.stringify(validRunSpec),
      model: 'accounts/fireworks/models/minimax-m2p1',
      usage: { promptTokens: 11, completionTokens: 22, totalTokens: 33 },
      costUsd: 0.01,
      durationMs: 123,
      attempts: 2,
    });

    try {
      const { orchestrate } = await import('../orchestrator');
      await orchestrate(1, {});

      const output = logSpy.mock.calls.map((call) => String(call[0])).join('\n');
      expect(output).toContain('[Research Stream v2 verbose][ORCH] system prompt sent to orchestrator');
      expect(output).toContain('[Research Stream v2 verbose][ORCH] unified AI client JSON attempt complete');
      expect(output).toContain('accounts/fireworks/models/minimax-m2p1');
      expect(output).toContain('inputTokens');
      expect(output).toContain('fan-out instructions produced by orchestrator');
    } finally {
      logSpy.mockRestore();
      delete process.env.SWARM_VERBOSE_LOG;
    }
  });

  it('passes schema validation into the unified client', async () => {
    mocks.callModelWithFallback.mockResolvedValue({
      content: JSON.stringify(validRunSpec),
      model: 'anthropic/claude-sonnet-4.6',
      usage: { promptTokens: 2, completionTokens: 3, totalTokens: 5 },
      durationMs: 123,
      attempts: 2,
    });
    const { orchestrate } = await import('../orchestrator');

    const result = await orchestrate(1, {});
    const validate = mocks.callModelWithFallback.mock.calls[0][0].validate;

    expect(result.modelUsed).toBe('anthropic/claude-sonnet-4.6');
    expect(() => validate(JSON.stringify({ agents: validRunSpec.agents.slice(0, 4) }))).toThrow();
    expect(() => validate(JSON.stringify(validRunSpec))).not.toThrow();
  });

  it('returns deterministic default when all models fail', async () => {
    mocks.callModelWithFallback.mockRejectedValue(new Error('network'));
    const { orchestrate } = await import('../orchestrator');

    const result = await orchestrate(1, { topic: 'Default focus' });

    expect(result.usedDefault).toBe(true);
    expect(result.runSpec.agents).toHaveLength(5);
    expect(result.runSpec.agents.map((agent) => agent.focus)).toEqual(Array(5).fill('Default focus'));
  });
});
