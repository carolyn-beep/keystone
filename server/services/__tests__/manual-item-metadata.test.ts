/**
 * Tests for manual-item-metadata: deriving topic/author/type for pasted
 * manual learning-stream items from their extracted content + page HTML.
 *
 * Network-dependent paths (YouTube oEmbed, HTML author fetch) are exercised
 * through a mocked global fetch.
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  deriveManualItemMetadata,
  parseHtmlAuthor,
  tweetHandleFromUrl,
} from '../manual-item-metadata';

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('deriveManualItemMetadata: type mapping', () => {
  it('maps embeds onto the defined retrieval types', async () => {
    // The youtube path calls oEmbed; keep the test off the network.
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false }));
    expect(
      (await deriveManualItemMetadata('https://youtube.com/watch?v=x', {
        contentType: 'embed',
        embedType: 'youtube',
        embedId: 'x',
      })).type,
    ).toBe('Video');
    expect(
      (await deriveManualItemMetadata('https://open.spotify.com/episode/x', {
        contentType: 'embed',
        embedType: 'spotify',
        embedId: 'x',
      })).type,
    ).toBe('Podcast');
    expect(
      (await deriveManualItemMetadata('https://x.com/someone/status/1', {
        contentType: 'embed',
        embedType: 'tweet',
        tweetId: '1',
      })).type,
    ).toBe('Twitter');
  });

  it('maps pdf → Academic Paper and substack hosts → Substack', async () => {
    expect(
      (await deriveManualItemMetadata('https://arxiv.org/pdf/123.pdf', {
        contentType: 'pdf',
        url: 'https://arxiv.org/pdf/123.pdf',
      })).type,
    ).toBe('Academic Paper');
    const substack = await deriveManualItemMetadata('https://kevin.substack.com/p/post', {
      contentType: 'article',
      markdown: 'body',
      title: 'A Post',
      author: 'Kevin',
    });
    expect(substack.type).toBe('Substack');
  });

  it('keeps the insert default (no type) for fallback extractions on unknown hosts', async () => {
    const meta = await deriveManualItemMetadata('https://example.com/page', {
      contentType: 'fallback',
      reason: 'nope',
    });
    expect(meta.type).toBeUndefined();
  });
});

describe('deriveManualItemMetadata: article title/author', () => {
  it('uses the extracted title and Exa author without fetching HTML', async () => {
    const fetchSpy = vi.fn();
    vi.stubGlobal('fetch', fetchSpy);
    const meta = await deriveManualItemMetadata('https://news.example.com/story', {
      contentType: 'article',
      markdown: 'body',
      title: 'The Story',
      author: 'Jane Doe',
      siteName: 'Example News',
    });
    expect(meta).toEqual({ type: 'News', topic: 'The Story', author: 'Jane Doe' });
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('falls back to parsing the page HTML for an author, then to siteName', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      headers: new Headers({ 'content-type': 'text/html; charset=utf-8' }),
      text: async () =>
        '<html><head><meta name="author" content="HTML Author"></head></html>',
    }));
    const meta = await deriveManualItemMetadata('https://news.example.com/story', {
      contentType: 'article',
      markdown: 'body',
      title: 'The Story',
      siteName: 'Example News',
    });
    expect(meta.author).toBe('HTML Author');

    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('offline')));
    const offline = await deriveManualItemMetadata('https://news.example.com/story', {
      contentType: 'article',
      markdown: 'body',
      siteName: 'Example News',
    });
    expect(offline.author).toBe('Example News');
  });
});

describe('deriveManualItemMetadata: youtube + tweet', () => {
  it('uses YouTube oEmbed for title and channel name', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ title: 'A Video', author_name: 'A Channel' }),
    }));
    const meta = await deriveManualItemMetadata('https://www.youtube.com/watch?v=abc', {
      contentType: 'embed',
      embedType: 'youtube',
      embedId: 'abc',
    });
    expect(meta).toEqual({ type: 'Video', topic: 'A Video', author: 'A Channel' });
  });

  it('derives the tweet author from the URL handle, no network needed', async () => {
    const fetchSpy = vi.fn();
    vi.stubGlobal('fetch', fetchSpy);
    const meta = await deriveManualItemMetadata('https://x.com/naval/status/123', {
      contentType: 'embed',
      embedType: 'tweet',
      tweetId: '123',
    });
    expect(meta.author).toBe('@naval');
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('tweetHandleFromUrl handles twitter.com, x.com, and rejects non-status URLs', () => {
    expect(tweetHandleFromUrl('https://twitter.com/jack/status/20')).toBe('jack');
    expect(tweetHandleFromUrl('https://x.com/jack/status/20')).toBe('jack');
    expect(tweetHandleFromUrl('https://x.com/jack')).toBeNull();
  });
});

describe('parseHtmlAuthor', () => {
  it('reads a JSON-LD author string', () => {
    const html = `<html><head><script type="application/ld+json">
      {"@type":"NewsArticle","headline":"H","author":"Ada Lovelace"}
    </script></head></html>`;
    expect(parseHtmlAuthor(html)).toBe('Ada Lovelace');
  });

  it('reads a JSON-LD Person object, arrays, and @graph wrappers', () => {
    const person = `<script type="application/ld+json">
      {"@graph":[{"@type":"WebPage"},{"@type":"Article","author":{"@type":"Person","name":"Grace Hopper"}}]}
    </script>`;
    expect(parseHtmlAuthor(person)).toBe('Grace Hopper');
    const list = `<script type="application/ld+json">
      [{"@type":"Article","author":[{"name":"First Author"},{"name":"Second"}]}]
    </script>`;
    expect(parseHtmlAuthor(list)).toBe('First Author');
  });

  it('falls back to meta tags and skips URL-valued article:author', () => {
    expect(
      parseHtmlAuthor('<meta content="Meta Author" name="author">'),
    ).toBe('Meta Author');
    expect(
      parseHtmlAuthor('<meta property="article:author" content="https://facebook.com/profile">'),
    ).toBeNull();
  });

  it('survives malformed JSON-LD and decodes basic entities', () => {
    const html = `<script type="application/ld+json">{not json}</script>
      <meta name="author" content="O&#39;Brien &amp; Co">`;
    expect(parseHtmlAuthor(html)).toBe("O'Brien & Co");
  });

  it('returns null when nothing is found', () => {
    expect(parseHtmlAuthor('<html><body>hi</body></html>')).toBeNull();
  });
});
