/**
 * Tests for onboarding project-title generation (gemini-2.5-flash-lite,
 * fail-open to null). `callModel` is mocked per the server/ai/__tests__
 * convention.
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';

const { mockCallModel } = vi.hoisted(() => ({
  mockCallModel: vi.fn(),
}));

vi.mock('../../client', () => ({
  callModel: (...args: unknown[]) => mockCallModel(...args),
}));

import { composeTopicSentence, generateProjectTitle } from '../title';

function resolveContent(content: string) {
  mockCallModel.mockResolvedValue({ content, model: 'google/gemini-2.5-flash-lite' });
}

function lastCallOptions(): Record<string, unknown> {
  return mockCallModel.mock.calls.at(-1)![0];
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe('generateProjectTitle', () => {
  it('returns the trimmed title', async () => {
    resolveContent('  PawPrompt: AI Dog Trainer  ');
    await expect(generateProjectTitle({ topic: 'AI for dogs' })).resolves.toBe(
      'PawPrompt: AI Dog Trainer',
    );
  });

  it('strips wrapping quotes and keeps only the first line', async () => {
    resolveContent('"RowFuel AI"\nHere is why this title works...');
    await expect(generateProjectTitle({ topic: 'rowing nutrition' })).resolves.toBe('RowFuel AI');
  });

  it('passes all three fields into the prompt when present', async () => {
    resolveContent('A Title');
    await generateProjectTitle({ topic: 'soccer app', focus: 'scheduling', why: 'help my coach' });
    const opts = lastCallOptions() as { messages: { content: string }[] };
    const prompt = opts.messages.map((m) => m.content).join('\n');
    expect(prompt).toContain('Working on: soccer app');
    expect(prompt).toContain('Specifically focusing on: scheduling');
    expect(prompt).toContain('In order to: help my coach');
  });

  it('omits empty focus/why lines (no dangling labels)', async () => {
    resolveContent('A Title');
    await generateProjectTitle({ topic: 'soccer app', focus: '  ', why: undefined });
    const opts = lastCallOptions() as { messages: { content: string }[] };
    const prompt = opts.messages.map((m) => m.content).join('\n');
    expect(prompt).not.toContain('Specifically focusing on:');
    expect(prompt).not.toContain('In order to:');
  });

  it('uses gemini-2.5-flash-lite with the onboarding.projectTitle caller', async () => {
    resolveContent('A Title');
    await generateProjectTitle({ topic: 'anything' });
    const opts = lastCallOptions();
    expect(opts.model).toBe('google/gemini-2.5-flash-lite');
    expect(opts.caller).toBe('onboarding.projectTitle');
    expect(opts.timeout).toBe(10_000);
  });

  it('resolves null when the model errors', async () => {
    mockCallModel.mockRejectedValue(new Error('upstream 500'));
    await expect(generateProjectTitle({ topic: 'anything' })).resolves.toBeNull();
  });

  it('resolves null on empty output', async () => {
    resolveContent('   ');
    await expect(generateProjectTitle({ topic: 'anything' })).resolves.toBeNull();
  });

  it('resolves null on implausibly long output', async () => {
    resolveContent('x'.repeat(200));
    await expect(generateProjectTitle({ topic: 'anything' })).resolves.toBeNull();
  });
});

describe('composeTopicSentence', () => {
  it('joins all three parts with the canonical connectives', () => {
    expect(
      composeTopicSentence({ topic: 'a nutrition app', focus: 'race-day fueling', why: 'help my crew' }),
    ).toBe('a nutrition app, specifically focusing on race-day fueling, in order to help my crew');
  });

  it('omits empty / whitespace-only parts', () => {
    expect(composeTopicSentence({ topic: 'AI for dogs' })).toBe('AI for dogs');
    expect(composeTopicSentence({ topic: 'AI for dogs', focus: '  ', why: 'dogs are cool' })).toBe(
      'AI for dogs, in order to dogs are cool',
    );
  });

  it('round-trips through splitTopicSuggestion when all parts are present', () => {
    const sentence = composeTopicSentence({ topic: 'A', focus: 'B', why: 'C' });
    expect(sentence).toBe('A, specifically focusing on B, in order to C');
  });
});
