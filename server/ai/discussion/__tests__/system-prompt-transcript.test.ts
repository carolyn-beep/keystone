/**
 * Tests for FR4: Wire Transcript into Discussion Agent (system-prompt.ts)
 *
 * Validates that buildDiscussionSystemPrompt and buildContentNote
 * correctly handle YouTube items with and without transcripts.
 */

import { describe, it, expect } from 'vitest';
import { buildDiscussionSystemPrompt } from '../system-prompt';
import type { LearningStreamItem, Brainlift } from '../../../storage/base';

function makeItem(overrides: Partial<LearningStreamItem> = {}): LearningStreamItem {
  return {
    id: 1,
    brainliftId: 1,
    type: 'Video',
    author: 'Test Channel',
    topic: 'Testing Best Practices',
    time: '10 min',
    facts: 'Key insights about testing',
    url: 'https://www.youtube.com/watch?v=abc123',
    status: 'pending',
    source: 'quick-search',
    quality: null,
    alignment: null,
    relevanceScore: null,
    aiRationale: 'Relevant to testing',
    extractedContent: null,
    createdAt: new Date(),
  } as LearningStreamItem;
}

const mockBrainlift = {
  displayPurpose: 'Learn testing',
  description: 'A brainlift about testing',
  title: 'Testing BrainLift',
} as Pick<Brainlift, 'displayPurpose' | 'description' | 'title'>;

describe('buildDiscussionSystemPrompt - transcript awareness', () => {
  it('includes transcript tool message for YouTube video with transcript', () => {
    const item = makeItem({
      extractedContent: {
        contentType: 'embed',
        embedType: 'youtube',
        embedId: 'abc123',
        transcript: 'Some transcript text',
      } as any,
    });

    const prompt = buildDiscussionSystemPrompt(item, mockBrainlift);

    expect(prompt).toContain('read_article_section');
    expect(prompt).toContain('transcript');
    expect(prompt).not.toContain('cannot access the media content directly');
  });

  it('includes "cannot access" message for YouTube video without transcript', () => {
    const item = makeItem({
      extractedContent: {
        contentType: 'embed',
        embedType: 'youtube',
        embedId: 'abc123',
      },
    });

    const prompt = buildDiscussionSystemPrompt(item, mockBrainlift);

    expect(prompt).toContain('cannot access the media content directly');
  });

  it('preserves article behavior unchanged', () => {
    const item = makeItem({
      type: 'Substack',
      extractedContent: {
        contentType: 'article',
        markdown: 'Some article content',
        title: 'Test Article',
      },
    });

    const prompt = buildDiscussionSystemPrompt(item, mockBrainlift);

    expect(prompt).toContain('full article text via the `read_article_section` tool');
  });
});
