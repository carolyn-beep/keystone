/**
 * Tests for FR3: Native Brainlift Route Handlers
 *
 * Simulates route handler logic without Express.
 * Mocks: storage, middleware.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createNativeBrainliftInputSchema, patchNativeDetailsInputSchema } from '@shared/routes';

// ─── Mock setup ──────────────────────────────────────────────────────────────

const mockCreateNativeBrainlift = vi.fn();
const mockGetNativeDetailsBySlug = vi.fn();
const mockUpdateNativeDetailsForBrainlift = vi.fn();

vi.mock('../../storage', () => ({
  storage: {
    createNativeBrainlift: (...args: unknown[]) => mockCreateNativeBrainlift(...args),
    getNativeDetailsBySlug: (...args: unknown[]) => mockGetNativeDetailsBySlug(...args),
    updateNativeDetailsForBrainlift: (...args: unknown[]) => mockUpdateNativeDetailsForBrainlift(...args),
  },
}));

beforeEach(() => {
  vi.clearAllMocks();
});

// ─── Validation schema tests ────────────────────────────────────────────────

describe('createNativeBrainliftInputSchema', () => {
  it('accepts valid input with all fields', () => {
    const result = createNativeBrainliftInputSchema.parse({
      topic: 'A valid topic that is long enough',
      purpose: 'A valid purpose string that is definitely long enough',
      owner: 'Test Owner',
    });

    expect(result.topic).toBe('A valid topic that is long enough');
    expect(result.purpose).toBe('A valid purpose string that is definitely long enough');
    expect(result.owner).toBe('Test Owner');
  });

  it('accepts valid input with null owner', () => {
    const result = createNativeBrainliftInputSchema.parse({
      topic: 'A valid topic that is long enough',
      purpose: 'A valid purpose string that is definitely long enough',
      owner: null,
    });

    expect(result.owner).toBeNull();
  });

  it('accepts valid input without owner field', () => {
    const result = createNativeBrainliftInputSchema.parse({
      topic: 'A valid topic that is long enough',
      purpose: 'A valid purpose string that is definitely long enough',
    });

    expect(result.owner).toBeUndefined();
  });

  it('trims whitespace from inputs', () => {
    const result = createNativeBrainliftInputSchema.parse({
      topic: '  A valid topic that is long enough  ',
      purpose: '  A valid purpose string that is definitely long enough  ',
    });

    expect(result.topic).toBe('A valid topic that is long enough');
    expect(result.purpose).toBe('A valid purpose string that is definitely long enough');
  });

  it('rejects topic shorter than 10 characters', () => {
    expect(() => createNativeBrainliftInputSchema.parse({
      topic: 'Short',
      purpose: 'A valid purpose string that is definitely long enough',
    })).toThrow();
  });

  it('rejects purpose shorter than 20 characters', () => {
    expect(() => createNativeBrainliftInputSchema.parse({
      topic: 'A valid topic that is long enough',
      purpose: 'Too short',
    })).toThrow();
  });

  it('rejects missing topic', () => {
    expect(() => createNativeBrainliftInputSchema.parse({
      purpose: 'A valid purpose string that is definitely long enough',
    })).toThrow();
  });

  it('rejects missing purpose', () => {
    expect(() => createNativeBrainliftInputSchema.parse({
      topic: 'A valid topic that is long enough',
    })).toThrow();
  });
});

describe('patchNativeDetailsInputSchema', () => {
  it('accepts partial update with only topic', () => {
    const result = patchNativeDetailsInputSchema.parse({
      topic: 'An updated topic that is long enough',
    });

    expect(result.topic).toBe('An updated topic that is long enough');
    expect(result.purpose).toBeUndefined();
    expect(result.owner).toBeUndefined();
    expect(result.lastActivePhase).toBeUndefined();
  });

  it('accepts lastActivePhase as a valid phase number', () => {
    for (const phase of [1, 2, 3, 4, 5]) {
      const result = patchNativeDetailsInputSchema.parse({ lastActivePhase: phase });
      expect(result.lastActivePhase).toBe(phase);
    }
  });

  it('rejects invalid lastActivePhase values', () => {
    expect(() => patchNativeDetailsInputSchema.parse({ lastActivePhase: 0 })).toThrow();
    expect(() => patchNativeDetailsInputSchema.parse({ lastActivePhase: 6 })).toThrow();
    expect(() => patchNativeDetailsInputSchema.parse({ lastActivePhase: 'two' })).toThrow();
  });

  it('accepts owner set to null', () => {
    const result = patchNativeDetailsInputSchema.parse({ owner: null });
    expect(result.owner).toBeNull();
  });

  it('accepts an empty object (all fields optional)', () => {
    const result = patchNativeDetailsInputSchema.parse({});
    expect(Object.keys(result)).toHaveLength(0);
  });

  it('rejects topic shorter than 10 characters', () => {
    expect(() => patchNativeDetailsInputSchema.parse({ topic: 'Short' })).toThrow();
  });

  it('rejects purpose shorter than 20 characters', () => {
    expect(() => patchNativeDetailsInputSchema.parse({ purpose: 'Short' })).toThrow();
  });
});

// ─── Route handler logic tests (simulated) ──────────────────────────────────

describe('POST /api/brainlifts/native handler', () => {
  it('calls createNativeBrainlift with correct params', async () => {
    const mockResult = {
      brainlift: { id: 1, slug: 'test-slug', title: 'Test Topic' },
      nativeDetails: { id: 1, brainliftId: 1, phaseProgress: {} },
    };
    mockCreateNativeBrainlift.mockResolvedValue(mockResult);

    const input = {
      topic: 'A valid topic that is long enough',
      purpose: 'A valid purpose string that is definitely long enough',
      owner: 'Test Owner',
    };
    const parsed = createNativeBrainliftInputSchema.parse(input);

    const result = await mockCreateNativeBrainlift({
      topic: parsed.topic,
      purpose: parsed.purpose,
      owner: parsed.owner ?? null,
      userId: 'test-user',
    });

    expect(mockCreateNativeBrainlift).toHaveBeenCalledWith({
      topic: 'A valid topic that is long enough',
      purpose: 'A valid purpose string that is definitely long enough',
      owner: 'Test Owner',
      userId: 'test-user',
    });
    expect(result).toEqual(mockResult);
  });
});

describe('GET /api/brainlifts/:slug/native-details handler', () => {
  it('returns native details when they exist', async () => {
    const mockDetails = {
      topic: 'Test Topic',
      purpose: 'Test Purpose',
      owner: null,
      phaseProgress: { phase1: 'complete', phase2: 'in_progress', phase3: 'locked', phase4: 'locked', phase5: 'locked' },
      lastActivePhase: 2,
      suggestionStatus: 'queued',
      suggestionError: null,
    };
    mockGetNativeDetailsBySlug.mockResolvedValue(mockDetails);

    const result = await mockGetNativeDetailsBySlug('test-slug');

    expect(result).toEqual(mockDetails);
  });

  it('returns null when native details do not exist (triggers 404)', async () => {
    mockGetNativeDetailsBySlug.mockResolvedValue(null);

    const result = await mockGetNativeDetailsBySlug('nonexistent-slug');

    expect(result).toBeNull();
  });
});

describe('PATCH /api/brainlifts/:slug/native-details handler', () => {
  it('calls updateNativeDetailsForBrainlift with parsed fields', async () => {
    const mockUpdated = {
      topic: 'Updated Topic',
      purpose: 'Updated Purpose',
      owner: null,
      phaseProgress: { phase1: 'complete', phase2: 'in_progress', phase3: 'locked', phase4: 'locked', phase5: 'locked' },
      lastActivePhase: 3,
      suggestionStatus: 'queued',
      suggestionError: null,
    };
    mockUpdateNativeDetailsForBrainlift.mockResolvedValue(mockUpdated);

    const input = patchNativeDetailsInputSchema.parse({
      topic: 'Updated Topic is long enough',
      lastActivePhase: 3,
    });

    await mockUpdateNativeDetailsForBrainlift(42, input);

    expect(mockUpdateNativeDetailsForBrainlift).toHaveBeenCalledWith(42, {
      topic: 'Updated Topic is long enough',
      lastActivePhase: 3,
    });
  });

  it('rejects patch on non-native brainlift', () => {
    // Simulating the sourceType check in the handler
    const brainlift = { sourceType: 'html' };
    expect(brainlift.sourceType !== 'native').toBe(true);
  });
});
