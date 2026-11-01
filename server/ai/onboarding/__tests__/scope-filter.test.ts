/**
 * Tests for 05-starter-pack FR2: `filterOutOfScopeItems`.
 *
 * The filter asks ONE fast-tier `callModel` (haiku, temp 0, 20s timeout, the
 * `onboarding.scopeFilter` caller) which candidate item ids clearly fall out of
 * scope, with "None" baked in as an explicitly legal answer. It is fail-open:
 * empty inputs skip the model entirely, and any model error / timeout / garbage
 * resolves `[]` (never discards on failure, never rejects). The unified AI
 * client (`callModel`) is mocked — no LLM.
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../client', () => ({
  callModel: vi.fn(),
}));

import { filterOutOfScopeItems } from '../scope-filter';
import { callModel } from '../../client';

const mockCallModel = vi.mocked(callModel);

function item(id: number, topic = `Topic ${id}`) {
  return { id, topic, facts: `Facts ${id}`, url: `https://example.com/${id}` };
}

function modelResult(content: string) {
  return { content, model: 'anthropic/claude-haiku-4.5' };
}

const ITEMS = [item(1), item(2), item(3)];
const OUT_OF_SCOPE = ['celebrity gossip', 'sports scores'];

beforeEach(() => {
  vi.clearAllMocks();
});

describe('FR2: filterOutOfScopeItems happy path', () => {
  it('returns exactly the candidate ids the model names', async () => {
    mockCallModel.mockResolvedValue(modelResult('[1, 3]'));

    const result = await filterOutOfScopeItems(ITEMS, OUT_OF_SCOPE);

    expect(result.sort()).toEqual([1, 3]);
    expect(mockCallModel).toHaveBeenCalledTimes(1);
  });

  it('returns [] on a "None" answer (the legal-answer path)', async () => {
    mockCallModel.mockResolvedValue(modelResult('None'));
    expect(await filterOutOfScopeItems(ITEMS, OUT_OF_SCOPE)).toEqual([]);
  });

  it('returns [] on an empty-array answer', async () => {
    mockCallModel.mockResolvedValue(modelResult('[]'));
    expect(await filterOutOfScopeItems(ITEMS, OUT_OF_SCOPE)).toEqual([]);
  });

  it('frames "None" as a valid answer and lists the out-of-scope topics + item ids in the prompt', async () => {
    mockCallModel.mockResolvedValue(modelResult('[]'));
    await filterOutOfScopeItems(ITEMS, OUT_OF_SCOPE);

    const arg = mockCallModel.mock.calls[0][0];
    const prompt = arg.messages.map((m) => (typeof m.content === 'string' ? m.content : '')).join('\n');
    const haystack = `${arg.system ?? ''}\n${prompt}`;
    expect(haystack).toMatch(/none/i);
    expect(haystack).toContain('celebrity gossip');
    expect(haystack).toContain('sports scores');
    // Item ids must be present so the model can reference them.
    expect(haystack).toContain('1');
    expect(haystack).toContain('2');
    expect(haystack).toContain('3');
  });
});

describe('FR2: skip-on-empty (no model call)', () => {
  it('returns [] without calling the model when items is empty', async () => {
    expect(await filterOutOfScopeItems([], OUT_OF_SCOPE)).toEqual([]);
    expect(mockCallModel).not.toHaveBeenCalled();
  });

  it('returns [] without calling the model when outOfScope is empty', async () => {
    expect(await filterOutOfScopeItems(ITEMS, [])).toEqual([]);
    expect(mockCallModel).not.toHaveBeenCalled();
  });
});

describe('FR2: parsing + candidate-set intersection', () => {
  it('drops ids outside the candidate set', async () => {
    mockCallModel.mockResolvedValue(modelResult('[2, 99, 1000]'));
    expect(await filterOutOfScopeItems(ITEMS, OUT_OF_SCOPE)).toEqual([2]);
  });

  it('parses a fenced ```json bare array', async () => {
    mockCallModel.mockResolvedValue(modelResult('```json\n[2]\n```'));
    expect(await filterOutOfScopeItems(ITEMS, OUT_OF_SCOPE)).toEqual([2]);
  });

  it('parses a { "discard": [...] } wrapper', async () => {
    mockCallModel.mockResolvedValue(modelResult('{"discard": [1, 2]}'));
    expect((await filterOutOfScopeItems(ITEMS, OUT_OF_SCOPE)).sort()).toEqual([1, 2]);
  });
});

describe('FR2: fail-open', () => {
  it('resolves [] (never rejects) when the model throws', async () => {
    mockCallModel.mockRejectedValue(new Error('model exploded'));
    await expect(filterOutOfScopeItems(ITEMS, OUT_OF_SCOPE)).resolves.toEqual([]);
  });

  it('resolves [] on unparseable garbage', async () => {
    mockCallModel.mockResolvedValue(modelResult('I think maybe item two, hard to say.'));
    await expect(filterOutOfScopeItems(ITEMS, OUT_OF_SCOPE)).resolves.toEqual([]);
  });
});

describe('FR2: call configuration', () => {
  it('uses the onboarding.scopeFilter caller, temperature 0, the fast haiku tier, and a 20s timeout', async () => {
    mockCallModel.mockResolvedValue(modelResult('[]'));
    await filterOutOfScopeItems(ITEMS, OUT_OF_SCOPE);

    expect(mockCallModel).toHaveBeenCalledWith(
      expect.objectContaining({
        caller: 'onboarding.scopeFilter',
        temperature: 0,
        model: 'anthropic/claude-haiku-4.5',
        timeout: 20_000,
      }),
    );
  });
});
