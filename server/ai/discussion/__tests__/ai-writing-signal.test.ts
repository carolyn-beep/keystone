/**
 * Tests for Spec 03 FR2 + FR3: Discussion Panel AI Writing Signal integration.
 *
 * FR2: `save_dok2_summary` description carries the canonical warning sentence
 *      (byte-identical to the chat curation tool warning).
 * FR3: `get_brainlift_context` builder-mode response carries snake_case
 *      `ai_writing_signal` per DOK2 summary in `itemExtraction.summaries`.
 *      The non-builder branch and the research branch do not enrich any list.
 */

import { describe, expect, it, vi, beforeEach } from 'vitest';

const mockGetLabelsByEntities = vi.fn();
const mockGetItemDetail = vi.fn();
const mockGetLearningStreamContext = vi.fn();

vi.mock('../../../storage', () => ({
  storage: {
    getLearningStreamItemById: vi.fn(),
    getLearningStreamContext: (...args: unknown[]) => mockGetLearningStreamContext(...args),
    getItemDetail: (...args: unknown[]) => mockGetItemDetail(...args),
    getSourcesByBrainlift: vi.fn().mockResolvedValue([]),
  },
}));

vi.mock('../../../storage/pangramAssessments', () => ({
  pangramAssessmentsStorage: {
    getLabelsByEntities: (...args: unknown[]) => mockGetLabelsByEntities(...args),
  },
}));

vi.mock('../../../storage/dok2', () => ({
  saveSingleDOK2Summary: vi.fn(),
}));

vi.mock('../../../storage/knowledge-tree', () => ({
  autoBookmarkIfPending: vi.fn(),
}));

vi.mock('../../../utils/withJob', () => ({
  withJob: vi.fn(() => ({
    forPayload: vi.fn().mockReturnThis(),
    withOptions: vi.fn().mockReturnThis(),
    queue: vi.fn().mockResolvedValue(undefined),
  })),
}));

vi.mock('../../../utils/item-text-content', () => ({
  ensureItemTextContent: vi.fn(),
}));

vi.mock('../../chat/tools/second-brain', () => ({
  buildSecondBrainChatTools: vi.fn(() => ({
    save_source: { description: 'sb save_source', inputSchema: {}, execute: vi.fn() },
    save_note: { description: 'sb save_note', inputSchema: {}, execute: vi.fn() },
    create_category: { description: 'sb create_category', inputSchema: {}, execute: vi.fn() },
    list_sources: { description: 'sb list_sources', inputSchema: {}, execute: vi.fn() },
    list_notes: { description: 'sb list_notes', inputSchema: {}, execute: vi.fn() },
    list_categories: { description: 'sb list_categories', inputSchema: {}, execute: vi.fn() },
  })),
}));

vi.mock('../../../storage/base', () => ({
  db: {
    select: vi.fn(() => ({
      from: vi.fn(() => ({
        where: vi.fn(() => Promise.resolve([{ maxId: '0' }])),
      })),
    })),
    insert: vi.fn(() => ({
      values: vi.fn(() => ({ returning: vi.fn(() => Promise.resolve([{ id: 1 }])) })),
    })),
  },
  eq: vi.fn(),
  sql: vi.fn(),
  facts: {},
  learningStreamItems: {},
}));

import { buildDiscussionTools } from '../tools';
import { AI_WRITING_SIGNAL_TOOL_WARNING } from '../../chat/tools/curation';
import type { LearningStreamItem, Brainlift } from '../../../storage/base';

const mockItem: LearningStreamItem = {
  id: 42,
  brainliftId: 5,
  type: 'Article',
  author: 'Author',
  topic: 'Topic',
  time: '5 min',
  facts: '',
  url: 'https://example.com',
  status: 'bookmarked',
  source: 'manual',
  extractedContent: null,
  createdAt: new Date(),
} as LearningStreamItem;

const authoringBrainlift: Pick<Brainlift, 'id' | 'displayPurpose' | 'description' | 'phase'> = {
  id: 5,
  displayPurpose: 'Purpose',
  description: 'Description',
  phase: 'authoring',
};

const researchBrainlift: Pick<Brainlift, 'id' | 'displayPurpose' | 'description' | 'phase'> = {
  id: 5,
  displayPurpose: 'Purpose',
  description: 'Description',
  phase: 'research',
};

const fakeAuthContext = { userId: 'user-1', role: 'user', isAdmin: false } as any;

beforeEach(() => {
  vi.clearAllMocks();
});

describe('FR2: save_dok2_summary description contains warning sentence', () => {
  it('authoring + non-builder mode', () => {
    const tools = buildDiscussionTools(mockItem, authoringBrainlift, fakeAuthContext);
    expect((tools as any).save_dok2_summary.description).toContain(AI_WRITING_SIGNAL_TOOL_WARNING);
  });

  it('authoring + builder mode', () => {
    const tools = buildDiscussionTools(mockItem, authoringBrainlift, fakeAuthContext, {
      mode: 'builder',
    });
    expect((tools as any).save_dok2_summary.description).toContain(AI_WRITING_SIGNAL_TOOL_WARNING);
  });

  it('save_dok1_fact does NOT contain the warning', () => {
    const tools = buildDiscussionTools(mockItem, authoringBrainlift, fakeAuthContext);
    expect((tools as any).save_dok1_fact.description).not.toContain(AI_WRITING_SIGNAL_TOOL_WARNING);
  });

  it('read-tool descriptions do NOT contain the warning', () => {
    const tools = buildDiscussionTools(mockItem, authoringBrainlift, fakeAuthContext);
    expect((tools as any).get_brainlift_context.description).not.toContain(
      AI_WRITING_SIGNAL_TOOL_WARNING,
    );
    expect((tools as any).read_article_section.description).not.toContain(
      AI_WRITING_SIGNAL_TOOL_WARNING,
    );
  });

  it('no description in the discussion tool set contains "pangram" (case-insensitive)', () => {
    const tools = buildDiscussionTools(mockItem, authoringBrainlift, fakeAuthContext, {
      mode: 'builder',
    });
    for (const [name, t] of Object.entries(tools)) {
      const desc = (t as any).description as string | undefined;
      if (typeof desc === 'string') {
        expect(
          desc.toLowerCase(),
          `${name}.description should not contain "pangram"`,
        ).not.toContain('pangram');
      }
    }
  });

  it('save_dok2_summary is absent in research mode', () => {
    const tools = buildDiscussionTools(mockItem, researchBrainlift, fakeAuthContext);
    expect(tools).not.toHaveProperty('save_dok2_summary');
    expect(tools).not.toHaveProperty('save_dok1_fact');
  });
});

describe('FR3: get_brainlift_context surfaces ai_writing_signal in builder mode', () => {
  it('returns ai_writing_signal per summary (snake_case)', async () => {
    mockGetLearningStreamContext.mockResolvedValue({
      facts: [],
      experts: [],
      existingTopics: [],
    });
    mockGetItemDetail.mockResolvedValue({
      learningStreamItem: mockItem,
      facts: [],
      summaries: [
        { id: 10, text: ['Point A'], learningStreamItemId: 42, relatedFactIds: [] },
        { id: 20, text: ['Point B'], learningStreamItemId: 42, relatedFactIds: [] },
      ],
      extractionCounts: { facts: 0, summaries: 2 },
      categoryId: null,
      categoryName: null,
    });
    mockGetLabelsByEntities.mockResolvedValue(
      new Map([
        [10, 'human'],
        [20, null],
      ]),
    );

    const tools = buildDiscussionTools(mockItem, authoringBrainlift, fakeAuthContext, {
      mode: 'builder',
    });
    const result: any = await (tools as any).get_brainlift_context.execute(
      {},
      { toolCallId: 'tc', messages: [], abortSignal: new AbortController().signal },
    );

    expect(mockGetLabelsByEntities).toHaveBeenCalledWith('dok2_summary', [10, 20]);
    expect(result.itemExtraction.summaries).toEqual([
      { id: 10, preview: 'Point A', ai_writing_signal: 'human' },
      { id: 20, preview: 'Point B', ai_writing_signal: null },
    ]);

    // Snake-case persistence through JSON
    const json = JSON.stringify(result);
    expect(json).toContain('"ai_writing_signal"');
    expect(json).not.toContain('"aiWritingSignal"');
  });

  it('summaries with no Pangram row → ai_writing_signal: null', async () => {
    mockGetLearningStreamContext.mockResolvedValue({
      facts: [],
      experts: [],
      existingTopics: [],
    });
    mockGetItemDetail.mockResolvedValue({
      learningStreamItem: mockItem,
      facts: [],
      summaries: [
        { id: 30, text: ['Only point'], learningStreamItemId: 42, relatedFactIds: [] },
      ],
      extractionCounts: { facts: 0, summaries: 1 },
      categoryId: null,
      categoryName: null,
    });
    mockGetLabelsByEntities.mockResolvedValue(new Map());

    const tools = buildDiscussionTools(mockItem, authoringBrainlift, fakeAuthContext, {
      mode: 'builder',
    });
    const result: any = await (tools as any).get_brainlift_context.execute(
      {},
      { toolCallId: 'tc', messages: [], abortSignal: new AbortController().signal },
    );

    expect(result.itemExtraction.summaries).toEqual([
      { id: 30, preview: 'Only point', ai_writing_signal: null },
    ]);
  });

  it('empty summaries array still calls getLabelsByEntities with []', async () => {
    mockGetLearningStreamContext.mockResolvedValue({
      facts: [],
      experts: [],
      existingTopics: [],
    });
    mockGetItemDetail.mockResolvedValue({
      learningStreamItem: mockItem,
      facts: [],
      summaries: [],
      extractionCounts: { facts: 0, summaries: 0 },
      categoryId: null,
      categoryName: null,
    });
    mockGetLabelsByEntities.mockResolvedValue(new Map());

    const tools = buildDiscussionTools(mockItem, authoringBrainlift, fakeAuthContext, {
      mode: 'builder',
    });
    const result: any = await (tools as any).get_brainlift_context.execute(
      {},
      { toolCallId: 'tc', messages: [], abortSignal: new AbortController().signal },
    );

    expect(result.itemExtraction.summaries).toEqual([]);
    // Helper is invoked with the empty array; the Spec 01 contract short-circuits inside the storage layer.
    expect(mockGetLabelsByEntities).toHaveBeenCalledWith('dok2_summary', []);
  });

  it('NON-builder authoring response shape has no ai_writing_signal anywhere', async () => {
    mockGetLearningStreamContext.mockResolvedValue({
      facts: [{ id: 1, fact: 'fact1', score: 5 }],
      experts: [{ id: 1, name: 'Expert' }],
      existingTopics: ['topic-a', 'topic-b'],
    });

    const tools = buildDiscussionTools(mockItem, authoringBrainlift, fakeAuthContext);
    const result: any = await (tools as any).get_brainlift_context.execute(
      {},
      { toolCallId: 'tc', messages: [], abortSignal: new AbortController().signal },
    );

    expect(result).not.toHaveProperty('itemExtraction');
    expect(JSON.stringify(result)).not.toContain('ai_writing_signal');
    expect(mockGetLabelsByEntities).not.toHaveBeenCalled();
  });

  it('research mode response shape has no ai_writing_signal anywhere', async () => {
    mockGetLearningStreamContext.mockResolvedValue({
      facts: [],
      experts: [],
      existingTopics: [],
    });

    const tools = buildDiscussionTools(mockItem, researchBrainlift, fakeAuthContext);
    const result: any = await (tools as any).get_brainlift_context.execute(
      {},
      { toolCallId: 'tc', messages: [], abortSignal: new AbortController().signal },
    );

    expect(JSON.stringify(result)).not.toContain('ai_writing_signal');
    expect(mockGetLabelsByEntities).not.toHaveBeenCalled();
  });
});
