/**
 * Tests for FR4: Wire Transcript into Discussion Agent (tools.ts)
 *
 * Validates that read_article_section returns transcript content for
 * YouTube items with transcripts, and preserves existing behavior otherwise.
 *
 * Mocks: storage module (getLearningStreamItemById)
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock storage
vi.mock('../../../storage', () => ({
  storage: {
    getLearningStreamItemById: vi.fn(),
    getLearningStreamContext: vi.fn(),
  },
}));

// Mock withJob
vi.mock('../../../utils/withJob', () => ({
  withJob: vi.fn(() => ({
    forPayload: vi.fn().mockReturnThis(),
    withOptions: vi.fn().mockReturnThis(),
    queue: vi.fn().mockResolvedValue(undefined),
  })),
}));

// Mock storage/base for db, eq, sql etc
vi.mock('../../../storage/base', () => ({
  db: { select: vi.fn(), insert: vi.fn() },
  eq: vi.fn(),
  sql: vi.fn(),
  facts: {},
  learningStreamItems: {},
}));

// Mock storage/dok2
vi.mock('../../../storage/dok2', () => ({
  saveSingleDOK2Summary: vi.fn(),
}));

import { storage } from '../../../storage';
import { buildDiscussionTools } from '../tools';
import type { LearningStreamItem, Brainlift } from '../../../storage/base';

const mockGetItem = vi.mocked(storage.getLearningStreamItemById);

const mockItem: LearningStreamItem = {
  id: 42,
  brainliftId: 1,
  type: 'Video',
  author: 'Test Channel',
  topic: 'Understanding Testing',
  time: '10 min',
  facts: 'Key facts',
  url: 'https://www.youtube.com/watch?v=abc123',
  status: 'pending',
  source: 'quick-search',
  quality: null,
  alignment: null,
  relevanceScore: null,
  aiRationale: null,
  extractedContent: null,
  createdAt: new Date(),
} as LearningStreamItem;

const mockBrainlift = {
  id: 1,
  displayPurpose: 'Learn about testing',
  description: 'Testing brainlift',
} as Pick<Brainlift, 'id' | 'displayPurpose' | 'description'>;

beforeEach(() => {
  vi.clearAllMocks();
});

describe('read_article_section - YouTube transcript', () => {
  it('returns transcript text for YouTube item with transcript', async () => {
    mockGetItem.mockResolvedValue({
      ...mockItem,
      extractedContent: {
        contentType: 'embed',
        embedType: 'youtube',
        embedId: 'abc123',
        transcript: 'This is the video transcript about software testing best practices.',
      } as any,
    });

    const tools = buildDiscussionTools(mockItem, mockBrainlift);
    const result = await tools.read_article_section.execute({}, { toolCallId: 'test', messages: [], abortSignal: undefined as any });

    expect(result).toEqual({
      contentType: 'transcript',
      title: 'Understanding Testing',
      markdown: 'This is the video transcript about software testing best practices.',
    });
  });

  it('caps transcript at ~3000 words', async () => {
    const longTranscript = Array(4000).fill('word').join(' ');
    mockGetItem.mockResolvedValue({
      ...mockItem,
      extractedContent: {
        contentType: 'embed',
        embedType: 'youtube',
        embedId: 'abc123',
        transcript: longTranscript,
      } as any,
    });

    const tools = buildDiscussionTools(mockItem, mockBrainlift);
    const result = await tools.read_article_section.execute({}, { toolCallId: 'test', messages: [], abortSignal: undefined as any });

    expect(result.contentType).toBe('transcript');
    const wordCount = (result as any).markdown.split(/\s+/).length;
    // 3000 words + truncation notice
    expect(wordCount).toBeLessThanOrEqual(3010);
    expect((result as any).markdown).toContain('[Content truncated');
  });

  it('returns "cannot read" message for YouTube item without transcript', async () => {
    mockGetItem.mockResolvedValue({
      ...mockItem,
      extractedContent: {
        contentType: 'embed',
        embedType: 'youtube',
        embedId: 'abc123',
      },
    });

    const tools = buildDiscussionTools(mockItem, mockBrainlift);
    const result = await tools.read_article_section.execute({}, { toolCallId: 'test', messages: [], abortSignal: undefined as any });

    expect(result).toEqual({
      contentType: 'embed',
      embedType: 'youtube',
      message: expect.stringContaining('cannot read the media content directly'),
    });
  });

  it('preserves existing behavior for non-YouTube embeds', async () => {
    mockGetItem.mockResolvedValue({
      ...mockItem,
      extractedContent: {
        contentType: 'embed',
        embedType: 'spotify',
        embedId: 'sp123',
      },
    });

    const tools = buildDiscussionTools(mockItem, mockBrainlift);
    const result = await tools.read_article_section.execute({}, { toolCallId: 'test', messages: [], abortSignal: undefined as any });

    expect(result).toEqual({
      contentType: 'embed',
      embedType: 'spotify',
      message: expect.stringContaining('cannot read the media content directly'),
    });
  });
});
