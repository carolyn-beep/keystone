/**
 * DOK1 evidence fetching.
 *
 * Validates deterministic web-search fallback behavior. The query builder is
 * intentionally isolated so it can be swapped later if search quality is weak.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const {
  mockSearchWeb,
  mockFetchReadableUrl,
  mockCallModelWithFallback,
} = vi.hoisted(() => ({
  mockSearchWeb: vi.fn(),
  mockFetchReadableUrl: vi.fn(),
  mockCallModelWithFallback: vi.fn(),
}));

vi.mock('../../services/web-research', () => ({
  searchWeb: (...args: unknown[]) => mockSearchWeb(...args),
  fetchReadableUrlDetailed: (...args: unknown[]) => mockFetchReadableUrl(...args),
}));

vi.mock('../client', () => ({
  callModelWithFallback: (...args: unknown[]) => mockCallModelWithFallback(...args),
}));

import {
  buildDeterministicFallbackEvidenceQuery,
  fetchEvidenceForFact,
  generateFallbackEvidenceQuery,
} from '../evidenceFetcher';

const originalFetch = globalThis.fetch;

beforeEach(() => {
  vi.clearAllMocks();
  vi.spyOn(console, 'log').mockImplementation(() => {});
  vi.spyOn(console, 'error').mockImplementation(() => {});
  globalThis.fetch = vi.fn();
});

afterEach(() => {
  globalThis.fetch = originalFetch;
  vi.restoreAllMocks();
});

describe('buildDeterministicFallbackEvidenceQuery', () => {
  it('uses the claim when source context is missing', () => {
    expect(buildDeterministicFallbackEvidenceQuery('Students learn better with spaced practice', '')).toBe(
      '"Students learn better with spaced practice" evidence fact check'
    );
  });

  it('includes source context without constraining search to the original URL host', () => {
    expect(buildDeterministicFallbackEvidenceQuery(
      'Retrieval practice improves retention',
      'Smith study (https://journals.example.edu/article?id=1)'
    )).toBe(
      '"Retrieval practice improves retention" "Smith study" evidence fact check'
    );
  });

  it('does not poison fallback search with a broken source URL domain', () => {
    const query = buildDeterministicFallbackEvidenceQuery(
      'As of the article writing date, the official MCP site listed 58 MCP clients but only 20 support Prompts',
      'Laurent Kubaski MCP Prompts Explained https://www.totallyfakewebsite123456.com/nope'
    );

    expect(query).toBe(
      '"As of the article writing date, the official MCP site listed 58 MCP clients but only 20 support Prompts" "Laurent Kubaski MCP Prompts Explained" evidence fact check'
    );
    expect(query).not.toContain('totallyfakewebsite123456.com');
    expect(query).not.toContain('site:');
  });

  it('normalizes whitespace and truncates long inputs deterministically', () => {
    const query = buildDeterministicFallbackEvidenceQuery(
      `  ${'claim '.repeat(80)}  `,
      `  ${'source '.repeat(80)}  `
    );

    expect(query.length).toBeLessThanOrEqual(280);
    expect(query).not.toContain('  ');
    expect(query).toContain('evidence fact check');
  });
});

describe('generateFallbackEvidenceQuery', () => {
  it('uses qwen-plus with gemini-flash fallback to generate a clean search query', async () => {
    mockCallModelWithFallback.mockResolvedValue({
      content: JSON.stringify({
        query: 'Laurent Kubaski MCP Prompts explained 58 MCP clients 20 support Prompts',
      }),
      model: 'qwen/qwen-plus',
      durationMs: 120,
      attempts: 1,
    });

    const query = await generateFallbackEvidenceQuery(
      'As of the article writing date, the official MCP site listed 58 MCP clients but only 20 support Prompts',
      'Laurent Kubaski MCP Prompts Explained https://www.totallyfakewebsite123456.com/nope'
    );

    expect(mockCallModelWithFallback).toHaveBeenCalledWith(expect.objectContaining({
      models: ['qwen/qwen-plus', 'google/gemini-2.0-flash-001'],
      temperature: 0,
      maxTokens: 120,
      timeout: 12_000,
      caller: 'evidenceFetcher.queryGeneration',
      responseFormat: expect.objectContaining({ type: 'json_schema' }),
    }));
    expect(query).toBe('Laurent Kubaski MCP Prompts explained 58 MCP clients 20 support Prompts');
    expect(query).not.toContain('totallyfakewebsite123456.com');
    expect(query).not.toContain('site:');
  });

  it('falls back to deterministic query when query generation fails', async () => {
    mockCallModelWithFallback.mockRejectedValue(new Error('query model failed'));

    const query = await generateFallbackEvidenceQuery(
      'Students learn better with spaced practice',
      ''
    );

    expect(query).toBe('"Students learn better with spaced practice" evidence fact check');
  });
});

describe('fetchEvidenceForFact', () => {
  it('returns cached transcript as direct transcript evidence and does not search', async () => {
    const result = await fetchEvidenceForFact(
      'The episode discusses spaced practice',
      'https://youtu.be/dQw4w9WgXcQ',
      undefined,
      'Transcript evidence'
    );

    expect(result.mode).toBe('cached_transcript');
    expect(result.content).toBe('Transcript evidence');
    expect(result.url).toBe('https://youtu.be/dQw4w9WgXcQ');
    expect(mockCallModelWithFallback).not.toHaveBeenCalled();
    expect(mockSearchWeb).not.toHaveBeenCalled();
    expect(mockFetchReadableUrl).not.toHaveBeenCalled();
  });

  it('returns direct source evidence when the submitted URL is readable', async () => {
    vi.mocked(globalThis.fetch).mockResolvedValue({
      ok: true,
      status: 200,
      headers: new Headers({ 'content-type': 'text/html' }),
      text: async () => '<html><body><main>Research content about education that is long enough to pass the direct evidence threshold and support grading.</main></body></html>',
    } as Response);

    const result = await fetchEvidenceForFact(
      'Test fact',
      'https://example.com/paper'
    );

    expect(result.mode).toBe('direct_source');
    expect(result.originalSourceUrl).toBe('https://example.com/paper');
    expect(result.content).toContain('Research content about education');
    expect(mockCallModelWithFallback).not.toHaveBeenCalled();
    expect(mockSearchWeb).not.toHaveBeenCalled();
  });

  it('uses fallback search evidence when direct URL fetch fails', async () => {
    const logSpy = vi.mocked(console.log);
    mockCallModelWithFallback.mockResolvedValue({
      content: JSON.stringify({ query: 'retrieval practice retention alternate evidence' }),
      model: 'qwen/qwen-plus',
      durationMs: 100,
      attempts: 1,
    });
    vi.mocked(globalThis.fetch).mockResolvedValue({
      ok: false,
      status: 404,
      statusText: 'Not Found',
      headers: new Headers(),
    } as Response);
    mockSearchWeb.mockResolvedValue([
      { title: 'Alternate Evidence', url: 'https://alt.example/article', publishedDate: null, author: null, score: 0.9, text: 'snippet' },
    ]);
    mockFetchReadableUrl.mockResolvedValue({
      source: {
        title: 'Alternate Evidence',
        url: 'https://alt.example/article',
        siteName: 'Alt',
        content: 'Readable alternate source evidence for the submitted claim.',
        fetchStatus: 'fetched',
      },
      normalizedUrl: 'https://alt.example/article',
      title: 'Alternate Evidence',
      contentChars: 59,
    });

    const result = await fetchEvidenceForFact(
      'Retrieval practice improves retention',
      'https://blocked.example/source'
    );

    expect(result.mode).toBe('fallback_search');
    expect(result.url).toBe('https://alt.example/article');
    expect(result.originalSourceUrl).toBe('https://blocked.example/source');
    expect(result.error).toContain('HTTP 404');
    expect(result.content).toContain('Fallback web search evidence');
    expect(result.content).toContain('Alternate Evidence');
    expect(result.fallbackSearch?.query).toBe('retrieval practice retention alternate evidence');
    expect(mockSearchWeb).toHaveBeenCalledWith('retrieval practice retention alternate evidence', expect.objectContaining({ numResults: 5 }));
    expect(mockFetchReadableUrl).toHaveBeenCalledWith('https://alt.example/article', expect.any(Number));

    const logs = logSpy.mock.calls.map((call) => String(call[0])).join('\n');
    expect(logs).toContain('FALLBACK_SEARCH_START reason="HTTP 404: Not Found" originalSourceUrl="https://blocked.example/source"');
    expect(logs).toContain('Fallback search returned 1 result(s)');
    expect(logs).toContain('"title":"Alternate Evidence"');
    expect(logs).toContain('"url":"https://alt.example/article"');
    expect(logs).toContain('Fallback readable sources 1/1');
    expect(logs).toContain('"contentChars":59');
    expect(logs).not.toContain('Readable alternate source evidence for the submitted claim.');
  });

  it('logs skipped fallback sources with metadata but not source content', async () => {
    const logSpy = vi.mocked(console.log);
    mockCallModelWithFallback.mockResolvedValue({
      content: JSON.stringify({ query: 'blocked page alternate evidence' }),
      model: 'qwen/qwen-plus',
      durationMs: 100,
      attempts: 1,
    });
    vi.mocked(globalThis.fetch).mockResolvedValue({
      ok: false,
      status: 403,
      statusText: 'Forbidden',
      headers: new Headers(),
    } as Response);
    mockSearchWeb.mockResolvedValue([
      { title: 'Just a moment...', url: 'https://blocked.example/cloudflare', publishedDate: null, author: null, score: null, text: null },
      { title: 'Clean Evidence', url: 'https://clean.example/article', publishedDate: null, author: null, score: null, text: null },
    ]);
    mockFetchReadableUrl
      .mockResolvedValueOnce({
        source: null,
        skippedReason: 'junk_title',
        normalizedUrl: 'https://blocked.example/cloudflare',
        title: 'Just a moment...',
        contentChars: 461,
      })
      .mockResolvedValueOnce({
        source: {
          title: 'Clean Evidence',
          url: 'https://clean.example/article',
          siteName: null,
          content: 'Clean accessible evidence.'.repeat(50),
          fetchStatus: 'fetched',
        },
        normalizedUrl: 'https://clean.example/article',
        title: 'Clean Evidence',
        contentChars: 1_300,
      });

    const result = await fetchEvidenceForFact(
      'Some fact',
      'https://blocked.example/source'
    );

    expect(result.mode).toBe('fallback_search');
    expect(result.fallbackSearch?.sources).toHaveLength(1);

    const logs = logSpy.mock.calls.map((call) => String(call[0])).join('\n');
    expect(logs).toContain('Fallback source skipped reason="junk_title"');
    expect(logs).toContain('title="Just a moment..."');
    expect(logs).toContain('contentChars=461');
    expect(logs).not.toContain('Clean accessible evidence.');
  });

  it('searches from claim and source context when no source URL exists', async () => {
    mockCallModelWithFallback.mockResolvedValue({
      content: JSON.stringify({ query: 'claim without URL Named Research Report evidence' }),
      model: 'qwen/qwen-plus',
      durationMs: 100,
      attempts: 1,
    });
    mockSearchWeb.mockResolvedValue([
      { title: 'Named Source Result', url: 'https://named.example/article', publishedDate: null, author: null, score: null, text: null },
    ]);
    mockFetchReadableUrl.mockResolvedValue({
      source: {
        title: 'Named Source Result',
        url: 'https://named.example/article',
        siteName: null,
        content: 'Readable named-source evidence.',
        fetchStatus: 'fetched',
      },
      normalizedUrl: 'https://named.example/article',
      title: 'Named Source Result',
      contentChars: 31,
    });

    const result = await fetchEvidenceForFact(
      'A claim without a URL',
      'Named Research Report'
    );

    expect(result.mode).toBe('fallback_search');
    expect(mockSearchWeb).toHaveBeenCalledWith(
      'claim without URL Named Research Report evidence',
      expect.any(Object)
    );
  });

  it('returns no evidence when fallback search cannot fetch readable sources', async () => {
    mockCallModelWithFallback.mockResolvedValue({
      content: JSON.stringify({ query: 'some fact fallback evidence' }),
      model: 'qwen/qwen-plus',
      durationMs: 100,
      attempts: 1,
    });
    vi.mocked(globalThis.fetch).mockResolvedValue({
      ok: false,
      status: 403,
      statusText: 'Forbidden',
      headers: new Headers(),
    } as Response);
    mockSearchWeb.mockResolvedValue([
      { title: 'Blocked Alt', url: 'https://alt.example/blocked', publishedDate: null, author: null, score: null, text: null },
    ]);
    mockFetchReadableUrl.mockResolvedValue({ source: null, skippedReason: 'fetch_failed', normalizedUrl: 'https://alt.example/blocked' });

    const result = await fetchEvidenceForFact(
      'Some fact',
      'https://blocked.example/source'
    );

    expect(result.mode).toBe('none');
    expect(result.content).toBeNull();
    expect(result.error).toContain('No accessible fallback web evidence found');
  });
});
