/**
 * Tests for FR3: Text Content Accessor
 *
 * Tests getItemTextContent() utility that extracts text from learning stream items.
 * Mock needed for transitive youtube-transcript import.
 */

import { describe, it, expect, vi } from 'vitest';

vi.mock('../../services/youtube-transcript', () => ({
  fetchYouTubeTranscript: vi.fn(),
}));

import { getItemTextContent } from '../item-text-content';
import type { LearningStreamItem } from '@shared/schema';

// Helper to create a minimal item with specific extractedContent
function makeItem(overrides: Partial<LearningStreamItem> = {}): LearningStreamItem {
  return {
    id: 1,
    brainliftId: 1,
    type: 'Substack',
    author: 'Test Author',
    topic: 'Test Topic',
    time: '5 min',
    facts: 'Some facts',
    url: 'https://example.com',
    status: 'pending',
    source: 'quick-search',
    quality: null,
    alignment: null,
    relevanceScore: null,
    aiRationale: null,
    extractedContent: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  };
}

describe('getItemTextContent', () => {
  describe('article content', () => {
    it('returns markdown for article with extractedContent', () => {
      const item = makeItem({
        extractedContent: {
          contentType: 'article',
          markdown: '# Hello World\n\nThis is an article about testing.',
          title: 'Hello World',
        },
      });

      const result = getItemTextContent(item);
      expect(result).toBe('# Hello World\n\nThis is an article about testing.');
    });

    it('returns markdown even without optional title/siteName', () => {
      const item = makeItem({
        extractedContent: {
          contentType: 'article',
          markdown: 'Plain article text.',
        },
      });

      const result = getItemTextContent(item);
      expect(result).toBe('Plain article text.');
    });
  });

  describe('YouTube embed content', () => {
    it('returns null for YouTube embed (transcripts fetched on demand, not stored)', () => {
      const item = makeItem({
        extractedContent: {
          contentType: 'embed',
          embedType: 'youtube',
          embedId: 'abc123',
        },
      });

      const result = getItemTextContent(item);
      expect(result).toBeNull();
    });
  });

  describe('unsupported content types', () => {
    it('returns null for PDF content', () => {
      const item = makeItem({
        extractedContent: { contentType: 'pdf', url: 'https://example.com/file.pdf' },
      });

      const result = getItemTextContent(item);
      expect(result).toBeNull();
    });

    it('returns null for Spotify embed', () => {
      const item = makeItem({
        extractedContent: { contentType: 'embed', embedType: 'spotify', embedId: 'track123' },
      });

      const result = getItemTextContent(item);
      expect(result).toBeNull();
    });

    it('returns null for Apple Podcast embed', () => {
      const item = makeItem({
        extractedContent: {
          contentType: 'embed',
          embedType: 'apple-podcast',
          embedUrl: 'https://podcasts.apple.com/...',
        },
      });

      const result = getItemTextContent(item);
      expect(result).toBeNull();
    });

    it('returns null for tweet embed', () => {
      const item = makeItem({
        extractedContent: { contentType: 'embed', embedType: 'tweet', tweetId: '12345' },
      });

      const result = getItemTextContent(item);
      expect(result).toBeNull();
    });

    it('returns null for fallback content', () => {
      const item = makeItem({
        extractedContent: { contentType: 'fallback', reason: 'Could not extract' },
      });

      const result = getItemTextContent(item);
      expect(result).toBeNull();
    });
  });

  describe('edge cases', () => {
    it('returns null when extractedContent is null', () => {
      const item = makeItem({ extractedContent: null });

      const result = getItemTextContent(item);
      expect(result).toBeNull();
    });

    it('returns null when extractedContent is undefined', () => {
      const item = makeItem();
      (item as any).extractedContent = undefined;

      const result = getItemTextContent(item);
      expect(result).toBeNull();
    });
  });
});
