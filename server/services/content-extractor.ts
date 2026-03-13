import type { ExtractedContent } from '@shared/schema';

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
 * 4. If HTML → call Jina Reader for article markdown
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
        signal: AbortSignal.timeout(5000),
        redirect: 'follow',
      });
      contentType = headRes.headers.get('content-type') || '';
    } catch {
      // HEAD failed — try Jina anyway (some servers block HEAD)
      contentType = 'text/html';
    }

    // 3. PDF detection
    if (contentType.includes('application/pdf')) {
      return { contentType: 'pdf', url: rawUrl };
    }

    // 4. HTML → Jina Reader for markdown extraction
    if (contentType.includes('text/html') || contentType.includes('text/') || !contentType) {
      return await fetchArticleViaJina(rawUrl);
    }

    // 5. Unsupported content type
    return { contentType: 'fallback', reason: `Unsupported content type: ${contentType}` };
  } catch (error: any) {
    return { contentType: 'fallback', reason: error.message || 'Content extraction failed' };
  }
}

/**
 * Fetch article content via Jina Reader API.
 * Returns markdown with optional title and site name.
 */
async function fetchArticleViaJina(url: string): Promise<ExtractedContent> {
  const apiKey = process.env.JINA_API_KEY;
  if (!apiKey) {
    return { contentType: 'fallback', reason: 'JINA_API_KEY not configured' };
  }

  try {
    const res = await fetch(`https://r.jina.ai/${url}`, {
      method: 'GET',
      headers: {
        Accept: 'application/json',
        Authorization: `Bearer ${apiKey}`,
        'X-Return-Format': 'markdown',
      },
      signal: AbortSignal.timeout(15000),
    });

    if (!res.ok) {
      return { contentType: 'fallback', reason: `Jina Reader returned ${res.status}` };
    }

    // Jina returns JSON with { data: { content, title, ... } } when Accept: application/json
    const json = await res.json();
    const data = json.data || json;
    const markdown = data.content || data.text || '';

    if (!markdown || markdown.length < 50) {
      return { contentType: 'fallback', reason: 'Article content too short or empty' };
    }

    return {
      contentType: 'article',
      markdown,
      title: data.title || undefined,
      siteName: data.siteName || undefined,
    };
  } catch (error: any) {
    if (error.name === 'TimeoutError' || error.name === 'AbortError') {
      return { contentType: 'fallback', reason: 'Article fetch timed out (15s)' };
    }
    return { contentType: 'fallback', reason: `Article fetch failed: ${error.message}` };
  }
}
