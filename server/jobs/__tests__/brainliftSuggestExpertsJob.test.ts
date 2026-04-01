/**
 * Tests for FR4: Expert Suggestion Background Job
 *
 * Validates brainliftSuggestExpertsJob generates suggestions via AI,
 * inserts them, and handles failures gracefully.
 *
 * Mocks: storage, callModelWithFallback, buildSuggestExpertsPrompt
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockGetBrainliftById = vi.fn();
const mockInsertSuggestedExperts = vi.fn();
const mockSetBuilderSuggestionState = vi.fn();

vi.mock('../../storage', () => ({
  storage: {
    getBrainliftById: (...args: unknown[]) => mockGetBrainliftById(...args),
    insertSuggestedExperts: (...args: unknown[]) => mockInsertSuggestedExperts(...args),
    setBuilderSuggestionState: (...args: unknown[]) => mockSetBuilderSuggestionState(...args),
  },
}));

const mockCallModelWithFallback = vi.fn();
vi.mock('../../ai/client', () => ({
  callModelWithFallback: (...args: unknown[]) => mockCallModelWithFallback(...args),
}));

vi.mock('../../ai/brainlift-builder/suggest-experts', () => ({
  buildSuggestExpertsPrompt: (topic: string, purpose: string) => ({
    system: 'You are an expert recommendation engine.',
    messages: [{ role: 'user', content: `Topic: "${topic}"\nPurpose: "${purpose}"` }],
  }),
}));

import { brainliftSuggestExpertsJob } from '../brainliftSuggestExpertsJob';
import type { JobHelpers } from 'graphile-worker';

const mockHelpers = {
  logger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  },
  job: { id: 'test-job-id', attempts: 1, max_attempts: 1 },
} as unknown as JobHelpers;

const PAYLOAD = { brainliftId: 42 };

const BRAINLIFT_FIXTURE = {
  id: 42,
  title: 'Quantum Computing Basics',
  description: 'Understanding quantum computing fundamentals for software engineers',
  slug: 'quantum-computing-basics',
  author: 'Test Author',
  sourceType: 'native',
};

const AI_RESPONSE_FIXTURE = JSON.stringify({
  experts: [
    { name: 'Alice Q.', who: 'Quantum physicist at MIT', focus: 'Quantum error correction', why: 'Leading researcher in QEC', where: '@aliceq' },
    { name: 'Bob S.', who: 'CS professor at Stanford', focus: 'Quantum algorithms', why: 'Developed novel quantum algorithms', where: 'https://twitter.com/bobs' },
    { name: 'Carol M.', who: 'IBM Quantum researcher', focus: 'Quantum hardware', why: 'Builds quantum processors', where: 'https://x.com/carolm' },
    { name: 'Dave K.', who: 'Google Quantum AI lead', focus: 'Quantum supremacy', why: 'Led quantum supremacy experiments', where: '@davek' },
    { name: 'Eve L.', who: 'Quantum computing author', focus: 'Quantum education', why: 'Best-selling author on quantum computing', where: 'https://linkedin.com/in/evel' },
  ],
});

beforeEach(() => {
  vi.clearAllMocks();
});

describe('brainliftSuggestExpertsJob', () => {
  it('generates and inserts 5 expert suggestions on success', async () => {
    mockGetBrainliftById.mockResolvedValue(BRAINLIFT_FIXTURE);
    mockCallModelWithFallback.mockResolvedValue({
      content: AI_RESPONSE_FIXTURE,
      model: 'anthropic/claude-sonnet-4.6',
    });
    mockInsertSuggestedExperts.mockResolvedValue([]);
    mockSetBuilderSuggestionState.mockResolvedValue(undefined);

    const result = await brainliftSuggestExpertsJob(PAYLOAD, mockHelpers);

    expect(result).toEqual(expect.objectContaining({ success: true }));
    expect(mockGetBrainliftById).toHaveBeenCalledWith(42);
    expect(mockCallModelWithFallback).toHaveBeenCalledWith(
      expect.objectContaining({
        models: ['anthropic/claude-sonnet-4.6', 'anthropic/claude-haiku-4.5'],
        caller: 'brainliftBuilder.suggestExperts',
      })
    );
    expect(mockInsertSuggestedExperts).toHaveBeenCalledWith(42, expect.arrayContaining([
      expect.objectContaining({ name: 'Alice Q.' }),
    ]));
    expect(mockSetBuilderSuggestionState).toHaveBeenCalledWith(42, { status: 'ready', error: null });
  });

  it('sets failed status when AI call fails', async () => {
    mockGetBrainliftById.mockResolvedValue(BRAINLIFT_FIXTURE);
    mockCallModelWithFallback.mockRejectedValue(new Error('All models failed'));
    mockSetBuilderSuggestionState.mockResolvedValue(undefined);

    const result = await brainliftSuggestExpertsJob(PAYLOAD, mockHelpers);

    expect(result).toEqual(expect.objectContaining({ success: false }));
    expect(mockSetBuilderSuggestionState).toHaveBeenCalledWith(42, {
      status: 'failed',
      error: expect.stringContaining('All models failed'),
    });
    // Should NOT insert any experts
    expect(mockInsertSuggestedExperts).not.toHaveBeenCalled();
  });

  it('sets failed status when JSON parsing fails', async () => {
    mockGetBrainliftById.mockResolvedValue(BRAINLIFT_FIXTURE);
    mockCallModelWithFallback.mockResolvedValue({
      content: 'not valid json at all',
      model: 'anthropic/claude-sonnet-4.6',
    });
    mockSetBuilderSuggestionState.mockResolvedValue(undefined);

    const result = await brainliftSuggestExpertsJob(PAYLOAD, mockHelpers);

    expect(result).toEqual(expect.objectContaining({ success: false }));
    expect(mockSetBuilderSuggestionState).toHaveBeenCalledWith(42, {
      status: 'failed',
      error: expect.any(String),
    });
    expect(mockInsertSuggestedExperts).not.toHaveBeenCalled();
  });

  it('fails gracefully when brainlift not found', async () => {
    mockGetBrainliftById.mockResolvedValue(null);
    mockSetBuilderSuggestionState.mockResolvedValue(undefined);

    const result = await brainliftSuggestExpertsJob(PAYLOAD, mockHelpers);

    expect(result).toEqual(expect.objectContaining({ success: false }));
    expect(mockCallModelWithFallback).not.toHaveBeenCalled();
  });
});
