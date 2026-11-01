/**
 * Tests for FR3 (Brainlift Extractor Pass-Through) and FR5 (Import Integration)
 *
 * FR3: BrainliftOutput includes dok4Spovs from hierarchy extraction
 * FR5: saveBrainliftFromAI saves DOK4 SPOVs and runs auto-linking
 *
 * These test import progress types (pure type tests) and
 * the brainlift extractor output shape.
 */

import { describe, it, expect } from 'vitest';
import type { ImportStage } from '@shared/import-progress';
import { STAGE_LABELS, STAGE_WEIGHTS } from '@shared/import-progress';
import type { DOK4ExtractedSpov } from '@shared/hierarchy-types';

// ═══════════════════════════════════════════════════════════════════════════
// FR3: Brainlift Extractor DOK4 Pass-Through
// ═══════════════════════════════════════════════════════════════════════════

describe('FR3: BrainliftOutput DOK4 pass-through', () => {
  it('DOK4ExtractedSpov type has required fields', () => {
    const spov: DOK4ExtractedSpov = {
      id: 'spov-1',
      text: 'Some spiky point of view claim',
      workflowyNodeId: 'wf-123',
      explicitDok3Refs: [1, 3, 5],
    };

    expect(spov.id).toBe('spov-1');
    expect(spov.text).toBe('Some spiky point of view claim');
    expect(spov.workflowyNodeId).toBe('wf-123');
    expect(spov.explicitDok3Refs).toEqual([1, 3, 5]);
  });

  it('DOK4ExtractedSpov allows null explicitDok3Refs', () => {
    const spov: DOK4ExtractedSpov = {
      id: 'spov-1',
      text: 'SPOV without explicit links',
      workflowyNodeId: 'wf-456',
      explicitDok3Refs: null,
    };

    expect(spov.explicitDok3Refs).toBeNull();
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// FR5: Import Progress Types
// ═══════════════════════════════════════════════════════════════════════════

describe('FR5: Import progress DOK4 stages', () => {
  it('ImportStage includes dok4_extraction', () => {
    const stage: ImportStage = 'dok4_extraction';
    expect(stage).toBe('dok4_extraction');
  });

  it('ImportStage includes dok4_linking', () => {
    const stage: ImportStage = 'dok4_linking';
    expect(stage).toBe('dok4_linking');
  });

  it('STAGE_LABELS has entries for DOK4 stages', () => {
    expect(STAGE_LABELS.dok4_extraction).toBeDefined();
    expect(STAGE_LABELS.dok4_linking).toBeDefined();
    expect(typeof STAGE_LABELS.dok4_extraction).toBe('string');
    expect(typeof STAGE_LABELS.dok4_linking).toBe('string');
  });

  it('STAGE_WEIGHTS has entries for DOK4 stages', () => {
    expect(STAGE_WEIGHTS.dok4_extraction).toBeDefined();
    expect(STAGE_WEIGHTS.dok4_linking).toBeDefined();
    expect(typeof STAGE_WEIGHTS.dok4_extraction).toBe('number');
    expect(typeof STAGE_WEIGHTS.dok4_linking).toBe('number');
  });

  it('STAGE_WEIGHTS still sum to 100', () => {
    const total = Object.values(STAGE_WEIGHTS).reduce((sum, w) => sum + w, 0);
    expect(total).toBe(100);
  });
});
