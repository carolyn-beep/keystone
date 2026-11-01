import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const { mockExtractContent } = vi.hoisted(() => ({
  mockExtractContent: vi.fn(),
}));

vi.mock('../content-extractor', () => ({
  extractContent: (...args: unknown[]) => mockExtractContent(...args),
}));

import {
  fetchReadableUrl,
  fetchReadableUrlDetailed,
  normalizeReadableEvidenceUrl,
  searchWeb,
} from '../web-research';

const originalFetch = globalThis.fetch;

describe('web-research service', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.EXA_API_KEY = 'exa-test-key';
    globalThis.fetch = vi.fn();
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  it('calls Exa with query options and normalizes valid results', async () => {
    vi.mocked(globalThis.fetch).mockResolvedValue({
      ok: true,
      json: async () => ({
        results: [
          {
            id: 'r1',
            title: 'Result One',
            url: 'https://example.com/one',
            publishedDate: '2026-04-01',
            author: 'Author',
            score: 0.91,
            text: 'x'.repeat(1_050),
            highlights: ['highlight'],
          },
          {
            id: 'bad',
            title: 'Bad URL',
            url: 'not a url',
          },
        ],
      }),
    } as Response);

    const results = await searchWeb('knowledge-rich curriculum research', {
      numResults: 3,
      includeDomains: ['educationnext.org'],
      excludeDomains: ['spam.example'],
      timeoutMs: 12_000,
    });

    expect(globalThis.fetch).toHaveBeenCalledWith(
      'https://api.exa.ai/search',
      expect.objectContaining({
        method: 'POST',
        headers: expect.objectContaining({
          'Content-Type': 'application/json',
          'x-api-key': 'exa-test-key',
        }),
        body: JSON.stringify({
          query: 'knowledge-rich curriculum research',
          numResults: 3,
          includeDomains: ['educationnext.org'],
          excludeDomains: ['spam.example'],
        }),
      })
    );
    expect(results).toEqual([
      {
        id: 'r1',
        title: 'Result One',
        url: 'https://example.com/one',
        publishedDate: '2026-04-01',
        author: 'Author',
        score: 0.91,
        text: expect.stringContaining('[truncated to 1000 characters]'),
        highlights: ['highlight'],
      },
    ]);
  });

  it('throws a clear configuration error when EXA_API_KEY is missing', async () => {
    delete process.env.EXA_API_KEY;

    await expect(searchWeb('test')).rejects.toThrow('EXA_API_KEY environment variable is not set');
    expect(globalThis.fetch).not.toHaveBeenCalled();
  });

  it('throws with status and response body for non-2xx Exa responses', async () => {
    vi.mocked(globalThis.fetch).mockResolvedValue({
      ok: false,
      status: 500,
      text: async () => 'server error',
    } as Response);

    await expect(searchWeb('test')).rejects.toThrow('Exa search failed (500): server error');
  });

  it('returns readable article content with truncation', async () => {
    mockExtractContent.mockResolvedValue({
      contentType: 'article',
      title: 'Article',
      siteName: 'Example',
      markdown: 'x'.repeat(12_050),
    });

    const result = await fetchReadableUrl('https://example.com/path', 12_000);

    expect(mockExtractContent).toHaveBeenCalledWith('https://example.com/path');
    expect(result).toEqual({
      title: 'Article',
      url: 'https://example.com/path',
      siteName: 'Example',
      content: expect.stringContaining('[truncated to 12000 characters]'),
      fetchStatus: 'fetched',
    });
  });

  it('normalizes arxiv PDF URLs to HTML evidence URLs before fetching', async () => {
    mockExtractContent.mockResolvedValue({
      contentType: 'article',
      title: 'Arxiv HTML',
      siteName: 'arXiv',
      markdown: 'research evidence '.repeat(100),
    });

    const result = await fetchReadableUrl('https://arxiv.org/pdf/2503.23278v3.pdf', 12_000);

    expect(normalizeReadableEvidenceUrl('https://arxiv.org/pdf/2503.23278v3.pdf')).toBe('https://arxiv.org/html/2503.23278v3');
    expect(mockExtractContent).toHaveBeenCalledWith('https://arxiv.org/html/2503.23278v3');
    expect(result?.url).toBe('https://arxiv.org/html/2503.23278v3');
  });

  it('rejects junk interstitial and not-found pages with skip reasons', async () => {
    mockExtractContent.mockResolvedValueOnce({
      contentType: 'article',
      title: 'Just a moment...',
      siteName: 'Blocked',
      markdown: 'Checking your browser before accessing the site.'.repeat(20),
    });

    await expect(fetchReadableUrlDetailed('https://example.com/cloudflare')).resolves.toEqual(
      expect.objectContaining({
        source: null,
        skippedReason: 'junk_title',
        title: 'Just a moment...',
      })
    );

    mockExtractContent.mockResolvedValueOnce({
      contentType: 'article',
      title: 'Sorry, the page you are looking for is not found.',
      siteName: 'Mirror',
      markdown: 'Sorry, the page you are looking for is not found.',
    });

    await expect(fetchReadableUrlDetailed('https://example.com/missing')).resolves.toEqual(
      expect.objectContaining({
        source: null,
        skippedReason: 'junk_title',
        title: 'Sorry, the page you are looking for is not found.',
      })
    );
  });

  it('rejects short pages that are not enough evidence', async () => {
    mockExtractContent.mockResolvedValue({
      contentType: 'article',
      title: 'Tiny Article',
      siteName: 'Example',
      markdown: 'short article',
    });

    await expect(fetchReadableUrlDetailed('https://example.com/tiny')).resolves.toEqual(
      expect.objectContaining({
        source: null,
        skippedReason: 'too_short',
        contentChars: 13,
      })
    );
  });

  it('returns null for non-article and thrown extractor results', async () => {
    mockExtractContent.mockResolvedValueOnce({ contentType: 'pdf', url: 'https://example.com/file.pdf' });
    await expect(fetchReadableUrl('https://example.com/file.pdf')).resolves.toBeNull();

    mockExtractContent.mockRejectedValueOnce(new Error('network failed'));
    await expect(fetchReadableUrl('https://example.com/error')).resolves.toBeNull();
  });
});
