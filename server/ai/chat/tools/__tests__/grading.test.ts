/**
 * Tests for Spec 03 FR4: `get_brainlift_assessment` field transform.
 *
 * The internal API returns camelCase `aiWritingSignal` on each DOK2/3/4 item
 * (Spec 01). The agent-facing JSON uses snake_case `ai_writing_signal` per
 * decisions §15 (parity with external MCP, `traceability_flagged` precedent).
 * The chat tool boundary performs the rename via `renameAiWritingSignalField`.
 *
 * DOK1 items have no `aiWritingSignal` field (DOK1 prose is not analyzed) so
 * the transform is a no-op there.
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';

const mockGetBrainliftAssessmentForAuthContext = vi.fn();
const mockGetBrainliftStatusForAuthContext = vi.fn();

vi.mock('../../../../services/brainlift-grading-surface', () => ({
  buildDefaultChatAuthContext: vi.fn(() => ({ userId: 'u', role: 'user', isAdmin: false })),
  buildGradingQueuedResponse: vi.fn(),
  getBrainliftAssessmentForAuthContext: (...args: unknown[]) =>
    mockGetBrainliftAssessmentForAuthContext(...args),
  getBrainliftStatusForAuthContext: (...args: unknown[]) =>
    mockGetBrainliftStatusForAuthContext(...args),
  getBrainliftTemplatePayload: vi.fn(),
  listBrainliftsForAuthContext: vi.fn(),
}));

vi.mock('../../../../services/internal-grading', () => ({
  processGradeRequest: vi.fn(),
}));

vi.mock('../../../../brand', () => ({ brandId: 'alphax' }));

beforeEach(() => {
  vi.clearAllMocks();
});

describe('FR4: renameAiWritingSignalField (unit)', () => {
  it('renames aiWritingSignal to ai_writing_signal on each item', async () => {
    const { renameAiWritingSignalField } = await import('../grading');
    const input = [
      { id: 1, aiWritingSignal: 'human' },
      { id: 2, aiWritingSignal: null },
    ];
    const output = renameAiWritingSignalField(input);
    expect(output).toEqual([
      { id: 1, ai_writing_signal: 'human' },
      { id: 2, ai_writing_signal: null },
    ]);
  });

  it('leaves items without aiWritingSignal unchanged (DOK1 case)', async () => {
    const { renameAiWritingSignalField } = await import('../grading');
    const input = [{ id: 3, score: 5, fact: 'a fact' }];
    const output = renameAiWritingSignalField(input);
    expect(output).toEqual([{ id: 3, score: 5, fact: 'a fact' }]);
    expect(output[0]).not.toHaveProperty('ai_writing_signal');
  });

  it('preserves all other fields on each item verbatim', async () => {
    const { renameAiWritingSignalField } = await import('../grading');
    const input = [
      {
        id: 7,
        text: 'insight text',
        status: 'graded',
        score: 4,
        rationale: 'rationale text',
        feedback: { strengths: [], weaknesses: [] },
        foundationIntegrityIndex: 0.92,
        linkedSources: ['Source A', 'Source B'],
        criteriaSummary: 'criteria',
        aiWritingSignal: 'ai-assisted',
        criteriaBreakdown: { distinctness: 4 },
        traceabilityFlagged: false,
      },
    ];
    const [renamed] = renameAiWritingSignalField(input) as Array<Record<string, unknown>>;
    expect(renamed.id).toBe(7);
    expect(renamed.text).toBe('insight text');
    expect(renamed.status).toBe('graded');
    expect(renamed.score).toBe(4);
    expect(renamed.rationale).toBe('rationale text');
    expect(renamed.feedback).toEqual({ strengths: [], weaknesses: [] });
    expect(renamed.foundationIntegrityIndex).toBe(0.92);
    expect(renamed.linkedSources).toEqual(['Source A', 'Source B']);
    expect(renamed.criteriaSummary).toBe('criteria');
    expect(renamed.criteriaBreakdown).toEqual({ distinctness: 4 });
    expect(renamed.traceabilityFlagged).toBe(false);
    expect(renamed.ai_writing_signal).toBe('ai-assisted');
    expect(renamed).not.toHaveProperty('aiWritingSignal');
  });

  it('does NOT mutate the input array members', async () => {
    const { renameAiWritingSignalField } = await import('../grading');
    const input = [{ id: 1, aiWritingSignal: 'human' as const }];
    const copy = { ...input[0] };
    renameAiWritingSignalField(input);
    expect(input[0]).toEqual(copy);
    expect(input[0]).toHaveProperty('aiWritingSignal');
    expect(input[0]).not.toHaveProperty('ai_writing_signal');
  });

  it('is idempotent on items already in snake_case', async () => {
    const { renameAiWritingSignalField } = await import('../grading');
    const input = [{ id: 1, ai_writing_signal: 'human' }];
    const output = renameAiWritingSignalField(input);
    expect(output).toEqual([{ id: 1, ai_writing_signal: 'human' }]);
  });

  it('handles non-object items defensively', async () => {
    const { renameAiWritingSignalField } = await import('../grading');
    const input: unknown[] = [null, 'string', 42];
    const output = renameAiWritingSignalField(input);
    expect(output).toEqual([null, 'string', 42]);
  });
});

describe('FR4: get_brainlift_assessment end-to-end transform', () => {
  it.each([2 as const, 3 as const, 4 as const])(
    'DOK%d items get ai_writing_signal (snake_case), no residual aiWritingSignal',
    async (dok) => {
      mockGetBrainliftAssessmentForAuthContext.mockResolvedValue({
        slug: 'test-brainlift',
        dok,
        status: 'complete',
        items: [
          { id: 1, aiWritingSignal: 'human', text: 'a' },
          { id: 2, aiWritingSignal: null, text: 'b' },
        ],
        pagination: { page: 1, pageSize: 20, totalItems: 2, totalPages: 1 },
      });

      const { buildChatGradingTools } = await import('../grading');
      const tools = buildChatGradingTools('user-1') as any;
      const result = await tools.get_brainlift_assessment.execute({
        slug: 'test-brainlift',
        dok,
      });

      expect(result.items).toEqual([
        { id: 1, ai_writing_signal: 'human', text: 'a' },
        { id: 2, ai_writing_signal: null, text: 'b' },
      ]);
      for (const item of result.items) {
        expect(item).not.toHaveProperty('aiWritingSignal');
      }
    },
  );

  it('DOK1 items unchanged when source has no aiWritingSignal', async () => {
    mockGetBrainliftAssessmentForAuthContext.mockResolvedValue({
      slug: 'test',
      dok: 1,
      status: 'complete',
      items: [
        { id: 1, fact: 'a', score: 5 },
        { id: 2, fact: 'b', score: 3 },
      ],
      pagination: { page: 1, pageSize: 20, totalItems: 2, totalPages: 1 },
    });

    const { buildChatGradingTools } = await import('../grading');
    const tools = buildChatGradingTools('user-1') as any;
    const result = await tools.get_brainlift_assessment.execute({
      slug: 'test',
      dok: 1,
    });

    expect(result.items).toEqual([
      { id: 1, fact: 'a', score: 5 },
      { id: 2, fact: 'b', score: 3 },
    ]);
    for (const item of result.items) {
      expect(item).not.toHaveProperty('ai_writing_signal');
      expect(item).not.toHaveProperty('aiWritingSignal');
    }
  });

  it('preserves wrapping response fields (slug, dok, status, pagination)', async () => {
    mockGetBrainliftAssessmentForAuthContext.mockResolvedValue({
      slug: 'preserved',
      dok: 3,
      status: 'complete',
      items: [{ id: 9, aiWritingSignal: 'mixed' }],
      pagination: { page: 2, pageSize: 5, totalItems: 11, totalPages: 3 },
    });

    const { buildChatGradingTools } = await import('../grading');
    const tools = buildChatGradingTools('user-1') as any;
    const result = await tools.get_brainlift_assessment.execute({
      slug: 'preserved',
      dok: 3,
      page: 2,
      pageSize: 5,
    });

    expect(result.slug).toBe('preserved');
    expect(result.dok).toBe(3);
    expect(result.status).toBe('complete');
    expect(result.pagination).toEqual({ page: 2, pageSize: 5, totalItems: 11, totalPages: 3 });
  });

  it('detail=full mode preserves extended fields plus ai_writing_signal', async () => {
    mockGetBrainliftAssessmentForAuthContext.mockResolvedValue({
      slug: 't',
      dok: 3,
      status: 'complete',
      items: [
        {
          id: 1,
          text: 'insight',
          aiWritingSignal: 'ai',
          criteriaBreakdown: { distinctness: 5 },
          traceabilityFlagged: true,
        },
      ],
      pagination: { page: 1, pageSize: 20, totalItems: 1, totalPages: 1 },
    });

    const { buildChatGradingTools } = await import('../grading');
    const tools = buildChatGradingTools('user-1') as any;
    const result = await tools.get_brainlift_assessment.execute({
      slug: 't',
      dok: 3,
      detail: 'full',
    });

    expect(result.items[0]).toEqual({
      id: 1,
      text: 'insight',
      ai_writing_signal: 'ai',
      criteriaBreakdown: { distinctness: 5 },
      traceabilityFlagged: true,
    });
  });

  it('statusOnly: true short-circuits, transform is NOT applied', async () => {
    mockGetBrainliftStatusForAuthContext.mockResolvedValue({
      slug: 's',
      status: 'grading',
      progress: { dok1: { graded: 0, total: 5 } },
    });

    const { buildChatGradingTools } = await import('../grading');
    const tools = buildChatGradingTools('user-1') as any;
    const result = await tools.get_brainlift_assessment.execute({
      slug: 's',
      dok: 3,
      statusOnly: true,
    });

    expect(mockGetBrainliftStatusForAuthContext).toHaveBeenCalledWith(
      expect.anything(),
      's',
    );
    expect(mockGetBrainliftAssessmentForAuthContext).not.toHaveBeenCalled();
    expect(result).toEqual({
      slug: 's',
      status: 'grading',
      progress: { dok1: { graded: 0, total: 5 } },
    });
  });
});
