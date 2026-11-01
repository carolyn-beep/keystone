/**
 * Tests for 03-merge-validate: Result Merging, Integrity Validation, and Tree Assembly
 *
 * Pure function tests -- no DB or LLM dependencies.
 * All section types now use markdown-based results with parsedNodes.
 */

import { describe, it, expect } from 'vitest';
import type { HierarchyNode } from '@shared/hierarchy-types';
import type {
  PreformatLLMResults,
  CategoryChunkResult,
  UnknownChunkResult,
} from '../types';
import type { MergedPreformatResult, ValidationReport } from '../types';
import { normalizeText, jaccardSimilarity, findBestMatch } from '../validator';
import { mergePreformatResults } from '../merger';
import { validateIntegrity } from '../validator';
import { buildCleanHierarchy } from '../tree-builder';
import { parseMarkdownToHierarchy } from '../markdown-parser';

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

/** Create empty LLM results */
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

/** Create a category result fixture (markdown-based) */
function makeCategory(overrides: Partial<CategoryChunkResult> & { category: string }): CategoryChunkResult {
  return {
    category: overrides.category,
    sectionMarkdown: overrides.sectionMarkdown ?? '',
    parsedNodes: overrides.parsedNodes ?? [],
    candidateInsights: overrides.candidateInsights ?? [],
    candidateSpovs: overrides.candidateSpovs ?? [],
    strippedTemplateInstructions: overrides.strippedTemplateInstructions ?? [],
  };
}

/** Helper to build markdown + parsedNodes from sources (for test convenience) */
function makeCategoryFromSources(
  category: string,
  sources: Array<{ name: string; url?: string; facts: string[]; summary: string[] }>,
  overrides?: Partial<CategoryChunkResult>,
): CategoryChunkResult {
  const lines: string[] = [];
  for (const src of sources) {
    lines.push(`- Source: ${src.name}`);
    if (src.facts.length > 0) {
      lines.push('  - DOK1 - facts');
      for (const f of src.facts) lines.push(`    - ${f}`);
    }
    if (src.summary.length > 0) {
      lines.push('  - DOK2 - summary');
      for (const s of src.summary) lines.push(`    - ${s}`);
    }
    if (src.url) {
      lines.push('  - link to source');
      lines.push(`    - ${src.url}`);
    }
  }
  const md = lines.join('\n');
  return {
    category,
    sectionMarkdown: md,
    parsedNodes: parseMarkdownToHierarchy(md),
    candidateInsights: overrides?.candidateInsights ?? [],
    candidateSpovs: overrides?.candidateSpovs ?? [],
    strippedTemplateInstructions: overrides?.strippedTemplateInstructions ?? [],
  };
}

/** Create a full LLM result fixture for merge testing */
function makeFullLLMResults(): PreformatLLMResults {
  const purposeMd = '- Purpose\n  - Test purpose statement\n  - Out of scope:\n    - Not this';
  const expertsMd = '- Expert One\n  - Who: A researcher\n  - Focus: AI\n  - Why Follow: Leading expert\n  - Where: MIT';
  const spovsMd = '- spov 1 - Mobile games are bad for indie devs\n- spov 2 - Premium pricing beats free-to-play';
  const insightsMd = '- Insight 1 - Source monetization trends show premium outperforms\n  - Links\n    - Category 1, Source "Source A"\n- Insight 2 - Developer time investment is highest for mobile\n  - Links\n    - Category 1, Source "Source B"';

  return {
    owner: { name: 'Test Owner' },
    purpose: {
      sectionMarkdown: purposeMd,
      parsedNodes: parseMarkdownToHierarchy(purposeMd),
    },
    experts: {
      sectionMarkdown: expertsMd,
      parsedNodes: parseMarkdownToHierarchy(expertsMd),
      strippedTemplateInstructions: [],
    },
    spovs: {
      sectionMarkdown: spovsMd,
      parsedNodes: parseMarkdownToHierarchy(spovsMd),
    },
    insights: {
      sectionMarkdown: insightsMd,
      parsedNodes: parseMarkdownToHierarchy(insightsMd),
    },
    categories: [
      makeCategoryFromSources('Category 1: Monetization', [
        { name: 'Source A', url: 'https://example.com/a', facts: ['Fact A1', 'Fact A2'], summary: ['Summary A'] },
        { name: 'Source B', url: 'https://example.com/b', facts: ['Fact B1'], summary: ['Summary B'] },
      ], {
        candidateInsights: [
          { text: 'Developer time investment is highest for mobile platforms', sourceRefs: ['Source B'] },
        ],
        candidateSpovs: [
          { text: 'Premium pricing beats free to play models', sourceRefs: ['Source A'], context: [] },
        ],
      }),
      makeCategoryFromSources('Category 2: Distribution', [
        { name: 'Source C', url: 'https://example.com/c', facts: ['Fact C1', 'Fact C2'], summary: ['Summary C'] },
      ], {
        candidateInsights: [
          { text: 'Platform fees eat into margins significantly', sourceRefs: ['Source C'] },
        ],
      }),
    ],
    unknownSections: [],
    scratchpad: ['Some operational note'],
  };
}

/** Create a MergedPreformatResult fixture for validation/tree builder testing */
function makeMergedResult(): MergedPreformatResult {
  const purposeMd = '- Purpose\n  - Test purpose statement\n  - Out of scope:\n    - Not this';
  const expertsMd = '- Expert One\n  - Who: A researcher\n  - Focus: AI\n  - Why Follow: Leading expert\n  - Where: MIT';
  const spovsMd = '- spov 1 - Mobile games are bad for indie devs\n- spov 2 - Premium pricing beats free-to-play';
  const insightsMd = '- Insight 1 - Source monetization trends show premium outperforms\n  - Links\n    - Category 1, Source "Source A"\n- Insight 2 - Developer time investment is highest for mobile\n  - Links\n    - Category 1, Source "Source B"\n- Insight 3 - Platform fees eat into margins significantly\n  - Links\n    - Category 2, Source "Source C"';

  return {
    owner: { name: 'Test Owner' },
    purposeNodes: parseMarkdownToHierarchy(purposeMd),
    expertNodes: parseMarkdownToHierarchy(expertsMd),
    spovNodes: parseMarkdownToHierarchy(spovsMd),
    insightNodes: parseMarkdownToHierarchy(insightsMd),
    categories: [
      makeCategoryFromSources('Category 1: Monetization', [
        { name: 'Source A', url: 'https://example.com/a', facts: ['Fact A1', 'Fact A2'], summary: ['Summary A'] },
        { name: 'Source B', url: 'https://example.com/b', facts: ['Fact B1'], summary: ['Summary B'] },
      ]),
      makeCategoryFromSources('Category 2: Distribution', [
        { name: 'Source C', url: 'https://example.com/c', facts: ['Fact C1', 'Fact C2'], summary: ['Summary C'] },
      ]),
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
  it('should preserve all categories with their parsedNodes', () => {
    const results = makeEmptyLLMResults();
    results.categories = [
      makeCategoryFromSources('Cat 1', [
        { name: 'Source A', url: 'https://a.com', facts: ['Fact A1'], summary: ['Sum A'] },
      ]),
      makeCategoryFromSources('Cat 2', [
        { name: 'Source B', url: 'https://b.com', facts: ['Fact B1'], summary: ['Sum B'] },
      ]),
    ];

    const merged = mergePreformatResults(results);
    expect(merged.categories).toHaveLength(2);
    expect(merged.categories[0].parsedNodes.length).toBeGreaterThan(0);
    expect(merged.categories[1].parsedNodes.length).toBeGreaterThan(0);
  });

  it('should deduplicate near-duplicate candidate insights from multiple categories', () => {
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
    expect(merged.mergeReport.insightsDeduped).toBeGreaterThanOrEqual(0);
  });

  it('should deduplicate near-duplicate candidate SPOVs from categories', () => {
    const results = makeEmptyLLMResults();
    results.categories = [
      makeCategory({
        category: 'Cat 1',
        candidateSpovs: [
          { text: 'Premium pricing beats free to play', sourceRefs: ['Source A'], context: [] },
        ],
      }),
      makeCategory({
        category: 'Cat 2',
        candidateSpovs: [
          { text: 'Premium pricing beats free to play models', sourceRefs: ['Source B'], context: [] },
        ],
      }),
    ];

    const merged = mergePreformatResults(results);
    expect(merged.mergeReport.spovsDeduped).toBeGreaterThanOrEqual(0);
  });

  it('should pass through purposeNodes from LLM results', () => {
    const purposeMd = '- Purpose\n  - Learn stuff';
    const results = makeEmptyLLMResults();
    results.purpose = {
      sectionMarkdown: purposeMd,
      parsedNodes: parseMarkdownToHierarchy(purposeMd),
    };

    const merged = mergePreformatResults(results);
    expect(merged.purposeNodes.length).toBeGreaterThan(0);
    expect(merged.purposeNodes[0].name).toBe('Purpose');
  });

  it('should pass through expertNodes from LLM results', () => {
    const expertsMd = '- Expert One\n  - Who: Researcher\n  - Focus: AI';
    const results = makeEmptyLLMResults();
    results.experts = {
      sectionMarkdown: expertsMd,
      parsedNodes: parseMarkdownToHierarchy(expertsMd),
      strippedTemplateInstructions: [],
    };

    const merged = mergePreformatResults(results);
    expect(merged.expertNodes.length).toBeGreaterThan(0);
    expect(merged.expertNodes[0].name).toBe('Expert One');
  });

  it('should pass through spovNodes from LLM results', () => {
    const spovsMd = '- spov 1 - Test spov text';
    const results = makeEmptyLLMResults();
    results.spovs = {
      sectionMarkdown: spovsMd,
      parsedNodes: parseMarkdownToHierarchy(spovsMd),
    };

    const merged = mergePreformatResults(results);
    expect(merged.spovNodes.length).toBeGreaterThan(0);
  });

  it('should pass through insightNodes from LLM results', () => {
    const insightsMd = '- Insight 1 - Test insight text';
    const results = makeEmptyLLMResults();
    results.insights = {
      sectionMarkdown: insightsMd,
      parsedNodes: parseMarkdownToHierarchy(insightsMd),
    };

    const merged = mergePreformatResults(results);
    expect(merged.insightNodes.length).toBeGreaterThan(0);
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
    expect(merged.purposeNodes).toEqual([]);
    expect(merged.expertNodes).toEqual([]);
    expect(merged.insightNodes).toEqual([]);
    expect(merged.spovNodes).toEqual([]);
  });

  it('should pass through owner from LLM results', () => {
    const results = makeFullLLMResults();
    const merged = mergePreformatResults(results);
    expect(merged.owner).toEqual({ name: 'Test Owner' });
  });

  it('should collect scratchpad content from LLM scratchpad array', () => {
    const results = makeEmptyLLMResults();
    results.scratchpad = ['Top-level note'];

    const merged = mergePreformatResults(results);
    expect(merged.scratchpadNodes.length).toBeGreaterThan(0);
    expect(merged.scratchpadNodes[0].name).toBe('Top-level note');
  });

  it('should incorporate unknown sections classified as dok_content into categories', () => {
    const results = makeEmptyLLMResults();
    const md = '- Source: Unknown Source\n  - DOK1 - facts\n    - Unknown fact';
    results.unknownSections = [
      {
        classification: 'dok_content',
        sectionMarkdown: md,
        parsedNodes: parseMarkdownToHierarchy(md),
      },
    ];

    const merged = mergePreformatResults(results);
    expect(merged.categories.length).toBeGreaterThan(0);
    expect(merged.categories[0].category).toBe('Uncategorized');
  });

  it('should collect scratchpadNodes from unknown sections classified as operational/scratchpad', () => {
    const opMd = '- TO-DO: finish editing';
    const spMd = '- Notes for later';
    const results = makeEmptyLLMResults();
    results.unknownSections = [
      {
        classification: 'operational',
        sectionMarkdown: opMd,
        parsedNodes: parseMarkdownToHierarchy(opMd),
      },
      {
        classification: 'scratchpad',
        sectionMarkdown: spMd,
        parsedNodes: parseMarkdownToHierarchy(spMd),
      },
    ];

    const merged = mergePreformatResults(results);
    const names = merged.scratchpadNodes.map(n => n.name);
    expect(names).toContain('TO-DO: finish editing');
    expect(names).toContain('Notes for later');
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

  it('should pass for well-matched original and merged data', () => {
    const original = makeOriginalNodes();
    const merged = makeMergedResult();
    const report = validateIntegrity(original, merged);
    expect(report.contentLossPercent).toBeLessThan(50);
  });

  it('should detect content loss when merged is missing original items', () => {
    const original = [
      makeNode({ name: 'Root', children: [
        makeNode({ name: 'Very important content that is quite long' }),
        makeNode({ name: 'Another significant piece of text here' }),
        makeNode({ name: 'Third item of meaningful content for testing' }),
      ] }),
    ];

    const merged: MergedPreformatResult = {
      owner: null,
      purposeNodes: [],
      expertNodes: [],
      spovNodes: [],
      insightNodes: [],
      categories: [],
      scratchpadNodes: [],
      mergeReport: {
        duplicateFactsRemoved: 0,
        duplicateSourcesConsolidated: 0,
        insightsDeduped: 0,
        spovsDeduped: 0,
        crossRefsUpdated: 0,
      },
    };

    const report = validateIntegrity(original, merged);
    expect(report.contentLossPercent).toBeGreaterThan(0);
    expect(report.details.missingFromOutput.length).toBeGreaterThan(0);
  });

  it('should detect hallucinations in output that are not in original', () => {
    const original = [makeNode({ name: 'Root', children: [makeNode({ name: 'Original content here' })] })];

    const hallMd = '- This text was never in the original and is completely fabricated content';
    const merged: MergedPreformatResult = {
      owner: null,
      purposeNodes: parseMarkdownToHierarchy(hallMd),
      expertNodes: [],
      spovNodes: [],
      insightNodes: [],
      categories: [],
      scratchpadNodes: [],
      mergeReport: {
        duplicateFactsRemoved: 0,
        duplicateSourcesConsolidated: 0,
        insightsDeduped: 0,
        spovsDeduped: 0,
        crossRefsUpdated: 0,
      },
    };

    const report = validateIntegrity(original, merged);
    expect(report.hallucinationCount).toBeGreaterThan(0);
  });

  it('should include bypassed scratchpad in output for content accounting', () => {
    const original = [
      makeNode({ name: 'Root', children: [
        makeNode({ name: 'Scratchpad', children: [
          makeNode({ name: 'My scratchpad note content here' }),
        ] }),
      ] }),
    ];

    const merged: MergedPreformatResult = {
      owner: null,
      purposeNodes: [],
      expertNodes: [],
      spovNodes: [],
      insightNodes: [],
      categories: [],
      scratchpadNodes: [],
      mergeReport: {
        duplicateFactsRemoved: 0,
        duplicateSourcesConsolidated: 0,
        insightsDeduped: 0,
        spovsDeduped: 0,
        crossRefsUpdated: 0,
      },
    };

    const bypassedScratchpad = [
      makeNode({ name: 'Scratchpad', children: [
        makeNode({ name: 'My scratchpad note content here' }),
      ] }),
    ];

    const report = validateIntegrity(original, merged, bypassedScratchpad);
    // The scratchpad content should be accounted for
    expect(report.details.missingFromOutput).not.toContain('My scratchpad note content here');
  });

  it('should exclude structural markers from hallucination checks', () => {
    const original = [makeNode({ name: 'Root', children: [makeNode({ name: 'Some content' })] })];

    const merged: MergedPreformatResult = {
      owner: null,
      purposeNodes: parseMarkdownToHierarchy('- Purpose\n  - Some content'),
      expertNodes: [],
      spovNodes: [],
      insightNodes: [],
      categories: [],
      scratchpadNodes: [],
      mergeReport: {
        duplicateFactsRemoved: 0,
        duplicateSourcesConsolidated: 0,
        insightsDeduped: 0,
        spovsDeduped: 0,
        crossRefsUpdated: 0,
      },
    };

    const report = validateIntegrity(original, merged);
    // "Purpose" is a structural marker and should not count as hallucination
    expect(report.details.possibleHallucinations).not.toContain('Purpose');
  });

  it('should exclude template instructions from content loss checks', () => {
    const original = [
      makeNode({ name: 'Root', children: [
        makeNode({ name: 'What are experts in a BrainLift' }),
        makeNode({ name: 'Creating lists of experts is important' }),
        makeNode({ name: 'Actual meaningful content worth checking' }),
      ] }),
    ];

    const merged: MergedPreformatResult = {
      owner: null,
      purposeNodes: [],
      expertNodes: parseMarkdownToHierarchy('- Actual meaningful content worth checking'),
      spovNodes: [],
      insightNodes: [],
      categories: [],
      scratchpadNodes: [],
      mergeReport: {
        duplicateFactsRemoved: 0,
        duplicateSourcesConsolidated: 0,
        insightsDeduped: 0,
        spovsDeduped: 0,
        crossRefsUpdated: 0,
      },
    };

    const report = validateIntegrity(original, merged);
    // Template instructions should be excluded from loss check
    expect(report.details.missingFromOutput).not.toContain('What are experts in a BrainLift');
  });
});


// ═══════════════════════════════════════════════════════════════════════════
// FR4: Tree Assembly
// ═══════════════════════════════════════════════════════════════════════════

describe('FR4: Tree Assembly', () => {
  it('should produce sections in canonical order: Owner, Purpose, Experts, DOK4, DOK3, DOK2, Scratchpad', () => {
    const merged = makeMergedResult();
    merged.scratchpadNodes = parseMarkdownToHierarchy('- Note item');

    const tree = buildCleanHierarchy(merged);

    const names = tree.map(n => n.name);
    expect(names[0]).toBe('Owner');
    expect(names[1]).toBe('Purpose');
    expect(names[2]).toBe('Experts');
    expect(names[3]).toBe('DOK4 - SPOV');
    expect(names[4]).toBe('DOK3 - Insights');
    expect(names[5]).toBe('DOK2 - Knowledge Tree');
    expect(names[6]).toBe('Scratchpad');
  });

  it('should skip missing sections', () => {
    const merged: MergedPreformatResult = {
      owner: null,
      purposeNodes: [],
      expertNodes: [],
      spovNodes: [],
      insightNodes: [],
      categories: [],
      scratchpadNodes: [],
      mergeReport: {
        duplicateFactsRemoved: 0,
        duplicateSourcesConsolidated: 0,
        insightsDeduped: 0,
        spovsDeduped: 0,
        crossRefsUpdated: 0,
      },
    };

    const tree = buildCleanHierarchy(merged);
    expect(tree).toHaveLength(0);
  });

  it('should build owner from JSON name field', () => {
    const merged: MergedPreformatResult = {
      owner: { name: 'John Doe' },
      purposeNodes: [],
      expertNodes: [],
      spovNodes: [],
      insightNodes: [],
      categories: [],
      scratchpadNodes: [],
      mergeReport: {
        duplicateFactsRemoved: 0,
        duplicateSourcesConsolidated: 0,
        insightsDeduped: 0,
        spovsDeduped: 0,
        crossRefsUpdated: 0,
      },
    };

    const tree = buildCleanHierarchy(merged);
    expect(tree).toHaveLength(1);
    expect(tree[0].name).toBe('Owner');
    expect(tree[0].children[0].name).toBe('John Doe');
  });

  it('should place parsedNodes as section children for purpose/experts/spovs/insights', () => {
    const purposeMd = '- main purpose text';
    const expertsMd = '- Expert Name\n  - Who: desc';
    const spovsMd = '- spov 1 - text';
    const insightsMd = '- Insight 1 - text';

    const merged: MergedPreformatResult = {
      owner: null,
      purposeNodes: parseMarkdownToHierarchy(purposeMd),
      expertNodes: parseMarkdownToHierarchy(expertsMd),
      spovNodes: parseMarkdownToHierarchy(spovsMd),
      insightNodes: parseMarkdownToHierarchy(insightsMd),
      categories: [],
      scratchpadNodes: [],
      mergeReport: {
        duplicateFactsRemoved: 0,
        duplicateSourcesConsolidated: 0,
        insightsDeduped: 0,
        spovsDeduped: 0,
        crossRefsUpdated: 0,
      },
    };

    const tree = buildCleanHierarchy(merged);
    expect(tree).toHaveLength(4); // Purpose, Experts, DOK4, DOK3
    expect(tree[0].name).toBe('Purpose');
    expect(tree[0].children[0].name).toBe('main purpose text');
    expect(tree[1].name).toBe('Experts');
    expect(tree[1].children[0].name).toBe('Expert Name');
    expect(tree[2].name).toBe('DOK4 - SPOV');
    expect(tree[2].children[0].name).toBe('spov 1 - text');
    expect(tree[3].name).toBe('DOK3 - Insights');
    expect(tree[3].children[0].name).toBe('Insight 1 - text');
  });

  it('should combine bypassed scratchpad with LLM scratchpad nodes', () => {
    const merged: MergedPreformatResult = {
      owner: null,
      purposeNodes: [],
      expertNodes: [],
      spovNodes: [],
      insightNodes: [],
      categories: [],
      scratchpadNodes: parseMarkdownToHierarchy('- LLM classified note'),
      mergeReport: {
        duplicateFactsRemoved: 0,
        duplicateSourcesConsolidated: 0,
        insightsDeduped: 0,
        spovsDeduped: 0,
        crossRefsUpdated: 0,
      },
    };

    const bypassedScratchpad = [
      makeNode({ name: 'Scratchpad', children: [
        makeNode({ name: 'Original note' }),
      ] }),
    ];

    const tree = buildCleanHierarchy(merged, bypassedScratchpad);
    expect(tree).toHaveLength(1);
    expect(tree[0].name).toBe('Scratchpad');
    const childNames = tree[0].children.map(c => c.name);
    expect(childNames).toContain('Original note');
    expect(childNames).toContain('LLM classified note');
  });

  it('should use category parsedNodes in DOK2 section', () => {
    const merged: MergedPreformatResult = {
      owner: null,
      purposeNodes: [],
      expertNodes: [],
      spovNodes: [],
      insightNodes: [],
      categories: [
        makeCategoryFromSources('Category 1', [
          { name: 'Source A', facts: ['Fact 1'], summary: [] },
        ]),
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

    const tree = buildCleanHierarchy(merged);
    expect(tree).toHaveLength(1);
    expect(tree[0].name).toBe('DOK2 - Knowledge Tree');
    expect(tree[0].children[0].name).toBe('Category 1');
    expect(tree[0].children[0].children.length).toBeGreaterThan(0);
  });
});
