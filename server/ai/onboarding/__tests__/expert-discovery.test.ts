/**
 * Tests for 06-expert-discovery FR1: `discoverExperts` pipeline.
 *
 * The pipeline runs 2-3 `searchWeb` queries (Promise.allSettled), feeds the
 * concatenated results into ONE `callModel` extraction (haiku, temp 0, the
 * `onboarding.expertDiscovery` caller, 30s timeout), then grounds/dedupes/caps
 * the candidates in code. It must NEVER throw: search or model failure → [].
 *
 * Both Exa (`searchWeb`) and the unified AI client (`callModel`) are mocked —
 * no network, no LLM.
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../../services/web-research', () => ({
  searchWeb: vi.fn(),
}));

vi.mock('../../client', () => ({
  callModel: vi.fn(),
}));

import { discoverExperts } from '../expert-discovery';
import { searchWeb } from '../../../services/web-research';
import { callModel } from '../../client';
import type { WebSearchResult } from '../../../services/web-research';

const mockSearchWeb = vi.mocked(searchWeb);
const mockCallModel = vi.mocked(callModel);

// --- Test Helpers ---

function makeResult(overrides: Partial<WebSearchResult> = {}): WebSearchResult {
  return {
    id: 'r-1',
    title: 'A profile of a researcher',
    url: 'https://example.com/profile-1',
    publishedDate: null,
    author: null,
    score: 0.9,
    text: 'Some snippet text about the expert and their work.',
    ...overrides,
  };
}

function modelResult(content: string) {
  return { content, model: 'anthropic/claude-haiku-4.5' };
}

const CTX = {
  topic: 'Marine Biology',
  inScope: ['coral reefs', 'whales'],
  categories: ['Ecology', 'Conservation'],
};

beforeEach(() => {
  vi.clearAllMocks();
});

describe('FR1: discoverExperts happy path', () => {
  it('returns grounded candidates, each with ≥1 evidence URL drawn from the search set', async () => {
    mockSearchWeb.mockResolvedValue([
      makeResult({ url: 'https://example.com/jane', title: 'Dr. Jane Roe' }),
      makeResult({ url: 'https://example.com/john', title: 'Prof. John Doe' }),
    ]);
    mockCallModel.mockResolvedValue(
      modelResult(
        JSON.stringify({
          candidates: [
            {
              name: 'Dr. Jane Roe',
              who: 'Marine ecologist',
              why: 'Leading coral reef researcher',
              focus: 'Coral reefs',
              where: 'https://example.com/jane',
              evidenceUrls: ['https://example.com/jane'],
            },
            {
              name: 'Prof. John Doe',
              who: 'Cetacean biologist',
              why: 'Studies whale migration',
              focus: null,
              where: '@johndoe',
              evidenceUrls: ['https://example.com/john'],
            },
          ],
        }),
      ),
    );

    const candidates = await discoverExperts(CTX);

    expect(candidates).toHaveLength(2);
    expect(candidates[0]).toEqual({
      name: 'Dr. Jane Roe',
      who: 'Marine ecologist',
      why: 'Leading coral reef researcher',
      focus: 'Coral reefs',
      where: 'https://example.com/jane',
      evidenceUrls: ['https://example.com/jane'],
    });
    // every evidence URL is from the actual search result set
    const searchUrls = new Set(['https://example.com/jane', 'https://example.com/john']);
    for (const c of candidates) {
      expect(c.evidenceUrls.length).toBeGreaterThanOrEqual(1);
      for (const u of c.evidenceUrls) expect(searchUrls.has(u)).toBe(true);
    }
  });

  it('caps the result at 5 candidates', async () => {
    mockSearchWeb.mockResolvedValue(
      Array.from({ length: 8 }, (_, i) => makeResult({ url: `https://example.com/e${i}` })),
    );
    mockCallModel.mockResolvedValue(
      modelResult(
        JSON.stringify({
          candidates: Array.from({ length: 8 }, (_, i) => ({
            name: `Expert ${i}`,
            who: 'Who',
            why: 'Why',
            focus: null,
            where: `https://example.com/e${i}`,
            evidenceUrls: [`https://example.com/e${i}`],
          })),
        }),
      ),
    );

    const candidates = await discoverExperts(CTX);
    expect(candidates).toHaveLength(5);
  });

  it('invokes callModel with haiku, temperature 0, the onboarding caller, and a 30s timeout', async () => {
    mockSearchWeb.mockResolvedValue([makeResult()]);
    mockCallModel.mockResolvedValue(modelResult(JSON.stringify({ candidates: [] })));

    await discoverExperts(CTX);

    expect(mockCallModel).toHaveBeenCalledTimes(1);
    const opts = mockCallModel.mock.calls[0][0];
    expect(opts.model).toBe('anthropic/claude-haiku-4.5');
    expect(opts.temperature).toBe(0);
    expect(opts.caller).toBe('onboarding.expertDiscovery');
    expect(opts.timeout).toBe(30_000);
    expect(opts.retries ?? 0).toBe(0);
  });

  it('runs multiple search queries and grounds against the union of all results', async () => {
    // Each query returns a different URL set; a candidate grounded in any of
    // them must survive.
    mockSearchWeb
      .mockResolvedValueOnce([makeResult({ url: 'https://a.com/x' })])
      .mockResolvedValueOnce([makeResult({ url: 'https://b.com/y' })])
      .mockResolvedValue([makeResult({ url: 'https://c.com/z' })]);
    mockCallModel.mockResolvedValue(
      modelResult(
        JSON.stringify({
          candidates: [
            { name: 'B Person', who: 'w', why: 'y', focus: null, where: 'b', evidenceUrls: ['https://b.com/y'] },
          ],
        }),
      ),
    );

    const candidates = await discoverExperts(CTX);
    expect(mockSearchWeb.mock.calls.length).toBeGreaterThanOrEqual(2);
    expect(candidates).toHaveLength(1);
    expect(candidates[0].name).toBe('B Person');
  });
});

describe('FR1: discoverExperts grounding enforcement', () => {
  it('drops a candidate whose evidence URLs are all outside the search set', async () => {
    mockSearchWeb.mockResolvedValue([makeResult({ url: 'https://example.com/real' })]);
    mockCallModel.mockResolvedValue(
      modelResult(
        JSON.stringify({
          candidates: [
            { name: 'Real', who: 'w', why: 'y', focus: null, where: 'r', evidenceUrls: ['https://example.com/real'] },
            // hallucinated: cites a URL that was never in any search result
            { name: 'Fabricated', who: 'w', why: 'y', focus: null, where: 'f', evidenceUrls: ['https://hallucinated.com/x'] },
          ],
        }),
      ),
    );

    const candidates = await discoverExperts(CTX);
    expect(candidates.map((c) => c.name)).toEqual(['Real']);
  });

  it('strips non-intersecting URLs from a partially-grounded candidate', async () => {
    mockSearchWeb.mockResolvedValue([makeResult({ url: 'https://example.com/real' })]);
    mockCallModel.mockResolvedValue(
      modelResult(
        JSON.stringify({
          candidates: [
            {
              name: 'Mixed',
              who: 'w',
              why: 'y',
              focus: null,
              where: 'm',
              evidenceUrls: ['https://example.com/real', 'https://hallucinated.com/x'],
            },
          ],
        }),
      ),
    );

    const candidates = await discoverExperts(CTX);
    expect(candidates).toHaveLength(1);
    expect(candidates[0].evidenceUrls).toEqual(['https://example.com/real']);
  });

  it('drops candidates with no evidence URLs at all', async () => {
    mockSearchWeb.mockResolvedValue([makeResult({ url: 'https://example.com/real' })]);
    mockCallModel.mockResolvedValue(
      modelResult(
        JSON.stringify({
          candidates: [
            { name: 'NoEvidence', who: 'w', why: 'y', focus: null, where: 'n', evidenceUrls: [] },
          ],
        }),
      ),
    );

    const candidates = await discoverExperts(CTX);
    expect(candidates).toEqual([]);
  });
});

describe('FR1: discoverExperts dedupe', () => {
  it('dedupes candidates with the same name in different casing', async () => {
    mockSearchWeb.mockResolvedValue([
      makeResult({ url: 'https://example.com/1' }),
      makeResult({ url: 'https://example.com/2' }),
    ]);
    mockCallModel.mockResolvedValue(
      modelResult(
        JSON.stringify({
          candidates: [
            { name: 'Jane Roe', who: 'w', why: 'y', focus: null, where: 'j', evidenceUrls: ['https://example.com/1'] },
            { name: 'JANE ROE', who: 'w2', why: 'y2', focus: null, where: 'j2', evidenceUrls: ['https://example.com/2'] },
          ],
        }),
      ),
    );

    const candidates = await discoverExperts(CTX);
    expect(candidates).toHaveLength(1);
    expect(candidates[0].name).toBe('Jane Roe');
  });
});

describe('FR1: discoverExperts partial / total search failure', () => {
  it('tolerates one search rejection and extracts from surviving results', async () => {
    mockSearchWeb
      .mockResolvedValueOnce([makeResult({ url: 'https://ok.com/survivor' })])
      .mockRejectedValueOnce(new Error('Exa 500'))
      .mockResolvedValue([]);
    mockCallModel.mockResolvedValue(
      modelResult(
        JSON.stringify({
          candidates: [
            { name: 'Survivor', who: 'w', why: 'y', focus: null, where: 's', evidenceUrls: ['https://ok.com/survivor'] },
          ],
        }),
      ),
    );

    const candidates = await discoverExperts(CTX);
    expect(mockCallModel).toHaveBeenCalledTimes(1);
    expect(candidates.map((c) => c.name)).toEqual(['Survivor']);
  });

  it('returns [] without throwing when every search rejects (e.g. missing EXA_API_KEY) and never calls the model', async () => {
    mockSearchWeb.mockRejectedValue(new Error('EXA_API_KEY is not set'));

    await expect(discoverExperts(CTX)).resolves.toEqual([]);
    expect(mockCallModel).not.toHaveBeenCalled();
  });

  it('returns [] when all searches succeed but yield zero results (no model call)', async () => {
    mockSearchWeb.mockResolvedValue([]);

    await expect(discoverExperts(CTX)).resolves.toEqual([]);
    expect(mockCallModel).not.toHaveBeenCalled();
  });
});

describe('FR1: discoverExperts model failure', () => {
  it('returns [] without throwing when callModel rejects', async () => {
    mockSearchWeb.mockResolvedValue([makeResult()]);
    mockCallModel.mockRejectedValue(new Error('model timeout'));

    await expect(discoverExperts(CTX)).resolves.toEqual([]);
  });

  it('returns [] when the model returns non-JSON garbage', async () => {
    mockSearchWeb.mockResolvedValue([makeResult()]);
    mockCallModel.mockResolvedValue(modelResult('not json at all {{{'));

    await expect(discoverExperts(CTX)).resolves.toEqual([]);
  });

  it('returns [] when the model returns JSON without a candidates array', async () => {
    mockSearchWeb.mockResolvedValue([makeResult()]);
    mockCallModel.mockResolvedValue(modelResult(JSON.stringify({ something: 'else' })));

    await expect(discoverExperts(CTX)).resolves.toEqual([]);
  });
});
