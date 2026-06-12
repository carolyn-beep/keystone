import {
  type ReadableWebSource,
  type WebSearchResult,
  fetchReadableUrlDetailed,
  searchWeb,
} from '../services/web-research';
import { callModelWithFallback } from './client';

export type WebEvidenceMode =
  | 'direct_source'
  | 'cached_transcript'
  | 'fallback_search'
  | 'none';

export interface WebSearchEvidence {
  query: string;
  results: WebSearchResult[];
  sources: ReadableWebSource[];
}

export interface EvidenceResult {
  url: string | null;
  content: string | null;
  error: string | null;
  fetchedAt: Date;
  mode: WebEvidenceMode;
  originalSourceUrl: string | null;
  fallbackSearch?: WebSearchEvidence;
}

const DIRECT_FETCH_TIMEOUT_MS = 10_000;
const DIRECT_MIN_CONTENT_CHARS = 100;
const FALLBACK_RESULT_COUNT = 5;
const FALLBACK_SOURCE_MAX_CHARS = 12_000;
const MAX_QUERY_CHARS = 280;
const QUERY_GENERATION_TIMEOUT_MS = 12_000;

const FALLBACK_QUERY_SCHEMA = {
  type: 'json_schema' as const,
  jsonSchema: {
    name: 'fallback_search_query',
    strict: true,
    schema: {
      type: 'object',
      properties: {
        query: {
          type: 'string',
          description: 'A concise web search query for finding accessible evidence about the claim.',
        },
      },
      required: ['query'],
      additionalProperties: false,
    },
  },
};

function quoteLogValue(value: string | null | undefined): string {
  return JSON.stringify(value ?? null);
}

function extractUrlFromSource(source: string): string | null {
  if (!source) return null;

  const urlMatch = source.match(/https?:\/\/[^\s\)]+/i);
  if (urlMatch) {
    return urlMatch[0].replace(/[.,;:]+$/, '');
  }

  return null;
}

function normalizeSearchText(value: string): string {
  return value
    .replace(/https?:\/\/[^\s\)]+/gi, ' ')
    .replace(/\(\s*\)/g, ' ')
    .replace(/["“”]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function truncateQueryPrefix(value: string, maxChars: number): string {
  if (value.length <= maxChars) {
    return value;
  }

  const truncated = value.slice(0, maxChars).trimEnd();
  const lastSpace = truncated.lastIndexOf(' ');
  return (lastSpace > 40 ? truncated.slice(0, lastSpace) : truncated).trimEnd();
}

export function buildDeterministicFallbackEvidenceQuery(fact: string, source: string): string {
  const claim = normalizeSearchText(fact);
  const sourceContext = normalizeSearchText(source);

  const parts = [
    claim ? `"${claim}"` : '',
    sourceContext ? `"${sourceContext}"` : '',
    'evidence fact check',
  ].filter(Boolean);

  const query = parts.join(' ').replace(/\s+/g, ' ').trim();
  if (query.length <= MAX_QUERY_CHARS) {
    return query;
  }

  const suffix = ' evidence fact check';
  return `${truncateQueryPrefix(query.slice(0, MAX_QUERY_CHARS - suffix.length), MAX_QUERY_CHARS - suffix.length)}${suffix}`;
}

function normalizeGeneratedQuery(query: string): string {
  return normalizeSearchText(query)
    .replace(/\b(?:www\.)?[a-z0-9-]+\.[a-z]{2,}\S*/gi, ' ')
    .replace(/\bsite:\S+/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, MAX_QUERY_CHARS)
    .trim();
}

function parseGeneratedQuery(content: string): string {
  const cleanContent = content
    .replace(/```json\s*/gi, '')
    .replace(/```\s*/g, '')
    .trim();

  try {
    const parsed = JSON.parse(cleanContent);
    if (typeof parsed.query === 'string') {
      return normalizeGeneratedQuery(parsed.query);
    }
  } catch {
    // Some fallback models may return plain text despite the schema request.
  }

  return normalizeGeneratedQuery(cleanContent);
}

export async function generateFallbackEvidenceQuery(fact: string, source: string): Promise<string> {
  const sourceContext = normalizeSearchText(source);
  const deterministicQuery = buildDeterministicFallbackEvidenceQuery(fact, source);
  const prompt = `Build one web search query to find accessible evidence for fact-checking this claim.

CLAIM:
${fact}

CITED SOURCE CONTEXT:
${sourceContext || 'No source context provided'}

Rules:
- Return only JSON matching the schema.
- Query should be concise and likely to find alternate accessible sources.
- Include distinctive claim terms, named author/source/title terms, and the topic.
- Do not include broken URLs, URL paths, domain names, site: operators, or protocol strings.
- Do not answer the claim. Only produce the search query.`;

  try {
    const result = await callModelWithFallback({
      models: ['qwen/qwen-plus', 'google/gemini-2.5-flash-lite'],
      messages: [{ role: 'user', content: prompt }],
      temperature: 0,
      maxTokens: 120,
      timeout: QUERY_GENERATION_TIMEOUT_MS,
      responseFormat: FALLBACK_QUERY_SCHEMA,
      caller: 'evidenceFetcher.queryGeneration',
      validate: (content) => {
        const query = parseGeneratedQuery(content);
        if (!query) {
          throw new Error('Generated fallback search query was empty');
        }
      },
    });

    const generatedQuery = parseGeneratedQuery(result.content);
    if (generatedQuery) {
      console.log(`[Evidence] Fallback query generated by ${result.model}: ${quoteLogValue(generatedQuery)}`);
      return generatedQuery;
    }
  } catch (err: any) {
    console.log(`[Evidence] Fallback query generation failed: ${err.message}`);
  }

  console.log(`[Evidence] Fallback query using deterministic backup: ${quoteLogValue(deterministicQuery)}`);
  return deterministicQuery;
}

async function fetchWebContent(url: string): Promise<{ content: string | null; error: string | null; isPdf?: boolean }> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), DIRECT_FETCH_TIMEOUT_MS);

  try {
    console.log(`[Evidence] Fetching web content from: ${url}`);
    const response = await fetch(url, {
      signal: controller.signal,
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; DOK1Grader/1.0; +https://replit.com)',
        Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
      },
    });

    if (!response.ok) {
      console.log(`[Evidence] HTTP error for ${url}: ${response.status} ${response.statusText}`);
      return { content: null, error: `HTTP ${response.status}: ${response.statusText}` };
    }

    const contentType = response.headers.get('content-type') || '';
    console.log(`[Evidence] Content-Type for ${url}: ${contentType}`);

    const isPdf = contentType.includes('application/pdf') ||
      url.toLowerCase().endsWith('.pdf') ||
      url.includes('/pdf/');

    if (isPdf) {
      console.log('[Evidence] PDF detected - cannot extract direct source text');
      return { content: null, error: 'Source is a PDF document - cannot extract text directly', isPdf: true };
    }

    if (!contentType.includes('text/html') && !contentType.includes('text/plain')) {
      console.log(`[Evidence] Unsupported content type: ${contentType}`);
      return { content: null, error: `Unsupported content type: ${contentType}` };
    }

    const html = await response.text();
    const textContent = html
      .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
      .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
      .replace(/<nav[^>]*>[\s\S]*?<\/nav>/gi, '')
      .replace(/<footer[^>]*>[\s\S]*?<\/footer>/gi, '')
      .replace(/<header[^>]*>[\s\S]*?<\/header>/gi, '')
      .replace(/<[^>]+>/g, ' ')
      .replace(/&nbsp;/g, ' ')
      .replace(/&amp;/g, '&')
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/&quot;/g, '"')
      .replace(/&#39;/g, "'")
      .replace(/\s+/g, ' ')
      .trim();

    console.log(`[Evidence] Successfully extracted ${textContent.length} chars from ${url}`);
    return { content: textContent, error: null };
  } catch (err: any) {
    console.log(`[Evidence] Error fetching ${url}: ${err.message}`);
    return { content: null, error: err.message };
  } finally {
    clearTimeout(timeoutId);
  }
}

function buildFallbackEvidencePacket(
  originalSourceUrl: string | null,
  fetchError: string | null | undefined,
  fallbackSearch: WebSearchEvidence
): string {
  const sourceSections = fallbackSearch.sources.map((source, index) => {
    return [
      `Source ${index + 1}: ${source.title ?? 'Untitled source'}`,
      `URL: ${source.url}`,
      source.siteName ? `Site: ${source.siteName}` : null,
      'Content:',
      source.content,
    ].filter(Boolean).join('\n');
  });

  return [
    'Fallback web search evidence',
    originalSourceUrl ? `Original source URL: ${originalSourceUrl}` : 'Original source URL: not provided',
    fetchError ? `Original source retrieval error: ${fetchError}` : null,
    `Search query: ${fallbackSearch.query}`,
    '',
    ...sourceSections,
  ].filter((line) => line !== null).join('\n');
}

async function findFallbackEvidence(
  fact: string,
  source: string,
): Promise<WebSearchEvidence | null> {
  const query = await generateFallbackEvidenceQuery(fact, source);

  try {
    console.log(`[Evidence] Fallback search query: ${quoteLogValue(query)}`);
    const results = await searchWeb(query, { numResults: FALLBACK_RESULT_COUNT });
    const resultSummaries = results.map((result, index) => ({
      rank: index + 1,
      title: result.title,
      url: result.url,
      score: result.score,
      publishedDate: result.publishedDate,
      author: result.author,
    }));
    console.log(`[Evidence] Fallback search returned ${results.length} result(s): ${JSON.stringify(resultSummaries)}`);

    const sources: ReadableWebSource[] = [];

    for (const result of results.slice(0, FALLBACK_RESULT_COUNT)) {
      const readableResult = await fetchReadableUrlDetailed(result.url, FALLBACK_SOURCE_MAX_CHARS);
      if (readableResult.source) {
        sources.push(readableResult.source);
      } else {
        console.log(`[Evidence] Fallback source skipped reason=${quoteLogValue(readableResult.skippedReason)} title=${quoteLogValue(readableResult.title ?? result.title)} url=${quoteLogValue(readableResult.normalizedUrl ?? result.url)} contentChars=${readableResult.contentChars ?? null}`);
      }
    }

    const readableSummaries = sources.map((source, index) => ({
      rank: index + 1,
      title: source.title,
      url: source.url,
      siteName: source.siteName,
      contentChars: source.content.length,
    }));
    console.log(`[Evidence] Fallback readable sources ${sources.length}/${results.length}: ${JSON.stringify(readableSummaries)}`);

    if (sources.length === 0) {
      return null;
    }

    return { query, results, sources };
  } catch (err: any) {
    console.log(`[Evidence] Fallback web search failed: ${err.message}`);
    return null;
  }
}

export async function fetchEvidenceForFact(
  fact: string,
  source: string,
  failedUrlCache?: Map<string, string>,
  cachedTranscript?: string | null
): Promise<EvidenceResult> {
  const fetchedAt = new Date();
  const originalSourceUrl = extractUrlFromSource(source);

  console.log('[Evidence] === Starting evidence fetch ===');
  console.log(`[Evidence] Fact: "${fact.substring(0, 100)}..."`);
  console.log(`[Evidence] Source: "${source}"`);

  if (cachedTranscript && cachedTranscript.length > 0) {
    console.log(`[Evidence] Using cached transcript (${cachedTranscript.length} chars)`);
    return {
      url: originalSourceUrl,
      content: cachedTranscript,
      error: null,
      fetchedAt,
      mode: 'cached_transcript',
      originalSourceUrl,
    };
  }

  let fetchError: string | null = null;

  if (originalSourceUrl) {
    if (failedUrlCache?.has(originalSourceUrl)) {
      fetchError = failedUrlCache.get(originalSourceUrl)!;
      console.log(`[Evidence] Skipping URL (cached failure): ${originalSourceUrl} - ${fetchError}`);
    } else {
      console.log(`[Evidence] Extracted URL: ${originalSourceUrl}`);
      const webResult = await fetchWebContent(originalSourceUrl);

      if (webResult.content && webResult.content.length > DIRECT_MIN_CONTENT_CHARS) {
        console.log(`[Evidence] SUCCESS: Got ${webResult.content.length} chars from URL`);
        return {
          url: originalSourceUrl,
          content: webResult.content,
          error: null,
          fetchedAt,
          mode: 'direct_source',
          originalSourceUrl,
        };
      }

      fetchError = webResult.error || 'No content returned';
      console.log(`[Evidence] URL fetch failed: ${fetchError}`);
      failedUrlCache?.set(originalSourceUrl, fetchError);
    }
  } else {
    fetchError = 'No source URL found';
    console.log('[Evidence] No URL found in source, using fallback web search');
  }

  console.log(`[Evidence] FALLBACK_SEARCH_START reason=${quoteLogValue(fetchError)} originalSourceUrl=${quoteLogValue(originalSourceUrl)}`);
  const fallbackSearch = await findFallbackEvidence(fact, source);

  if (fallbackSearch) {
    const primarySource = fallbackSearch.sources[0];
    const content = buildFallbackEvidencePacket(originalSourceUrl, fetchError, fallbackSearch);

    console.log(`[Evidence] SUCCESS: Fallback search found ${fallbackSearch.sources.length} readable source(s)`);
    return {
      url: primarySource.url,
      content,
      error: fetchError,
      fetchedAt,
      mode: 'fallback_search',
      originalSourceUrl,
      fallbackSearch,
    };
  }

  console.log('[Evidence] FAILED: Could not fetch or find accessible evidence');
  return {
    url: originalSourceUrl,
    content: null,
    error: fetchError
      ? `${fetchError}; No accessible fallback web evidence found`
      : 'No accessible fallback web evidence found',
    fetchedAt,
    mode: 'none',
    originalSourceUrl,
  };
}
