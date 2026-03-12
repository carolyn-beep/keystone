/**
 * Tests for FR2: Fact Verifier Migration to Unified Client
 *
 * Validates that factVerifier.ts uses callModel from the unified
 * AI client while preserving consensus logic and response parsing.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock the unified AI client
vi.mock('../../ai/client/index', () => ({
  callModel: vi.fn(),
}));

import {
  verifyFactWithAllModels,
  calculateConsensus,
  type ModelGradeResult,
  type VerificationResult,
} from '../../ai/factVerifier';
import { callModel } from '../../ai/client/index';

const mockCallModel = vi.mocked(callModel);

describe('Fact Verifier — Unified Client Migration', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  const defaultArgs = {
    fact: 'Spaced repetition improves long-term retention',
    source: 'Ebbinghaus, 1885',
    evidence: 'Multiple studies confirm spaced repetition effects',
    linkFailed: false,
  };

  describe('successful verification via unified callModel', () => {
    it('returns verification result with model score and rationale', async () => {
      mockCallModel.mockResolvedValue({
        content: JSON.stringify({
          score: 5,
          rationale: 'Well-supported by research',
          isNonGradeable: false,
        }),
        model: 'google/gemini-2.0-flash-001',
        durationMs: 400,
        attempts: 1,
      });

      const result = await verifyFactWithAllModels(
        defaultArgs.fact,
        defaultArgs.source,
        defaultArgs.evidence,
        defaultArgs.linkFailed,
      );

      expect(result.modelResults).toHaveLength(1);
      expect(result.modelResults[0].score).toBe(5);
      expect(result.modelResults[0].rationale).toBe('Well-supported by research');
      expect(result.modelResults[0].status).toBe('completed');
    });

    it('calls unified callModel with correct model, temperature, maxTokens, and caller', async () => {
      mockCallModel.mockResolvedValue({
        content: JSON.stringify({
          score: 4,
          rationale: 'Mostly verified',
          isNonGradeable: false,
        }),
        model: 'google/gemini-2.0-flash-001',
        durationMs: 300,
        attempts: 1,
      });

      await verifyFactWithAllModels(
        defaultArgs.fact,
        defaultArgs.source,
        defaultArgs.evidence,
        defaultArgs.linkFailed,
      );

      expect(mockCallModel).toHaveBeenCalledTimes(1);
      const callArgs = mockCallModel.mock.calls[0][0];
      expect(callArgs.model).toBe('google/gemini-2.0-flash-001');
      expect(callArgs.temperature).toBe(0.1);
      expect(callArgs.maxTokens).toBe(800);
      expect(callArgs.caller).toBe('factVerifier');
      expect(callArgs.responseFormat).toBeDefined();
      expect(callArgs.responseFormat?.type).toBe('json_schema');
    });
  });

  describe('fallback from Gemini to Qwen', () => {
    it('falls back to Qwen when Gemini fails', async () => {
      // First call (Gemini) fails
      mockCallModel
        .mockRejectedValueOnce(new Error('Gemini unavailable'))
        // Second call (Qwen) succeeds
        .mockResolvedValueOnce({
          content: JSON.stringify({
            score: 4,
            rationale: 'Qwen verified this',
            isNonGradeable: false,
          }),
          model: 'qwen/qwen3-32b',
          durationMs: 600,
          attempts: 1,
        });

      const result = await verifyFactWithAllModels(
        defaultArgs.fact,
        defaultArgs.source,
        defaultArgs.evidence,
        defaultArgs.linkFailed,
      );

      expect(mockCallModel).toHaveBeenCalledTimes(2);
      expect(result.modelResults).toHaveLength(1);
      expect(result.modelResults[0].status).toBe('completed');
      expect(result.modelResults[0].score).toBe(4);
    });
  });

  describe('both models fail', () => {
    it('returns consensus with low confidence when all models fail', async () => {
      mockCallModel
        .mockRejectedValueOnce(new Error('Gemini failed'))
        .mockRejectedValueOnce(new Error('Qwen failed'));

      const result = await verifyFactWithAllModels(
        defaultArgs.fact,
        defaultArgs.source,
        defaultArgs.evidence,
        defaultArgs.linkFailed,
      );

      // Both models failed, should have a failed result
      expect(result.modelResults).toHaveLength(1);
      expect(result.modelResults[0].status).toBe('failed');
      expect(result.modelResults[0].error).toBeTruthy();
      expect(result.consensus.confidenceLevel).toBe('low');
    });
  });

  describe('isNonGradeable flag propagation', () => {
    it('propagates isNonGradeable through consensus', async () => {
      mockCallModel.mockResolvedValue({
        content: JSON.stringify({
          score: 3,
          rationale: 'Cannot evaluate this obscure claim',
          isNonGradeable: true,
        }),
        model: 'google/gemini-2.0-flash-001',
        durationMs: 300,
        attempts: 1,
      });

      const result = await verifyFactWithAllModels(
        defaultArgs.fact,
        defaultArgs.source,
        defaultArgs.evidence,
        defaultArgs.linkFailed,
      );

      expect(result.modelResults[0].score).toBe(0); // isNonGradeable sets score to 0
      expect(result.consensus.isNonGradeable).toBe(true);
      expect(result.consensus.consensusScore).toBe(0);
    });
  });

  describe('JSON response parsing', () => {
    it('handles response with markdown code blocks', async () => {
      const contentWithMarkdown = '```json\n{"score": 4, "rationale": "Good claim", "isNonGradeable": false}\n```';

      mockCallModel.mockResolvedValue({
        content: contentWithMarkdown,
        model: 'google/gemini-2.0-flash-001',
        durationMs: 300,
        attempts: 1,
      });

      const result = await verifyFactWithAllModels(
        defaultArgs.fact,
        defaultArgs.source,
        defaultArgs.evidence,
        defaultArgs.linkFailed,
      );

      expect(result.modelResults[0].score).toBe(4);
      expect(result.modelResults[0].status).toBe('completed');
    });

    it('handles response needing control character sanitization', async () => {
      // JSON with embedded control characters in string values
      const contentWithControlChars = '{"score": 3, "rationale": "This has a\ttab and\nnewline", "isNonGradeable": false}';

      mockCallModel.mockResolvedValue({
        content: contentWithControlChars,
        model: 'google/gemini-2.0-flash-001',
        durationMs: 300,
        attempts: 1,
      });

      const result = await verifyFactWithAllModels(
        defaultArgs.fact,
        defaultArgs.source,
        defaultArgs.evidence,
        defaultArgs.linkFailed,
      );

      expect(result.modelResults[0].score).toBe(3);
      expect(result.modelResults[0].status).toBe('completed');
    });
  });

  describe('calculateConsensus (unchanged logic)', () => {
    it('returns high confidence for single successful model', () => {
      const modelResults: (ModelGradeResult & { isNonGradeable?: boolean })[] = [
        {
          model: 'google/gemini-2.0-flash-001',
          score: 4,
          rationale: 'Well supported',
          status: 'completed',
          error: null,
        },
      ];

      const consensus = calculateConsensus(modelResults);
      expect(consensus.consensusScore).toBe(4);
      expect(consensus.confidenceLevel).toBe('high');
      expect(consensus.needsReview).toBe(false);
    });

    it('returns low confidence when no models completed', () => {
      const modelResults: (ModelGradeResult & { isNonGradeable?: boolean })[] = [
        {
          model: 'google/gemini-2.0-flash-001',
          score: null,
          rationale: null,
          status: 'failed',
          error: 'Model failed',
        },
      ];

      const consensus = calculateConsensus(modelResults);
      expect(consensus.consensusScore).toBe(3); // default score
      expect(consensus.confidenceLevel).toBe('low');
      expect(consensus.needsReview).toBe(true);
    });

    it('handles isNonGradeable correctly', () => {
      const modelResults: (ModelGradeResult & { isNonGradeable?: boolean })[] = [
        {
          model: 'google/gemini-2.0-flash-001',
          score: 0,
          rationale: 'Cannot evaluate',
          status: 'completed',
          error: null,
          isNonGradeable: true,
        },
      ];

      const consensus = calculateConsensus(modelResults);
      expect(consensus.consensusScore).toBe(0);
      expect(consensus.isNonGradeable).toBe(true);
    });
  });
});
