/**
 * Tests for FR4: Conditional Pipeline in saveBrainliftFromAI (02-conditional-pipeline)
 *
 * Tests autoLink parameter branching: auto mode calls pipeline,
 * manual mode preserves legacy behavior (skipping DOK4 auto-linking).
 *
 * These are integration-style tests that mock the heavy dependencies
 * and verify the conditional branching logic.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock heavy dependencies
vi.mock('../../storage', () => ({
  storage: {
    createBrainlift: vi.fn(),
    getBrainliftBySlug: vi.fn(),
    getBrainliftById: vi.fn(),
    getFactsForBrainlift: vi.fn(),
    getDOK2Summaries: vi.fn(),
    getDOK3Insights: vi.fn(),
    getDOK4Spovs: vi.fn(),
    saveDOK2Summaries: vi.fn(),
    saveDOK3Insights: vi.fn(),
    saveDOK4Spovs: vi.fn(),
    saveExperts: vi.fn(),
    saveRedundancyGroups: vi.fn(),
    updateBrainliftFields: vi.fn(),
    getDOK1MeanScore: vi.fn(),
    getDOK2MeanScore: vi.fn(),
    getDOK3MeanScore: vi.fn(),
    getDOK4MeanScore: vi.fn(),
  },
}));

vi.mock('../../utils/slug', () => ({
  generateUniqueSlug: vi.fn().mockResolvedValue('test-slug'),
}));

vi.mock('../../ai/factSummarizer', () => ({
  summarizeFact: vi.fn().mockResolvedValue('summary'),
}));

vi.mock('../../ai/factVerifier', () => ({
  verifyFactWithAllModels: vi.fn().mockResolvedValue({
    consensus: { consensusScore: 4, verificationNotes: 'Verified', isNonGradeable: false },
  }),
}));

vi.mock('../../ai/evidenceFetcher', () => ({
  fetchEvidenceForFact: vi.fn().mockResolvedValue({ content: 'evidence' }),
}));

vi.mock('../../ai/experts', () => ({
  extractAndRankExperts: vi.fn().mockResolvedValue([]),
  diagnoseExpertFormat: vi.fn().mockResolvedValue(null),
}));

vi.mock('../../ai/redundancyAnalyzer', () => ({
  analyzeFactRedundancy: vi.fn().mockResolvedValue({ redundancyGroups: [] }),
}));

vi.mock('../../ai/brainliftExtractor', () => ({
  findContradictions: vi.fn().mockResolvedValue([]),
}));

vi.mock('../../ai/dok2Grader', () => ({
  gradeDOK2Summary: vi.fn().mockResolvedValue({
    displayTitle: 'Test Title',
    score: 4,
    diagnosis: 'Good',
    feedback: 'Nice',
    failReason: null,
    sourceVerified: true,
  }),
}));

vi.mock('../../ai/dok3SourceRanker', () => ({
  rankSourcesForInsights: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('../../ai/dok4AutoLinker', () => ({
  autoLinkDOK4Spovs: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('../../ai/dok4InsightRanker', () => ({
  rankInsightsForSpovs: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('../grading-pipeline', () => ({
  runDOK3DOK4Pipeline: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('../../utils/timeout', () => ({
  withRetryTimeout: vi.fn().mockImplementation(async (fn: Function) => fn()),
}));

vi.mock('../../utils/withJob', () => ({
  withJob: vi.fn(() => {
    const withOptionsResult = { queue: vi.fn().mockResolvedValue(undefined) };
    const payloadResult = {
      queue: vi.fn().mockResolvedValue(undefined),
      withOptions: vi.fn(() => withOptionsResult),
    };
    return { forPayload: vi.fn(() => payloadResult) };
  }),
}));

import { storage } from '../../storage';
import { autoLinkDOK4Spovs } from '../../ai/dok4AutoLinker';
import { withJob } from '../../utils/withJob';
import { runDOK3DOK4Pipeline } from '../grading-pipeline';
import { saveBrainliftFromAI } from '../brainlift';

// Minimal extraction output
const MINIMAL_DATA = {
  title: 'Test Brainlift',
  description: 'Test description',
  displayPurpose: null,
  owner: 'Test Owner',
  classification: 'research',
  improperlyFormatted: false,
  rejectionReason: null,
  rejectionSubtype: null,
  rejectionRecommendation: null,
  facts: [{ id: 'f1', fact: 'Test fact', category: 'test', source: null, aiNotes: '', contradicts: false, flags: [] }],
  dok2Summaries: [
    {
      sourceName: 'Source A',
      sourceUrl: 'https://a.com',
      category: 'test',
      points: [{ text: 'Point 1' }],
      relatedDOK1Ids: ['f1'],
    },
  ],
  dok3Insights: [
    { text: 'Insight about climate', workflowyNodeId: 'wf-1' },
  ],
  dok4Spovs: [
    { id: 'spov-1', text: 'SPOV text', workflowyNodeId: 'wf-s1', explicitDok3Refs: null },
  ],
};

describe('FR4: Conditional Pipeline in saveBrainliftFromAI', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.SKIP_GRADING = 'true'; // Speed up tests by skipping DOK1 grading

    vi.mocked(storage.createBrainlift).mockResolvedValue({
      id: 100, slug: 'test-slug', title: 'Test',
    } as any);
    vi.mocked(storage.getBrainliftBySlug).mockResolvedValue({
      id: 100, slug: 'test-slug',
    } as any);
    vi.mocked(storage.getBrainliftById).mockResolvedValue({
      id: 100, slug: 'test-slug', summary: {},
    } as any);
    vi.mocked(storage.getFactsForBrainlift).mockResolvedValue([
      { id: 1, originalId: 'f1' },
    ] as any);
    vi.mocked(storage.getDOK2Summaries).mockResolvedValue([
      { id: 10, sourceName: 'Source A', displayTitle: 'Title A', category: 'test' },
    ] as any);
    vi.mocked(storage.getDOK3Insights).mockResolvedValue([
      { id: 1, text: 'Insight', status: 'pending_linking' },
    ] as any);
    vi.mocked(storage.getDOK4Spovs).mockResolvedValue([
      { id: 201, text: 'SPOV text', status: 'pending_linking' },
    ] as any);
    vi.mocked(storage.saveDOK2Summaries).mockResolvedValue([10] as any);
    vi.mocked(storage.saveDOK4Spovs).mockResolvedValue([201]);
    vi.mocked(storage.getDOK1MeanScore).mockResolvedValue(4.0);
    vi.mocked(storage.getDOK2MeanScore).mockResolvedValue(3.8);
    vi.mocked(storage.getDOK3MeanScore).mockResolvedValue(null);
    vi.mocked(storage.getDOK4MeanScore).mockResolvedValue(null);
  });

  it('autoLink=true calls runDOK3DOK4Pipeline', async () => {
    await saveBrainliftFromAI(MINIMAL_DATA as any, 'content', 'text', 'user1', 0, undefined, true);

    expect(runDOK3DOK4Pipeline).toHaveBeenCalledWith(100, 'test-slug', undefined, {
      dok3ExplicitRefs: [null],
      dok4ExplicitRefs: [null],
    });
    // Legacy DOK4 auto-linking should NOT be called
    expect(autoLinkDOK4Spovs).not.toHaveBeenCalled();
  });

  it('enqueues AI Writing Signal analysis for saved DOK2 summaries during import', async () => {
    await saveBrainliftFromAI(MINIMAL_DATA as any, 'content', 'text', 'user1', 0, undefined, false);

    expect(withJob).toHaveBeenCalledWith('pangram:analyze');
    const chain = vi.mocked(withJob).mock.results[0].value;
    expect(chain.forPayload).toHaveBeenCalledWith({
      entityType: 'dok2_summary',
      entityId: 10,
      brainliftId: 100,
    });
    expect(chain.forPayload.mock.results[0].value.withOptions).toHaveBeenCalledWith({ maxAttempts: 3 });
  });

  it('autoLink=false preserves legacy behavior with dok3_linking event', async () => {
    const onProgress = vi.fn();
    await saveBrainliftFromAI(MINIMAL_DATA as any, 'content', 'text', 'user1', 0, onProgress, false);

    // Pipeline should NOT be called
    expect(runDOK3DOK4Pipeline).not.toHaveBeenCalled();

    // DOK3 insights should be saved (pending_linking)
    expect(storage.saveDOK3Insights).toHaveBeenCalled();

    // dok3_linking info event should be emitted
    const dok3LinkingEvents = onProgress.mock.calls.filter(
      (c: any) => c[0]?.stage === 'dok3_linking'
    );
    expect(dok3LinkingEvents.length).toBeGreaterThan(0);
  });

  it('autoLink=false skips DOK4 auto-linking', async () => {
    await saveBrainliftFromAI(MINIMAL_DATA as any, 'content', 'text', 'user1', 0, undefined, false);

    // DOK4 SPOVs should still be saved
    expect(storage.saveDOK4Spovs).toHaveBeenCalled();
    // But auto-linking should be skipped
    expect(autoLinkDOK4Spovs).not.toHaveBeenCalled();
    // Pipeline should not be called
    expect(runDOK3DOK4Pipeline).not.toHaveBeenCalled();
  });

  it('autoLink defaults to true when undefined', async () => {
    await saveBrainliftFromAI(MINIMAL_DATA as any, 'content', 'text', 'user1', 0, undefined);

    // Should call pipeline (autoLink defaults to true)
    expect(runDOK3DOK4Pipeline).toHaveBeenCalled();
  });
});
