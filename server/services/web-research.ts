import { extractContent } from './content-extractor';

export const EXA_SEARCH_URL = 'https://api.exa.ai/search';
export const DEFAULT_SEARCH_RESULT_COUNT = 5;
export const MAX_SEARCH_RESULT_COUNT = 10;
export const DEFAULT_SEARCH_TIMEOUT_MS = 15_000;
export const DEFAULT_READABLE_MAX_CHARS = 20_000;
const MIN_READABLE_CONTENT_CHARS = 800;

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

export interface WebSearchResult {
  id?: string;
  title: string | null;
  url: string;
  publishedDate: string | null;
  author: string | null;
  score: number | null;
  text: string | null;
  highlights?: string[];
}

export interface ReadableWebSource {
  title: string | null;
  url: string;
  siteName: string | null;
  content: string;
  fetchStatus: 'fetched';
}

export type ReadableUrlSkipReason =
  | 'invalid_url'
  | 'non_article'
  | 'junk_title'
  | 'junk_content'
  | 'too_short'
  | 'fetch_failed';

export interface ReadableUrlFetchResult {
  source: ReadableWebSource | null;
  skippedReason?: ReadableUrlSkipReason;
  normalizedUrl?: string;
  title?: string | null;
  contentChars?: number;
}

export interface SearchWebOptions {
  numResults?: number;
  includeDomains?: string[];
  excludeDomains?: string[];
  timeoutMs?: number;
}

export function truncateText(value: string, maxChars: number): string {
  if (value.length <= maxChars) {
    return value;
  }

  return `${value.slice(0, maxChars).trimEnd()}\n\n[truncated to ${maxChars} characters]`;
}

export function normalizeUrl(value: string): string {
  const trimmed = value.trim();
  const url = new URL(trimmed);
  return url.toString();
}

export function normalizeReadableEvidenceUrl(value: string): string {
  const url = new URL(value.trim());
  const host = url.hostname.toLowerCase();

  if ((host === 'arxiv.org' || host === 'www.arxiv.org') && url.pathname.startsWith('/pdf/')) {
    const paperId = url.pathname
      .replace(/^\/pdf\//, '')
      .replace(/\.pdf$/i, '')
      .replace(/^abs\//, '')
      .trim();

    if (paperId) {
      return `https://arxiv.org/html/${paperId}${url.search}${url.hash}`;
    }
  }

  return url.toString();
}

function includesJunkPattern(value: string, patterns: RegExp[]): boolean {
  return patterns.some((pattern) => pattern.test(value));
}

function isJunkTitle(title: string | null | undefined): boolean {
  if (!title) return false;
  return includesJunkPattern(title, [
    /just a moment/i,
    /page (?:not )?found/i,
    /page you are looking for is not found/i,
    /access denied/i,
    /forbidden/i,
    /checking your browser/i,
    /enable javascript/i,
    /captcha/i,
    /verify you are human/i,
  ]);
}

function isJunkContent(markdown: string): boolean {
  return includesJunkPattern(markdown.slice(0, 2_000), [
    /just a moment/i,
    /checking your browser/i,
    /enable javascript/i,
    /access denied/i,
    /403 forbidden/i,
    /404 not found/i,
    /page you are looking for is not found/i,
    /verify you are human/i,
    /captcha/i,
    /cloudflare/i,
  ]);
}

function requireExaApiKey(): string {
  const apiKey = process.env.EXA_API_KEY;
  if (!apiKey) {
    throw new Error('EXA_API_KEY environment variable is not set');
  }
  return apiKey;
}

function normalizeSearchResult(result: ExaResult): WebSearchResult | null {
  if (!result.url) {
    return null;
  }

  let url: string;
  try {
    url = normalizeUrl(result.url);
  } catch {
    return null;
  }

  return {
    id: result.id,
    title: result.title ?? null,
    url,
    publishedDate: result.publishedDate ?? null,
    author: result.author ?? null,
    score: result.score ?? null,
    text: result.text ? truncateText(result.text, 1_000) : null,
    highlights: result.highlights,
  };
}

export async function searchWeb(query: string, options: SearchWebOptions = {}): Promise<WebSearchResult[]> {
  const numResults = Math.min(
    Math.max(options.numResults ?? DEFAULT_SEARCH_RESULT_COUNT, 1),
    MAX_SEARCH_RESULT_COUNT
  );

  const response = await fetch(EXA_SEARCH_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': requireExaApiKey(),
    },
    body: JSON.stringify({
      query,
      numResults,
      ...(options.includeDomains?.length ? { includeDomains: options.includeDomains } : {}),
      ...(options.excludeDomains?.length ? { excludeDomains: options.excludeDomains } : {}),
    }),
    signal: AbortSignal.timeout(options.timeoutMs ?? DEFAULT_SEARCH_TIMEOUT_MS),
  });

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`Exa search failed (${response.status}): ${body}`);
  }

  const payload = await response.json() as { results?: ExaResult[] };
  return (payload.results ?? [])
    .map(normalizeSearchResult)
    .filter((result): result is WebSearchResult => result !== null);
}

export async function fetchReadableUrl(
  url: string,
  maxChars: number = DEFAULT_READABLE_MAX_CHARS
): Promise<ReadableWebSource | null> {
  const result = await fetchReadableUrlDetailed(url, maxChars);
  return result.source;
}

export async function fetchReadableUrlDetailed(
  url: string,
  maxChars: number = DEFAULT_READABLE_MAX_CHARS
): Promise<ReadableUrlFetchResult> {
  let normalizedUrl: string;
  try {
    normalizedUrl = normalizeReadableEvidenceUrl(url);
  } catch {
    return { source: null, skippedReason: 'invalid_url' };
  }

  try {
    const content = await extractContent(normalizedUrl);
    if (content.contentType !== 'article') {
      return {
        source: null,
        skippedReason: 'non_article',
        normalizedUrl,
        title: null,
      };
    }

    const markdown = content.markdown.trim();
    const title = content.title ?? null;

    if (isJunkTitle(title)) {
      return {
        source: null,
        skippedReason: 'junk_title',
        normalizedUrl,
        title,
        contentChars: markdown.length,
      };
    }

    if (isJunkContent(markdown)) {
      return {
        source: null,
        skippedReason: 'junk_content',
        normalizedUrl,
        title,
        contentChars: markdown.length,
      };
    }

    if (markdown.length < MIN_READABLE_CONTENT_CHARS) {
      return {
        source: null,
        skippedReason: 'too_short',
        normalizedUrl,
        title,
        contentChars: markdown.length,
      };
    }

    return {
      source: {
        title,
        url: normalizedUrl,
        siteName: content.siteName ?? null,
        content: truncateText(markdown, maxChars),
        fetchStatus: 'fetched',
      },
      normalizedUrl,
      title,
      contentChars: markdown.length,
    };
  } catch {
    return { source: null, skippedReason: 'fetch_failed', normalizedUrl };
  }
}
