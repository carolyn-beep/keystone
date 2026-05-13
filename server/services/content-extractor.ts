import type { ExtractedContent } from '@shared/schema';

const EXA_CONTENTS_URL = 'https://api.exa.ai/contents';
const HEAD_TIMEOUT_MS = 5_000;
const ARTICLE_FETCH_TIMEOUT_MS = 15_000;
const EXA_CONTENTS_TEXT_MAX_CHARACTERS = 20_000;
const MIN_ARTICLE_CONTENT_CHARS = 50;

interface ExaContentsResult {
  url?: string;
  title?: string;
  text?: string;
}

interface ExaContentsStatus {
  id?: string;
  status?: 'success' | 'error';
  error?: {
    tag?: string;
    httpStatusCode?: number;
  };
}

interface ExaContentsResponse {
  results?: ExaContentsResult[];
  statuses?: ExaContentsStatus[];
}

// === Embed pattern matchers (pure URL parsing, no network) ===

const EMBED_PATTERNS: Array<{
  test: (url: URL) => boolean;
  extract: (url: URL) => ExtractedContent;
}> = [
  // YouTube: youtube.com/watch?v=ID, youtu.be/ID, youtube.com/embed/ID
  {
    test: (url) =>
      (url.hostname === 'www.youtube.com' || url.hostname === 'youtube.com') &&
      (url.pathname === '/watch' || url.pathname.startsWith('/embed/')),
    extract: (url) => {
      const id = url.pathname.startsWith('/embed/')
        ? url.pathname.split('/embed/')[1]
        : url.searchParams.get('v');
      return { contentType: 'embed', embedType: 'youtube', embedId: id || '' };
    },
  },
  {
    test: (url) => url.hostname === 'youtu.be',
    extract: (url) => ({
      contentType: 'embed',
      embedType: 'youtube',
      embedId: url.pathname.slice(1),
    }),
  },
  // Spotify: open.spotify.com/episode/ID
  {
    test: (url) =>
      url.hostname === 'open.spotify.com' && url.pathname.startsWith('/episode/'),
    extract: (url) => ({
      contentType: 'embed',
      embedType: 'spotify',
      embedId: url.pathname.split('/episode/')[1]?.split('?')[0] || '',
    }),
  },
  // Apple Podcasts: podcasts.apple.com/*/podcast/*/id*
  {
    test: (url) =>
      url.hostname === 'podcasts.apple.com' && url.pathname.includes('/podcast/'),
    extract: (url) => ({
      contentType: 'embed',
      embedType: 'apple-podcast',
      embedUrl: url.href.replace('podcasts.apple.com', 'embed.podcasts.apple.com'),
    }),
  },
  // Twitter/X: twitter.com/*/status/ID or x.com/*/status/ID
  {
    test: (url) =>
      (url.hostname === 'twitter.com' ||
        url.hostname === 'www.twitter.com' ||
        url.hostname === 'x.com' ||
        url.hostname === 'www.x.com') &&
      url.pathname.includes('/status/'),
    extract: (url) => {
      const match = url.pathname.match(/\/status\/(\d+)/);
      return {
        contentType: 'embed',
        embedType: 'tweet',
        tweetId: match?.[1] || '',
      };
    },
  },
];

/**
 * Extract viewable content from a URL.
 *
 * Strategy:
 * 1. Try embed pattern matchers first (YouTube, Spotify, Apple Podcasts, Twitter/X) — pure URL parsing, no network
 * 2. HEAD request to detect content type (5s timeout)
 * 3. If PDF → return { contentType: 'pdf', url }
 * 4. If HTML → call Exa Contents for article text
 * 5. Fallback for errors/unsupported types
 */
export async function extractContent(rawUrl: string): Promise<ExtractedContent> {
  try {
    const url = new URL(rawUrl);

    // 1. Check embed patterns (instant, no network)
    for (const pattern of EMBED_PATTERNS) {
      if (pattern.test(url)) {
        return pattern.extract(url);
      }
    }

    // 2. HEAD request to detect content type
    let contentType: string;
    try {
      const headRes = await fetch(rawUrl, {
        method: 'HEAD',
        signal: AbortSignal.timeout(HEAD_TIMEOUT_MS),
        redirect: 'follow',
      });
      contentType = headRes.headers.get('content-type') || '';
    } catch {
      // HEAD failed — try Exa anyway (some servers block HEAD)
      contentType = 'text/html';
    }

    // 3. PDF detection
    if (contentType.includes('application/pdf')) {
      return { contentType: 'pdf', url: rawUrl };
    }

    // 4. HTML/text → Exa Contents for article extraction
    if (contentType.includes('text/html') || contentType.includes('text/') || !contentType) {
      return await fetchArticleViaExaContents(rawUrl);
    }

    // 5. Unsupported content type
    return { contentType: 'fallback', reason: `Unsupported content type: ${contentType}` };
  } catch (error: any) {
    return { contentType: 'fallback', reason: error.message || 'Content extraction failed' };
  }
}

/**
 * Fetch article content via Exa Contents API.
 * Returns text in the existing article markdown field for compatibility.
 */
async function fetchArticleViaExaContents(url: string): Promise<ExtractedContent> {
  const apiKey = process.env.EXA_API_KEY;
  if (!apiKey) {
    return { contentType: 'fallback', reason: 'EXA_API_KEY not configured' };
  }

  try {
    const res = await fetch(EXA_CONTENTS_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
      },
      body: JSON.stringify({
        urls: [url],
        text: { maxCharacters: EXA_CONTENTS_TEXT_MAX_CHARACTERS },
        livecrawlTimeout: ARTICLE_FETCH_TIMEOUT_MS,
      }),
      signal: AbortSignal.timeout(ARTICLE_FETCH_TIMEOUT_MS),
    });

    if (!res.ok) {
      return { contentType: 'fallback', reason: `Exa Contents returned ${res.status}` };
    }

    const json = await res.json() as ExaContentsResponse;
    const statusFailure = getExaContentsStatusFailureReason(json);
    if (statusFailure) {
      return { contentType: 'fallback', reason: statusFailure };
    }

    const data = json.results?.[0];
    const markdown = data?.text?.trim() || '';

    if (!markdown || markdown.length < MIN_ARTICLE_CONTENT_CHARS) {
      return { contentType: 'fallback', reason: 'Article content too short or empty' };
    }

    return {
      contentType: 'article',
      markdown,
      title: data?.title || undefined,
      siteName: getSiteName(data?.url || url),
    };
  } catch (error: any) {
    if (error.name === 'TimeoutError' || error.name === 'AbortError') {
      return { contentType: 'fallback', reason: 'Article fetch timed out (15s)' };
    }
    return { contentType: 'fallback', reason: `Article fetch failed: ${error.message}` };
  }
}

function getExaContentsStatusFailureReason(payload: ExaContentsResponse): string | null {
  const failedStatus = payload.statuses?.find((status) => status.status === 'error');
  if (!failedStatus) {
    return null;
  }

  const tag = failedStatus.error?.tag || 'unknown error';
  const statusCode = failedStatus.error?.httpStatusCode;
  return `Exa Contents could not fetch URL: ${tag}${statusCode ? ` (${statusCode})` : ''}`;
}

function getSiteName(value: string): string | undefined {
  try {
    return new URL(value).hostname;
  } catch {
    return undefined;
  }
}
