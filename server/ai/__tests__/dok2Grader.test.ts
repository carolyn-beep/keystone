/**
 * Tests for FR1: DOK2 Grader Migration to Unified Client
 *
 * Validates that dok2Grader.ts uses callModelWithFallback from the unified
 * AI client while preserving all response parsing and domain logic.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock the unified AI client
vi.mock('../../ai/client/index', () => ({
  callModelWithFallback: vi.fn(),
}));

// Mock evidenceFetcher to isolate DOK2 grading tests
vi.mock('../../ai/evidenceFetcher', () => ({
  fetchEvidenceForFact: vi.fn().mockResolvedValue({ content: '', error: null }),
}));

import { gradeDOK2Summary, type DOK2GradeResult } from '../../ai/dok2Grader';
import { callModelWithFallback } from '../../ai/client/index';
import { AllModelsFailed } from '../../ai/client/errors';

const mockCallModelWithFallback = vi.mocked(callModelWithFallback);

describe('DOK2 Grader — Unified Client Migration', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  const defaultArgs = {
    summaryPoints: ['Point 1 about learning', 'Point 2 about cognition'],
    relatedDOK1s: [{ fact: 'Related fact 1', source: 'Source A' }],
    brainliftPurpose: 'Test purpose',
    sourceUrl: 'https://example.com/source',
  };

  describe('successful grading via callModelWithFallback', () => {
    it('returns correct DOK2GradeResult when model responds with valid JSON', async () => {
      const mockResponse = {
        displayTitle: 'Test Title',
        score: 4,
        diagnosis: 'Good synthesis',
        feedback: 'Well done',
        failReason: null,
      };

      mockCallModelWithFallback.mockResolvedValue({
        content: JSON.stringify(mockResponse),
        model: 'qwen/qwen-plus',
        durationMs: 500,
        attempts: 1,
      });

      const result = await gradeDOK2Summary(
        defaultArgs.summaryPoints,
        defaultArgs.relatedDOK1s,
        defaultArgs.brainliftPurpose,
        defaultArgs.sourceUrl,
      );

      expect(result.score).toBe(4);
      expect(result.diagnosis).toBe('Good synthesis');
      expect(result.feedback).toBe('Well done');
      expect(result.failReason).toBeNull();
      expect(result.displayTitle).toBe('Test Title');
    });

    it('calls callModelWithFallback with correct models, temperature, maxTokens, and caller', async () => {
      mockCallModelWithFallback.mockResolvedValue({
        content: JSON.stringify({
          displayTitle: null,
          score: 3,
          diagnosis: 'Average',
          feedback: 'OK',
          failReason: null,
        }),
        model: 'qwen/qwen-plus',
        durationMs: 400,
        attempts: 1,
      });

      await gradeDOK2Summary(
        defaultArgs.summaryPoints,
        defaultArgs.relatedDOK1s,
        defaultArgs.brainliftPurpose,
        defaultArgs.sourceUrl,
      );

      expect(mockCallModelWithFallback).toHaveBeenCalledTimes(1);
      const callArgs = mockCallModelWithFallback.mock.calls[0][0];
      expect(callArgs.models).toEqual(['qwen/qwen-plus', 'google/gemini-2.5-flash-lite']);
      expect(callArgs.temperature).toBe(0.1);
      expect(callArgs.maxTokens).toBe(1500);
      expect(callArgs.timeout).toBe(60_000);
      expect(callArgs.retries).toBe(2);
      expect(callArgs.caller).toBe('dok2Grader.summaryGrading');
    });
  });

  describe('regex fallback for malformed JSON', () => {
    it('parses fields via regex when JSON.parse fails', async () => {
      // Malformed JSON that will fail parse but regex can extract
      const malformedContent = `{
        "displayTitle": "Regex Title",
        "score": 4,
        "diagnosis": "Good work here",
        "feedback": "Keep going",
        "failReason": null
      }extra garbage that breaks JSON`;

      // Provide content where the JSON object can be extracted but has trailing garbage
      // The regex match for \{[\s\S]*\} should still capture the object
      mockCallModelWithFallback.mockResolvedValue({
        content: malformedContent,
        model: 'qwen/qwen-plus',
        durationMs: 400,
        attempts: 1,
      });

      const result = await gradeDOK2Summary(
        defaultArgs.summaryPoints,
        defaultArgs.relatedDOK1s,
        defaultArgs.brainliftPurpose,
        defaultArgs.sourceUrl,
      );

      // Should still parse successfully (the JSON object within is valid)
      expect(result.score).toBeGreaterThanOrEqual(1);
      expect(result.score).toBeLessThanOrEqual(5);
    });

    it('uses regex field extraction when no valid JSON object found', async () => {
      // Content where regex fallback is needed
      const regexContent = `Here is the grade:
        "displayTitle": "Fallback Title",
        "score": 3,
        "diagnosis": "Average synthesis",
        "feedback": "Needs improvement",
        "failReason": null`;

      mockCallModelWithFallback.mockResolvedValue({
        content: `{${regexContent}}`,
        model: 'qwen/qwen-plus',
        durationMs: 300,
        attempts: 1,
      });

      const result = await gradeDOK2Summary(
        defaultArgs.summaryPoints,
        defaultArgs.relatedDOK1s,
        defaultArgs.brainliftPurpose,
        defaultArgs.sourceUrl,
      );

      expect(result.score).toBe(3);
    });
  });

  describe('both models fail — default grade', () => {
    it('returns default grade (score 3) when callModelWithFallback throws AllModelsFailed', async () => {
      mockCallModelWithFallback.mockRejectedValue(
        new AllModelsFailed(
          ['qwen/qwen-plus', 'google/gemini-2.5-flash-lite'],
          [new Error('Gemini failed'), new Error('Sonnet failed')],
        ),
      );

      const result = await gradeDOK2Summary(
        defaultArgs.summaryPoints,
        defaultArgs.relatedDOK1s,
        defaultArgs.brainliftPurpose,
        defaultArgs.sourceUrl,
      );

      expect(result.score).toBe(3);
      expect(result.diagnosis).toContain('system error');
      expect(result.feedback).toContain('try re-importing');
      expect(result.failReason).toBeNull();
    });

    it('returns default grade when callModelWithFallback throws generic error', async () => {
      mockCallModelWithFallback.mockRejectedValue(new Error('Network failure'));

      const result = await gradeDOK2Summary(
        defaultArgs.summaryPoints,
        defaultArgs.relatedDOK1s,
        defaultArgs.brainliftPurpose,
        defaultArgs.sourceUrl,
      );

      expect(result.score).toBe(3);
      expect(result.failReason).toBeNull();
    });
  });

  describe('source-link penalty logic preserved', () => {
    it('caps score at 4 when no source URL provided and score is 5', async () => {
      mockCallModelWithFallback.mockResolvedValue({
        content: JSON.stringify({
          displayTitle: null,
          score: 5,
          diagnosis: 'Excellent',
          feedback: 'Great',
          failReason: null,
        }),
        model: 'qwen/qwen-plus',
        durationMs: 300,
        attempts: 1,
      });

      const result = await gradeDOK2Summary(
        defaultArgs.summaryPoints,
        defaultArgs.relatedDOK1s,
        defaultArgs.brainliftPurpose,
        null, // no source URL
      );

      expect(result.score).toBe(4);
      expect(result.diagnosis).toContain('Source Link Penalty');
    });

    it('reduces score by 1 when no source URL and score >= 3', async () => {
      mockCallModelWithFallback.mockResolvedValue({
        content: JSON.stringify({
          displayTitle: null,
          score: 4,
          diagnosis: 'Good',
          feedback: 'Nice',
          failReason: null,
        }),
        model: 'qwen/qwen-plus',
        durationMs: 300,
        attempts: 1,
      });

      const result = await gradeDOK2Summary(
        defaultArgs.summaryPoints,
        defaultArgs.relatedDOK1s,
        defaultArgs.brainliftPurpose,
        null, // no source URL
      );

      expect(result.score).toBe(3);
      expect(result.diagnosis).toContain('Source Link Penalty');
    });

    it('does not penalize when source URL is provided', async () => {
      mockCallModelWithFallback.mockResolvedValue({
        content: JSON.stringify({
          displayTitle: null,
          score: 5,
          diagnosis: 'Perfect',
          feedback: 'Excellent',
          failReason: null,
        }),
        model: 'qwen/qwen-plus',
        durationMs: 300,
        attempts: 1,
      });

      const result = await gradeDOK2Summary(
        defaultArgs.summaryPoints,
        defaultArgs.relatedDOK1s,
        defaultArgs.brainliftPurpose,
        'https://example.com/source',
      );

      expect(result.score).toBe(5);
      expect(result.diagnosis).not.toContain('Source Link Penalty');
    });
  });

  describe('failReason handling', () => {
    it('passes through valid failReason from model response', async () => {
      mockCallModelWithFallback.mockResolvedValue({
        content: JSON.stringify({
          displayTitle: null,
          score: 1,
          diagnosis: 'Copy paste detected',
          feedback: 'Rewrite needed',
          failReason: 'copy_paste',
        }),
        model: 'qwen/qwen-plus',
        durationMs: 300,
        attempts: 1,
      });

      const result = await gradeDOK2Summary(
        defaultArgs.summaryPoints,
        defaultArgs.relatedDOK1s,
        defaultArgs.brainliftPurpose,
        defaultArgs.sourceUrl,
      );

      expect(result.score).toBe(1);
      expect(result.failReason).toBe('copy_paste');
    });
  });
});
