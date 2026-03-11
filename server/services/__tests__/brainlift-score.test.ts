/**
 * Tests for FR5: Brainlift Score Update (DOK4 integration)
 *
 * Tests the recomputeBrainliftScore function with DOK4 support.
 * Mocks storage functions to test the formula without DB access.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { recomputeBrainliftScore } from '../brainlift';
import { storage } from '../../storage';

// Mock the storage module
vi.mock('../../storage', () => ({
  storage: {
    getDOK1MeanScore: vi.fn(),
    getDOK2MeanScore: vi.fn(),
    getDOK3MeanScore: vi.fn(),
    getDOK4MeanScore: vi.fn(),
    getBrainliftById: vi.fn(),
    updateBrainliftFields: vi.fn(),
  },
}));

const mockStorage = vi.mocked(storage);

beforeEach(() => {
  vi.clearAllMocks();
  // Default mock: brainlift exists
  mockStorage.getBrainliftById.mockResolvedValue({
    id: 1,
    title: 'Test',
    slug: 'test',
    description: 'Test',
    ownerId: 'user1',
    summary: { totalFacts: 10, meanScore: '0', score5Count: 0, contradictionCount: 0 },
  } as any);
  mockStorage.updateBrainliftFields.mockResolvedValue(undefined as any);
});


describe('recomputeBrainliftScore with DOK4', () => {
  it('with all 4 DOK levels uses DOK1*0.25 + DOK2*0.25 + DOK3*0.25 + DOK4*0.25', async () => {
    mockStorage.getDOK1MeanScore.mockResolvedValue(4.0);
    mockStorage.getDOK2MeanScore.mockResolvedValue(3.0);
    mockStorage.getDOK3MeanScore.mockResolvedValue(5.0);
    mockStorage.getDOK4MeanScore.mockResolvedValue(4.0);

    await recomputeBrainliftScore(1);

    // Expected: 4.0*0.25 + 3.0*0.25 + 5.0*0.25 + 4.0*0.25 = 1.0+0.75+1.25+1.0 = 4.0
    expect(mockStorage.updateBrainliftFields).toHaveBeenCalledWith(1, expect.objectContaining({
      summary: expect.objectContaining({
        meanScore: '4.00',
      }),
    }));
  });

  it('with DOK1+DOK2+DOK3 only uses 33/34/33 split (unchanged)', async () => {
    mockStorage.getDOK1MeanScore.mockResolvedValue(4.0);
    mockStorage.getDOK2MeanScore.mockResolvedValue(3.0);
    mockStorage.getDOK3MeanScore.mockResolvedValue(5.0);
    mockStorage.getDOK4MeanScore.mockResolvedValue(null);

    await recomputeBrainliftScore(1);

    // Expected: 4.0*0.33 + 3.0*0.34 + 5.0*0.33 = 1.32+1.02+1.65 = 3.99
    expect(mockStorage.updateBrainliftFields).toHaveBeenCalledWith(1, expect.objectContaining({
      summary: expect.objectContaining({
        meanScore: '3.99',
      }),
    }));
  });

  it('with DOK1+DOK2 only uses 50/50 split (unchanged)', async () => {
    mockStorage.getDOK1MeanScore.mockResolvedValue(4.0);
    mockStorage.getDOK2MeanScore.mockResolvedValue(3.0);
    mockStorage.getDOK3MeanScore.mockResolvedValue(null);
    mockStorage.getDOK4MeanScore.mockResolvedValue(null);

    await recomputeBrainliftScore(1);

    // Expected: (4.0 + 3.0) / 2 = 3.50
    expect(mockStorage.updateBrainliftFields).toHaveBeenCalledWith(1, expect.objectContaining({
      summary: expect.objectContaining({
        meanScore: '3.50',
      }),
    }));
  });

  it('with only one category uses that single mean (unchanged)', async () => {
    mockStorage.getDOK1MeanScore.mockResolvedValue(4.5);
    mockStorage.getDOK2MeanScore.mockResolvedValue(null);
    mockStorage.getDOK3MeanScore.mockResolvedValue(null);
    mockStorage.getDOK4MeanScore.mockResolvedValue(null);

    await recomputeBrainliftScore(1);

    expect(mockStorage.updateBrainliftFields).toHaveBeenCalledWith(1, expect.objectContaining({
      summary: expect.objectContaining({
        meanScore: '4.50',
      }),
    }));
  });

  it('backward compatible -- null DOK4 mean falls back to existing formula', async () => {
    mockStorage.getDOK1MeanScore.mockResolvedValue(4.0);
    mockStorage.getDOK2MeanScore.mockResolvedValue(3.0);
    mockStorage.getDOK3MeanScore.mockResolvedValue(5.0);
    mockStorage.getDOK4MeanScore.mockResolvedValue(null);

    await recomputeBrainliftScore(1);

    // Should use 33/34/33, NOT 25/25/25/25
    expect(mockStorage.updateBrainliftFields).toHaveBeenCalledWith(1, expect.objectContaining({
      summary: expect.objectContaining({
        meanScore: '3.99', // Not 4.00 which would be equal weights
      }),
    }));
  });
});
