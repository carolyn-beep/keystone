import { beforeEach, describe, expect, it, vi } from 'vitest';

const {
  mockExtractContent,
  mockFetchYouTubeTranscript,
} = vi.hoisted(() => ({
  mockExtractContent: vi.fn(),
  mockFetchYouTubeTranscript: vi.fn(),
}));

vi.mock('../../../../services/content-extractor', () => ({
  extractContent: (...args: unknown[]) => mockExtractContent(...args),
}));

vi.mock('../../../../services/youtube-transcript', () => ({
  fetchYouTubeTranscript: (...args: unknown[]) => mockFetchYouTubeTranscript(...args),
}));

const toolContext = {
  toolCallId: 'tool-1',
  messages: [],
  abortSignal: new AbortController().signal,
};

describe('buildResearchChatTools', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.EXA_API_KEY = 'exa-test-key';
    global.fetch = vi.fn();
  });

  it('registers native research tools', async () => {
    const { buildResearchChatTools } = await import('../research');
    const tools = buildResearchChatTools();

    expect(Object.keys(tools)).toEqual([
      'web_search_exa',
      'fetch_url_content',
      'get_youtube_transcript',
    ]);
  });

  it('calls Exa search with the expected request body and returns normalized results', async () => {
    const fetchMock = vi.mocked(global.fetch);
    fetchMock.mockResolvedValue({
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
          },
        ],
      }),
    } as Response);

    const { buildResearchChatTools } = await import('../research');
    const tools = buildResearchChatTools();

    const result = await tools.web_search_exa.execute(
      {
        query: 'knowledge-rich curriculum research',
        numResults: 3,
        includeDomains: ['educationnext.org'],
      },
      toolContext,
    );

    expect(fetchMock).toHaveBeenCalledWith(
      'https://api.exa.ai/search',
      expect.objectContaining({
        method: 'POST',
        headers: expect.objectContaining({
          'x-api-key': 'exa-test-key',
        }),
        body: JSON.stringify({
          query: 'knowledge-rich curriculum research',
          numResults: 3,
          includeDomains: ['educationnext.org'],
        }),
      }),
    );
    expect(result).toEqual({
      query: 'knowledge-rich curriculum research',
      results: [
        {
          id: 'r1',
          title: 'Result One',
          url: 'https://example.com/one',
          publishedDate: '2026-04-01',
          author: 'Author',
          score: 0.91,
          text: undefined,
          highlights: undefined,
        },
      ],
    });
  });

  it('fails clearly when EXA_API_KEY is missing', async () => {
    delete process.env.EXA_API_KEY;
    const { buildResearchChatTools } = await import('../research');
    const tools = buildResearchChatTools();

    await expect(tools.web_search_exa.execute(
      { query: 'test' },
      toolContext,
    )).rejects.toThrow('EXA_API_KEY environment variable is not set');
  });

  it('fetches URL content through the shared extractor and truncates article markdown', async () => {
    mockExtractContent.mockResolvedValue({
      contentType: 'article',
      title: 'Article',
      siteName: 'Example',
      markdown: 'x'.repeat(20_050),
    });

    const { buildResearchChatTools } = await import('../research');
    const tools = buildResearchChatTools();

    const result = await tools.fetch_url_content.execute(
      { url: 'https://example.com/path' },
      toolContext,
    );

    expect(mockExtractContent).toHaveBeenCalledWith('https://example.com/path');
    expect(result.contentType).toBe('article');
    expect(result.markdown.length).toBeLessThan(20_100);
    expect(result.markdown).toContain('[truncated to 20000 characters]');
  });

  it('extracts YouTube IDs from URLs and returns transcripts', async () => {
    mockFetchYouTubeTranscript.mockResolvedValue('Transcript text');

    const { buildResearchChatTools } = await import('../research');
    const tools = buildResearchChatTools();

    const result = await tools.get_youtube_transcript.execute(
      { urlOrVideoId: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ&t=10s' },
      toolContext,
    );

    expect(mockFetchYouTubeTranscript).toHaveBeenCalledWith('dQw4w9WgXcQ');
    expect(result).toEqual({
      videoId: 'dQw4w9WgXcQ',
      available: true,
      transcript: 'Transcript text',
    });
  });

  it('returns unavailable when captions cannot be fetched', async () => {
    mockFetchYouTubeTranscript.mockResolvedValue(null);

    const { buildResearchChatTools } = await import('../research');
    const tools = buildResearchChatTools();

    const result = await tools.get_youtube_transcript.execute(
      { urlOrVideoId: 'dQw4w9WgXcQ' },
      toolContext,
    );

    expect(result).toEqual({
      videoId: 'dQw4w9WgXcQ',
      available: false,
      transcript: null,
    });
  });
});
