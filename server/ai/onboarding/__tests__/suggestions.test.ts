/**
 * Tests for 04-suggestion-steps FR1: onboarding suggestion generation module.
 *
 * The module builds kind-specific prompts and calls the unified AI client
 * (fast tier, temp 0.8, 10s timeout, per-kind caller). It parses raw JSON
 * (fence-stripped, bare-array or { suggestions: [] }) and resolves [] on ANY
 * failure so the wizard is never blocked.
 *
 * `callModel` is mocked per the server/ai/__tests__ convention.
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';

const { mockCallModel } = vi.hoisted(() => ({
  mockCallModel: vi.fn(),
}));

vi.mock('../../client', () => ({
  callModel: (...args: unknown[]) => mockCallModel(...args),
}));

import {
  generateTopicSuggestions,
  generateOnboardingSuggestions,
  splitTopicSuggestion,
} from '../suggestions';

/** Build a valid templated sentence for topic-suggestion fixtures. */
function templated(i: number): string {
  return `Topic ${i}, specifically focusing on aspect ${i}, in order to reach goal ${i}`;
}

/** Resolve the mock with a clean JSON-array string body. */
function resolveArray(items: string[]) {
  mockCallModel.mockResolvedValue({ content: JSON.stringify(items), model: 'anthropic/claude-haiku-4.5' });
}

/** The CallModelOptions the module passed to its single callModel call. */
function lastCallOptions(): {
  model: string;
  caller: string;
  temperature?: number;
  timeout?: number;
  system?: string;
  messages: { role: string; content: string }[];
} {
  return mockCallModel.mock.calls.at(-1)![0];
}

/** Concatenated user-message content of the last call (the prompt body). */
function lastPrompt(): string {
  return lastCallOptions()
    .messages.map((m) => m.content)
    .join('\n');
}

/** The prompt of the FIRST call (topic stage 1). */
function firstPrompt(): string {
  const opts = mockCallModel.mock.calls[0]![0] as { messages: { content: string }[] };
  return opts.messages.map((m) => m.content).join('\n');
}

const CTX = {
  topic: 'Marine Biology',
  inScope: ['whale migration', 'coral reefs'],
  outOfScope: ['freshwater fish'],
};

beforeEach(() => {
  vi.clearAllMocks();
});

// ─── Happy path: each kind returns a capped string array ─────────────────────

describe('FR1: count caps per kind', () => {
  it('topic suggestions cap at 8 and split into structured parts', async () => {
    resolveArray(Array.from({ length: 12 }, (_, i) => templated(i)));
    const out = await generateTopicSuggestions();
    expect(out).toHaveLength(8);
    expect(out[0]).toEqual({
      text: 'Topic 0, specifically focusing on aspect 0, in order to reach goal 0',
      topic: 'Topic 0',
      focus: 'aspect 0',
      why: 'reach goal 0',
    });
  });

  it('topic suggestions drop sentences that do not match the template', async () => {
    resolveArray([templated(1), 'just a bare topic', templated(2)]);
    const out = await generateTopicSuggestions();
    expect(out.map((s) => s.topic)).toEqual(['Topic 1', 'Topic 2']);
  });

  it('in-scope suggestions cap at 8', async () => {
    resolveArray(Array.from({ length: 12 }, (_, i) => `phrase ${i}`));
    const out = await generateOnboardingSuggestions('in-scope', CTX);
    expect(out).toHaveLength(8);
  });

  it('out-of-scope suggestions cap at 8', async () => {
    resolveArray(Array.from({ length: 12 }, (_, i) => `phrase ${i}`));
    const out = await generateOnboardingSuggestions('out-of-scope', CTX);
    expect(out).toHaveLength(8);
  });

  it('categories suggestions cap at 6', async () => {
    resolveArray(Array.from({ length: 12 }, (_, i) => `cat ${i}`));
    const out = await generateOnboardingSuggestions('categories', CTX);
    expect(out).toHaveLength(6);
  });

  it('returns the model items verbatim when under the cap', async () => {
    resolveArray(['Tide pools', 'Deep sea vents']);
    const out = await generateOnboardingSuggestions('in-scope', CTX);
    expect(out).toEqual(['Tide pools', 'Deep sea vents']);
  });
});

// ─── Prompt inputs ───────────────────────────────────────────────────────────

describe('FR1: prompt inputs per kind', () => {
  it('in-scope prompt contains the topic', async () => {
    resolveArray(['x']);
    await generateOnboardingSuggestions('in-scope', CTX);
    expect(lastPrompt()).toContain('Marine Biology');
  });

  it('out-of-scope prompt contains topic + in-scope items', async () => {
    resolveArray(['x']);
    await generateOnboardingSuggestions('out-of-scope', CTX);
    const prompt = lastPrompt();
    expect(prompt).toContain('Marine Biology');
    expect(prompt).toContain('whale migration');
    expect(prompt).toContain('coral reefs');
  });

  it('categories prompt contains topic + both scope arrays', async () => {
    resolveArray(['x']);
    await generateOnboardingSuggestions('categories', CTX);
    const prompt = lastPrompt();
    expect(prompt).toContain('Marine Biology');
    expect(prompt).toContain('whale migration');
    expect(prompt).toContain('freshwater fish');
  });

  it('lists exclude items as already-shown and asks for different ones', async () => {
    resolveArray(['x']);
    await generateOnboardingSuggestions('in-scope', CTX, ['plankton', 'tides']);
    const prompt = lastPrompt().toLowerCase();
    expect(prompt).toContain('plankton');
    expect(prompt).toContain('tides');
    expect(prompt).toContain('different');
  });

  it('topic stage 1 carries the exclude list and the rotating anchors', async () => {
    resolveArray(['x']);
    await generateTopicSuggestions(['Biology']);
    const stage1 = firstPrompt();
    expect(stage1.toLowerCase()).toContain('biology'); // exclude echoed
    expect(stage1).toContain('Real projects from students on this platform');
    expect(stage1).toContain('AlphaX');
  });

  it('topic stage 2 receives the stage-1 projects and the template', async () => {
    resolveArray(['a drone racing league for schools']);
    await generateTopicSuggestions();
    const stage2 = lastPrompt();
    expect(stage2).toContain('a drone racing league for schools');
    expect(stage2).toContain('specifically focusing on');
    expect(stage2).toContain('Keep the project as-is at the start');
  });

  it('topic: empty stage-1 projects resolve to [] without a second call', async () => {
    resolveArray([]);
    await expect(generateTopicSuggestions()).resolves.toEqual([]);
    expect(mockCallModel).toHaveBeenCalledTimes(1);
  });

  it('empty scope arrays still produce a well-formed prompt (no "undefined")', async () => {
    resolveArray(['x']);
    await generateOnboardingSuggestions('categories', { topic: 'Chess', inScope: [], outOfScope: [] });
    const prompt = lastPrompt();
    expect(prompt).toContain('Chess');
    expect(prompt).not.toMatch(/undefined/);
  });
});

// ─── Parsing: fenced / wrapper shapes ────────────────────────────────────────

describe('FR1: response parsing', () => {
  it('recovers a fenced ```json bare-array response', async () => {
    mockCallModel.mockResolvedValue({
      content: '```json\n' + JSON.stringify([templated(1)]) + '\n```',
      model: 'anthropic/claude-haiku-4.5',
    });
    const out = await generateTopicSuggestions();
    expect(out.map((s) => s.topic)).toEqual(['Topic 1']);
  });

  it('recovers a { suggestions: [...] } wrapper shape', async () => {
    mockCallModel.mockResolvedValue({
      content: JSON.stringify({ suggestions: ['one', 'two'] }),
      model: 'anthropic/claude-haiku-4.5',
    });
    const out = await generateOnboardingSuggestions('in-scope', CTX);
    expect(out).toEqual(['one', 'two']);
  });

  it('drops non-string and empty entries', async () => {
    mockCallModel.mockResolvedValue({
      content: JSON.stringify(['keep', '', 42, null, 'also']),
      model: 'anthropic/claude-haiku-4.5',
    });
    const out = await generateOnboardingSuggestions('out-of-scope', CTX);
    expect(out).toEqual(['keep', 'also']);
  });
});

// ─── Failure path: always [] ─────────────────────────────────────────────────

describe('FR1: failure resolves to [] (never rejects)', () => {
  it('callModel throwing → []', async () => {
    mockCallModel.mockRejectedValue(new Error('upstream 500'));
    await expect(generateOnboardingSuggestions('in-scope', CTX)).resolves.toEqual([]);
  });

  it('callModel timeout-style rejection → []', async () => {
    mockCallModel.mockRejectedValue(new Error('timeout after 10000ms'));
    await expect(generateTopicSuggestions()).resolves.toEqual([]);
  });

  it('unparseable (non-JSON) response → []', async () => {
    mockCallModel.mockResolvedValue({ content: 'sorry, I cannot do that', model: 'x' });
    await expect(generateOnboardingSuggestions('categories', CTX)).resolves.toEqual([]);
  });

  it('JSON object without an array → []', async () => {
    mockCallModel.mockResolvedValue({ content: JSON.stringify({ nope: true }), model: 'x' });
    await expect(generateTopicSuggestions()).resolves.toEqual([]);
  });
});

// ─── Call hygiene: caller, model tier, timeout ───────────────────────────────

describe('FR1: every call passes caller + fast tier + 10s timeout', () => {
  it('topic pipeline: two gemini calls with per-stage callers, temp 1.0', async () => {
    resolveArray(['x']);
    await generateTopicSuggestions();
    expect(mockCallModel).toHaveBeenCalledTimes(2);
    const stage1 = mockCallModel.mock.calls[0]![0] as Record<string, unknown>;
    const stage2 = mockCallModel.mock.calls[1]![0] as Record<string, unknown>;
    expect(stage1.caller).toBe('onboarding.topicSuggestions.projects');
    expect(stage2.caller).toBe('onboarding.topicSuggestions.extend');
    for (const opts of [stage1, stage2]) {
      expect(opts.model).toBe('google/gemini-2.5-flash-lite');
      expect(opts.timeout).toBe(10_000);
      // 1.0: cross-call chip diversity is the product goal (sim rounds 1-5).
      expect(opts.temperature).toBe(1.0);
    }
  });

  it('in-scope kind uses caller onboarding.inScopeSuggestions', async () => {
    resolveArray(['x']);
    await generateOnboardingSuggestions('in-scope', CTX);
    expect(lastCallOptions().caller).toBe('onboarding.inScopeSuggestions');
    expect(lastCallOptions().temperature).toBe(0.8);
  });

  it('out-of-scope kind uses caller onboarding.outOfScopeSuggestions', async () => {
    resolveArray(['x']);
    await generateOnboardingSuggestions('out-of-scope', CTX);
    expect(lastCallOptions().caller).toBe('onboarding.outOfScopeSuggestions');
  });

  it('categories kind uses caller onboarding.categoriesSuggestions', async () => {
    resolveArray(['x']);
    await generateOnboardingSuggestions('categories', CTX);
    expect(lastCallOptions().caller).toBe('onboarding.categoriesSuggestions');
  });
});

// ─── splitTopicSuggestion: deterministic template split ──────────────────────

describe('splitTopicSuggestion', () => {
  it('splits a real tuning-run sentence', () => {
    const s = splitTopicSuggestion(
      'Battery chemistry, specifically focusing on lithium-ion degradation, in order to build an electric skateboard that lasts',
    );
    expect(s).toEqual({
      text: 'Battery chemistry, specifically focusing on lithium-ion degradation, in order to build an electric skateboard that lasts',
      topic: 'Battery chemistry',
      focus: 'lithium-ion degradation',
      why: 'build an electric skateboard that lasts',
    });
  });

  it('tolerates a missing comma before "in order to"', () => {
    const s = splitTopicSuggestion('A, specifically focusing on B in order to C');
    expect(s).toEqual({ text: 'A, specifically focusing on B in order to C', topic: 'A', focus: 'B', why: 'C' });
  });

  it('is case-insensitive on the connectives', () => {
    expect(splitTopicSuggestion('A, Specifically Focusing On B, In Order To C')).not.toBeNull();
  });

  it('keeps commas inside the topic part', () => {
    const s = splitTopicSuggestion('Cooking, baking, and pastry, specifically focusing on lamination, in order to open a stall');
    expect(s?.topic).toBe('Cooking, baking, and pastry');
  });

  it('returns null when a connective is missing', () => {
    expect(splitTopicSuggestion('Rocket propulsion for beginners')).toBeNull();
    expect(splitTopicSuggestion('A, specifically focusing on B')).toBeNull();
    expect(splitTopicSuggestion('A in order to C')).toBeNull();
  });
});

// ─── Tolerant parsing + tone flag (prompt-review fixes, 2026-06-12) ──────────

describe('tolerant response parsing', () => {
  it('parses a JSON array wrapped in prose', async () => {
    mockCallModel.mockResolvedValue({
      content: 'Here are the suggestions:\n["Tide pools", "Deep sea vents"]\nHope these help!',
      model: 'anthropic/claude-haiku-4.5',
    });
    await expect(generateOnboardingSuggestions('in-scope', CTX)).resolves.toEqual([
      'Tide pools',
      'Deep sea vents',
    ]);
  });

  it('parses a { suggestions } wrapper buried in prose', async () => {
    mockCallModel.mockResolvedValue({
      content: 'Sure! {"suggestions": ["one", "two"]} — let me know.',
      model: 'anthropic/claude-haiku-4.5',
    });
    await expect(generateOnboardingSuggestions('categories', CTX)).resolves.toEqual(['one', 'two']);
  });

  it('still resolves [] for genuinely unparseable output', async () => {
    mockCallModel.mockResolvedValue({ content: 'no json here at all', model: 'm' });
    await expect(generateOnboardingSuggestions('in-scope', CTX)).resolves.toEqual([]);
  });
});

describe('grade-5 tone flag (userFacing)', () => {
  it('is ON for both topic pipeline stages', async () => {
    resolveArray([templated(1)]);
    await generateTopicSuggestions();
    expect(mockCallModel.mock.calls.length).toBeGreaterThanOrEqual(2);
    for (const call of mockCallModel.mock.calls) {
      expect((call[0] as { userFacing?: boolean }).userFacing).toBe(true);
    }
  });

  it('is OFF for the scoped kinds (tuned register, A/B 2026-06-12)', async () => {
    resolveArray(['x']);
    await generateOnboardingSuggestions('in-scope', CTX);
    expect((lastCallOptions() as { userFacing?: boolean }).userFacing).toBeUndefined();
  });
});
