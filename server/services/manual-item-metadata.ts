import type { ExtractedContent } from '@shared/schema';

/**
 * Presentation-metadata derivation for pasted manual learning-stream items.
 *
 * A pasted link is inserted with placeholders (topic = the raw URL, author =
 * hostname, type = 'News'); once the content-extraction job has run we know
 * enough to backfill real values:
 *
 * - topic: the extracted article title (Exa) or the YouTube oEmbed title.
 * - author: Exa's author field → JSON-LD / meta-tag parse of the page HTML →
 *   the site name; YouTube channel via oEmbed; tweet @handle from the URL.
 * - type: mapped onto the defined retrieval types ('Video', 'Podcast',
 *   'Twitter', 'Substack', 'Academic Paper', 'News').
 *
 * Everything here is best-effort and non-throwing: a field we cannot derive
 * is simply omitted so the insert-time placeholder stays.
 */

const HTML_FETCH_TIMEOUT_MS = 8_000;
const HTML_SCAN_MAX_CHARS = 300_000;
const OEMBED_TIMEOUT_MS = 5_000;

export interface ManualItemMetadata {
  topic?: string;
  author?: string;
  type?: string;
}

export async function deriveManualItemMetadata(
  url: string,
  extracted: ExtractedContent,
): Promise<ManualItemMetadata> {
  const meta: ManualItemMetadata = {};

  const type = detectType(url, extracted);
  if (type) meta.type = type;

  if (extracted.contentType === 'article') {
    if (extracted.title) meta.topic = extracted.title;
    const author =
      extracted.author ?? (await fetchHtmlAuthor(url)) ?? extracted.siteName ?? null;
    if (author) meta.author = author;
  } else if (extracted.contentType === 'embed' && extracted.embedType === 'youtube') {
    const oembed = await fetchYouTubeOEmbed(url);
    if (oembed.title) meta.topic = oembed.title;
    if (oembed.author) meta.author = oembed.author;
  } else if (extracted.contentType === 'embed' && extracted.embedType === 'tweet') {
    const handle = tweetHandleFromUrl(url);
    if (handle) meta.author = `@${handle}`;
  }

  return meta;
}

/** Map onto the defined retrieval types; undefined keeps the insert default. */
function detectType(url: string, extracted: ExtractedContent): string | undefined {
  if (extracted.contentType === 'embed') {
    switch (extracted.embedType) {
      case 'youtube':
        return 'Video';
      case 'spotify':
      case 'apple-podcast':
        return 'Podcast';
      case 'tweet':
        return 'Twitter';
    }
  }
  if (extracted.contentType === 'pdf') return 'Academic Paper';
  if (safeHostname(url)?.includes('substack')) return 'Substack';
  if (extracted.contentType === 'article') return 'News';
  return undefined;
}

function safeHostname(url: string): string | null {
  try {
    return new URL(url).hostname.toLowerCase();
  } catch {
    return null;
  }
}

export function tweetHandleFromUrl(url: string): string | null {
  const match = /(?:twitter\.com|x\.com)\/@?([A-Za-z0-9_]{1,15})\/status\//i.exec(url);
  return match ? match[1] : null;
}

async function fetchYouTubeOEmbed(url: string): Promise<{ title?: string; author?: string }> {
  try {
    const res = await fetch(
      `https://www.youtube.com/oembed?format=json&url=${encodeURIComponent(url)}`,
      { signal: AbortSignal.timeout(OEMBED_TIMEOUT_MS) },
    );
    if (!res.ok) return {};
    const json = (await res.json()) as { title?: string; author_name?: string };
    return { title: json.title || undefined, author: json.author_name || undefined };
  } catch {
    return {};
  }
}

/** GET the page and parse an author out of its HTML. Non-throwing. */
async function fetchHtmlAuthor(url: string): Promise<string | null> {
  try {
    const res = await fetch(url, {
      headers: { 'User-Agent': 'Mozilla/5.0 (compatible; BrainliftBot/1.0)' },
      signal: AbortSignal.timeout(HTML_FETCH_TIMEOUT_MS),
    });
    if (!res.ok) return null;
    const contentType = res.headers.get('content-type') || '';
    if (!contentType.includes('text/html')) return null;
    return parseHtmlAuthor(await res.text());
  } catch {
    return null;
  }
}

/**
 * Pull an author name out of raw HTML: JSON-LD (`schema.org` `author` on
 * Article/BlogPosting/etc., including `@graph` wrappers) first, then
 * `<meta name="author">` / `<meta property="article:author">` (skipping
 * URL-valued article:author, which points at a profile page, not a name).
 */
export function parseHtmlAuthor(html: string): string | null {
  const slice = html.slice(0, HTML_SCAN_MAX_CHARS);

  const ldRe = /<script[^>]*type\s*=\s*["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi;
  let match: RegExpExecArray | null;
  while ((match = ldRe.exec(slice))) {
    try {
      const author = findJsonLdAuthor(JSON.parse(match[1]));
      if (author) return author;
    } catch {
      // Malformed JSON-LD block; keep scanning.
    }
  }

  const metaAuthor =
    matchMetaContent(slice, 'name', 'author') ??
    matchMetaContent(slice, 'property', 'article:author');
  if (metaAuthor && !/^https?:\/\//i.test(metaAuthor)) return metaAuthor;

  return null;
}

function findJsonLdAuthor(node: unknown, depth = 0): string | null {
  if (node == null || depth > 6) return null;
  if (Array.isArray(node)) {
    for (const child of node) {
      const found = findJsonLdAuthor(child, depth + 1);
      if (found) return found;
    }
    return null;
  }
  if (typeof node !== 'object') return null;
  const obj = node as Record<string, unknown>;
  if (obj.author != null) {
    const name = authorName(obj.author);
    if (name) return name;
  }
  if (obj['@graph'] != null) return findJsonLdAuthor(obj['@graph'], depth + 1);
  return null;
}

/** JSON-LD author can be a string, a Person/Organization object, or an array. */
function authorName(author: unknown): string | null {
  if (typeof author === 'string') return author.trim() || null;
  if (Array.isArray(author)) {
    for (const entry of author) {
      const name = authorName(entry);
      if (name) return name;
    }
    return null;
  }
  if (typeof author === 'object' && author != null) {
    const name = (author as Record<string, unknown>).name;
    if (typeof name === 'string') return name.trim() || null;
  }
  return null;
}

function matchMetaContent(html: string, attr: 'name' | 'property', key: string): string | null {
  const escaped = key.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const contentAfter = new RegExp(
    `<meta[^>]*${attr}\\s*=\\s*["']${escaped}["'][^>]*content\\s*=\\s*["']([^"']+)["']`,
    'i',
  );
  const contentBefore = new RegExp(
    `<meta[^>]*content\\s*=\\s*["']([^"']+)["'][^>]*${attr}\\s*=\\s*["']${escaped}["']`,
    'i',
  );
  const found = contentAfter.exec(html) ?? contentBefore.exec(html);
  return found ? decodeBasicEntities(found[1].trim()) || null : null;
}

function decodeBasicEntities(value: string): string {
  return value
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#0?39;/g, "'")
    .replace(/&apos;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>');
}
