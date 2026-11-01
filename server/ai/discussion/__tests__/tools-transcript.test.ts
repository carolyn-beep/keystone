/**
 * Tests for Discussion Agent tools - YouTube transcript on-demand fetch
 *
 * Validates that read_article_section fetches transcripts on demand
 * via ensureItemTextContent for YouTube items.
 *
 * Mocks: storage, withJob, ensureItemTextContent
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../../../storage', () => ({
  storage: {
    getLearningStreamItemById: vi.fn(),
    getLearningStreamContext: vi.fn(),
  },
}));

vi.mock('../../../utils/withJob', () => ({
  withJob: vi.fn(() => ({
    forPayload: vi.fn().mockReturnThis(),
    withOptions: vi.fn().mockReturnThis(),
    queue: vi.fn().mockResolvedValue(undefined),
  })),
}));

vi.mock('../../../storage/base', () => ({
  db: { select: vi.fn(), insert: vi.fn() },
  eq: vi.fn(),
  sql: vi.fn(),
  facts: {},
  learningStreamItems: {},
}));

vi.mock('../../../storage/dok2', () => ({
  saveSingleDOK2Summary: vi.fn(),
}));

vi.mock('../../../utils/item-text-content', () => ({
  ensureItemTextContent: vi.fn(),
}));

import { storage } from '../../../storage';
import { ensureItemTextContent } from '../../../utils/item-text-content';
import { buildDiscussionTools } from '../tools';
import type { LearningStreamItem, Brainlift } from '../../../storage/base';

const mockGetItem = vi.mocked(storage.getLearningStreamItemById);
const mockEnsureContent = vi.mocked(ensureItemTextContent);

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
  mockEnsureContent.mockResolvedValue(null);
});

describe('read_article_section - YouTube transcript on-demand', () => {
  it('returns transcript fetched on demand for YouTube item', async () => {
    const freshItem = {
      ...mockItem,
      extractedContent: {
        contentType: 'embed' as const,
        embedType: 'youtube' as const,
        embedId: 'abc123',
      },
    };
    mockGetItem.mockResolvedValue(freshItem);
    mockEnsureContent.mockResolvedValue('This is the video transcript about testing.');

    const tools = buildDiscussionTools(mockItem, mockBrainlift);
    const result = await tools.read_article_section.execute({}, { toolCallId: 'test', messages: [], abortSignal: undefined as any });

    expect(mockEnsureContent).toHaveBeenCalledWith(freshItem);
    expect(result).toEqual({
      contentType: 'transcript',
      title: 'Understanding Testing',
      markdown: 'This is the video transcript about testing.',
    });
  });

  it('returns "cannot read" when transcript is unavailable', async () => {
    mockGetItem.mockResolvedValue({
      ...mockItem,
      extractedContent: {
        contentType: 'embed' as const,
        embedType: 'youtube' as const,
        embedId: 'abc123',
      },
    });
    mockEnsureContent.mockResolvedValue(null);

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
        contentType: 'embed' as const,
        embedType: 'spotify' as const,
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
