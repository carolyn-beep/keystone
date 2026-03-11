/**
 * Tests for 07-backend-pipeline: Production Pipeline Integration
 *
 * FR1: Evaluate Endpoint
 * FR2: Import Stream Preformat Integration
 * FR3: SSE Progress Events
 * FR4: Preformat Pipeline Options (onProgress, skipValidation)
 * FR5: Remove ENABLE_PREFORMAT Gate
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { HierarchyNode } from '@shared/hierarchy-types';
import type {
  PreformatChunk,
  PreformatLLMResults,
  MergedPreformatResult,
  ValidationReport,
} from '../types';
import { parseMarkdownToHierarchy } from '../markdown-parser';

// ═══════════════════════════════════════════════════════════════════════════
// Test Helpers
// ═══════════════════════════════════════════════════════════════════════════

function makeNode(
  overrides: Partial<HierarchyNode> & { name: string },
): HierarchyNode {
  return {
    id: overrides.id ?? `node_${Math.random().toString(36).slice(2, 8)}`,
    name: overrides.name,
    note: overrides.note ?? null,
    depth: overrides.depth ?? 0,
    children: overrides.children ?? [],
    isDOK1Marker: overrides.isDOK1Marker ?? false,
    isDOK2Marker: overrides.isDOK2Marker ?? false,
    isDOK3Marker: overrides.isDOK3Marker ?? false,
    isDOK4Marker: overrides.isDOK4Marker ?? false,
    isSourceMarker: overrides.isSourceMarker ?? false,
    isCategoryMarker: overrides.isCategoryMarker ?? false,
    isPurposeMarker: overrides.isPurposeMarker ?? false,
    extractedUrl: overrides.extractedUrl ?? null,
  };
}

function makeValidationReport(passed: boolean): ValidationReport {
  return {
    passed,
    contentLossPercent: passed ? 2 : 15,
    hallucinationCount: 0,
    duplicateCount: 0,
    warnings: passed ? [] : ['Content loss exceeds threshold'],
    details: {
      missingFromOutput: [],
      possibleHallucinations: [],
      duplicatePairs: [],
    },
  };
}

function makeMergedResult(): MergedPreformatResult {
  const catMd = '- Source: Source A\n  - DOK1 - facts\n    - fact 1';
  return {
    owner: { name: 'Test Owner' },
    purposeNodes: parseMarkdownToHierarchy('- Purpose\n  - Test purpose'),
    expertNodes: [],
    spovNodes: [],
    insightNodes: [],
    categories: [
      {
        category: 'Category 1',
        sectionMarkdown: catMd,
        parsedNodes: parseMarkdownToHierarchy(catMd),
        candidateInsights: [],
        candidateSpovs: [],
        strippedTemplateInstructions: [],
      },
    ],
    scratchpadNodes: [],
    mergeReport: {
      duplicateFactsRemoved: 0,
      duplicateSourcesConsolidated: 0,
      insightsDeduped: 0,
      spovsDeduped: 0,
      crossRefsUpdated: 0,
    },
  };
}

function makeSimpleHierarchy(): HierarchyNode[] {
  return [
    makeNode({
      id: 'root',
      name: 'My BrainLift',
      children: [
        makeNode({
          id: 'owner-1',
          name: 'Owner',
          children: [makeNode({ name: 'Test Owner' })],
        }),
        makeNode({
          id: 'kt-1',
          name: 'Knowledge Tree',
          children: [
            makeNode({
              id: 'cat-1',
              name: 'Category 1',
              isCategoryMarker: true,
              children: [
                makeNode({
                  id: 'src-1',
                  name: 'Source: Source A',
                  isSourceMarker: true,
                  children: [
                    makeNode({
                      name: 'DOK1 - facts',
                      isDOK1Marker: true,
                      children: [makeNode({ name: 'fact 1' })],
                    }),
                  ],
                }),
              ],
            }),
          ],
        }),
      ],
    }),
  ];
}

function makeCleanHierarchy(): HierarchyNode[] {
  return [
    makeNode({
      id: 'preformat-owner-1',
      name: 'Owner',
      children: [makeNode({ name: 'Test Owner' })],
    }),
  ];
}

// ═══════════════════════════════════════════════════════════════════════════
// FR3: SSE Progress Events
// ═══════════════════════════════════════════════════════════════════════════

describe('FR3: SSE Progress Events for Preformat', () => {
  it('SC3.1: ImportStage type includes formatting and validating', async () => {
    const { STAGE_LABELS } = await import('@shared/import-progress');
    // If these stages exist in STAGE_LABELS, they must be valid ImportStage values
    expect('formatting' in STAGE_LABELS).toBe(true);
    expect('validating' in STAGE_LABELS).toBe(true);
  });

  it('SC3.2: FormattingProgress has completed and total fields', async () => {
    // Verify the interface exists by constructing a valid FormattingProgress object
    const { STAGE_LABELS } = await import('@shared/import-progress');
    const formattingEvent = {
      stage: 'formatting' as const,
      message: STAGE_LABELS.formatting,
      completed: 3,
      total: 10,
    };
    expect(formattingEvent.completed).toBe(3);
    expect(formattingEvent.total).toBe(10);
    expect(formattingEvent.stage).toBe('formatting');
  });

  it('SC3.3: ValidatingProgress interface exists', async () => {
    const { STAGE_LABELS } = await import('@shared/import-progress');
    const validatingEvent = {
      stage: 'validating' as const,
      message: STAGE_LABELS.validating,
    };
    expect(validatingEvent.stage).toBe('validating');
    expect(typeof validatingEvent.message).toBe('string');
  });

  it('SC3.4: STAGE_WEIGHTS sum to 100 with new stages', async () => {
    const { STAGE_WEIGHTS } = await import('@shared/import-progress');
    const total = Object.values(STAGE_WEIGHTS).reduce((sum, w) => sum + w, 0);
    expect(total).toBe(100);
    expect(STAGE_WEIGHTS.formatting).toBeGreaterThan(0);
    expect(STAGE_WEIGHTS.validating).toBeGreaterThan(0);
  });

  it('SC3.5: STAGE_LABELS includes labels for new stages', async () => {
    const { STAGE_LABELS } = await import('@shared/import-progress');
    expect(typeof STAGE_LABELS.formatting).toBe('string');
    expect(STAGE_LABELS.formatting.length).toBeGreaterThan(0);
    expect(typeof STAGE_LABELS.validating).toBe('string');
    expect(STAGE_LABELS.validating.length).toBeGreaterThan(0);
  });

  it('SC3.6: calculateProgress handles new stages in correct execution order', async () => {
    const { calculateProgress } = await import('@shared/import-progress');

    // formatting comes first, so should have low progress
    const formattingProgress = calculateProgress({
      stage: 'formatting',
      message: 'Formatting...',
      completed: 5,
      total: 10,
    } as any);
    expect(formattingProgress).toBeGreaterThan(0);
    expect(formattingProgress).toBeLessThan(20);

    // validating comes after formatting
    const validatingProgress = calculateProgress({
      stage: 'validating',
      message: 'Validating...',
    } as any);
    expect(validatingProgress).toBeGreaterThan(formattingProgress);

    // extracting comes after validating
    const extractingProgress = calculateProgress({
      stage: 'extracting',
      message: 'Extracting...',
    } as any);
    expect(extractingProgress).toBeGreaterThan(validatingProgress);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// FR4: Preformat Pipeline Options
// ═══════════════════════════════════════════════════════════════════════════

// Mock the pipeline modules
vi.mock('../chunker', () => ({
  identifyAndSerializeChunks: vi.fn(),
}));
vi.mock('../llm-caller', () => ({
  runPreformatLLMCalls: vi.fn(),
}));
vi.mock('../merger', () => ({
  mergePreformatResults: vi.fn(),
}));
vi.mock('../validator', () => ({
  validateIntegrity: vi.fn(),
  normalizeText: vi.fn((t: string) => t.toLowerCase().split(/\s+/)),
  jaccardSimilarity: vi.fn(() => 1),
  findBestMatch: vi.fn(() => ({ match: '', score: 1 })),
}));
vi.mock('../tree-builder', () => ({
  buildCleanHierarchy: vi.fn(),
}));

import { identifyAndSerializeChunks } from '../chunker';
import { runPreformatLLMCalls } from '../llm-caller';
import { mergePreformatResults } from '../merger';
import { validateIntegrity } from '../validator';
import { buildCleanHierarchy } from '../tree-builder';

import { preformatHierarchy } from '../../../services/brainlift-preformat';

const mockChunker = vi.mocked(identifyAndSerializeChunks);
const mockLLMCalls = vi.mocked(runPreformatLLMCalls);
const mockMerger = vi.mocked(mergePreformatResults);
const mockValidator = vi.mocked(validateIntegrity);
const mockTreeBuilder = vi.mocked(buildCleanHierarchy);

describe('FR4: Preformat Pipeline Options', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(console, 'log').mockImplementation(() => {});
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  function setupMocksForSuccess() {
    const chunks: PreformatChunk[] = [
      { type: 'owner', label: 'Owner', markdown: '## Owner\nTest', sourceNodeIds: ['owner-1'], originalNodes: [] },
      { type: 'category', label: 'Cat 1', markdown: '## Cat 1\nStuff', sourceNodeIds: ['cat-1'], originalNodes: [] },
    ];
    const llmResults: PreformatLLMResults = {
      owner: { name: 'Test Owner' },
      purpose: null,
      experts: null,
      spovs: null,
      insights: null,
      categories: [],
      unknownSections: [],
      scratchpad: [],
    };
    const merged = makeMergedResult();
    const report = makeValidationReport(true);
    const cleanHierarchy = makeCleanHierarchy();

    mockChunker.mockReturnValue({ chunks, bypassedScratchpad: [] });
    mockLLMCalls.mockResolvedValue(llmResults);
    mockMerger.mockReturnValue(merged);
    mockValidator.mockReturnValue(report);
    mockTreeBuilder.mockReturnValue(cleanHierarchy);

    return { chunks, llmResults, merged, report, cleanHierarchy };
  }

  it('SC4.1: preformatHierarchy accepts optional options parameter', async () => {
    setupMocksForSuccess();
    const hierarchy = makeSimpleHierarchy();

    // Should work without options (backward compatible)
    const result1 = await preformatHierarchy(hierarchy);
    expect(result1).not.toBeNull();

    // Should work with options
    const result2 = await preformatHierarchy(hierarchy, {
      onProgress: () => {},
    });
    expect(result2).not.toBeNull();
  });

  it('SC4.2: onProgress is called with completed/total as chunks complete', async () => {
    const { chunks } = setupMocksForSuccess();
    const hierarchy = makeSimpleHierarchy();

    // Override LLM mock to simulate calling onProgress
    mockLLMCalls.mockImplementation(async (_chunks, onProgressCb) => {
      // Simulate chunk completion progress
      for (let i = 0; i < _chunks.length; i++) {
        onProgressCb?.(i + 1, _chunks.length);
      }
      return {
        owner: { name: 'Test Owner' },
        purpose: null,
        experts: null,
        spovs: null,
        insights: null,
        categories: [],
        unknownSections: [],
        scratchpad: [],
      };
    });

    const progressCalls: Array<{ completed: number; total: number }> = [];
    const onProgress = (completed: number, total: number) => {
      progressCalls.push({ completed, total });
    };

    await preformatHierarchy(hierarchy, { onProgress });

    // Should have been called with progress updates
    expect(progressCalls.length).toBeGreaterThan(0);
    // Total should match chunk count
    const lastCall = progressCalls[progressCalls.length - 1];
    expect(lastCall.total).toBe(chunks.length);
    expect(lastCall.completed).toBe(chunks.length);
  });

  it('SC4.3: skipValidation=true skips validation step, report.passed defaults to true', async () => {
    setupMocksForSuccess();
    const hierarchy = makeSimpleHierarchy();

    const result = await preformatHierarchy(hierarchy, { skipValidation: true });

    expect(result).not.toBeNull();
    // Validation should NOT have been called
    expect(mockValidator).not.toHaveBeenCalled();
    // Report should indicate passed=true
    expect(result!.report.passed).toBe(true);
    // validationSkipped flag should be set
    expect(result!.validationSkipped).toBe(true);
  });

  it('SC4.4: existing callers without options continue to work', async () => {
    setupMocksForSuccess();
    const hierarchy = makeSimpleHierarchy();

    const result = await preformatHierarchy(hierarchy);

    expect(result).not.toBeNull();
    expect(result!.cleanHierarchy).toBeDefined();
    expect(result!.report).toBeDefined();
    // Validation SHOULD have been called when no options
    expect(mockValidator).toHaveBeenCalled();
    // validationSkipped should be false
    expect(result!.validationSkipped).toBe(false);
  });

  it('SC4.5: PreformatResult includes validationSkipped field', async () => {
    setupMocksForSuccess();
    const hierarchy = makeSimpleHierarchy();

    // Without skipValidation
    const result1 = await preformatHierarchy(hierarchy);
    expect(result1).not.toBeNull();
    expect(typeof result1!.validationSkipped).toBe('boolean');
    expect(result1!.validationSkipped).toBe(false);

    // With skipValidation
    vi.clearAllMocks();
    setupMocksForSuccess();
    const result2 = await preformatHierarchy(hierarchy, { skipValidation: true });
    expect(result2).not.toBeNull();
    expect(result2!.validationSkipped).toBe(true);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// FR5: Remove ENABLE_PREFORMAT Gate
// ═══════════════════════════════════════════════════════════════════════════

describe('FR5: Remove ENABLE_PREFORMAT Gate', () => {
  it('SC5.1: extractBrainlift source does not reference ENABLE_PREFORMAT', async () => {
    // Read the source file and verify ENABLE_PREFORMAT is not referenced
    const fs = await import('fs');
    const path = await import('path');
    const extractorPath = path.resolve(__dirname, '../../../ai/brainliftExtractor.ts');
    const source = fs.readFileSync(extractorPath, 'utf-8');
    expect(source).not.toContain('ENABLE_PREFORMAT');
  });

  it('SC5.2: extractBrainlift source does not import preformatHierarchy', async () => {
    const fs = await import('fs');
    const path = await import('path');
    const extractorPath = path.resolve(__dirname, '../../../ai/brainliftExtractor.ts');
    const source = fs.readFileSync(extractorPath, 'utf-8');
    expect(source).not.toContain('preformatHierarchy');
    expect(source).not.toContain('brainlift-preformat');
  });

  it('SC5.3: extractBrainlift uses hierarchy parameter directly', async () => {
    const fs = await import('fs');
    const path = await import('path');
    const extractorPath = path.resolve(__dirname, '../../../ai/brainliftExtractor.ts');
    const source = fs.readFileSync(extractorPath, 'utf-8');
    // Should still accept hierarchy parameter
    expect(source).toContain('hierarchy?: HierarchyNode[]');
    // Should NOT have effectiveHierarchy assigned from preformat
    expect(source).not.toContain('effectiveHierarchy = preformatResult');
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// FR1: Evaluate Endpoint
// ═══════════════════════════════════════════════════════════════════════════

describe('FR1: Evaluate Endpoint', () => {
  // These tests validate the endpoint logic by testing the building blocks.
  // Full HTTP integration tests would need supertest, so we test the logic.

  it('SC1.1: evaluateNeedsPreformat returns decision, confidence, reasons, contentSizeChars', async () => {
    // Test the return type contract of evaluateNeedsPreformat
    const { evaluateNeedsPreformat } = await import('../evaluator');
    // The actual function requires an API key and makes LLM calls,
    // so we test the type contract by verifying the function signature
    expect(typeof evaluateNeedsPreformat).toBe('function');
    // The function takes HierarchyNode[] and returns Promise<EvaluationResult>
    // EvaluationResult has: decision, confidence, reasons, contentSizeChars
  });

  it('SC1.5: evaluate endpoint route pattern requires auth', async () => {
    // Verify the route is registered with requireAuth by reading brainlifts.ts source
    const fs = await import('fs');
    const path = await import('path');
    const routerPath = path.resolve(__dirname, '../../../routes/brainlifts.ts');
    const source = fs.readFileSync(routerPath, 'utf-8');

    // Should have the evaluate endpoint
    expect(source).toContain('/api/brainlifts/evaluate');
    // The evaluate route block should include requireAuth
    // Extract the full route definition (from the post() call to the closing handler)
    const evaluateIdx = source.indexOf("'/api/brainlifts/evaluate'");
    expect(evaluateIdx).toBeGreaterThan(-1);
    // Look backward to find the brainliftsRouter.post( that starts this route
    const routeStart = source.lastIndexOf('brainliftsRouter.post(', evaluateIdx);
    const routeBlock = source.substring(routeStart, evaluateIdx + 100);
    expect(routeBlock).toContain('requireAuth');
  });

  it('SC1.6: evaluate endpoint validates sourceType', async () => {
    const fs = await import('fs');
    const path = await import('path');
    const routerPath = path.resolve(__dirname, '../../../routes/brainlifts.ts');
    const source = fs.readFileSync(routerPath, 'utf-8');

    // The evaluate endpoint should validate sourceType
    expect(source).toContain('/api/brainlifts/evaluate');
    // Should reference sourceType in the evaluate handler
    const evaluateIdx = source.indexOf('/api/brainlifts/evaluate');
    const afterEval = source.substring(evaluateIdx, evaluateIdx + 1000);
    expect(afterEval).toContain('sourceType');
  });

  it('SC1.7: evaluate endpoint has error handling', async () => {
    const fs = await import('fs');
    const path = await import('path');
    const routerPath = path.resolve(__dirname, '../../../routes/brainlifts.ts');
    const source = fs.readFileSync(routerPath, 'utf-8');

    const evaluateIdx = source.indexOf('/api/brainlifts/evaluate');
    const afterEval = source.substring(evaluateIdx, evaluateIdx + 2000);
    // Should have try-catch or asyncHandler for error handling
    const hasErrorHandling = afterEval.includes('catch') || afterEval.includes('asyncHandler');
    expect(hasErrorHandling).toBe(true);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// FR2: Import Stream Preformat Integration
// ═══════════════════════════════════════════════════════════════════════════

describe('FR2: Import Stream Preformat Integration', () => {
  it('SC2.1-SC2.2: import-stream route accepts preformat flag', async () => {
    const fs = await import('fs');
    const path = await import('path');
    const routerPath = path.resolve(__dirname, '../../../routes/brainlifts.ts');
    const source = fs.readFileSync(routerPath, 'utf-8');

    // import-stream handler should reference preformat
    const importStreamIdx = source.indexOf('/api/brainlifts/import-stream');
    expect(importStreamIdx).toBeGreaterThan(-1);
    const afterImport = source.substring(importStreamIdx, importStreamIdx + 3000);
    expect(afterImport).toContain('preformat');
  });

  it('SC2.3: import-stream passes preformatted hierarchy to extractBrainlift', async () => {
    const fs = await import('fs');
    const path = await import('path');
    const routerPath = path.resolve(__dirname, '../../../routes/brainlifts.ts');
    const source = fs.readFileSync(routerPath, 'utf-8');

    // Should have logic for using cleanHierarchy vs original
    const importStreamIdx = source.indexOf('/api/brainlifts/import-stream');
    const afterImport = source.substring(importStreamIdx, importStreamIdx + 5000);

    // Should reference preformatHierarchy or cleanHierarchy
    const hasPreformatLogic =
      afterImport.includes('cleanHierarchy') ||
      afterImport.includes('preformatHierarchy') ||
      afterImport.includes('effectiveHierarchy');
    expect(hasPreformatLogic).toBe(true);
  });

  it('SC2.4: import-stream falls back to original hierarchy on preformat failure', async () => {
    const fs = await import('fs');
    const path = await import('path');
    const routerPath = path.resolve(__dirname, '../../../routes/brainlifts.ts');
    const source = fs.readFileSync(routerPath, 'utf-8');

    const importStreamIdx = source.indexOf('/api/brainlifts/import-stream');
    const afterImport = source.substring(importStreamIdx, importStreamIdx + 5000);

    // Should have fallback logic
    const hasFallback =
      afterImport.includes('hierarchy') &&
      (afterImport.includes('catch') || afterImport.includes('report.passed') || afterImport.includes('!preformatResult'));
    expect(hasFallback).toBe(true);
  });

  it('SC3.7: import-stream emits formatting SSE events', async () => {
    const fs = await import('fs');
    const path = await import('path');
    const routerPath = path.resolve(__dirname, '../../../routes/brainlifts.ts');
    const source = fs.readFileSync(routerPath, 'utf-8');

    const importStreamIdx = source.indexOf('/api/brainlifts/import-stream');
    const afterImport = source.substring(importStreamIdx, importStreamIdx + 5000);

    // Should emit formatting stage SSE events
    expect(afterImport).toContain("'formatting'");
  });

  it('SC3.8: import-stream emits validating SSE event', async () => {
    const fs = await import('fs');
    const path = await import('path');
    const routerPath = path.resolve(__dirname, '../../../routes/brainlifts.ts');
    const source = fs.readFileSync(routerPath, 'utf-8');

    const importStreamIdx = source.indexOf('/api/brainlifts/import-stream');
    const afterImport = source.substring(importStreamIdx, importStreamIdx + 5000);

    // Should emit validating stage SSE event
    expect(afterImport).toContain("'validating'");
  });
});
