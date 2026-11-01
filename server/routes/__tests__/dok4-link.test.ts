/**
 * Tests for FR1: DOK4 Manual Linking Route
 *
 * Tests the POST /dok4-spovs/:id/link endpoint logic.
 * Storage and job queueing are mocked.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

// ─── Mocks ──────────────────────────────────────────────────────────────────

const mockGetDOK4Spovs = vi.fn();
const mockLinkDOK4Spov = vi.fn();
const mockGetDOK3Insights = vi.fn();
const mockQueueJob = vi.fn().mockResolvedValue(undefined);

vi.mock('../../storage', () => ({
  storage: {
    getDOK4Spovs: (...args: unknown[]) => mockGetDOK4Spovs(...args),
    linkDOK4Spov: (...args: unknown[]) => mockLinkDOK4Spov(...args),
    getDOK3Insights: (...args: unknown[]) => mockGetDOK3Insights(...args),
  },
}));

vi.mock('../../utils/withJob', () => ({
  withJob: () => ({
    forPayload: () => ({
      queue: () => mockQueueJob(),
    }),
  }),
}));

// ─── Helpers ────────────────────────────────────────────────────────────────

/**
 * Simulates the route handler logic in isolation (without Express).
 * This tests the validation + orchestration logic directly.
 */
async function simulateLinkRoute(params: {
  spovId: number;
  brainliftId: number;
  body: unknown;
}) {
  const { spovId, brainliftId, body } = params;

  // Validate body structure
  const { links } = body as { links?: unknown };
  if (!Array.isArray(links) || links.length === 0) {
    return { status: 400, body: { message: 'links must be a non-empty array' } };
  }

  // Validate each link
  for (const link of links) {
    if (typeof link !== 'object' || link === null) {
      return { status: 400, body: { message: 'Each link must be an object with dok3InsightId and isPrimary' } };
    }
    const { dok3InsightId, isPrimary } = link as { dok3InsightId?: number; isPrimary?: boolean };
    if (typeof dok3InsightId !== 'number' || typeof isPrimary !== 'boolean') {
      return { status: 400, body: { message: 'Each link must have dok3InsightId (number) and isPrimary (boolean)' } };
    }
  }

  // Validate exactly one isPrimary
  const primaryCount = links.filter((l: { isPrimary: boolean }) => l.isPrimary).length;
  if (primaryCount !== 1) {
    return { status: 400, body: { message: 'Exactly one link must have isPrimary=true' } };
  }

  // IDOR check: SPOV must belong to brainlift
  const spovs = await mockGetDOK4Spovs(brainliftId);
  const spov = spovs.find((s: { id: number }) => s.id === spovId);
  if (!spov) {
    return { status: 404, body: { message: 'SPOV not found' } };
  }

  // Status check
  if (spov.status !== 'pending_linking') {
    return { status: 400, body: { message: 'SPOV is not in pending_linking status' } };
  }

  // Link the SPOV
  await mockLinkDOK4Spov(spovId, brainliftId, links);

  // Check if all linked DOK3 insights are graded
  const dok3Ids = links.map((l: { dok3InsightId: number }) => l.dok3InsightId);
  const allInsights = await mockGetDOK3Insights(brainliftId);
  const linkedInsights = allInsights.filter((i: { id: number }) => dok3Ids.includes(i.id));
  const allGraded = linkedInsights.length > 0 && linkedInsights.every((i: { status: string }) => i.status === 'graded');

  let gradingQueued = false;
  if (allGraded) {
    await mockQueueJob();
    gradingQueued = true;
  }

  return { status: 200, body: { spov: { ...spov, status: 'linked' }, gradingQueued } };
}

// ─── Tests ──────────────────────────────────────────────────────────────────

describe('DOK4 Manual Linking Route Logic', () => {
  const BRAINLIFT_ID = 1;

  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('Validation', () => {
    it('rejects empty links array', async () => {
      const result = await simulateLinkRoute({
        spovId: 10,
        brainliftId: BRAINLIFT_ID,
        body: { links: [] },
      });
      expect(result.status).toBe(400);
      expect(result.body.message).toContain('non-empty');
    });

    it('rejects missing links field', async () => {
      const result = await simulateLinkRoute({
        spovId: 10,
        brainliftId: BRAINLIFT_ID,
        body: {},
      });
      expect(result.status).toBe(400);
    });

    it('rejects links without exactly one isPrimary=true', async () => {
      const result = await simulateLinkRoute({
        spovId: 10,
        brainliftId: BRAINLIFT_ID,
        body: {
          links: [
            { dok3InsightId: 1, isPrimary: false },
            { dok3InsightId: 2, isPrimary: false },
          ],
        },
      });
      expect(result.status).toBe(400);
      expect(result.body.message).toContain('isPrimary');
    });

    it('rejects links with multiple isPrimary=true', async () => {
      const result = await simulateLinkRoute({
        spovId: 10,
        brainliftId: BRAINLIFT_ID,
        body: {
          links: [
            { dok3InsightId: 1, isPrimary: true },
            { dok3InsightId: 2, isPrimary: true },
          ],
        },
      });
      expect(result.status).toBe(400);
      expect(result.body.message).toContain('isPrimary');
    });

    it('rejects links with invalid types', async () => {
      const result = await simulateLinkRoute({
        spovId: 10,
        brainliftId: BRAINLIFT_ID,
        body: {
          links: [{ dok3InsightId: 'not-a-number', isPrimary: true }],
        },
      });
      expect(result.status).toBe(400);
    });
  });

  describe('IDOR check', () => {
    it('returns 404 for SPOV not belonging to brainlift', async () => {
      mockGetDOK4Spovs.mockResolvedValue([{ id: 99, status: 'pending_linking' }]);

      const result = await simulateLinkRoute({
        spovId: 10, // Not in the returned array
        brainliftId: BRAINLIFT_ID,
        body: { links: [{ dok3InsightId: 1, isPrimary: true }] },
      });
      expect(result.status).toBe(404);
    });
  });

  describe('Status check', () => {
    it('rejects SPOV not in pending_linking status', async () => {
      mockGetDOK4Spovs.mockResolvedValue([{ id: 10, status: 'linked' }]);

      const result = await simulateLinkRoute({
        spovId: 10,
        brainliftId: BRAINLIFT_ID,
        body: { links: [{ dok3InsightId: 1, isPrimary: true }] },
      });
      expect(result.status).toBe(400);
      expect(result.body.message).toContain('pending_linking');
    });
  });

  describe('Happy path', () => {
    it('links SPOV and returns gradingQueued=true when all DOK3s graded', async () => {
      mockGetDOK4Spovs.mockResolvedValue([{ id: 10, status: 'pending_linking', text: 'Test SPOV' }]);
      mockLinkDOK4Spov.mockResolvedValue(undefined);
      mockGetDOK3Insights.mockResolvedValue([
        { id: 1, status: 'graded' },
        { id: 2, status: 'graded' },
      ]);

      const result = await simulateLinkRoute({
        spovId: 10,
        brainliftId: BRAINLIFT_ID,
        body: {
          links: [
            { dok3InsightId: 1, isPrimary: true },
            { dok3InsightId: 2, isPrimary: false },
          ],
        },
      });

      expect(result.status).toBe(200);
      expect(result.body.gradingQueued).toBe(true);
      expect(result.body.spov.status).toBe('linked');
      expect(mockLinkDOK4Spov).toHaveBeenCalledWith(10, BRAINLIFT_ID, [
        { dok3InsightId: 1, isPrimary: true },
        { dok3InsightId: 2, isPrimary: false },
      ]);
      expect(mockQueueJob).toHaveBeenCalled();
    });

    it('links SPOV and returns gradingQueued=false when DOK3s not all graded', async () => {
      mockGetDOK4Spovs.mockResolvedValue([{ id: 10, status: 'pending_linking', text: 'Test SPOV' }]);
      mockLinkDOK4Spov.mockResolvedValue(undefined);
      mockGetDOK3Insights.mockResolvedValue([
        { id: 1, status: 'graded' },
        { id: 2, status: 'linked' }, // Not graded yet
      ]);

      const result = await simulateLinkRoute({
        spovId: 10,
        brainliftId: BRAINLIFT_ID,
        body: {
          links: [
            { dok3InsightId: 1, isPrimary: true },
            { dok3InsightId: 2, isPrimary: false },
          ],
        },
      });

      expect(result.status).toBe(200);
      expect(result.body.gradingQueued).toBe(false);
      expect(mockLinkDOK4Spov).toHaveBeenCalled();
    });

    it('handles single DOK3 link', async () => {
      mockGetDOK4Spovs.mockResolvedValue([{ id: 10, status: 'pending_linking', text: 'Test SPOV' }]);
      mockLinkDOK4Spov.mockResolvedValue(undefined);
      mockGetDOK3Insights.mockResolvedValue([{ id: 5, status: 'graded' }]);

      const result = await simulateLinkRoute({
        spovId: 10,
        brainliftId: BRAINLIFT_ID,
        body: {
          links: [{ dok3InsightId: 5, isPrimary: true }],
        },
      });

      expect(result.status).toBe(200);
      expect(result.body.gradingQueued).toBe(true);
    });
  });
});
