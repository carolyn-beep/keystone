/**
 * Tests for FR2: Fact Verifier Migration to Unified Client
 *
 * Validates that factVerifier.ts uses callModelWithFallback from the unified
 * AI client while preserving consensus logic and response parsing.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock the unified AI client
vi.mock('../../ai/client/index', () => ({
  callModelWithFallback: vi.fn(),
}));

import {
  verifyFactWithAllModels,
  calculateConsensus,
  type ModelGradeResult,
  type VerificationResult,
} from '../../ai/factVerifier';
import { callModelWithFallback } from '../../ai/client/index';

const mockCallModelWithFallback = vi.mocked(callModelWithFallback);

describe('Fact Verifier — Unified Client Migration', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.restoreAllMocks();
  });

  const defaultArgs = {
    fact: 'Spaced repetition improves long-term retention',
    source: 'Ebbinghaus, 1885',
    evidence: 'Multiple studies confirm spaced repetition effects',
    linkFailed: false,
  };

  describe('successful verification via unified callModelWithFallback', () => {
    it('returns verification result with model score and rationale', async () => {
      mockCallModelWithFallback.mockResolvedValue({
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

    it('calls callModelWithFallback with correct models, temperature, maxTokens, timeout, retries, and caller', async () => {
      mockCallModelWithFallback.mockResolvedValue({
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

      expect(mockCallModelWithFallback).toHaveBeenCalledTimes(1);
      const callArgs = mockCallModelWithFallback.mock.calls[0][0];
      expect(callArgs.models).toEqual(['qwen/qwen-plus', 'google/gemini-2.0-flash-001']);
      expect(callArgs.temperature).toBe(0.1);
      expect(callArgs.maxTokens).toBe(800);
      expect(callArgs.timeout).toBe(45_000);
      expect(callArgs.retries).toBe(2);
      expect(callArgs.caller).toBe('factVerifier');
      expect(callArgs.responseFormat).toBeDefined();
      expect(callArgs.responseFormat?.type).toBe('json_schema');
    });
  });

  describe('fallback handled by callModelWithFallback', () => {
    it('uses callModelWithFallback which handles model fallback internally', async () => {
      // callModelWithFallback handles fallback internally — only one call from our code
      mockCallModelWithFallback.mockResolvedValue({
        content: JSON.stringify({
          score: 4,
          rationale: 'Fallback model verified this',
          isNonGradeable: false,
        }),
        model: 'anthropic/claude-haiku-4.5',
        durationMs: 600,
        attempts: 2,
      });

      const result = await verifyFactWithAllModels(
        defaultArgs.fact,
        defaultArgs.source,
        defaultArgs.evidence,
        defaultArgs.linkFailed,
      );

      expect(mockCallModelWithFallback).toHaveBeenCalledTimes(1);
      expect(result.modelResults).toHaveLength(1);
      expect(result.modelResults[0].status).toBe('completed');
      expect(result.modelResults[0].score).toBe(4);
    });
  });

  describe('evidence-only prompt contract', () => {
    function mockSuccessfulVerification() {
      mockCallModelWithFallback.mockResolvedValue({
        content: JSON.stringify({
          score: 4,
          rationale: 'Verified from supplied evidence',
          isNonGradeable: false,
        }),
        model: 'google/gemini-2.0-flash-001',
        durationMs: 300,
        attempts: 1,
      });
    }

    function promptText() {
      const callArgs = mockCallModelWithFallback.mock.calls[0][0];
      return `${callArgs.system}\n${callArgs.messages[0].content}`;
    }

    it('direct evidence mode grades only from supplied submitted-source evidence', async () => {
      mockSuccessfulVerification();

      await verifyFactWithAllModels(defaultArgs.fact, defaultArgs.source, {
        content: defaultArgs.evidence,
        mode: 'direct_source',
        originalSourceUrl: 'https://example.com/source',
        evidenceError: null,
      });

      const prompt = promptText();
      expect(prompt).toContain('Use only the supplied evidence');
      expect(prompt).toContain('submitted source');
      expect(prompt).not.toMatch(/use your knowledge|training knowledge|training data|model memory|domain knowledge when evidence is unavailable/i);
    });

    it('fallback search mode requires alternate-source rationale framing', async () => {
      const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
      mockSuccessfulVerification();

      await verifyFactWithAllModels(defaultArgs.fact, defaultArgs.source, {
        content: 'Fallback evidence packet',
        mode: 'fallback_search',
        originalSourceUrl: 'https://blocked.example/source',
        evidenceError: 'HTTP 403: Forbidden',
        fallbackSources: [
          {
            title: 'Alternate Source',
            url: 'https://alt.example/article',
            siteName: 'Alt',
            content: 'Fallback evidence',
            fetchStatus: 'fetched',
          },
        ],
      });

      const prompt = promptText();
      expect(prompt).toContain('alternate accessible web sources');
      expect(prompt).toContain('original source could not be retrieved');
      expect(prompt).not.toMatch(/use your knowledge|training knowledge|training data|model memory|domain knowledge when evidence is unavailable/i);

      const logs = logSpy.mock.calls.map((call) => String(call[0])).join('\n');
      expect(logs).toContain('FALLBACK_SEARCH_SCORE score=4 confidence=high needsReview=false fallbackSources=1');
    });

    it('no evidence mode instructs non-gradeable instead of plausibility grading', async () => {
      mockCallModelWithFallback.mockResolvedValue({
        content: JSON.stringify({
          score: 1,
          rationale: 'No supplied evidence was available',
          isNonGradeable: true,
        }),
        model: 'google/gemini-2.0-flash-001',
        durationMs: 300,
        attempts: 1,
      });

      const result = await verifyFactWithAllModels(defaultArgs.fact, defaultArgs.source, {
        content: '',
        mode: 'none',
        originalSourceUrl: 'https://blocked.example/source',
        evidenceError: 'No accessible fallback web evidence found',
      });

      const prompt = promptText();
      expect(prompt).toContain('set "isNonGradeable": true');
      expect(prompt).toContain('Do not assign a plausibility score');
      expect(prompt).not.toMatch(/use your knowledge|training knowledge|training data|model memory|domain knowledge when evidence is unavailable/i);
      expect(result.consensus.isNonGradeable).toBe(true);
      expect(result.consensus.consensusScore).toBe(0);
    });

    it('keeps previous evaluation context when evidence input is provenance-rich', async () => {
      mockSuccessfulVerification();

      await verifyFactWithAllModels(
        defaultArgs.fact,
        defaultArgs.source,
        {
          content: defaultArgs.evidence,
          mode: 'direct_source',
          originalSourceUrl: null,
          evidenceError: null,
        },
        undefined,
        {
          previousScore: 5,
          previousFeedback: 'Previous rationale',
          oldText: 'old fact',
          newText: defaultArgs.fact,
          editNumber: 1,
        }
      );

      expect(promptText()).toContain('PREVIOUS EVALUATION');
      expect(promptText()).toContain('Previous rationale');
    });
  });

  describe('all models fail', () => {
    it('returns consensus with low confidence when callModelWithFallback fails', async () => {
      mockCallModelWithFallback.mockRejectedValue(new Error('All models failed'));

      const result = await verifyFactWithAllModels(
        defaultArgs.fact,
        defaultArgs.source,
        defaultArgs.evidence,
        defaultArgs.linkFailed,
      );

      // callModelWithFallback failed, should have a failed result
      expect(result.modelResults).toHaveLength(1);
      expect(result.modelResults[0].status).toBe('failed');
      expect(result.modelResults[0].error).toBeTruthy();
      expect(result.consensus.confidenceLevel).toBe('low');
    });
  });

  describe('isNonGradeable flag propagation', () => {
    it('propagates isNonGradeable through consensus', async () => {
      mockCallModelWithFallback.mockResolvedValue({
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

      mockCallModelWithFallback.mockResolvedValue({
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

      mockCallModelWithFallback.mockResolvedValue({
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
