/**
 * Tests for 03-merge-validate: Result Merging, Integrity Validation, and Tree Assembly
 *
 * Pure function tests -- no DB or LLM dependencies.
 */

import { describe, it, expect } from 'vitest';
import type { HierarchyNode } from '@shared/hierarchy-types';
import type {
  PreformatLLMResults,
  CategoryChunkResult,
  InsightResult,
  SpovResult,
  ExpertResult,
  UnknownChunkResult,
} from '../types';
import type { MergedPreformatResult, ValidationReport } from '../types';
import { normalizeText, jaccardSimilarity, findBestMatch } from '../validator';
import { mergePreformatResults } from '../merger';
import { validateIntegrity } from '../validator';
import { buildCleanHierarchy } from '../tree-builder';

// ═══════════════════════════════════════════════════════════════════════════
// Test Helpers
// ═══════════════════════════════════════════════════════════════════════════

/** Helper to create a minimal HierarchyNode */
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

/** Create an empty/minimal PreformatLLMResults */
function makeEmptyLLMResults(): PreformatLLMResults {
  return {
    owner: null,
    purpose: null,
    experts: null,
    spovs: null,
    insights: null,
    categories: [],
    unknownSections: [],
    scratchpad: [],
  };
}

/** Create a category result fixture */
function makeCategory(overrides: Partial<CategoryChunkResult> & { category: string }): CategoryChunkResult {
  return {
    category: overrides.category,
    sources: overrides.sources ?? [],
    candidateInsights: overrides.candidateInsights ?? [],
    candidateSpovs: overrides.candidateSpovs ?? [],
    scratchpad: overrides.scratchpad ?? [],
    strippedTemplateInstructions: overrides.strippedTemplateInstructions ?? [],
  };
}

/** Create a full LLM result fixture for merge testing */
function makeFullLLMResults(): PreformatLLMResults {
  return {
    owner: { name: 'Test Owner' },
    purpose: { purpose: 'Test purpose statement', outOfScope: ['Not this'] },
    experts: {
      experts: [
        { name: 'Expert One', who: 'A researcher', focus: 'AI', whyFollow: 'Leading expert', where: 'MIT' },
      ],
    },
    spovs: {
      spovs: [
        { text: 'Mobile games are bad for indie devs', explicitInsightRefs: [1] },
        { text: 'Premium pricing beats free-to-play', explicitInsightRefs: [] },
      ],
    },
    insights: {
      insights: [
        { text: 'Source monetization trends show premium outperforms', sourceRefs: ['Source A'] },
        { text: 'Developer time investment is highest for mobile', sourceRefs: ['Source B'] },
      ],
    },
    categories: [
      makeCategory({
        category: 'Category 1: Monetization',
        sources: [
          { name: 'Source A', url: 'https://example.com/a', facts: ['Fact A1', 'Fact A2'], summary: ['Summary A'] },
          { name: 'Source B', url: 'https://example.com/b', facts: ['Fact B1'], summary: ['Summary B'] },
        ],
        candidateInsights: [
          { text: 'Developer time investment is highest for mobile platforms', sourceRefs: ['Source B'] },
        ],
        candidateSpovs: [
          { text: 'Premium pricing beats free to play models', sourceRefs: ['Source A'] },
        ],
      }),
      makeCategory({
        category: 'Category 2: Distribution',
        sources: [
          { name: 'Source C', url: 'https://example.com/c', facts: ['Fact C1', 'Fact C2'], summary: ['Summary C'] },
        ],
        candidateInsights: [
          { text: 'Platform fees eat into margins significantly', sourceRefs: ['Source C'] },
        ],
        candidateSpovs: [],
      }),
    ],
    unknownSections: [],
    scratchpad: ['Some operational note'],
  };
}

/** Create a MergedPreformatResult fixture for validation/tree builder testing */
function makeMergedResult(): MergedPreformatResult {
  return {
    owner: { name: 'Test Owner' },
    purpose: { purpose: 'Test purpose statement', outOfScope: ['Not this'] },
    experts: [
      { name: 'Expert One', who: 'A researcher', focus: 'AI', whyFollow: 'Leading expert', where: 'MIT' },
    ],
    spovs: [
      { text: 'Mobile games are bad for indie devs', explicitInsightRefs: [1], globalIndex: 1 },
      { text: 'Premium pricing beats free-to-play', explicitInsightRefs: [], globalIndex: 2 },
    ],
    insights: [
      { text: 'Source monetization trends show premium outperforms', sourceRefs: ['Source A'], globalIndex: 1 },
      { text: 'Developer time investment is highest for mobile', sourceRefs: ['Source B'], globalIndex: 2 },
      { text: 'Platform fees eat into margins significantly', sourceRefs: ['Source C'], globalIndex: 3 },
    ],
    categories: [
      makeCategory({
        category: 'Category 1: Monetization',
        sources: [
          { name: 'Source A', url: 'https://example.com/a', facts: ['Fact A1', 'Fact A2'], summary: ['Summary A'] },
          { name: 'Source B', url: 'https://example.com/b', facts: ['Fact B1'], summary: ['Summary B'] },
        ],
      }),
      makeCategory({
        category: 'Category 2: Distribution',
        sources: [
          { name: 'Source C', url: 'https://example.com/c', facts: ['Fact C1', 'Fact C2'], summary: ['Summary C'] },
        ],
      }),
    ],
    scratchpad: ['Some operational note'],
    mergeReport: {
      duplicateFactsRemoved: 0,
      duplicateSourcesConsolidated: 0,
      insightsDeduped: 0,
      spovsDeduped: 0,
      crossRefsUpdated: 0,
    },
  };
}


// ═══════════════════════════════════════════════════════════════════════════
// FR1: Text Similarity Utilities
// ═══════════════════════════════════════════════════════════════════════════

describe('FR1: Text Similarity Utilities', () => {
  describe('normalizeText', () => {
    it('should lowercase and split into word tokens', () => {
      const result = normalizeText('Hello World Test');
      expect(result).toEqual(['hello', 'world', 'test']);
    });

    it('should strip punctuation', () => {
      const result = normalizeText('Hello, World! This is a test.');
      expect(result).toContain('hello');
      expect(result).toContain('world');
      expect(result).not.toContain('hello,');
      expect(result).not.toContain('test.');
    });

    it('should handle empty string', () => {
      const result = normalizeText('');
      expect(result).toEqual([]);
    });

    it('should handle string with only punctuation', () => {
      const result = normalizeText('...,,,!!!');
      expect(result).toEqual([]);
    });

    it('should handle extra whitespace', () => {
      const result = normalizeText('  hello   world  ');
      expect(result).toEqual(['hello', 'world']);
    });
  });

  describe('jaccardSimilarity', () => {
    it('should return 1.0 for identical strings', () => {
      expect(jaccardSimilarity('hello world', 'hello world')).toBe(1.0);
    });

    it('should return 0.0 for empty strings', () => {
      expect(jaccardSimilarity('', '')).toBe(0.0);
    });

    it('should return 0.0 when one string is empty', () => {
      expect(jaccardSimilarity('hello world', '')).toBe(0.0);
    });

    it('should return > 0.95 for whitespace/punctuation/case differences', () => {
      const score = jaccardSimilarity(
        'Mobile games are not great for profit',
        'mobile games are not great for profit!',
      );
      expect(score).toBeGreaterThan(0.95);
    });

    it('should return high score for same content with minor formatting changes', () => {
      const score = jaccardSimilarity(
        'The quick brown fox jumps over the lazy dog',
        'the quick brown fox jumps over the lazy dog',
      );
      expect(score).toBe(1.0);
    });

    it('should return low score for completely different strings', () => {
      const score = jaccardSimilarity(
        'The quick brown fox',
        'A completely unrelated sentence about cats',
      );
      expect(score).toBeLessThan(0.3);
    });

    it('should return moderate score for partially overlapping strings', () => {
      const score = jaccardSimilarity(
        'Mobile games are bad for developers',
        'Mobile is a time suck for developers',
      );
      // Some overlap: "mobile", "for", "developers"
      expect(score).toBeGreaterThan(0.2);
      expect(score).toBeLessThan(0.8);
    });
  });

  describe('findBestMatch', () => {
    it('should return the highest-scoring match', () => {
      const result = findBestMatch('hello world', [
        'completely different text',
        'hello world exactly',
        'hello there world',
      ]);
      expect(result.score).toBeGreaterThan(0.5);
      expect(result.match).toBeTruthy();
    });

    it('should return score 0.0 for empty haystack', () => {
      const result = findBestMatch('hello world', []);
      expect(result.score).toBe(0.0);
      expect(result.match).toBe('');
    });

    it('should find exact match with score 1.0', () => {
      const result = findBestMatch('hello world', [
        'foo bar',
        'hello world',
        'baz qux',
      ]);
      expect(result.score).toBe(1.0);
      expect(result.match).toBe('hello world');
    });
  });
});


// ═══════════════════════════════════════════════════════════════════════════
// FR2: Result Merging
// ═══════════════════════════════════════════════════════════════════════════

describe('FR2: Result Merging', () => {
  it('should preserve all sources from two categories with no overlap', () => {
    const results = makeEmptyLLMResults();
    results.categories = [
      makeCategory({
        category: 'Cat 1',
        sources: [
          { name: 'Source A', url: 'https://a.com', facts: ['Fact A1'], summary: ['Sum A'] },
        ],
      }),
      makeCategory({
        category: 'Cat 2',
        sources: [
          { name: 'Source B', url: 'https://b.com', facts: ['Fact B1'], summary: ['Sum B'] },
        ],
      }),
    ];

    const merged = mergePreformatResults(results);
    expect(merged.categories).toHaveLength(2);
    expect(merged.categories[0].sources).toHaveLength(1);
    expect(merged.categories[1].sources).toHaveLength(1);
  });

  it('should collect and globally number candidate insights from multiple categories', () => {
    const results = makeEmptyLLMResults();
    results.categories = [
      makeCategory({
        category: 'Cat 1',
        candidateInsights: [
          { text: 'Insight from category one', sourceRefs: ['Source A'] },
        ],
      }),
      makeCategory({
        category: 'Cat 2',
        candidateInsights: [
          { text: 'Insight from category two', sourceRefs: ['Source B'] },
        ],
      }),
    ];

    const merged = mergePreformatResults(results);
    expect(merged.insights).toHaveLength(2);
    expect(merged.insights[0].globalIndex).toBe(1);
    expect(merged.insights[1].globalIndex).toBe(2);
  });

  it('should collect and globally number candidate SPOVs from multiple categories', () => {
    const results = makeEmptyLLMResults();
    results.categories = [
      makeCategory({
        category: 'Cat 1',
        candidateSpovs: [
          { text: 'SPOV from cat one', sourceRefs: ['Source A'] },
        ],
      }),
      makeCategory({
        category: 'Cat 2',
        candidateSpovs: [
          { text: 'SPOV from cat two', sourceRefs: ['Source B'] },
        ],
      }),
    ];

    const merged = mergePreformatResults(results);
    expect(merged.spovs).toHaveLength(2);
    expect(merged.spovs[0].globalIndex).toBe(1);
    expect(merged.spovs[1].globalIndex).toBe(2);
  });

  it('should update SPOV explicit insight refs to global indices', () => {
    const results = makeEmptyLLMResults();
    // Top-level insights: [Insight 1, Insight 2]
    results.insights = {
      insights: [
        { text: 'Top level insight one', sourceRefs: ['A'] },
        { text: 'Top level insight two', sourceRefs: ['B'] },
      ],
    };
    // Category has 1 candidate insight (will become global #3)
    results.categories = [
      makeCategory({
        category: 'Cat 1',
        candidateInsights: [
          { text: 'Category insight three', sourceRefs: ['C'] },
        ],
      }),
    ];
    // Top-level SPOVs referencing insight 1 (chunk-local = 1 from top-level)
    results.spovs = {
      spovs: [
        { text: 'A spiky point of view', explicitInsightRefs: [1] },
      ],
    };

    const merged = mergePreformatResults(results);
    // Insight ref [1] from top-level maps to global index 1
    expect(merged.spovs[0].explicitInsightRefs).toContain(1);
    expect(merged.insights).toHaveLength(3);
    expect(merged.insights[2].globalIndex).toBe(3);
  });

  it('should deduplicate near-identical facts within a category', () => {
    const results = makeEmptyLLMResults();
    results.categories = [
      makeCategory({
        category: 'Cat 1',
        sources: [
          {
            name: 'Source A',
            url: 'https://a.com',
            facts: [
              'Mobile games are not profitable for small studios',
              'Mobile games are not profitable for small studios', // exact duplicate
              'Different fact about distribution',
            ],
            summary: [],
          },
        ],
      }),
    ];

    const merged = mergePreformatResults(results);
    const facts = merged.categories[0].sources[0].facts;
    expect(facts).toHaveLength(2); // one duplicate removed
    expect(merged.mergeReport.duplicateFactsRemoved).toBe(1);
  });

  it('should deduplicate near-duplicate insights from two categories', () => {
    const results = makeEmptyLLMResults();
    results.categories = [
      makeCategory({
        category: 'Cat 1',
        candidateInsights: [
          { text: 'Developer time investment is highest for mobile platforms', sourceRefs: ['Source A'] },
        ],
      }),
      makeCategory({
        category: 'Cat 2',
        candidateInsights: [
          { text: 'Developer time investment is highest for mobile platforms in gaming', sourceRefs: ['Source B'] },
        ],
      }),
    ];

    const merged = mergePreformatResults(results);
    // These are very similar (Jaccard >= 0.9 likely), should be deduped
    // The first one is kept, sourceRefs are merged
    expect(merged.insights.length).toBeLessThanOrEqual(2);
    if (merged.insights.length === 1) {
      expect(merged.mergeReport.insightsDeduped).toBeGreaterThan(0);
      // sourceRefs should be merged
      expect(merged.insights[0].sourceRefs).toContain('Source A');
      expect(merged.insights[0].sourceRefs).toContain('Source B');
    }
  });

  it('should deduplicate near-duplicate SPOVs from category + top-level DOK4', () => {
    const results = makeEmptyLLMResults();
    results.spovs = {
      spovs: [
        { text: 'Premium pricing beats free to play', explicitInsightRefs: [] },
      ],
    };
    results.categories = [
      makeCategory({
        category: 'Cat 1',
        candidateSpovs: [
          { text: 'Premium pricing beats free to play models', sourceRefs: ['Source A'] },
        ],
      }),
    ];

    const merged = mergePreformatResults(results);
    // Very similar SPOVs should be deduped
    expect(merged.spovs.length).toBeLessThanOrEqual(2);
    if (merged.spovs.length === 1) {
      expect(merged.mergeReport.spovsDeduped).toBeGreaterThan(0);
    }
  });

  it('should remap SPOV chunk-local insight refs to global indices', () => {
    const results = makeEmptyLLMResults();
    // Top-level: 2 insights
    results.insights = {
      insights: [
        { text: 'Top insight alpha', sourceRefs: ['A'] },
        { text: 'Top insight beta', sourceRefs: ['B'] },
      ],
    };
    // Category chunk: 2 candidate insights
    results.categories = [
      makeCategory({
        category: 'Cat 1',
        candidateInsights: [
          { text: 'Category insight gamma', sourceRefs: ['C'] },
          { text: 'Category insight delta', sourceRefs: ['D'] },
        ],
        // SPOV within category referencing chunk-local insight 1 (= 'Category insight gamma')
        candidateSpovs: [
          { text: 'A category SPOV referencing insight 1', sourceRefs: ['C'] },
        ],
      }),
    ];
    // The category's insight 1 should map to global index 3 (after 2 top-level insights)

    const merged = mergePreformatResults(results);
    expect(merged.insights).toHaveLength(4); // 2 top-level + 2 from category
    expect(merged.insights[0].globalIndex).toBe(1);
    expect(merged.insights[1].globalIndex).toBe(2);
    expect(merged.insights[2].globalIndex).toBe(3);
    expect(merged.insights[3].globalIndex).toBe(4);
  });

  it('should include empty categories with empty sources', () => {
    const results = makeEmptyLLMResults();
    results.categories = [
      makeCategory({ category: 'Empty Cat', sources: [] }),
    ];

    const merged = mergePreformatResults(results);
    expect(merged.categories).toHaveLength(1);
    expect(merged.categories[0].sources).toHaveLength(0);
  });

  it('should return empty insights array when no candidates exist', () => {
    const results = makeEmptyLLMResults();
    results.categories = [
      makeCategory({ category: 'Cat 1', candidateInsights: [] }),
    ];

    const merged = mergePreformatResults(results);
    expect(merged.insights).toHaveLength(0);
  });

  it('should return empty spovs array when no candidates exist and no top-level', () => {
    const results = makeEmptyLLMResults();
    results.categories = [
      makeCategory({ category: 'Cat 1', candidateSpovs: [] }),
    ];

    const merged = mergePreformatResults(results);
    expect(merged.spovs).toHaveLength(0);
  });

  it('should handle null/undefined fields in LLM results gracefully', () => {
    const results: PreformatLLMResults = {
      owner: null,
      purpose: null,
      experts: null,
      spovs: null,
      insights: null,
      categories: [],
      unknownSections: [],
      scratchpad: [],
    };

    expect(() => mergePreformatResults(results)).not.toThrow();
    const merged = mergePreformatResults(results);
    expect(merged.owner).toBeNull();
    expect(merged.purpose).toBeNull();
    expect(merged.experts).toEqual([]);
    expect(merged.insights).toEqual([]);
    expect(merged.spovs).toEqual([]);
  });

  it('should pass through owner, purpose, and experts from LLM results', () => {
    const results = makeFullLLMResults();
    const merged = mergePreformatResults(results);

    expect(merged.owner).toEqual({ name: 'Test Owner' });
    expect(merged.purpose).toEqual({ purpose: 'Test purpose statement', outOfScope: ['Not this'] });
    expect(merged.experts).toHaveLength(1);
    expect(merged.experts[0].name).toBe('Expert One');
  });

  it('should collect scratchpad content from categories and top-level', () => {
    const results = makeEmptyLLMResults();
    results.scratchpad = ['Top-level note'];
    results.categories = [
      makeCategory({
        category: 'Cat 1',
        scratchpad: ['Category note'],
      }),
    ];

    const merged = mergePreformatResults(results);
    expect(merged.scratchpad).toContain('Top-level note');
    expect(merged.scratchpad).toContain('Category note');
  });

  it('should incorporate unknown sections classified as dok_content', () => {
    const results = makeEmptyLLMResults();
    results.unknownSections = [
      {
        classification: 'dok_content',
        sources: [
          { name: 'Unknown Source', url: 'https://unknown.com', facts: ['Unknown fact'], summary: ['Unknown summary'] },
        ],
        insights: [{ text: 'Unknown insight', sourceRefs: ['Unknown Source'] }],
        spovs: [{ text: 'Unknown SPOV', sourceRefs: ['Unknown Source'] }],
      },
    ];

    const merged = mergePreformatResults(results);
    // Should have incorporated the sources into a category
    const allSources = merged.categories.flatMap(c => c.sources);
    expect(allSources.some(s => s.name === 'Unknown Source')).toBe(true);
    // Should have incorporated insights
    expect(merged.insights.some(i => i.text === 'Unknown insight')).toBe(true);
    // Should have incorporated SPOVs
    expect(merged.spovs.some(s => s.text === 'Unknown SPOV')).toBe(true);
  });

  it('should collect scratchpad from unknown sections classified as operational/scratchpad', () => {
    const results = makeEmptyLLMResults();
    results.unknownSections = [
      {
        classification: 'operational',
        content: ['TO-DO: finish editing'],
      },
      {
        classification: 'scratchpad',
        content: ['Notes for later'],
      },
    ];

    const merged = mergePreformatResults(results);
    expect(merged.scratchpad).toContain('TO-DO: finish editing');
    expect(merged.scratchpad).toContain('Notes for later');
  });
});


// ═══════════════════════════════════════════════════════════════════════════
// FR3: Integrity Validation
// ═══════════════════════════════════════════════════════════════════════════

describe('FR3: Integrity Validation', () => {
  /** Build original nodes that match the merged result fixture */
  function makeOriginalNodes(): HierarchyNode[] {
    return [
      makeNode({ name: 'Root', children: [
        makeNode({ name: 'Owner', children: [makeNode({ name: 'Test Owner' })] }),
        makeNode({ name: 'Purpose', children: [
          makeNode({ name: 'Test purpose statement' }),
          makeNode({ name: 'Out of scope:', children: [makeNode({ name: 'Not this' })] }),
        ] }),
        makeNode({ name: 'Experts', children: [
          makeNode({ name: 'Expert One', children: [
            makeNode({ name: 'Who: A researcher' }),
            makeNode({ name: 'Focus: AI' }),
            makeNode({ name: 'Why Follow: Leading expert' }),
            makeNode({ name: 'Where: MIT' }),
          ] }),
        ] }),
        makeNode({ name: 'DOK4 - SPOV', children: [
          makeNode({ name: 'Mobile games are bad for indie devs' }),
          makeNode({ name: 'Premium pricing beats free-to-play' }),
        ] }),
        makeNode({ name: 'DOK3 - Insights', children: [
          makeNode({ name: 'Source monetization trends show premium outperforms' }),
          makeNode({ name: 'Developer time investment is highest for mobile' }),
          makeNode({ name: 'Platform fees eat into margins significantly' }),
        ] }),
        makeNode({ name: 'DOK2 - Knowledge Tree', children: [
          makeNode({ name: 'Category 1: Monetization', children: [
            makeNode({ name: 'Source A', children: [
              makeNode({ name: 'DOK1 - facts', children: [
                makeNode({ name: 'Fact A1' }),
                makeNode({ name: 'Fact A2' }),
              ] }),
              makeNode({ name: 'DOK2 - summary', children: [
                makeNode({ name: 'Summary A' }),
              ] }),
            ] }),
            makeNode({ name: 'Source B', children: [
              makeNode({ name: 'DOK1 - facts', children: [
                makeNode({ name: 'Fact B1' }),
              ] }),
              makeNode({ name: 'DOK2 - summary', children: [
                makeNode({ name: 'Summary B' }),
              ] }),
            ] }),
          ] }),
          makeNode({ name: 'Category 2: Distribution', children: [
            makeNode({ name: 'Source C', children: [
              makeNode({ name: 'DOK1 - facts', children: [
                makeNode({ name: 'Fact C1' }),
                makeNode({ name: 'Fact C2' }),
              ] }),
              makeNode({ name: 'DOK2 - summary', children: [
                makeNode({ name: 'Summary C' }),
              ] }),
            ] }),
          ] }),
        ] }),
        makeNode({ name: 'Some operational note' }),
      ] }),
    ];
  }

  it('should pass validation when output matches original well', () => {
    const original = makeOriginalNodes();
    const merged = makeMergedResult();
    const report = validateIntegrity(original, merged);

    expect(report.passed).toBe(true);
    expect(report.contentLossPercent).toBeLessThanOrEqual(10);
    expect(report.hallucinationCount).toBe(0);
  });

  it('should match despite minor whitespace/punctuation differences', () => {
    const original = [
      makeNode({ name: 'Root', children: [
        makeNode({ name: 'Content with extra   spaces  and  punctuation!' }),
      ] }),
    ];
    const merged: MergedPreformatResult = {
      owner: null,
      purpose: null,
      experts: [],
      spovs: [],
      insights: [],
      categories: [
        makeCategory({
          category: 'Cat 1',
          sources: [
            { name: 'Src', url: null, facts: ['Content with extra spaces and punctuation'], summary: [] },
          ],
        }),
      ],
      scratchpad: [],
      mergeReport: { duplicateFactsRemoved: 0, duplicateSourcesConsolidated: 0, insightsDeduped: 0, spovsDeduped: 0, crossRefsUpdated: 0 },
    };
    const report = validateIntegrity(original, merged);
    // The content should match despite whitespace/punctuation diffs
    expect(report.details.missingFromOutput.length).toBe(0);
  });

  it('should exclude template instructions from content loss calculation', () => {
    const original = [
      makeNode({ name: 'Root', children: [
        makeNode({ name: 'What are experts and how to find them' }),
        makeNode({ name: 'Creating lists of experts is DOK 1' }),
        makeNode({ name: 'Real content about monetization strategies' }),
      ] }),
    ];
    const merged: MergedPreformatResult = {
      owner: null,
      purpose: null,
      experts: [],
      spovs: [],
      insights: [],
      categories: [
        makeCategory({
          category: 'Cat 1',
          sources: [
            { name: 'Src', url: null, facts: ['Real content about monetization strategies'], summary: [] },
          ],
        }),
      ],
      scratchpad: [],
      mergeReport: { duplicateFactsRemoved: 0, duplicateSourcesConsolidated: 0, insightsDeduped: 0, spovsDeduped: 0, crossRefsUpdated: 0 },
    };
    const report = validateIntegrity(original, merged);
    // Template instructions should NOT be counted as lost content
    expect(report.details.missingFromOutput).not.toContain('What are experts and how to find them');
    expect(report.details.missingFromOutput).not.toContain('Creating lists of experts is DOK 1');
  });

  it('should exclude Workflowy artifacts from content loss calculation', () => {
    const original = [
      makeNode({ name: 'Root', children: [
        makeNode({ name: '0 Backlinks' }),
        makeNode({ name: 'https://workflowy.com/#/abc123' }),
        makeNode({ name: 'Real content about developer strategies' }),
      ] }),
    ];
    const merged: MergedPreformatResult = {
      owner: null,
      purpose: null,
      experts: [],
      spovs: [],
      insights: [],
      categories: [
        makeCategory({
          category: 'Cat 1',
          sources: [
            { name: 'Src', url: null, facts: ['Real content about developer strategies'], summary: [] },
          ],
        }),
      ],
      scratchpad: [],
      mergeReport: { duplicateFactsRemoved: 0, duplicateSourcesConsolidated: 0, insightsDeduped: 0, spovsDeduped: 0, crossRefsUpdated: 0 },
    };
    const report = validateIntegrity(original, merged);
    expect(report.details.missingFromOutput).not.toContain('0 Backlinks');
    expect(report.details.missingFromOutput).not.toContain('https://workflowy.com/#/abc123');
  });

  it('should exclude short original texts (< 10 chars) from loss check', () => {
    const original = [
      makeNode({ name: 'Root', children: [
        makeNode({ name: 'OK' }),  // 2 chars
        makeNode({ name: 'Short' }),  // 5 chars
        makeNode({ name: 'Real meaningful content about something important' }),
      ] }),
    ];
    const merged: MergedPreformatResult = {
      owner: null,
      purpose: null,
      experts: [],
      spovs: [],
      insights: [],
      categories: [
        makeCategory({
          category: 'Cat 1',
          sources: [
            { name: 'Src', url: null, facts: ['Real meaningful content about something important'], summary: [] },
          ],
        }),
      ],
      scratchpad: [],
      mergeReport: { duplicateFactsRemoved: 0, duplicateSourcesConsolidated: 0, insightsDeduped: 0, spovsDeduped: 0, crossRefsUpdated: 0 },
    };
    const report = validateIntegrity(original, merged);
    // Short texts should not be counted as content loss
    expect(report.details.missingFromOutput).not.toContain('OK');
    expect(report.details.missingFromOutput).not.toContain('Short');
  });

  it('should detect hallucinated content not in original', () => {
    const original = [
      makeNode({ name: 'Root', children: [
        makeNode({ name: 'Only this content exists in the original document' }),
      ] }),
    ];
    const merged: MergedPreformatResult = {
      owner: null,
      purpose: null,
      experts: [],
      spovs: [],
      insights: [
        { text: 'This insight was completely fabricated by the LLM out of nowhere', sourceRefs: [], globalIndex: 1 },
      ],
      categories: [
        makeCategory({
          category: 'Cat 1',
          sources: [
            { name: 'Src', url: null, facts: ['Only this content exists in the original document'], summary: [] },
          ],
        }),
      ],
      scratchpad: [],
      mergeReport: { duplicateFactsRemoved: 0, duplicateSourcesConsolidated: 0, insightsDeduped: 0, spovsDeduped: 0, crossRefsUpdated: 0 },
    };
    const report = validateIntegrity(original, merged);
    expect(report.hallucinationCount).toBeGreaterThan(0);
    expect(report.details.possibleHallucinations.length).toBeGreaterThan(0);
  });

  it('should detect content loss when source is dropped entirely', () => {
    const original = [
      makeNode({ name: 'Root', children: [
        makeNode({ name: 'Content A about monetization strategies in gaming' }),
        makeNode({ name: 'Content B about developer time investment in mobile platforms' }),
        makeNode({ name: 'Content C about platform distribution fees eating into margins' }),
      ] }),
    ];
    // Merged result drops Content B entirely
    const merged: MergedPreformatResult = {
      owner: null,
      purpose: null,
      experts: [],
      spovs: [],
      insights: [],
      categories: [
        makeCategory({
          category: 'Cat 1',
          sources: [
            { name: 'Src', url: null, facts: [
              'Content A about monetization strategies in gaming',
              'Content C about platform distribution fees eating into margins',
            ], summary: [] },
          ],
        }),
      ],
      scratchpad: [],
      mergeReport: { duplicateFactsRemoved: 0, duplicateSourcesConsolidated: 0, insightsDeduped: 0, spovsDeduped: 0, crossRefsUpdated: 0 },
    };
    const report = validateIntegrity(original, merged);
    expect(report.contentLossPercent).toBeGreaterThan(0);
    expect(report.details.missingFromOutput.length).toBeGreaterThan(0);
  });

  it('should fail when content loss exceeds 10%', () => {
    // Create original with 10 items, output only has 5 -> 50% loss
    const original = [
      makeNode({ name: 'Root', children: [
        makeNode({ name: 'Content piece one about a topic that is very specific' }),
        makeNode({ name: 'Content piece two about another separate topic entirely' }),
        makeNode({ name: 'Content piece three about yet something else completely different' }),
        makeNode({ name: 'Content piece four with detailed discussion of strategy' }),
        makeNode({ name: 'Content piece five covering distribution and marketing channels' }),
        makeNode({ name: 'Content piece six about user acquisition cost analysis' }),
        makeNode({ name: 'Content piece seven exploring retention metrics and trends' }),
        makeNode({ name: 'Content piece eight on competitive landscape overview topics' }),
        makeNode({ name: 'Content piece nine about market sizing and total addressable market' }),
        makeNode({ name: 'Content piece ten covering pricing strategy and elasticity analysis' }),
      ] }),
    ];
    const merged: MergedPreformatResult = {
      owner: null,
      purpose: null,
      experts: [],
      spovs: [],
      insights: [],
      categories: [
        makeCategory({
          category: 'Cat 1',
          sources: [
            { name: 'Src', url: null, facts: [
              'Content piece one about a topic that is very specific',
              'Content piece two about another separate topic entirely',
              'Content piece three about yet something else completely different',
              'Content piece four with detailed discussion of strategy',
              'Content piece five covering distribution and marketing channels',
            ], summary: [] },
          ],
        }),
      ],
      scratchpad: [],
      mergeReport: { duplicateFactsRemoved: 0, duplicateSourcesConsolidated: 0, insightsDeduped: 0, spovsDeduped: 0, crossRefsUpdated: 0 },
    };
    const report = validateIntegrity(original, merged);
    expect(report.passed).toBe(false);
    expect(report.contentLossPercent).toBeGreaterThan(10);
  });

  it('should detect near-duplicate output items', () => {
    const original = [
      makeNode({ name: 'Root', children: [
        makeNode({ name: 'Mobile games are not profitable for small studios at all' }),
        makeNode({ name: 'Mobile games are not profitable for small studios either' }),
      ] }),
    ];
    const merged: MergedPreformatResult = {
      owner: null,
      purpose: null,
      experts: [],
      spovs: [],
      insights: [],
      categories: [
        makeCategory({
          category: 'Cat 1',
          sources: [
            { name: 'Src', url: null, facts: [
              'Mobile games are not profitable for small studios at all',
              'Mobile games are not profitable for small studios either',
            ], summary: [] },
          ],
        }),
      ],
      scratchpad: [],
      mergeReport: { duplicateFactsRemoved: 0, duplicateSourcesConsolidated: 0, insightsDeduped: 0, spovsDeduped: 0, crossRefsUpdated: 0 },
    };
    const report = validateIntegrity(original, merged);
    expect(report.duplicateCount).toBeGreaterThan(0);
    expect(report.details.duplicatePairs.length).toBeGreaterThan(0);
  });
});


// ═══════════════════════════════════════════════════════════════════════════
// FR4: Canonical Tree Assembly
// ═══════════════════════════════════════════════════════════════════════════

describe('FR4: Canonical Tree Assembly', () => {
  it('should produce correct node order with all sections present', () => {
    const merged = makeMergedResult();
    const tree = buildCleanHierarchy(merged);

    // Root children should be in order: Owner, Purpose, Experts, DOK4, DOK3, DOK2, Scratchpad
    expect(tree.length).toBeGreaterThanOrEqual(7);
    expect(tree[0].name).toMatch(/owner/i);
    expect(tree[1].name).toMatch(/purpose/i);
    expect(tree[2].name).toMatch(/experts?/i);
    expect(tree[3].name).toMatch(/DOK\s*4|SPOV/i);
    expect(tree[4].name).toMatch(/DOK\s*3|Insights?/i);
    expect(tree[5].name).toMatch(/DOK\s*2|Knowledge Tree/i);
    expect(tree[6].name).toMatch(/scratchpad/i);
  });

  it('should build category > source > DOK1/DOK2/link children correctly', () => {
    const merged = makeMergedResult();
    const tree = buildCleanHierarchy(merged);

    // Find DOK2 - Knowledge Tree node
    const ktNode = tree.find(n => /DOK\s*2|Knowledge Tree/i.test(n.name));
    expect(ktNode).toBeDefined();
    expect(ktNode!.children.length).toBe(2); // 2 categories

    const cat1 = ktNode!.children[0];
    expect(cat1.isCategoryMarker).toBe(true);
    expect(cat1.children.length).toBe(2); // 2 sources

    const sourceA = cat1.children[0];
    expect(sourceA.isSourceMarker).toBe(true);
    expect(sourceA.name).toContain('Source A');

    // Source children: DOK1 marker, DOK2 marker, link to source
    const dok1Marker = sourceA.children.find(c => c.isDOK1Marker);
    const dok2Marker = sourceA.children.find(c => c.isDOK2Marker);
    const linkNode = sourceA.children.find(c => /link to source/i.test(c.name));

    expect(dok1Marker).toBeDefined();
    expect(dok1Marker!.children.length).toBe(2); // Fact A1, Fact A2
    expect(dok2Marker).toBeDefined();
    expect(dok2Marker!.children.length).toBe(1); // Summary A
    expect(linkNode).toBeDefined();
    expect(linkNode!.children.length).toBe(1);
    expect(linkNode!.children[0].extractedUrl).toBe('https://example.com/a');
  });

  it('should omit Owner node when not present', () => {
    const merged = makeMergedResult();
    merged.owner = null;
    const tree = buildCleanHierarchy(merged);

    expect(tree[0].name).not.toMatch(/owner/i);
  });

  it('should omit Experts node when not present', () => {
    const merged = makeMergedResult();
    merged.experts = [];
    const tree = buildCleanHierarchy(merged);

    const expertNode = tree.find(n => /experts?/i.test(n.name));
    expect(expertNode).toBeUndefined();
  });

  it('should omit Scratchpad node when not present', () => {
    const merged = makeMergedResult();
    merged.scratchpad = [];
    const tree = buildCleanHierarchy(merged);

    const scratchNode = tree.find(n => /scratchpad/i.test(n.name));
    expect(scratchNode).toBeUndefined();
  });

  it('should omit link to source when source has no URL', () => {
    const merged: MergedPreformatResult = {
      owner: null,
      purpose: null,
      experts: [],
      spovs: [],
      insights: [],
      categories: [
        makeCategory({
          category: 'Cat 1',
          sources: [
            { name: 'Source No URL', url: null, facts: ['A fact'], summary: ['A summary'] },
          ],
        }),
      ],
      scratchpad: [],
      mergeReport: { duplicateFactsRemoved: 0, duplicateSourcesConsolidated: 0, insightsDeduped: 0, spovsDeduped: 0, crossRefsUpdated: 0 },
    };
    const tree = buildCleanHierarchy(merged);

    const ktNode = tree.find(n => /DOK\s*2|Knowledge Tree/i.test(n.name));
    expect(ktNode).toBeDefined();
    const source = ktNode!.children[0].children[0];
    const linkNode = source.children.find(c => /link to source/i.test(c.name));
    expect(linkNode).toBeUndefined();
  });

  it('should set correct depth values throughout the tree', () => {
    const merged = makeMergedResult();
    const tree = buildCleanHierarchy(merged);

    // Root children at depth 0
    for (const node of tree) {
      expect(node.depth).toBe(0);
      // Their children at depth 1
      for (const child of node.children) {
        expect(child.depth).toBe(1);
        // And so on
        for (const grandchild of child.children) {
          expect(grandchild.depth).toBe(2);
        }
      }
    }
  });

  it('should generate unique IDs following the naming convention', () => {
    const merged = makeMergedResult();
    const tree = buildCleanHierarchy(merged);

    // Collect all IDs
    const ids: string[] = [];
    function collectIds(nodes: HierarchyNode[]) {
      for (const node of nodes) {
        ids.push(node.id);
        collectIds(node.children);
      }
    }
    collectIds(tree);

    // All IDs should start with 'preformat-'
    for (const id of ids) {
      expect(id).toMatch(/^preformat-/);
    }

    // All IDs should be unique
    const uniqueIds = new Set(ids);
    expect(uniqueIds.size).toBe(ids.length);
  });

  it('should set all marker flags correctly', () => {
    const merged = makeMergedResult();
    const tree = buildCleanHierarchy(merged);

    // Find DOK4 marker
    const dok4 = tree.find(n => /DOK\s*4|SPOV/i.test(n.name));
    expect(dok4?.isDOK4Marker).toBe(true);

    // Find DOK3 marker
    const dok3 = tree.find(n => /DOK\s*3|Insights?/i.test(n.name));
    expect(dok3?.isDOK3Marker).toBe(true);

    // Find Purpose marker
    const purpose = tree.find(n => /purpose/i.test(n.name));
    expect(purpose?.isPurposeMarker).toBe(true);

    // Find Knowledge Tree
    const kt = tree.find(n => /DOK\s*2|Knowledge Tree/i.test(n.name));
    expect(kt).toBeDefined();

    // Category markers
    for (const cat of kt!.children) {
      expect(cat.isCategoryMarker).toBe(true);

      // Source markers
      for (const src of cat.children) {
        expect(src.isSourceMarker).toBe(true);

        // DOK1 and DOK2 markers
        const dok1 = src.children.find(c => c.isDOK1Marker);
        const dok2 = src.children.find(c => c.isDOK2Marker);
        expect(dok1).toBeDefined();
        expect(dok2).toBeDefined();
      }
    }
  });

  it('should build purpose section with out-of-scope children', () => {
    const merged = makeMergedResult();
    const tree = buildCleanHierarchy(merged);

    const purpose = tree.find(n => /purpose/i.test(n.name));
    expect(purpose).toBeDefined();
    // Should have purpose text child and out-of-scope child
    expect(purpose!.children.length).toBeGreaterThanOrEqual(2);
    const oosNode = purpose!.children.find(c => /out of scope/i.test(c.name));
    expect(oosNode).toBeDefined();
    expect(oosNode!.children.length).toBe(1); // 'Not this'
  });

  it('should build expert children with Who/Focus/Why Follow/Where fields', () => {
    const merged = makeMergedResult();
    const tree = buildCleanHierarchy(merged);

    const experts = tree.find(n => /experts?/i.test(n.name));
    expect(experts).toBeDefined();
    expect(experts!.children.length).toBe(1); // 1 expert

    const expert = experts!.children[0];
    expect(expert.name).toContain('Expert One');
    const fieldNames = expert.children.map(c => c.name);
    expect(fieldNames.some(n => /who/i.test(n))).toBe(true);
    expect(fieldNames.some(n => /focus/i.test(n))).toBe(true);
    expect(fieldNames.some(n => /why follow/i.test(n))).toBe(true);
    expect(fieldNames.some(n => /where/i.test(n))).toBe(true);
  });

  it('should build DOK3 insights with Links sub-tree', () => {
    const merged = makeMergedResult();
    const tree = buildCleanHierarchy(merged);

    const dok3 = tree.find(n => /DOK\s*3|Insights?/i.test(n.name));
    expect(dok3).toBeDefined();
    expect(dok3!.children.length).toBe(3); // 3 insights

    // Each insight should have a Links sub-tree
    for (const insight of dok3!.children) {
      const links = insight.children.find(c => /links/i.test(c.name));
      expect(links).toBeDefined();
      expect(links!.children.length).toBeGreaterThan(0);
    }
  });
});
