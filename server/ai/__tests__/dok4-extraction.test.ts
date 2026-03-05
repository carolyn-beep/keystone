/**
 * Tests for FR1 + FR2: DOK4 Marker Detection, Node Discovery, and SPOV Extraction
 *
 * Pure function tests -- no DB or LLM dependencies.
 */

import { describe, it, expect } from 'vitest';
import type { HierarchyNode } from '@shared/hierarchy-types';

// Import the functions under test
import { findDOK4Nodes, extractDOK4Spovs, extractAllFromHierarchy } from '../hierarchyExtractor';

/** Helper to create a minimal HierarchyNode for testing */
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

// ═══════════════════════════════════════════════════════════════════════════
// FR1: DOK4 Marker Detection and Node Discovery
// ═══════════════════════════════════════════════════════════════════════════

describe('findDOK4Nodes', () => {
  it('finds nodes with isDOK4Marker=true in tree', () => {
    const dok4Node = makeNode({ name: 'DOK4 - SPOVs', isDOK4Marker: true });
    const roots = [
      makeNode({
        name: 'Root',
        children: [dok4Node],
      }),
    ];

    const result = findDOK4Nodes(roots);
    expect(result).toHaveLength(1);
    expect(result[0].name).toBe('DOK4 - SPOVs');
  });

  it('returns empty array when no DOK4 markers exist', () => {
    const roots = [
      makeNode({
        name: 'Root',
        children: [
          makeNode({ name: 'DOK1 Facts', isDOK1Marker: true }),
          makeNode({ name: 'DOK3 Insights', isDOK3Marker: true }),
        ],
      }),
    ];

    expect(findDOK4Nodes(roots)).toHaveLength(0);
  });

  it('finds multiple DOK4 sections', () => {
    const roots = [
      makeNode({
        name: 'Root',
        children: [
          makeNode({ name: 'DOK4 - SPOVs', isDOK4Marker: true }),
          makeNode({ name: 'Another section' }),
          makeNode({ name: 'DOK 4 - More SPOVs', isDOK4Marker: true }),
        ],
      }),
    ];

    expect(findDOK4Nodes(roots)).toHaveLength(2);
  });

  it('finds DOK4 nodes nested deep in hierarchy', () => {
    const dok4Node = makeNode({ name: 'DOK4 - SPOVs', isDOK4Marker: true });
    const roots = [
      makeNode({
        name: 'Root',
        children: [
          makeNode({
            name: 'Level 1',
            children: [
              makeNode({
                name: 'Level 2',
                children: [dok4Node],
              }),
            ],
          }),
        ],
      }),
    ];

    const result = findDOK4Nodes(roots);
    expect(result).toHaveLength(1);
    expect(result[0].name).toBe('DOK4 - SPOVs');
  });

  it('does not affect DOK1/DOK2/DOK3 marker detection', () => {
    const roots = [
      makeNode({
        name: 'Root',
        children: [
          makeNode({ name: 'DOK1 Facts', isDOK1Marker: true }),
          makeNode({ name: 'DOK2 Summaries', isDOK2Marker: true }),
          makeNode({ name: 'DOK3 Insights', isDOK3Marker: true }),
          makeNode({ name: 'DOK4 SPOVs', isDOK4Marker: true }),
        ],
      }),
    ];

    // Only finds DOK4 nodes, not DOK1/2/3
    const result = findDOK4Nodes(roots);
    expect(result).toHaveLength(1);
    expect(result[0].name).toBe('DOK4 SPOVs');
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// FR2: DOK4 SPOV Extraction with Explicit Link Parsing
// ═══════════════════════════════════════════════════════════════════════════

describe('extractDOK4Spovs', () => {
  describe('basic extraction', () => {
    it('extracts first-level children as SPOV text', () => {
      const dok4Nodes = [
        makeNode({
          name: 'DOK4 - SPOVs',
          isDOK4Marker: true,
          children: [
            makeNode({ id: 'wf-1', name: 'The NIL space can be detrimental to student athletes' }),
            makeNode({ id: 'wf-2', name: 'AI tutors can deliver more equitable outcomes' }),
          ],
        }),
      ];

      const result = extractDOK4Spovs(dok4Nodes);
      expect(result).toHaveLength(2);
      expect(result[0].text).toBe('The NIL space can be detrimental to student athletes');
      expect(result[1].text).toBe('AI tutors can deliver more equitable outcomes');
    });

    it('generates sequential IDs (spov-1, spov-2)', () => {
      const dok4Nodes = [
        makeNode({
          name: 'DOK4 - SPOVs',
          isDOK4Marker: true,
          children: [
            makeNode({ name: 'First spiky point of view about education' }),
            makeNode({ name: 'Second spiky point of view about technology' }),
            makeNode({ name: 'Third spiky point of view about learning' }),
          ],
        }),
      ];

      const result = extractDOK4Spovs(dok4Nodes);
      expect(result.map(s => s.id)).toEqual(['spov-1', 'spov-2', 'spov-3']);
    });

    it('preserves workflowyNodeId from source node', () => {
      const dok4Nodes = [
        makeNode({
          name: 'DOK4 - SPOVs',
          isDOK4Marker: true,
          children: [
            makeNode({ id: 'wf-abc-123', name: 'Some SPOV text' }),
          ],
        }),
      ];

      const result = extractDOK4Spovs(dok4Nodes);
      expect(result[0].workflowyNodeId).toBe('wf-abc-123');
    });

    it('returns empty array for empty DOK4 section', () => {
      const dok4Nodes = [
        makeNode({
          name: 'DOK4 - SPOVs',
          isDOK4Marker: true,
          children: [],
        }),
      ];

      expect(extractDOK4Spovs(dok4Nodes)).toHaveLength(0);
    });

    it('extracts from multiple DOK4 sections', () => {
      const dok4Nodes = [
        makeNode({
          name: 'DOK4 - SPOVs',
          isDOK4Marker: true,
          children: [
            makeNode({ name: 'SPOV from section 1' }),
          ],
        }),
        makeNode({
          name: 'DOK 4 - More SPOVs',
          isDOK4Marker: true,
          children: [
            makeNode({ name: 'SPOV from section 2' }),
          ],
        }),
      ];

      const result = extractDOK4Spovs(dok4Nodes);
      expect(result).toHaveLength(2);
      expect(result[0].id).toBe('spov-1');
      expect(result[1].id).toBe('spov-2');
    });
  });

  describe('text processing', () => {
    it('skips strikethrough text (~~...~~)', () => {
      const dok4Nodes = [
        makeNode({
          name: 'DOK4 - SPOVs',
          isDOK4Marker: true,
          children: [
            makeNode({ name: 'Valid SPOV text' }),
            makeNode({ name: '~~Crossed out SPOV that was abandoned~~' }),
            makeNode({ name: 'Another valid SPOV' }),
          ],
        }),
      ];

      const result = extractDOK4Spovs(dok4Nodes);
      expect(result).toHaveLength(2);
      expect(result[0].text).toBe('Valid SPOV text');
      expect(result[1].text).toBe('Another valid SPOV');
    });

    it('strips bold formatting from SPOV text', () => {
      const dok4Nodes = [
        makeNode({
          name: 'DOK4 - SPOVs',
          isDOK4Marker: true,
          children: [
            makeNode({ name: '**Knowledge-first approaches that delay complex thinking are counterproductive**' }),
          ],
        }),
      ];

      const result = extractDOK4Spovs(dok4Nodes);
      expect(result[0].text).toBe('Knowledge-first approaches that delay complex thinking are counterproductive');
    });

    it('includes direct child text as supporting detail', () => {
      const dok4Nodes = [
        makeNode({
          name: 'DOK4 - SPOVs',
          isDOK4Marker: true,
          children: [
            makeNode({
              name: 'Main SPOV claim text',
              children: [
                makeNode({ name: 'Supporting detail that elaborates on the claim' }),
                makeNode({ name: 'Another supporting detail for context' }),
              ],
            }),
          ],
        }),
      ];

      const result = extractDOK4Spovs(dok4Nodes);
      expect(result).toHaveLength(1);
      expect(result[0].text).toContain('Main SPOV claim text');
      expect(result[0].text).toContain('Supporting detail that elaborates on the claim');
      expect(result[0].text).toContain('Another supporting detail for context');
    });

    it('skips very short entries (less than 10 chars)', () => {
      const dok4Nodes = [
        makeNode({
          name: 'DOK4 - SPOVs',
          isDOK4Marker: true,
          children: [
            makeNode({ name: 'Short' }),
            makeNode({ name: 'A valid SPOV with enough text to be meaningful' }),
          ],
        }),
      ];

      const result = extractDOK4Spovs(dok4Nodes);
      expect(result).toHaveLength(1);
      expect(result[0].text).toBe('A valid SPOV with enough text to be meaningful');
    });
  });

  describe('explicit link parsing', () => {
    it('parses "Links" child with "Insight N" grandchildren', () => {
      const dok4Nodes = [
        makeNode({
          name: 'DOK4 - SPOVs',
          isDOK4Marker: true,
          children: [
            makeNode({
              name: 'The NIL space can be detrimental to student athletes',
              children: [
                makeNode({
                  name: 'Links',
                  children: [
                    makeNode({ name: 'Insight 14' }),
                    makeNode({ name: 'Insight 6' }),
                    makeNode({ name: 'Insight 12' }),
                  ],
                }),
              ],
            }),
          ],
        }),
      ];

      const result = extractDOK4Spovs(dok4Nodes);
      expect(result).toHaveLength(1);
      expect(result[0].explicitDok3Refs).toEqual([14, 6, 12]);
    });

    it('handles case-insensitive "links" matching', () => {
      const dok4Nodes = [
        makeNode({
          name: 'DOK4 - SPOVs',
          isDOK4Marker: true,
          children: [
            makeNode({
              name: 'Some SPOV text here for testing',
              children: [
                makeNode({
                  name: 'links',
                  children: [
                    makeNode({ name: 'Insight 3' }),
                  ],
                }),
              ],
            }),
          ],
        }),
      ];

      const result = extractDOK4Spovs(dok4Nodes);
      expect(result[0].explicitDok3Refs).toEqual([3]);
    });

    it('sets explicitDok3Refs to null when no Links child exists', () => {
      const dok4Nodes = [
        makeNode({
          name: 'DOK4 - SPOVs',
          isDOK4Marker: true,
          children: [
            makeNode({
              name: 'SPOV without explicit links here',
              children: [
                makeNode({ name: 'Some elaboration' }),
              ],
            }),
          ],
        }),
      ];

      const result = extractDOK4Spovs(dok4Nodes);
      expect(result[0].explicitDok3Refs).toBeNull();
    });

    it('parses "Insight 14" with trailing text', () => {
      const dok4Nodes = [
        makeNode({
          name: 'DOK4 - SPOVs',
          isDOK4Marker: true,
          children: [
            makeNode({
              name: 'A SPOV with link references included',
              children: [
                makeNode({
                  name: 'Links',
                  children: [
                    makeNode({ name: 'Insight 11' }),
                    makeNode({ name: 'Insight 14 - Category 6, Source 3 "Refereeing NIL"' }),
                  ],
                }),
              ],
            }),
          ],
        }),
      ];

      const result = extractDOK4Spovs(dok4Nodes);
      expect(result[0].explicitDok3Refs).toEqual([11, 14]);
    });

    it('ignores Links children that do not match Insight pattern', () => {
      const dok4Nodes = [
        makeNode({
          name: 'DOK4 - SPOVs',
          isDOK4Marker: true,
          children: [
            makeNode({
              name: 'A SPOV claim about something interesting',
              children: [
                makeNode({
                  name: 'Links',
                  children: [
                    makeNode({ name: 'Insight 5' }),
                    makeNode({ name: 'Some random non-insight text' }),
                    makeNode({ name: 'Insight 8' }),
                  ],
                }),
              ],
            }),
          ],
        }),
      ];

      const result = extractDOK4Spovs(dok4Nodes);
      expect(result[0].explicitDok3Refs).toEqual([5, 8]);
    });
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// FR1 + FR2 integration via extractAllFromHierarchy
// ═══════════════════════════════════════════════════════════════════════════

describe('extractAllFromHierarchy with DOK4', () => {
  it('includes dok4Spovs in extraction result', () => {
    const roots = [
      makeNode({
        name: 'Root',
        children: [
          makeNode({
            name: 'DOK4 - SPOVs',
            isDOK4Marker: true,
            children: [
              makeNode({ id: 'wf-1', name: 'My spiky point of view on education policy' }),
            ],
          }),
        ],
      }),
    ];

    const result = extractAllFromHierarchy(roots);
    expect(result.dok4Spovs).toHaveLength(1);
    expect(result.dok4Spovs[0].text).toBe('My spiky point of view on education policy');
    expect(result.metadata.dok4NodesFound).toBe(1);
    expect(result.metadata.totalDOK4SpovsExtracted).toBe(1);
  });

  it('returns empty dok4Spovs when no DOK4 section exists', () => {
    const roots = [
      makeNode({
        name: 'Root',
        children: [
          makeNode({ name: 'DOK1 Facts', isDOK1Marker: true }),
        ],
      }),
    ];

    const result = extractAllFromHierarchy(roots);
    expect(result.dok4Spovs).toHaveLength(0);
    expect(result.metadata.dok4NodesFound).toBe(0);
    expect(result.metadata.totalDOK4SpovsExtracted).toBe(0);
  });
});
