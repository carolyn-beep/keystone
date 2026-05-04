import { tool } from 'ai';
import { z } from 'zod';
import { extractContent } from '../../../services/content-extractor';
import { fetchYouTubeTranscript } from '../../../services/youtube-transcript';

const EXA_SEARCH_URL = 'https://api.exa.ai/search';
const DEFAULT_SEARCH_RESULT_COUNT = 5;
const MAX_SEARCH_RESULT_COUNT = 10;
const MAX_FETCH_MARKDOWN_CHARS = 20_000;
const MAX_TRANSCRIPT_CHARS = 40_000;

type ExaResult = {
  id?: string;
  title?: string;
  url?: string;
  publishedDate?: string;
  author?: string;
  score?: number;
  text?: string;
  highlights?: string[];
};

function requireExaApiKey(): string {
  const apiKey = process.env.EXA_API_KEY;
  if (!apiKey) {
    throw new Error('EXA_API_KEY environment variable is not set');
  }
  return apiKey;
}

function truncateText(value: string, maxChars: number): string {
  if (value.length <= maxChars) {
    return value;
  }
  return `${value.slice(0, maxChars).trimEnd()}\n\n[truncated to ${maxChars} characters]`;
}

function normalizeUrl(value: string): string {
  const trimmed = value.trim();
  const url = new URL(trimmed);
  return url.toString();
}

export function extractYouTubeVideoId(input: string): string | null {
  const trimmed = input.trim();
  if (/^[A-Za-z0-9_-]{11}$/.test(trimmed)) {
    return trimmed;
  }

  try {
    const url = new URL(trimmed);
    const hostname = url.hostname.replace(/^www\./, '');

    if (hostname === 'youtube.com' && url.pathname === '/watch') {
      return url.searchParams.get('v');
    }
    if (hostname === 'youtube.com' && url.pathname.startsWith('/embed/')) {
      return url.pathname.split('/embed/')[1]?.split(/[/?#]/)[0] || null;
    }
    if (hostname === 'youtu.be') {
      return url.pathname.slice(1).split(/[/?#]/)[0] || null;
    }
  } catch {
    return null;
  }

  return null;
}

const webSearchInputSchema = z.object({
  query: z.string().trim().min(1).describe('The web search query. Be specific and include the topic, source type, or recency need.'),
  numResults: z
    .number()
    .int()
    .min(1)
    .max(MAX_SEARCH_RESULT_COUNT)
    .optional()
    .describe(`Number of results to return. Defaults to ${DEFAULT_SEARCH_RESULT_COUNT}, max ${MAX_SEARCH_RESULT_COUNT}.`),
  includeDomains: z
    .array(z.string().trim().min(1))
    .max(10)
    .optional()
    .describe('Optional domains to restrict search to, such as arxiv.org or substack.com.'),
  excludeDomains: z
    .array(z.string().trim().min(1))
    .max(10)
    .optional()
    .describe('Optional domains to exclude from results.'),
});

const fetchUrlInputSchema = z.object({
  url: z.string().trim().url().describe('The URL to fetch and convert into readable content when possible.'),
});

const youtubeTranscriptInputSchema = z.object({
  urlOrVideoId: z
    .string()
    .trim()
    .min(1)
    .describe('A YouTube watch URL, youtu.be URL, embed URL, or raw 11-character video ID.'),
});

export function buildResearchChatTools() {
  return {
    web_search_exa: tool({
      description:
        'Search the web using Exa. Use this for fresh research, source discovery, experts, articles, papers, videos, and market context. Fetch promising URLs before relying on them.',
      inputSchema: webSearchInputSchema,
      execute: async ({ query, numResults, includeDomains, excludeDomains }) => {
        const response = await fetch(EXA_SEARCH_URL, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'x-api-key': requireExaApiKey(),
          },
          body: JSON.stringify({
            query,
            numResults: numResults ?? DEFAULT_SEARCH_RESULT_COUNT,
            ...(includeDomains?.length ? { includeDomains } : {}),
            ...(excludeDomains?.length ? { excludeDomains } : {}),
          }),
          signal: AbortSignal.timeout(15_000),
        });

        if (!response.ok) {
          const body = await response.text();
          throw new Error(`Exa search failed (${response.status}): ${body}`);
        }

        const payload = await response.json() as { results?: ExaResult[] };
        return {
          query,
          results: (payload.results ?? []).map((result) => ({
            id: result.id,
            title: result.title ?? null,
            url: result.url ?? null,
            publishedDate: result.publishedDate ?? null,
            author: result.author ?? null,
            score: result.score ?? null,
            text: result.text ? truncateText(result.text, 1_000) : undefined,
            highlights: result.highlights,
          })),
        };
      },
    }),

    fetch_url_content: tool({
      description:
        'Fetch a URL into readable content. Uses existing content extraction: article markdown via Jina, PDF/embed detection, and fallback diagnostics. If the fetch returns insufficient content (login wall, paywall, JS-only page, blocked bot, captcha, etc.), do NOT improvise around the gap or fall back on memory — ask the student to open the URL themselves and paste back the specific information you needed. Keeping the human in the loop is coaching, not failing.',
      inputSchema: fetchUrlInputSchema,
      execute: async ({ url }) => {
        const normalizedUrl = normalizeUrl(url);
        const content = await extractContent(normalizedUrl);

        if (content.contentType === 'article') {
          return {
            url: normalizedUrl,
            contentType: content.contentType,
            title: content.title ?? null,
            siteName: content.siteName ?? null,
            markdown: truncateText(content.markdown, MAX_FETCH_MARKDOWN_CHARS),
          };
        }

        return {
          url: normalizedUrl,
          ...content,
        };
      },
    }),

    get_youtube_transcript: tool({
      description:
        'Fetch the transcript for a YouTube video when captions are available. Accepts a YouTube URL or raw video ID. If captions are unavailable or the transcript fails to retrieve, do NOT summarize from memory — ask the student to share the relevant timestamps, quotes, or notes from the video themselves.',
      inputSchema: youtubeTranscriptInputSchema,
      execute: async ({ urlOrVideoId }) => {
        const videoId = extractYouTubeVideoId(urlOrVideoId);
        if (!videoId) {
          throw new Error('Could not extract a YouTube video ID from urlOrVideoId');
        }

        const transcript = await fetchYouTubeTranscript(videoId);
        return {
          videoId,
          available: transcript !== null,
          transcript: transcript ? truncateText(transcript, MAX_TRANSCRIPT_CHARS) : null,
        };
      },
    }),
  };
}
