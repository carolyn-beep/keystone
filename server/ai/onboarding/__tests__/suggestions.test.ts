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
} from '../suggestions';

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
  it('topic suggestions cap at 8', async () => {
    resolveArray(Array.from({ length: 12 }, (_, i) => `topic ${i}`));
    const out = await generateTopicSuggestions();
    expect(out).toHaveLength(8);
    expect(out.every((s) => typeof s === 'string')).toBe(true);
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

  it('topic prompt asks for varied topic ideas (creativity prompt)', async () => {
    resolveArray(['x']);
    await generateTopicSuggestions(['Biology']);
    const prompt = lastPrompt();
    expect(prompt.toLowerCase()).toContain('biology'); // exclude echoed
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
      content: '```json\n["alpha", "beta"]\n```',
      model: 'anthropic/claude-haiku-4.5',
    });
    const out = await generateTopicSuggestions();
    expect(out).toEqual(['alpha', 'beta']);
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
    const out = await generateTopicSuggestions();
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
  it('topic kind uses caller onboarding.topicSuggestions', async () => {
    resolveArray(['x']);
    await generateTopicSuggestions();
    const opts = lastCallOptions();
    expect(opts.caller).toBe('onboarding.topicSuggestions');
    expect(opts.model).toBe('anthropic/claude-haiku-4.5');
    expect(opts.timeout).toBe(10_000);
    expect(opts.temperature).toBe(0.8);
  });

  it('in-scope kind uses caller onboarding.inScopeSuggestions', async () => {
    resolveArray(['x']);
    await generateOnboardingSuggestions('in-scope', CTX);
    expect(lastCallOptions().caller).toBe('onboarding.inScopeSuggestions');
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
