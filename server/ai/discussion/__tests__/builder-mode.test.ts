/**
 * Tests for 04-source-detail FR5 + FR6: Discussion Tool Builder Mode
 *
 * FR5: buildDiscussionTools branches on builder context
 * FR6: buildDiscussionSystemPrompt includes builder-specific guidance
 *
 * Mocks: storage, db, withJob, saveSingleDOK2Summary
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

// ─── Mocks ──────────────────────────────────────────────────────────────────

vi.mock('../../../storage', () => ({
  storage: {
    getLearningStreamItemById: vi.fn(),
    getLearningStreamContext: vi.fn(),
    getItemDetail: vi.fn(),
  },
}));

vi.mock('../../../utils/withJob', () => ({
  withJob: vi.fn(() => ({
    forPayload: vi.fn().mockReturnThis(),
    withOptions: vi.fn().mockReturnThis(),
    queue: vi.fn().mockResolvedValue(undefined),
  })),
}));

const mockDbSelect = vi.fn();
const mockDbInsert = vi.fn();
const mockDbInsertValues = vi.fn();
const mockDbInsertReturning = vi.fn();
const mockDbSelectFrom = vi.fn();
const mockDbSelectWhere = vi.fn();

vi.mock('../../../storage/base', () => ({
  db: {
    select: (...args: unknown[]) => {
      mockDbSelect(...args);
      return {
        from: (...fArgs: unknown[]) => {
          mockDbSelectFrom(...fArgs);
          return {
            where: (...wArgs: unknown[]) => {
              mockDbSelectWhere(...wArgs);
              return Promise.resolve([{ maxId: '0' }]);
            },
          };
        },
      };
    },
    insert: (...args: unknown[]) => {
      mockDbInsert(...args);
      return {
        values: (...vArgs: unknown[]) => {
          mockDbInsertValues(...vArgs);
          return {
            returning: () => {
              return Promise.resolve([{
                id: 1,
                brainliftId: 5,
                originalId: '1',
                category: null,
                source: 'https://example.com/article',
                fact: 'Test fact',
                score: 0,
                isGradeable: true,
                learningStreamItemId: 42,
              }]);
            },
          };
        },
      };
    },
  },
  eq: vi.fn(),
  sql: vi.fn().mockReturnValue('mock-sql'),
  facts: { brainliftId: 'brainliftId', originalId: 'originalId' },
  learningStreamItems: {},
}));

const mockSaveSingleDOK2Summary = vi.fn();
vi.mock('../../../storage/dok2', () => ({
  saveSingleDOK2Summary: (...args: unknown[]) => mockSaveSingleDOK2Summary(...args),
}));

vi.mock('../../../utils/item-text-content', () => ({
  ensureItemTextContent: vi.fn(),
}));

import { storage } from '../../../storage';
import { buildDiscussionTools } from '../tools';
import { buildDiscussionSystemPrompt } from '../system-prompt';
import type { LearningStreamItem, Brainlift } from '../../../storage/base';

beforeEach(() => {
  vi.clearAllMocks();
});

// ─── Test Data ──────────────────────────────────────────────────────────────

const mockItem: LearningStreamItem = {
  id: 42,
  brainliftId: 5,
  type: 'Substack',
  author: 'Alice',
  topic: 'AI Research Article',
  time: '5 min',
  facts: 'Key findings about AI',
  url: 'https://example.com/article',
  status: 'bookmarked',
  source: 'quick-search',
  categoryId: null,
  createdAt: new Date('2026-03-18'),
  updatedAt: new Date('2026-03-18'),
  extractedContent: null,
  aiRationale: null,
};

const mockBrainlift: Pick<Brainlift, 'id' | 'displayPurpose' | 'description'> = {
  id: 5,
  displayPurpose: 'Learn about modern AI techniques',
  description: 'A deep dive into AI',
};

const mockBrainliftWithTitle: Pick<Brainlift, 'displayPurpose' | 'description' | 'title'> = {
  displayPurpose: 'Learn about modern AI techniques',
  description: 'A deep dive into AI',
  title: 'AI Learning BrainLift',
};

// ─── FR5: Discussion Tools Builder Mode ─────────────────────────────────────

describe('FR5: buildDiscussionTools creates standard tools', () => {
  it('returns all four tool names', () => {
    const tools = buildDiscussionTools(mockItem, mockBrainlift);
    expect(tools).toHaveProperty('save_dok1_fact');
    expect(tools).toHaveProperty('save_dok2_summary');
    expect(tools).toHaveProperty('get_brainlift_context');
    expect(tools).toHaveProperty('read_article_section');
  });
});

describe('FR5: save_dok1_fact inserts with learningStreamItemId', () => {
  it('calls db.insert with item url as source', async () => {
    const tools = buildDiscussionTools(mockItem, mockBrainlift);
    const result = await tools.save_dok1_fact.execute(
      { fact: 'AI is advancing', category: 'Technology' },
      { toolCallId: 'tc1', messages: [], abortSignal: new AbortController().signal }
    );

    // Verify the insert was called
    expect(mockDbInsert).toHaveBeenCalled();
    // Verify values included source = item.url
    expect(mockDbInsertValues).toHaveBeenCalled();
    const insertedValues = mockDbInsertValues.mock.calls[0][0];
    expect(insertedValues.source).toBe(mockItem.url);
    expect(insertedValues.brainliftId).toBe(mockBrainlift.id);
    // Result should include the returned data
    expect(result).toHaveProperty('factId');
    expect(result).toHaveProperty('fact');
  });
});

describe('FR5: save_dok2_summary delegates to saveSingleDOK2Summary', () => {
  it('passes sourceName and sourceUrl from item', async () => {
    mockSaveSingleDOK2Summary.mockResolvedValue(200);

    const tools = buildDiscussionTools(mockItem, mockBrainlift);
    const result = await tools.save_dok2_summary.execute(
      {
        summaryPoints: ['Point 1', 'Point 2'],
        relatedFactIds: [1],
        category: 'Technology',
      },
      { toolCallId: 'tc2', messages: [], abortSignal: new AbortController().signal }
    );

    expect(mockSaveSingleDOK2Summary).toHaveBeenCalledWith(
      expect.objectContaining({
        brainliftId: mockBrainlift.id,
        category: 'Technology',
        sourceName: mockItem.topic,
        sourceUrl: mockItem.url,
      })
    );
    expect(result).toHaveProperty('summaryId', 200);
    expect(result).toHaveProperty('points');
  });
});

describe('FR5: get_brainlift_context returns context', () => {
  it('returns purpose, facts, experts, and topics', async () => {
    vi.mocked(storage.getLearningStreamContext).mockResolvedValue({
      facts: [{ id: 1, fact: 'fact1', score: 5 }],
      experts: [{ id: 1, name: 'Expert 1' }],
      existingTopics: ['AI', 'ML'],
    } as any);

    const tools = buildDiscussionTools(mockItem, mockBrainlift);
    const result = await tools.get_brainlift_context.execute(
      {},
      { toolCallId: 'tc3', messages: [], abortSignal: new AbortController().signal }
    );

    expect(result).toHaveProperty('purpose', mockBrainlift.displayPurpose);
    expect(result).toHaveProperty('topFacts');
    expect(result).toHaveProperty('followedExperts');
    expect(result).toHaveProperty('existingTopics');
  });
});

// ─── FR6: System Prompt Builder Enhancement ─────────────────────────────────

describe('FR6: buildDiscussionSystemPrompt', () => {
  it('includes item metadata in the prompt', () => {
    const prompt = buildDiscussionSystemPrompt(mockItem, mockBrainliftWithTitle);

    expect(prompt).toContain(mockItem.topic);
    expect(prompt).toContain(mockItem.type);
    expect(prompt).toContain(mockItem.author);
    expect(prompt).toContain(mockBrainliftWithTitle.title);
  });

  it('includes brainlift purpose in the prompt', () => {
    const prompt = buildDiscussionSystemPrompt(mockItem, mockBrainliftWithTitle);
    expect(prompt).toContain(mockBrainliftWithTitle.displayPurpose!);
  });

  it('includes DOK framework guidance', () => {
    const prompt = buildDiscussionSystemPrompt(mockItem, mockBrainliftWithTitle);
    expect(prompt).toContain('DOK1');
    expect(prompt).toContain('DOK2');
    expect(prompt).toContain('save_dok1_fact');
    expect(prompt).toContain('save_dok2_summary');
  });

  it('handles item without extractedContent', () => {
    const itemWithoutContent = { ...mockItem, extractedContent: null };
    const prompt = buildDiscussionSystemPrompt(itemWithoutContent, mockBrainliftWithTitle);
    expect(prompt).toBeDefined();
    expect(prompt.length).toBeGreaterThan(100);
  });

  it('handles brainlift without displayPurpose', () => {
    const brainliftNoPurpose = { ...mockBrainliftWithTitle, displayPurpose: null };
    const prompt = buildDiscussionSystemPrompt(mockItem, brainliftNoPurpose);
    expect(prompt).toContain(brainliftNoPurpose.description!);
  });
});

// ─── Phase branching: research vs authoring ─────────────────────────────────

describe('buildDiscussionTools — phase branching', () => {
  const authoringBrainlift = { ...mockBrainlift, phase: 'authoring' as const };
  const researchBrainlift = { ...mockBrainlift, phase: 'research' as const };
  const mockAuthContext = { userId: 'user-1', role: 'user', isAdmin: false } as any;

  it('authoring phase keeps DOK tools and adds Second Brain tools', () => {
    const tools = buildDiscussionTools(mockItem, authoringBrainlift, mockAuthContext);
    expect(tools).toHaveProperty('save_dok1_fact');
    expect(tools).toHaveProperty('save_dok2_summary');
    expect(tools).toHaveProperty('get_brainlift_context');
    expect(tools).toHaveProperty('read_article_section');
    // Second Brain — available in both phases
    expect(tools).toHaveProperty('save_source');
    expect(tools).toHaveProperty('save_note');
    expect(tools).toHaveProperty('create_category');
    expect(tools).toHaveProperty('list_sources');
    expect(tools).toHaveProperty('list_notes');
    expect(tools).toHaveProperty('list_categories');
  });

  it('research phase drops DOK extraction tools but keeps context + read + Second Brain', () => {
    const tools = buildDiscussionTools(mockItem, researchBrainlift, mockAuthContext);
    expect(tools).not.toHaveProperty('save_dok1_fact');
    expect(tools).not.toHaveProperty('save_dok2_summary');
    expect(tools).toHaveProperty('get_brainlift_context');
    expect(tools).toHaveProperty('read_article_section');
    expect(tools).toHaveProperty('save_source');
    expect(tools).toHaveProperty('save_note');
    expect(tools).toHaveProperty('create_category');
  });
});

describe('buildDiscussionSystemPrompt — phase branching', () => {
  const researchBrainliftWithTitle = { ...mockBrainliftWithTitle, phase: 'research' as const };
  const authoringBrainliftWithTitle = { ...mockBrainliftWithTitle, phase: 'authoring' as const };

  it('research phase emits capture-first prompt with no DOK vocabulary', () => {
    const prompt = buildDiscussionSystemPrompt(mockItem, researchBrainliftWithTitle);
    expect(prompt).toContain('research mode');
    expect(prompt).toContain('save_note');
    expect(prompt).toContain('save_source');
    expect(prompt).toContain('Capture');
    expect(prompt).toContain(String(mockItem.id)); // learningStreamItemId surfaced
    expect(prompt).not.toContain('DOK1 (Facts)');
    expect(prompt).not.toContain('save_dok1_fact');
  });

  it('authoring phase keeps DOK framework and adds Second Brain section', () => {
    const prompt = buildDiscussionSystemPrompt(mockItem, authoringBrainliftWithTitle);
    expect(prompt).toContain('DOK1');
    expect(prompt).toContain('save_dok1_fact');
    expect(prompt).toContain('Second Brain');
    expect(prompt).toContain('save_source');
    expect(prompt).toContain('save_note');
  });
});
