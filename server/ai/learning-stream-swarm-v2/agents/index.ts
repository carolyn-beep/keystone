import { tool, type ToolSet } from 'ai';
import { z } from 'zod';
import type { RetrievalType, Slot } from '@shared/research-stream';
import type { SwarmContext } from '../context-builder';
import { storage } from '../../../storage';
import { extractContent } from '../../../services/content-extractor';
import {
  DEFAULT_SEARCH_RESULT_COUNT,
  MAX_SEARCH_RESULT_COUNT,
  normalizeUrl,
  searchWeb,
  truncateText,
} from '../../../services/web-research';
import { fetchYouTubeTranscript } from '../../../services/youtube-transcript';
import { extractYouTubeVideoId } from '../../chat/tools/research';
import * as web from './web';
import * as academic from './academic';
import * as twitter from './twitter';
import * as video from './video';
import * as podcast from './podcast';
import * as news from './news';

const MAX_FETCH_MARKDOWN_CHARS = 20_000;
const MAX_TRANSCRIPT_CHARS = 40_000;
export const MAX_KEY_INSIGHTS_CHARS = 320;
export const MAX_PROJECT_RATIONALE_CHARS = 520;

export interface TypeRunner {
  buildPrompt: (slot: Slot, ctx: SwarmContext) => string;
  buildTools: (closure: SlotToolClosure) => ToolSet;
}

export interface SlotToolClosure {
  brainliftId: number;
  runId: number;
  slotIdx: number;
  brainliftTitle?: string;
  slotFocus?: string;
  recordActivity: (event: { eventType: string; data: Record<string, unknown> }) => void;
  existingUrls: Set<string>;
  discoveredTitles?: Map<string, string>;
  incrementSaved?: (duplicate: boolean) => void;
}

const webSearchInputSchema = z.object({
  query: z.string().trim().min(1),
  numResults: z.number().int().min(1).max(MAX_SEARCH_RESULT_COUNT).optional(),
  includeDomains: z.array(z.string().trim().min(1)).max(10).optional(),
  excludeDomains: z.array(z.string().trim().min(1)).max(10).optional(),
});

const fetchInputSchema = z.object({
  url: z.string().trim().url(),
});

const youtubeInputSchema = z.object({
  urlOrVideoId: z.string().trim().min(1),
});

const CANONICAL_TYPES = ['Substack', 'Twitter', 'AcademicPaper', 'Podcast', 'Video', 'News'] as const;
type CanonicalType = (typeof CANONICAL_TYPES)[number];

/** Normalize any LLM-provided type string to a canonical RetrievalType.
 *  Strict match first; then keyword sniff (e.g. "Podcast Episode" → "Podcast",
 *  "Substack Essay" → "Substack"). Returns null if no canonical match found. */
function normalizeType(raw: string): CanonicalType | null {
  if ((CANONICAL_TYPES as readonly string[]).includes(raw)) return raw as CanonicalType;
  const lower = raw.toLowerCase();
  if (lower.includes('podcast')) return 'Podcast';
  if (lower.includes('substack') || lower.includes('newsletter')) return 'Substack';
  if (lower.includes('academic') || lower.includes('paper') || lower.includes('arxiv') || lower.includes('preprint')) return 'AcademicPaper';
  if (lower.includes('video') || lower.includes('youtube')) return 'Video';
  if (lower.includes('news') || lower.includes('article') || lower.includes('headline')) return 'News';
  if (lower.includes('twitter') || lower.includes('tweet') || lower === 'x') return 'Twitter';
  return null;
}

const saveItemInputSchema = z.object({
  type: z.string().trim().min(1).transform((raw, ctx) => {
    const canonical = normalizeType(raw);
    if (!canonical) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: `Unrecognized source type "${raw}". Use one of: ${CANONICAL_TYPES.join(', ')}.`,
      });
      return z.NEVER;
    }
    return canonical;
  }).describe('Source type. Must resolve to one of the canonical RetrievalType enum values; descriptors like "Episode"/"Essay"/"Paper" are stripped server-side.'),
  author: z.string().trim().min(1).default('Unknown'),
  topic: z.string().trim().min(1).describe('Actual source title/headline, not the brainlift title or slot focus'),
  time: z.string().trim().min(1).default('10 min'),
  facts: z.string().trim().min(1).describe('Key Insights preview: 1-2 compact sentences or max 2 short bullets, not a full source summary'),
  url: z.string().trim().min(1),
  relevanceScore: z.string().trim().optional(),
  aiRationale: z.string().trim().optional().describe('Why this matters: project-specific rationale tied to the current brainlift, user context, experts, gaps, SPOV, or slot focus'),
});

const checkDuplicateInputSchema = z.object({
  url: z.string().trim().min(1),
});

function isHttpUrl(rawUrl: string): boolean {
  try {
    const url = new URL(rawUrl);
    return url.protocol === 'http:' || url.protocol === 'https:';
  } catch {
    return false;
  }
}

function normalizeLabel(value: string | undefined): string {
  return (value ?? '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

function isProjectLevelTitle(candidate: string, closure: SlotToolClosure): boolean {
  const normalizedCandidate = normalizeLabel(candidate);
  if (!normalizedCandidate) return true;

  return [
    closure.brainliftTitle,
    closure.slotFocus,
  ].some((value) => {
    const normalizedValue = normalizeLabel(value);
    return normalizedValue.length > 0 && normalizedCandidate === normalizedValue;
  });
}

function rememberDiscoveredTitle(titles: Map<string, string>, rawUrl: string, title: string | null | undefined) {
  if (!title || !isHttpUrl(rawUrl)) return;
  const normalizedTitle = title.trim();
  if (!normalizedTitle) return;
  titles.set(normalizeUrl(rawUrl), normalizedTitle);
}

function compactPreview(value: string, maxChars: number): string {
  const normalized = value
    .replace(/\r\n?/g, '\n')
    .split('\n')
    .map((line) => line.replace(/^\s*[-*]\s+/, '').trim())
    .filter(Boolean)
    .slice(0, 2)
    .join(' ')
    .replace(/\s+/g, ' ')
    .trim();

  if (normalized.length <= maxChars) return normalized;

  const contentMax = Math.max(1, maxChars - 3);
  const sliced = normalized.slice(0, contentMax + 1);
  const lastBoundary = Math.max(
    sliced.lastIndexOf('. '),
    sliced.lastIndexOf('? '),
    sliced.lastIndexOf('! '),
    sliced.lastIndexOf('; '),
    sliced.lastIndexOf(', '),
    sliced.lastIndexOf(' '),
  );
  const cutAt = lastBoundary > Math.floor(contentMax * 0.6) ? lastBoundary : contentMax;
  return `${normalized.slice(0, cutAt).trim().replace(/[.,;:!?-]+$/, '')}...`;
}

export function buildCommonTools(closure: SlotToolClosure) {
  const discoveredTitles = closure.discoveredTitles ?? new Map<string, string>();

  return {
    web_search_exa: tool({
      description: 'Search the web using Exa for source discovery.',
      inputSchema: webSearchInputSchema,
      execute: async ({ query, numResults, includeDomains, excludeDomains }) => {
        closure.recordActivity({ eventType: 'search', data: { query } });
        const results = await searchWeb(query, {
          numResults: numResults ?? DEFAULT_SEARCH_RESULT_COUNT,
          includeDomains,
          excludeDomains,
        });

        for (const result of results) {
          rememberDiscoveredTitle(discoveredTitles, result.url, result.title);
        }

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

    web_fetch: tool({
      description: 'Fetch a URL into readable content for source verification.',
      inputSchema: fetchInputSchema,
      execute: async ({ url }) => {
        const normalizedUrl = normalizeUrl(url);
        closure.recordActivity({ eventType: 'fetch', data: { url: normalizedUrl } });
        const content = await extractContent(normalizedUrl);

        if (content.contentType === 'article') {
          rememberDiscoveredTitle(discoveredTitles, normalizedUrl, content.title);
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

    youtube_get_video_details: tool({
      description: 'Fetch YouTube transcript/details when available. Accepts a YouTube URL or raw video ID.',
      inputSchema: youtubeInputSchema,
      execute: async ({ urlOrVideoId }) => {
        const videoId = extractYouTubeVideoId(urlOrVideoId);
        if (!videoId) {
          return { available: false, reason: 'invalid_video_id' };
        }

        closure.recordActivity({ eventType: 'fetch', data: { videoId, source: 'youtube' } });
        const transcript = await fetchYouTubeTranscript(videoId);
        return {
          videoId,
          available: transcript !== null,
          transcript: transcript ? truncateText(transcript, MAX_TRANSCRIPT_CHARS) : null,
        };
      },
    }),

    check_duplicate: tool({
      description: 'Check whether this exact URL has already been saved for this brainlift or run.',
      inputSchema: checkDuplicateInputSchema,
      execute: async ({ url }) => {
        const normalizedUrl = isHttpUrl(url) ? normalizeUrl(url) : url;
        const isDuplicate = closure.existingUrls.has(normalizedUrl);
        closure.recordActivity({ eventType: 'check_duplicate', data: { url: normalizedUrl, isDuplicate } });
        return { isDuplicate };
      },
    }),

    save_item: tool({
      description: 'Save one learning stream item directly to the brainlift.',
      inputSchema: saveItemInputSchema,
      execute: async (input) => {
        if (!isHttpUrl(input.url)) {
          return { success: false, reason: 'invalid_url' };
        }

        const normalizedUrl = normalizeUrl(input.url);
        const duplicateBeforeSave = closure.existingUrls.has(normalizedUrl);
        const discoveredTitle = discoveredTitles.get(normalizedUrl);
        const topic = discoveredTitle && isProjectLevelTitle(input.topic, closure)
          ? discoveredTitle
          : input.topic;
        const facts = compactPreview(input.facts, MAX_KEY_INSIGHTS_CHARS);
        const aiRationale = input.aiRationale
          ? compactPreview(input.aiRationale, MAX_PROJECT_RATIONALE_CHARS)
          : null;
        const item = await storage.addLearningStreamItem(closure.brainliftId, {
          type: input.type,
          author: input.author,
          topic,
          time: input.time,
          facts,
          url: normalizedUrl,
          source: 'swarm-research',
          relevanceScore: input.relevanceScore ?? null,
          aiRationale,
        });

        const duplicate = duplicateBeforeSave;
        closure.existingUrls.add(normalizedUrl);
        closure.incrementSaved?.(duplicate);
        closure.recordActivity({
          eventType: 'save_item',
          data: {
            itemId: item.id,
            topic: item.topic,
            url: item.url,
            type: item.type,
            duplicate,
          },
        });

        return {
          success: true,
          itemId: item.id,
          topic: item.topic,
          url: item.url,
          duplicate,
        };
      },
    }),
  };
}

export function pickTools(closure: SlotToolClosure, keys: string[]): ToolSet {
  const common = buildCommonTools(closure);
  return Object.fromEntries(keys.map((key) => [key, common[key as keyof typeof common]]));
}

export function typeRunnerFor(type: RetrievalType): TypeRunner {
  switch (type) {
    case 'Substack':
      return web;
    case 'AcademicPaper':
      return academic;
    case 'Twitter':
      return twitter;
    case 'Video':
      return video;
    case 'Podcast':
      return podcast;
    case 'News':
      return news;
    default: {
      const exhaustive: never = type;
      throw new Error(`Unknown retrieval type: ${exhaustive}`);
    }
  }
}
