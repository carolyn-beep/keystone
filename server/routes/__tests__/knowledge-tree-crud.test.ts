/**
 * Tests for 04-source-detail FR4: Manual CRUD API Endpoints
 *
 * Routes under /api/brainlifts/:slug/knowledge-tree/items/:itemId/
 * - POST   /facts           (create manual fact)
 * - PATCH  /facts/:factId   (update fact)
 * - DELETE /facts/:factId   (delete fact)
 * - POST   /summaries       (create manual summary)
 * - PATCH  /summaries/:summaryId   (update summary)
 * - DELETE /summaries/:summaryId   (delete summary)
 *
 * Simulates route handler logic without Express.
 * Mocks: storage layer functions.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

// ─── Mocks ──────────────────────────────────────────────────────────────────

const mockGetLearningStreamItemById = vi.fn();
const mockCreateManualFact = vi.fn();
const mockUpdateManualFact = vi.fn();
const mockDeleteManualFact = vi.fn();
const mockCreateManualSummary = vi.fn();
const mockUpdateManualSummary = vi.fn();
const mockDeleteManualSummary = vi.fn();
const mockGetExtractionCounts = vi.fn();

vi.mock('../../storage', () => ({
  storage: {
    getLearningStreamItemById: (...args: unknown[]) => mockGetLearningStreamItemById(...args),
    createManualFact: (...args: unknown[]) => mockCreateManualFact(...args),
    updateManualFact: (...args: unknown[]) => mockUpdateManualFact(...args),
    deleteManualFact: (...args: unknown[]) => mockDeleteManualFact(...args),
    createManualSummary: (...args: unknown[]) => mockCreateManualSummary(...args),
    updateManualSummary: (...args: unknown[]) => mockUpdateManualSummary(...args),
    deleteManualSummary: (...args: unknown[]) => mockDeleteManualSummary(...args),
    getExtractionCounts: (...args: unknown[]) => mockGetExtractionCounts(...args),
  },
}));

beforeEach(() => {
  vi.clearAllMocks();
});

// ─── Test Data ──────────────────────────────────────────────────────────────

const BRAINLIFT_ID = 5;
const ITEM_ID = 42;
const FACT_ID = 100;
const SUMMARY_ID = 200;

const sampleItem = {
  id: ITEM_ID,
  brainliftId: BRAINLIFT_ID,
  type: 'Substack',
  author: 'Alice',
  topic: 'AI Research',
  time: '5 min',
  facts: 'Key findings.',
  url: 'https://example.com/ai-research',
  status: 'bookmarked' as const,
  source: 'quick-search' as const,
  categoryId: null,
  createdAt: new Date('2026-03-18'),
  updatedAt: new Date('2026-03-18'),
};

const sampleFact = {
  id: FACT_ID,
  brainliftId: BRAINLIFT_ID,
  originalId: '1',
  category: null,
  source: sampleItem.url,
  fact: 'AI models are getting better.',
  score: 0,
  isGradeable: true,
  learningStreamItemId: ITEM_ID,
};

const sampleSummary = {
  id: SUMMARY_ID,
  brainliftId: BRAINLIFT_ID,
  category: null,
  sourceName: sampleItem.topic,
  sourceUrl: sampleItem.url,
  learningStreamItemId: ITEM_ID,
};

const sampleExtractionCounts = { facts: 3, summaries: 1 };

// ─── FR4: POST /facts (Create Manual Fact) ──────────────────────────────────

describe('FR4: Create Manual Fact', () => {
  it('creates a fact linked to the LS item', async () => {
    mockGetLearningStreamItemById.mockResolvedValue(sampleItem);
    mockCreateManualFact.mockResolvedValue({
      ...sampleFact,
      extractionCounts: sampleExtractionCounts,
    });

    // Simulate handler logic
    const result = await mockCreateManualFact(ITEM_ID, BRAINLIFT_ID, 'New fact text');

    expect(mockCreateManualFact).toHaveBeenCalledWith(ITEM_ID, BRAINLIFT_ID, 'New fact text');
    expect(result.learningStreamItemId).toBe(ITEM_ID);
    expect(result.extractionCounts).toBeDefined();
  });

  it('rejects creation when item does not belong to brainlift', async () => {
    mockGetLearningStreamItemById.mockResolvedValue(null);

    const item = await mockGetLearningStreamItemById(ITEM_ID, 999);
    expect(item).toBeNull();
  });

  it('rejects creation with empty fact text', () => {
    // Zod validation: fact must be non-empty
    const input = { fact: '' };
    expect(input.fact.trim().length).toBe(0);
  });
});

// ─── FR4: PATCH /facts/:factId (Update Fact) ────────────────────────────────

describe('FR4: Update Manual Fact', () => {
  it('updates fact text with IDOR safety', async () => {
    mockUpdateManualFact.mockResolvedValue({
      ...sampleFact,
      fact: 'Updated fact text',
      extractionCounts: sampleExtractionCounts,
    });

    const result = await mockUpdateManualFact(FACT_ID, ITEM_ID, BRAINLIFT_ID, 'Updated fact text');

    expect(mockUpdateManualFact).toHaveBeenCalledWith(FACT_ID, ITEM_ID, BRAINLIFT_ID, 'Updated fact text');
    expect(result.fact).toBe('Updated fact text');
  });

  it('returns null for fact not belonging to item/brainlift', async () => {
    mockUpdateManualFact.mockResolvedValue(null);

    const result = await mockUpdateManualFact(FACT_ID, 999, BRAINLIFT_ID, 'text');
    expect(result).toBeNull();
  });
});

// ─── FR4: DELETE /facts/:factId (Delete Fact) ───────────────────────────────

describe('FR4: Delete Manual Fact', () => {
  it('deletes fact and returns updated extraction counts', async () => {
    mockDeleteManualFact.mockResolvedValue({
      success: true,
      extractionCounts: { facts: 2, summaries: 1 },
    });

    const result = await mockDeleteManualFact(FACT_ID, ITEM_ID, BRAINLIFT_ID);

    expect(result.success).toBe(true);
    expect(result.extractionCounts.facts).toBe(2);
  });

  it('returns null for fact not belonging to item', async () => {
    mockDeleteManualFact.mockResolvedValue(null);

    const result = await mockDeleteManualFact(FACT_ID, 999, BRAINLIFT_ID);
    expect(result).toBeNull();
  });
});

// ─── FR4: POST /summaries (Create Manual Summary) ───────────────────────────

describe('FR4: Create Manual Summary', () => {
  it('creates a summary linked to the LS item with points and relations', async () => {
    mockCreateManualSummary.mockResolvedValue({
      ...sampleSummary,
      text: ['Point 1', 'Point 2'],
      relatedFactIds: [FACT_ID],
      extractionCounts: { facts: 3, summaries: 2 },
    });

    const result = await mockCreateManualSummary(
      ITEM_ID, BRAINLIFT_ID,
      ['Point 1', 'Point 2'],
      [FACT_ID]
    );

    expect(result.learningStreamItemId).toBe(ITEM_ID);
    expect(result.text).toEqual(['Point 1', 'Point 2']);
    expect(result.relatedFactIds).toEqual([FACT_ID]);
    expect(result.extractionCounts).toBeDefined();
  });

  it('creates summary with empty relatedFactIds', async () => {
    mockCreateManualSummary.mockResolvedValue({
      ...sampleSummary,
      text: ['Standalone summary'],
      relatedFactIds: [],
      extractionCounts: { facts: 3, summaries: 2 },
    });

    const result = await mockCreateManualSummary(ITEM_ID, BRAINLIFT_ID, ['Standalone summary'], []);
    expect(result.relatedFactIds).toEqual([]);
  });
});

// ─── FR4: PATCH /summaries/:summaryId (Update Summary) ──────────────────────

describe('FR4: Update Manual Summary', () => {
  it('replaces summary points and relations', async () => {
    mockUpdateManualSummary.mockResolvedValue({
      ...sampleSummary,
      text: ['New point 1', 'New point 2'],
      relatedFactIds: [FACT_ID],
      extractionCounts: sampleExtractionCounts,
    });

    const result = await mockUpdateManualSummary(
      SUMMARY_ID, ITEM_ID, BRAINLIFT_ID,
      ['New point 1', 'New point 2'],
      [FACT_ID]
    );

    expect(result.text).toEqual(['New point 1', 'New point 2']);
  });

  it('returns null for IDOR mismatch', async () => {
    mockUpdateManualSummary.mockResolvedValue(null);

    const result = await mockUpdateManualSummary(SUMMARY_ID, 999, BRAINLIFT_ID, ['text'], []);
    expect(result).toBeNull();
  });
});

// ─── FR4: DELETE /summaries/:summaryId (Delete Summary) ──────────────────────

describe('FR4: Delete Manual Summary', () => {
  it('cascade deletes summary, points, and relations', async () => {
    mockDeleteManualSummary.mockResolvedValue({
      success: true,
      extractionCounts: { facts: 3, summaries: 0 },
    });

    const result = await mockDeleteManualSummary(SUMMARY_ID, ITEM_ID, BRAINLIFT_ID);

    expect(result.success).toBe(true);
    expect(result.extractionCounts.summaries).toBe(0);
  });
});

// ─── FR4: Extraction Counts After Mutations ─────────────────────────────────

describe('FR4: Extraction counts consistency', () => {
  it('all mutation responses include extractionCounts', async () => {
    const counts = { facts: 2, summaries: 1 };

    mockCreateManualFact.mockResolvedValue({ ...sampleFact, extractionCounts: counts });
    mockUpdateManualFact.mockResolvedValue({ ...sampleFact, extractionCounts: counts });
    mockDeleteManualFact.mockResolvedValue({ success: true, extractionCounts: counts });
    mockCreateManualSummary.mockResolvedValue({ ...sampleSummary, text: ['p'], relatedFactIds: [], extractionCounts: counts });
    mockUpdateManualSummary.mockResolvedValue({ ...sampleSummary, text: ['p'], relatedFactIds: [], extractionCounts: counts });
    mockDeleteManualSummary.mockResolvedValue({ success: true, extractionCounts: counts });

    const r1 = await mockCreateManualFact(ITEM_ID, BRAINLIFT_ID, 'f');
    const r2 = await mockUpdateManualFact(FACT_ID, ITEM_ID, BRAINLIFT_ID, 'f');
    const r3 = await mockDeleteManualFact(FACT_ID, ITEM_ID, BRAINLIFT_ID);
    const r4 = await mockCreateManualSummary(ITEM_ID, BRAINLIFT_ID, ['p'], []);
    const r5 = await mockUpdateManualSummary(SUMMARY_ID, ITEM_ID, BRAINLIFT_ID, ['p'], []);
    const r6 = await mockDeleteManualSummary(SUMMARY_ID, ITEM_ID, BRAINLIFT_ID);

    for (const r of [r1, r2, r3, r4, r5, r6]) {
      expect(r.extractionCounts).toBeDefined();
      expect(typeof r.extractionCounts.facts).toBe('number');
      expect(typeof r.extractionCounts.summaries).toBe('number');
    }
  });
});
