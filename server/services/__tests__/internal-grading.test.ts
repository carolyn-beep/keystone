/**
 * Tests for FR7: Service Layer (internal-grading.ts)
 *
 * Tests processGradeRequest orchestration: parse -> extract -> create -> queue.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

const { mockParseMarkdownBrainlift, mockExtractBrainlift, mockCreateBrainlift, mockWithJob, mockQueueFn } = vi.hoisted(() => {
  const mockQueueFn = vi.fn().mockResolvedValue('job-123');
  return {
    mockParseMarkdownBrainlift: vi.fn(),
    mockExtractBrainlift: vi.fn(),
    mockCreateBrainlift: vi.fn(),
    mockWithJob: vi.fn(),
    mockQueueFn,
  };
});

vi.mock('../../utils/markdown-brainlift-parser', () => ({
  parseMarkdownBrainlift: mockParseMarkdownBrainlift,
}));

vi.mock('../../ai/brainliftExtractor', () => ({
  extractBrainlift: mockExtractBrainlift,
}));

vi.mock('../../storage', () => ({
  storage: {
    createBrainlift: mockCreateBrainlift,
    updateImportStatus: vi.fn(),
    getBrainliftBySlug: vi.fn().mockResolvedValue(null), // No conflicts by default
  },
}));

vi.mock('../../utils/withJob', () => ({
  withJob: mockWithJob,
}));

beforeEach(() => {
  vi.clearAllMocks();

  // Default: withJob returns chainable object
  mockWithJob.mockReturnValue({
    forPayload: vi.fn().mockReturnValue({
      queue: mockQueueFn,
    }),
  });
});

describe('processGradeRequest', () => {
  it('parses markdown, extracts, creates brainlift, and queues job', async () => {
    mockParseMarkdownBrainlift.mockReturnValue({
      markdown: '# BL\n\nContent',
      hierarchy: [{ id: '1', text: 'Root', children: [] }],
    });

    mockExtractBrainlift.mockResolvedValue({
      title: 'Test BL',
      description: 'Test description',
      owner: null,
      classification: 'brainlift',
      summary: { totalFacts: 5, meanScore: '0', score5Count: 0, contradictionCount: 0 },
      facts: [
        { id: '1', category: 'Cat', source: 'S', fact: 'F1', score: 0, aiNotes: '', contradicts: null },
      ],
      contradictionClusters: [],
      dok2Summaries: [],
      dok3Insights: [],
      dok4Spovs: [],
    });

    mockCreateBrainlift.mockResolvedValue({
      id: 42,
      slug: 'test-bl',
      title: 'Test BL',
      importStatus: 'pending',
    });

    const { processGradeRequest } = await import('../internal-grading');
    const result = await processGradeRequest('# BL\n\nContent', undefined, 'user-1');

    expect(result).toEqual({ slug: 'test-bl', brainliftId: 42 });
    expect(mockParseMarkdownBrainlift).toHaveBeenCalledWith('# BL\n\nContent');
    expect(mockExtractBrainlift).toHaveBeenCalled();
    expect(mockCreateBrainlift).toHaveBeenCalled();
    const createCall = mockCreateBrainlift.mock.calls[0];
    expect(createCall[0].origin).toBe('mcp');
    expect(mockWithJob).toHaveBeenCalledWith('internal:grade');
    expect(mockQueueFn).toHaveBeenCalled();
  });

  it('uses provided title override', async () => {
    mockParseMarkdownBrainlift.mockReturnValue({
      markdown: '# BL',
      hierarchy: [{ id: '1', text: 'Root', children: [] }],
    });

    mockExtractBrainlift.mockResolvedValue({
      title: 'Original Title',
      description: 'Desc',
      owner: null,
      classification: 'brainlift',
      summary: { totalFacts: 1, meanScore: '0', score5Count: 0, contradictionCount: 0 },
      facts: [{ id: '1', category: 'Cat', source: null, fact: 'F', score: 0, aiNotes: '', contradicts: null }],
      contradictionClusters: [],
    });

    mockCreateBrainlift.mockResolvedValue({
      id: 43,
      slug: 'custom-title',
      title: 'Custom Title',
      importStatus: 'pending',
    });

    const { processGradeRequest } = await import('../internal-grading');
    await processGradeRequest('# BL', 'Custom Title', 'user-1');

    // The title override should be passed to createBrainlift
    const createCall = mockCreateBrainlift.mock.calls[0];
    expect(createCall[0].title).toBe('Custom Title');
  });

  it('throws when the slug for the title is already taken (JLS-143)', async () => {
    const { storage } = await import('../../storage');

    // Slug already exists for the agent's chosen title.
    (storage.getBrainliftBySlug as any).mockResolvedValueOnce({
      id: 1,
      slug: 'test-bl',
    });

    mockParseMarkdownBrainlift.mockReturnValue({
      markdown: '# BL',
      hierarchy: [{ id: '1', text: 'Root', children: [] }],
    });

    mockExtractBrainlift.mockResolvedValue({
      title: 'Test BL',
      description: 'Desc',
      owner: null,
      classification: 'brainlift',
      summary: { totalFacts: 1, meanScore: '0', score5Count: 0, contradictionCount: 0 },
      facts: [{ id: '1', category: 'Cat', source: null, fact: 'F', score: 0, aiNotes: '', contradicts: null }],
      contradictionClusters: [],
      dok2Summaries: [],
      dok3Insights: [],
      dok4Spovs: [],
    });

    const { processGradeRequest } = await import('../internal-grading');

    await expect(
      processGradeRequest('# BL\n\nContent', undefined, 'user-1'),
    ).rejects.toThrow(/already exists/i);

    expect(mockCreateBrainlift).not.toHaveBeenCalled();
  });

  it('throws BadRequestError for empty markdown', async () => {
    const { processGradeRequest } = await import('../internal-grading');

    await expect(processGradeRequest('', undefined, 'user-1')).rejects.toThrow(
      /markdown/i,
    );
  });

  it('throws BadRequestError when extraction yields 0 facts', async () => {
    mockParseMarkdownBrainlift.mockReturnValue({
      markdown: '# BL',
      hierarchy: [],
    });

    mockExtractBrainlift.mockResolvedValue({
      title: 'Empty BL',
      description: 'Nothing here',
      owner: null,
      classification: 'brainlift',
      summary: { totalFacts: 0, meanScore: '0', score5Count: 0, contradictionCount: 0 },
      facts: [],
      contradictionClusters: [],
    });

    const { processGradeRequest } = await import('../internal-grading');

    await expect(processGradeRequest('# BL', undefined, 'user-1')).rejects.toThrow(
      /facts/i,
    );
  });
});
