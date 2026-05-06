import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { extractContent } from '../content-extractor';

const originalFetch = globalThis.fetch;
const originalExaApiKey = process.env.EXA_API_KEY;
const originalJinaApiKey = process.env.JINA_API_KEY;

function headResponse(contentType: string) {
  return {
    ok: true,
    headers: new Headers({ 'content-type': contentType }),
  } as Response;
}

function exaResponse(payload: unknown, status = 200) {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => payload,
    text: async () => JSON.stringify(payload),
  } as Response;
}

function getFetchCall(index: number) {
  return vi.mocked(globalThis.fetch).mock.calls[index] as [string, RequestInit | undefined];
}

describe('content-extractor Exa Contents integration', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.EXA_API_KEY = 'exa-test-key';
    delete process.env.JINA_API_KEY;
    globalThis.fetch = vi.fn();
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
    process.env.EXA_API_KEY = originalExaApiKey;
    process.env.JINA_API_KEY = originalJinaApiKey;
  });

  it('FR1 fetches HTML article content through Exa Contents and maps the article contract', async () => {
    vi.mocked(globalThis.fetch)
      .mockResolvedValueOnce(headResponse('text/html'))
      .mockResolvedValueOnce(exaResponse({
        results: [
          {
            id: 'https://example.com/article',
            url: 'https://example.com/article',
            title: 'Example Article',
            text: 'Readable article content. '.repeat(20),
          },
        ],
        statuses: [{ id: 'https://example.com/article', status: 'success' }],
      }));

    const result = await extractContent('https://example.com/article');

    expect(result).toEqual({
      contentType: 'article',
      markdown: 'Readable article content. '.repeat(20),
      title: 'Example Article',
      siteName: 'example.com',
    });

    const [requestUrl, requestOptions] = getFetchCall(1);
    expect(requestUrl).toBe('https://api.exa.ai/contents');
    expect(requestOptions).toEqual(expect.objectContaining({
      method: 'POST',
      headers: expect.objectContaining({
        'Content-Type': 'application/json',
        'x-api-key': 'exa-test-key',
      }),
    }));
    expect(JSON.parse(requestOptions?.body as string)).toEqual({
      urls: ['https://example.com/article'],
      text: { maxCharacters: 20000 },
      livecrawlTimeout: 15000,
    });
  });

  it('FR1 returns embeds immediately without HEAD or Exa calls', async () => {
    const result = await extractContent('https://www.youtube.com/watch?v=dQw4w9WgXcQ');

    expect(result).toEqual({
      contentType: 'embed',
      embedType: 'youtube',
      embedId: 'dQw4w9WgXcQ',
    });
    expect(globalThis.fetch).not.toHaveBeenCalled();
  });

  it('FR1 returns confirmed PDFs without calling Exa', async () => {
    vi.mocked(globalThis.fetch).mockResolvedValueOnce(headResponse('application/pdf'));

    const result = await extractContent('https://example.com/report.pdf');

    expect(result).toEqual({ contentType: 'pdf', url: 'https://example.com/report.pdf' });
    expect(globalThis.fetch).toHaveBeenCalledTimes(1);
    expect(getFetchCall(0)[1]).toEqual(expect.objectContaining({ method: 'HEAD' }));
  });

  it('FR2 returns a fallback when EXA_API_KEY is missing', async () => {
    delete process.env.EXA_API_KEY;
    vi.mocked(globalThis.fetch).mockResolvedValueOnce(headResponse('text/html'));

    await expect(extractContent('https://example.com/article')).resolves.toEqual({
      contentType: 'fallback',
      reason: 'EXA_API_KEY not configured',
    });
    expect(globalThis.fetch).toHaveBeenCalledTimes(1);
  });

  it('FR2 returns a fallback for non-2xx Exa responses', async () => {
    vi.mocked(globalThis.fetch)
      .mockResolvedValueOnce(headResponse('text/html'))
      .mockResolvedValueOnce(exaResponse({ error: 'bad gateway' }, 502));

    await expect(extractContent('https://example.com/article')).resolves.toEqual({
      contentType: 'fallback',
      reason: 'Exa Contents returned 502',
    });
  });

  it('FR2 returns a fallback for Exa per-URL status errors', async () => {
    vi.mocked(globalThis.fetch)
      .mockResolvedValueOnce(headResponse('text/html'))
      .mockResolvedValueOnce(exaResponse({
        results: [],
        statuses: [
          {
            id: 'https://example.com/article',
            status: 'error',
            error: { tag: 'CRAWL_NOT_FOUND', httpStatusCode: 404 },
          },
        ],
      }));

    await expect(extractContent('https://example.com/article')).resolves.toEqual({
      contentType: 'fallback',
      reason: 'Exa Contents could not fetch URL: CRAWL_NOT_FOUND (404)',
    });
  });

  it('FR2 preserves short-content, timeout, thrown-error, HEAD-failure, and unsupported-type behavior', async () => {
    vi.mocked(globalThis.fetch)
      .mockResolvedValueOnce(headResponse('text/html'))
      .mockResolvedValueOnce(exaResponse({ results: [{ text: 'too short', title: 'Tiny' }] }));

    await expect(extractContent('https://example.com/tiny')).resolves.toEqual({
      contentType: 'fallback',
      reason: 'Article content too short or empty',
    });

    const timeoutError = new Error('timeout');
    timeoutError.name = 'TimeoutError';
    vi.mocked(globalThis.fetch)
      .mockResolvedValueOnce(headResponse('text/html'))
      .mockRejectedValueOnce(timeoutError);

    await expect(extractContent('https://example.com/timeout')).resolves.toEqual({
      contentType: 'fallback',
      reason: 'Article fetch timed out (15s)',
    });

    vi.mocked(globalThis.fetch)
      .mockResolvedValueOnce(headResponse('text/html'))
      .mockRejectedValueOnce(new Error('network failed'));

    await expect(extractContent('https://example.com/error')).resolves.toEqual({
      contentType: 'fallback',
      reason: 'Article fetch failed: network failed',
    });

    vi.mocked(globalThis.fetch)
      .mockRejectedValueOnce(new Error('HEAD blocked'))
      .mockResolvedValueOnce(exaResponse({
        results: [{ url: 'https://example.com/head-blocked', title: 'Article', text: 'fallback article '.repeat(20) }],
      }));

    await expect(extractContent('https://example.com/head-blocked')).resolves.toEqual({
      contentType: 'article',
      markdown: 'fallback article '.repeat(20),
      title: 'Article',
      siteName: 'example.com',
    });

    vi.mocked(globalThis.fetch).mockResolvedValueOnce(headResponse('image/png'));

    await expect(extractContent('https://example.com/image.png')).resolves.toEqual({
      contentType: 'fallback',
      reason: 'Unsupported content type: image/png',
    });
  });
});
