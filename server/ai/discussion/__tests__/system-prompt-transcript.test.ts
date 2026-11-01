/**
 * Tests for Discussion Agent system prompt - YouTube transcript awareness
 *
 * Validates that buildDiscussionSystemPrompt tells the agent that
 * YouTube videos have transcript access via read_article_section.
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
    ...overrides,
  } as LearningStreamItem;
}

const mockBrainlift = {
  displayPurpose: 'Learn testing',
  description: 'A brainlift about testing',
  title: 'Testing BrainLift',
} as Pick<Brainlift, 'displayPurpose' | 'description' | 'title'>;

describe('buildDiscussionSystemPrompt - YouTube transcript awareness', () => {
  it('tells agent transcript is available for any YouTube embed', () => {
    const item = makeItem({
      extractedContent: {
        contentType: 'embed',
        embedType: 'youtube',
        embedId: 'abc123',
      },
    });

    const prompt = buildDiscussionSystemPrompt(item, mockBrainlift);

    expect(prompt).toContain('transcript');
    expect(prompt).toContain('read_article_section');
  });

  it('shows "cannot access" for non-YouTube video embeds', () => {
    const item = makeItem({
      extractedContent: {
        contentType: 'embed',
        embedType: 'spotify',
        embedId: 'sp123',
      },
    });

    const prompt = buildDiscussionSystemPrompt(item, mockBrainlift);

    expect(prompt).not.toContain('transcript');
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
