/**
 * Tests for FR2: isQuizzableContent utility
 *
 * Pure function -- no mocks needed.
 */

import { describe, it, expect } from 'vitest';
import { isQuizzableContent } from '../item-text-content';
import type { ExtractedContent } from '@shared/schema';

describe('isQuizzableContent', () => {
  it('returns true for article content', () => {
    const ec: ExtractedContent = { contentType: 'article', markdown: '# Hello' };
    expect(isQuizzableContent(ec)).toBe(true);
  });

  it('returns true for YouTube embed', () => {
    const ec: ExtractedContent = { contentType: 'embed', embedType: 'youtube', embedId: 'abc' };
    expect(isQuizzableContent(ec)).toBe(true);
  });

  it('returns false for Spotify embed', () => {
    const ec: ExtractedContent = { contentType: 'embed', embedType: 'spotify', embedId: 'track1' };
    expect(isQuizzableContent(ec)).toBe(false);
  });

  it('returns false for Apple Podcast embed', () => {
    const ec: ExtractedContent = { contentType: 'embed', embedType: 'apple-podcast', embedUrl: 'https://...' };
    expect(isQuizzableContent(ec)).toBe(false);
  });

  it('returns false for tweet embed', () => {
    const ec: ExtractedContent = { contentType: 'embed', embedType: 'tweet', tweetId: '123' };
    expect(isQuizzableContent(ec)).toBe(false);
  });

  it('returns false for PDF content', () => {
    const ec: ExtractedContent = { contentType: 'pdf', url: 'https://example.com/doc.pdf' };
    expect(isQuizzableContent(ec)).toBe(false);
  });

  it('returns false for fallback content', () => {
    const ec: ExtractedContent = { contentType: 'fallback', reason: 'Failed' };
    expect(isQuizzableContent(ec)).toBe(false);
  });
});
