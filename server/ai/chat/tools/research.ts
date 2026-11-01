import { tool } from 'ai';
import { z } from 'zod';
import { brandId } from '../../../brand';
import { extractContent } from '../../../services/content-extractor';
import {
  DEFAULT_SEARCH_RESULT_COUNT,
  MAX_SEARCH_RESULT_COUNT,
  normalizeUrl,
  searchWeb,
  truncateText,
} from '../../../services/web-research';
import { fetchYouTubeTranscript } from '../../../services/youtube-transcript';

const MAX_FETCH_MARKDOWN_CHARS = 20_000;
const MAX_TRANSCRIPT_CHARS = 40_000;

const isKeystone = brandId === 'keystone';

const FETCH_URL_DESCRIPTION = isKeystone
  ? "Fetch a URL into readable content. The content this returns is for READING WITH the student, not silently mining. After the fetch lands, your next move is to quote 2–3 of the most load-bearing passages back to the student verbatim, tell them which parts caught your eye, and ask what stands out, what surprises them, what pushes back, what lines up with what they already thought. DOK1 fact extraction comes AFTER the student has engaged with the source. DOK2/3/4 prose must come from the student's articulation in the conversation that follows — never directly from this fetched content. If the fetch returns insufficient content (login wall, paywall, JS-only page, blocked bot, captcha, etc.), pivot: try mirror or archive URLs (archive.org, Google cache), search for the same material on freely accessible sites, or substitute another source that covers the same ground. Keep the research moving on your own — you have the tools to find an angle in. When you summarise findings, you can drop a one-line aside about any sources you couldn't reach, in case they want to peek at them directly. Light mention only, never a request for help."
  : "Fetch a URL into readable content. Uses existing content extraction: article text via Exa Contents, PDF/embed detection, and fallback diagnostics. If the fetch returns insufficient content (login wall, paywall, JS-only page, blocked bot, captcha, etc.), pivot: try mirror or archive URLs (archive.org, Google cache), search for the same material on freely accessible sites, or substitute another source that covers the same ground. Keep the research moving on your own — you have the tools to find an angle in. When you summarise findings, you can drop a one-line aside about any sources you couldn't reach, in case they want to peek at them directly. Light mention only, never a request for help.";

const YOUTUBE_TRANSCRIPT_DESCRIPTION = isKeystone
  ? "Fetch the transcript for a YouTube video when captions are available. Accepts a YouTube URL or raw video ID. The transcript this returns is for READING WITH the student, not silently mining. Surface 2–3 of the most striking passages back to the student verbatim, tell them what caught your ear, and ask what stands out or pushes back before extracting DOK1 facts. DOK2/3/4 prose must come from the student's reactions in the conversation, never directly from the transcript. If captions are unavailable or the transcript fails to retrieve, pivot to other coverage of the same material — articles, blog posts, recap pieces, related videos with captions, or summaries of the talk. Keep the research moving on your own. When you summarise findings, you can casually mention the original video as something the user might enjoy watching directly. Light mention only, never a request for help."
  : "Fetch the transcript for a YouTube video when captions are available. Accepts a YouTube URL or raw video ID. If captions are unavailable or the transcript fails to retrieve, pivot to other coverage of the same material — articles, blog posts, recap pieces, related videos with captions, or summaries of the talk. Keep the research moving on your own. When you summarise findings, you can casually mention the original video as something the user might enjoy watching directly. Light mention only, never a request for help.";

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
        'Web search via Exa. Use for in-chat source discovery: a URL the student shared, a specific article or paper they named, a verification, or sources for the back-and-forth when the student prefers to keep searching in conversation rather than launch a swarm. For a broad investigative sweep across a topic/angle/domain, `propose_research_run` is the better default — it fans out a 5-slot parallel swarm which is what the platform is built for. The one anti-pattern: two searches on the same topic in one turn to compose your own analysis — stop and propose a swarm instead.',
      inputSchema: webSearchInputSchema,
      execute: async ({ query, numResults, includeDomains, excludeDomains }) => {
        const results = await searchWeb(query, {
          numResults: numResults ?? DEFAULT_SEARCH_RESULT_COUNT,
          includeDomains,
          excludeDomains,
        });

        return {
          query,
          results: results.map((result) => ({
            id: result.id,
            title: result.title ?? null,
            url: result.url,
            publishedDate: result.publishedDate ?? null,
            author: result.author ?? null,
            score: result.score ?? null,
            text: result.text ?? undefined,
            highlights: result.highlights,
          })),
        };
      },
    }),

    fetch_url_content: tool({
      description: FETCH_URL_DESCRIPTION,
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
      description: YOUTUBE_TRANSCRIPT_DESCRIPTION,
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
