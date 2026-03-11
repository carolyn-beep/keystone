/**
 * Tests for 01-chunking: Section Identification and Chunk Serialization
 *
 * Pure function tests -- no DB or LLM dependencies.
 */

import { describe, it, expect } from 'vitest';
import type { HierarchyNode } from '@shared/hierarchy-types';
import {
  identifySection,
  splitKnowledgeTree,
  serializeSubtree,
  collectNodeIds,
  identifyAndSerializeChunks,
  splitOversizedChunks,
} from '../chunker';
import type { ChunkType, PreformatChunk } from '../types';

// ═══════════════════════════════════════════════════════════════════════════
// Test Helpers
// ═══════════════════════════════════════════════════════════════════════════

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

/** Build a well-structured BrainLift tree for integration tests */
function makeWellStructuredTree(): HierarchyNode[] {
  return [
    makeNode({
      id: 'root',
      name: 'My BrainLift',
      children: [
        makeNode({ id: 'owner-1', name: 'Owner', children: [
          makeNode({ id: 'owner-child', name: 'John Doe' }),
        ]}),
        makeNode({ id: 'purpose-1', name: 'Purpose', children: [
          makeNode({ id: 'purpose-child', name: 'Learn about branding' }),
        ]}),
        makeNode({ id: 'experts-1', name: 'Experts', children: [
          makeNode({ id: 'expert-child', name: 'Expert 1: Jane' }),
        ]}),
        makeNode({ id: 'dok4-1', name: 'DOK4 SPOVs', children: [
          makeNode({ id: 'spov-child', name: 'SPOV 1: Branding is everything' }),
        ]}),
        makeNode({ id: 'dok3-1', name: 'DOK3 Insights', children: [
          makeNode({ id: 'insight-child', name: 'Insight 1: Cross-source pattern' }),
        ]}),
        makeNode({ id: 'kt-1', name: 'DOK2 Knowledge Tree', children: [
          makeNode({ id: 'cat-1', name: 'Category 1: Branding', children: [
            makeNode({ id: 'src-1', name: 'Source: Brand Book', children: [
              makeNode({ id: 'fact-1', name: 'Logos matter' }),
            ]}),
          ]}),
          makeNode({ id: 'cat-2', name: 'Category 2: Marketing', children: [
            makeNode({ id: 'src-2', name: 'Source: Marketing 101', children: [
              makeNode({ id: 'fact-2', name: 'Ads drive growth' }),
            ]}),
          ]}),
        ]}),
      ],
    }),
  ];
}

// ═══════════════════════════════════════════════════════════════════════════
// FR1: Section Identification via Fuzzy Matching
// ═══════════════════════════════════════════════════════════════════════════

describe('identifySection', () => {
  it('identifies "DOK4 SPOVs" as spovs (SC1.1)', () => {
    expect(identifySection('DOK4 SPOVs')).toBe('spovs');
  });

  it('identifies "Knowledge tree" (no DOK prefix) as knowledgeTree (SC1.2)', () => {
    expect(identifySection('Knowledge tree')).toBe('knowledgeTree');
  });

  it('identifies "Insights" (no DOK prefix) as insights (SC1.3)', () => {
    expect(identifySection('Insights')).toBe('insights');
  });

  it('identifies "How to implement mastery" as unknown (SC1.4)', () => {
    expect(identifySection('How to implement mastery')).toBe('unknown');
  });

  it('identifies "DOK 4 - Spiky POVs" (spaces, dash) as spovs (SC1.5)', () => {
    expect(identifySection('DOK 4 - Spiky POVs')).toBe('spovs');
  });

  it('identifies exact canonical names', () => {
    expect(identifySection('Owner')).toBe('owner');
    expect(identifySection('Purpose')).toBe('purpose');
    expect(identifySection('Experts')).toBe('experts');
  });

  it('handles DOK markers with variable spacing', () => {
    expect(identifySection('DOK4')).toBe('spovs');
    expect(identifySection('DOK 4')).toBe('spovs');
    expect(identifySection('DOK  4')).toBe('spovs');
    expect(identifySection('DOK3')).toBe('insights');
    expect(identifySection('DOK 3')).toBe('insights');
    expect(identifySection('DOK2')).toBe('knowledgeTree');
    expect(identifySection('DOK 2')).toBe('knowledgeTree');
  });

  it('handles case insensitivity', () => {
    expect(identifySection('owner')).toBe('owner');
    expect(identifySection('OWNER')).toBe('owner');
    expect(identifySection('PURPOSE')).toBe('purpose');
    expect(identifySection('experts')).toBe('experts');
  });

  it('allows "Purpose Statement" variant', () => {
    expect(identifySection('Purpose Statement')).toBe('purpose');
  });

  it('identifies singular "Expert"', () => {
    expect(identifySection('Expert')).toBe('experts');
  });

  it('identifies SPOV variants', () => {
    expect(identifySection('SPOVs')).toBe('spovs');
    expect(identifySection('SPOV')).toBe('spovs');
    expect(identifySection('Spiky POVs')).toBe('spovs');
    expect(identifySection('SpikyPOVs')).toBe('spovs');
  });

  it('identifies Insight singular', () => {
    expect(identifySection('Insight')).toBe('insights');
  });

  it('identifies "Knowledge Tree" with capital T', () => {
    expect(identifySection('Knowledge Tree')).toBe('knowledgeTree');
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// FR2: Knowledge Tree Category Splitting
// ═══════════════════════════════════════════════════════════════════════════

describe('splitKnowledgeTree', () => {
  it('splits KT with 3 category children into 3 category chunks (SC2.1)', () => {
    const kt = makeNode({
      id: 'kt',
      name: 'Knowledge Tree',
      children: [
        makeNode({ id: 'c1', name: 'Category 1: Branding', children: [
          makeNode({ id: 'c1-child', name: 'Source: Book' }),
        ]}),
        makeNode({ id: 'c2', name: 'Category 2: Marketing', children: [
          makeNode({ id: 'c2-child', name: 'Source: Article' }),
        ]}),
        makeNode({ id: 'c3', name: 'Category 3: Design', children: [
          makeNode({ id: 'c3-child', name: 'Source: Tutorial' }),
        ]}),
      ],
    });

    const result = splitKnowledgeTree(kt);
    expect(result).toHaveLength(3);
    expect(result.every(r => r.type === 'category')).toBe(true);
  });

  it('returns single knowledge_tree chunk when no categories found (SC2.2)', () => {
    const kt = makeNode({
      id: 'kt',
      name: 'Knowledge Tree',
      children: [
        makeNode({ id: 'topic-1', name: 'Branding basics' }),
        makeNode({ id: 'topic-2', name: 'Marketing fundamentals' }),
      ],
    });

    const result = splitKnowledgeTree(kt);
    expect(result).toHaveLength(1);
    expect(result[0].type).toBe('knowledge_tree');
  });

  it('detects markdown headings in category labels (SC2.3)', () => {
    const kt = makeNode({
      id: 'kt',
      name: 'Knowledge Tree',
      children: [
        makeNode({ id: 'c1', name: '# Category 1: Branding' }),
      ],
    });

    const result = splitKnowledgeTree(kt);
    expect(result).toHaveLength(1);
    expect(result[0].type).toBe('category');
  });

  it('preserves original category name in label (SC2.4)', () => {
    const kt = makeNode({
      id: 'kt',
      name: 'Knowledge Tree',
      children: [
        makeNode({ id: 'c1', name: 'Category 1: Branding' }),
      ],
    });

    const result = splitKnowledgeTree(kt);
    expect(result[0].label).toBe('Category 1: Branding');
  });

  it('handles mixed children (some categories, some not)', () => {
    const kt = makeNode({
      id: 'kt',
      name: 'Knowledge Tree',
      children: [
        makeNode({ id: 'c1', name: 'Category 1: Branding', children: [
          makeNode({ id: 'c1-child', name: 'Source: Book' }),
        ]}),
        makeNode({ id: 'misc', name: 'Uncategorized notes', children: [
          makeNode({ id: 'misc-child', name: 'Some note' }),
        ]}),
        makeNode({ id: 'c2', name: 'Category 2: Marketing', children: [
          makeNode({ id: 'c2-child', name: 'Source: Article' }),
        ]}),
      ],
    });

    const result = splitKnowledgeTree(kt);
    // Should have 2 category chunks + 1 knowledge_tree chunk for non-category children
    const categories = result.filter(r => r.type === 'category');
    const ktChunks = result.filter(r => r.type === 'knowledge_tree');
    expect(categories).toHaveLength(2);
    expect(ktChunks).toHaveLength(1);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// FR3: Markdown Serialization
// ═══════════════════════════════════════════════════════════════════════════

describe('serializeSubtree', () => {
  it('serializes 3-level deep subtree with correct indentation (SC3.1)', () => {
    const node = makeNode({
      name: 'Root',
      children: [
        makeNode({
          name: 'Child',
          children: [
            makeNode({ name: 'Grandchild' }),
          ],
        }),
      ],
    });

    const result = serializeSubtree(node);
    const lines = result.split('\n').filter(l => l.trim());
    expect(lines[0]).toBe('- Root');
    expect(lines[1]).toBe('  - Child');
    expect(lines[2]).toBe('    - Grandchild');
  });

  it('includes node notes as indented text below node line (SC3.2)', () => {
    const node = makeNode({
      name: 'Node with note',
      note: 'This is a note about the node',
    });

    const result = serializeSubtree(node);
    expect(result).toContain('- Node with note');
    expect(result).toContain('This is a note about the node');
  });

  it('includes whitespace-only node names in output (SC3.4)', () => {
    const node = makeNode({
      name: 'Parent',
      children: [
        makeNode({ name: '   ' }),
      ],
    });

    const result = serializeSubtree(node);
    const lines = result.split('\n').filter(l => l.length > 0);
    expect(lines.length).toBeGreaterThanOrEqual(2);
  });

  it('serializes leaf node correctly', () => {
    const node = makeNode({ name: 'Just a leaf' });
    const result = serializeSubtree(node);
    expect(result.trim()).toBe('- Just a leaf');
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// collectNodeIds
// ═══════════════════════════════════════════════════════════════════════════

describe('collectNodeIds', () => {
  it('collects all IDs from a subtree', () => {
    const node = makeNode({
      id: 'parent',
      name: 'Parent',
      children: [
        makeNode({
          id: 'child-1',
          name: 'Child 1',
          children: [
            makeNode({ id: 'grandchild-1', name: 'Grandchild 1' }),
          ],
        }),
        makeNode({ id: 'child-2', name: 'Child 2' }),
      ],
    });

    const ids = collectNodeIds(node);
    expect(ids).toContain('parent');
    expect(ids).toContain('child-1');
    expect(ids).toContain('child-2');
    expect(ids).toContain('grandchild-1');
    expect(ids).toHaveLength(4);
  });

  it('returns single ID for leaf node', () => {
    const node = makeNode({ id: 'leaf', name: 'Leaf' });
    const ids = collectNodeIds(node);
    expect(ids).toEqual(['leaf']);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// FR4: Chunk Assembly (identifyAndSerializeChunks)
// ═══════════════════════════════════════════════════════════════════════════

describe('identifyAndSerializeChunks', () => {
  it('produces correct chunk types for well-structured tree (SC4.1)', () => {
    const roots = makeWellStructuredTree();
    const { chunks } = identifyAndSerializeChunks(roots);

    const types = chunks.map(c => c.type);
    expect(types).toContain('owner');
    expect(types).toContain('purpose');
    expect(types).toContain('experts');
    expect(types).toContain('spovs');
    expect(types).toContain('insights');
    expect(types.filter(t => t === 'category')).toHaveLength(2);
    expect(chunks).toHaveLength(7);
  });

  it('produces single unstructured chunk for flat document (SC4.2)', () => {
    const roots = [
      makeNode({
        id: 'root',
        name: 'PowerPath Course',
        children: [
          makeNode({ id: 'topic-1', name: 'Module 1: Getting Started' }),
          makeNode({ id: 'topic-2', name: 'Module 2: Advanced Topics' }),
        ],
      }),
    ];

    const { chunks } = identifyAndSerializeChunks(roots);
    expect(chunks).toHaveLength(1);
    expect(chunks[0].type).toBe('unstructured');
  });

  it('returns empty result for empty roots (SC4.3)', () => {
    const result = identifyAndSerializeChunks([]);
    expect(result.chunks).toEqual([]);
    expect(result.bypassedScratchpad).toEqual([]);
  });

  it('sourceNodeIds contains all IDs in subtree (SC4.4)', () => {
    const roots = [
      makeNode({
        id: 'root',
        name: 'BrainLift',
        children: [
          makeNode({
            id: 'owner-1',
            name: 'Owner',
            children: [
              makeNode({ id: 'owner-child', name: 'John Doe' }),
            ],
          }),
        ],
      }),
    ];

    const { chunks } = identifyAndSerializeChunks(roots);
    const ownerChunk = chunks.find(c => c.type === 'owner');
    expect(ownerChunk).toBeDefined();
    expect(ownerChunk!.sourceNodeIds).toContain('owner-1');
    expect(ownerChunk!.sourceNodeIds).toContain('owner-child');
  });

  it('originalNodes contains root node(s) of chunk subtree (SC4.5)', () => {
    const roots = [
      makeNode({
        id: 'root',
        name: 'BrainLift',
        children: [
          makeNode({ id: 'owner-1', name: 'Owner' }),
        ],
      }),
    ];

    const { chunks } = identifyAndSerializeChunks(roots);
    const ownerChunk = chunks.find(c => c.type === 'owner');
    expect(ownerChunk).toBeDefined();
    expect(ownerChunk!.originalNodes).toHaveLength(1);
    expect(ownerChunk!.originalNodes[0].id).toBe('owner-1');
  });

  it('handles missing sections without error (SC4.6)', () => {
    const roots = [
      makeNode({
        id: 'root',
        name: 'BrainLift',
        children: [
          makeNode({ id: 'owner-1', name: 'Owner' }),
          makeNode({ id: 'purpose-1', name: 'Purpose' }),
          // No Experts, no DOK3, no DOK4
          makeNode({ id: 'kt-1', name: 'Knowledge Tree', children: [
            makeNode({ id: 'cat-1', name: 'Category 1: Topics' }),
          ]}),
        ],
      }),
    ];

    const { chunks } = identifyAndSerializeChunks(roots);
    const types = chunks.map(c => c.type);
    expect(types).toContain('owner');
    expect(types).toContain('purpose');
    expect(types).toContain('category');
    expect(types).not.toContain('experts');
    expect(types).not.toContain('spovs');
    expect(types).not.toContain('insights');
  });

  it('groups multiple unknown nodes into single unknown chunk (SC4.7)', () => {
    const roots = [
      makeNode({
        id: 'root',
        name: 'BrainLift',
        children: [
          makeNode({ id: 'owner-1', name: 'Owner' }),
          makeNode({ id: 'unk-1', name: 'How to implement mastery' }),
          makeNode({ id: 'unk-2', name: 'PowerPath Course Quality' }),
        ],
      }),
    ];

    const { chunks } = identifyAndSerializeChunks(roots);
    const unknownChunks = chunks.filter(c => c.type === 'unknown');
    expect(unknownChunks).toHaveLength(1);
    // Both unknown nodes should be in the single chunk
    expect(unknownChunks[0].originalNodes).toHaveLength(2);
  });

  it('produces single unstructured chunk for root with no children', () => {
    const roots = [
      makeNode({ id: 'root', name: 'Empty BrainLift' }),
    ];

    const { chunks } = identifyAndSerializeChunks(roots);
    expect(chunks).toHaveLength(1);
    expect(chunks[0].type).toBe('unstructured');
  });

  it('chunk markdown starts with context header (SC3.3)', () => {
    const roots = [
      makeNode({
        id: 'root',
        name: 'BrainLift',
        children: [
          makeNode({ id: 'owner-1', name: 'Owner', children: [
            makeNode({ id: 'owner-child', name: 'Jane' }),
          ]}),
        ],
      }),
    ];

    const { chunks } = identifyAndSerializeChunks(roots);
    const ownerChunk = chunks.find(c => c.type === 'owner');
    expect(ownerChunk).toBeDefined();
    expect(ownerChunk!.markdown).toMatch(/^## owner: Owner\n\n/);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// FR5: Recursive Oversized Chunk Splitting
// ═══════════════════════════════════════════════════════════════════════════

/** Generate a long string of the given char length as a bullet list */
function makeLongContent(targetChars: number): HierarchyNode[] {
  const children: HierarchyNode[] = [];
  let total = 0;
  let i = 0;
  while (total < targetChars) {
    const text = `Item ${i}: ${'x'.repeat(100)}`;
    children.push(makeNode({ name: text }));
    total += text.length + 4; // "- " prefix + newline
    i++;
  }
  return children;
}

function makeChunkFromNode(type: ChunkType, label: string, nodes: HierarchyNode[]): PreformatChunk {
  let markdown = `## ${type}: ${label}\n\n`;
  for (const node of nodes) {
    markdown += serializeSubtree(node);
  }
  return {
    type,
    label,
    markdown,
    sourceNodeIds: nodes.flatMap(n => collectNodeIds(n)),
    originalNodes: nodes,
  };
}

describe('splitOversizedChunks', () => {
  it('passes through chunks under the threshold', () => {
    const smallChunk = makeChunkFromNode('experts', 'Experts', [
      makeNode({ name: 'Expert 1', children: [makeNode({ name: 'Who: A researcher' })] }),
    ]);

    const result = splitOversizedChunks([smallChunk], 15000);
    expect(result).toHaveLength(1);
    expect(result[0].label).toBe('Experts');
  });

  it('splits multi-root chunks into one chunk per root', () => {
    const node1 = makeNode({ name: 'Unknown Section A', children: makeLongContent(5000) });
    const node2 = makeNode({ name: 'Unknown Section B', children: makeLongContent(5000) });
    const node3 = makeNode({ name: 'Unknown Section C', children: makeLongContent(5000) });

    const bigChunk = makeChunkFromNode('unknown', 'Unrecognized Sections', [node1, node2, node3]);
    // Should be over 15K total
    expect(bigChunk.markdown.length).toBeGreaterThan(15000);

    const result = splitOversizedChunks([bigChunk], 15000);
    // Each root should become its own chunk
    expect(result.length).toBeGreaterThanOrEqual(3);
    expect(result.every(c => c.originalNodes.length === 1)).toBe(true);
  });

  it('recursively splits single-root oversized chunks by children', () => {
    // Create a root with 3 children, each ~8K (total ~24K)
    const root = makeNode({
      name: 'Experts',
      children: [
        makeNode({ name: 'Expert A', children: makeLongContent(8000) }),
        makeNode({ name: 'Expert B', children: makeLongContent(8000) }),
        makeNode({ name: 'Expert C', children: makeLongContent(8000) }),
      ],
    });

    const bigChunk = makeChunkFromNode('experts', 'Experts', [root]);
    expect(bigChunk.markdown.length).toBeGreaterThan(15000);

    const result = splitOversizedChunks([bigChunk], 15000);
    // Should split into at least 3 chunks (one per expert)
    expect(result.length).toBeGreaterThanOrEqual(3);
    expect(result.some(c => c.label.includes('Expert A'))).toBe(true);
    expect(result.some(c => c.label.includes('Expert B'))).toBe(true);
    expect(result.some(c => c.label.includes('Expert C'))).toBe(true);
  });

  it('splits recursively when first-level children are still oversized', () => {
    // Root has 2 children, one of which is still oversized after first split
    // Root > [Small Child, Big Child > [Sub A, Sub B]]
    const root = makeNode({
      name: 'Experts',
      children: [
        makeNode({ name: 'Small Expert', children: [makeNode({ name: 'Who: nobody' })] }),
        makeNode({
          name: 'Big Group',
          children: [
            makeNode({ name: 'Sub A', children: makeLongContent(10000) }),
            makeNode({ name: 'Sub B', children: makeLongContent(10000) }),
          ],
        }),
      ],
    });

    const bigChunk = makeChunkFromNode('experts', 'Experts', [root]);
    const result = splitOversizedChunks([bigChunk], 15000);

    // First split: Experts → [Small Expert, Big Group]
    // Big Group still oversized → second split: Big Group → [Sub A, Sub B]
    expect(result.some(c => c.label.includes('Sub A'))).toBe(true);
    expect(result.some(c => c.label.includes('Sub B'))).toBe(true);
    expect(result.some(c => c.label.includes('Small Expert'))).toBe(true);
  });

  it('respects max depth and stops splitting', () => {
    // Create a deeply nested chain where every level is oversized
    const leaf = makeNode({ name: 'Leaf', children: makeLongContent(20000) });
    const deep3 = makeNode({ name: 'Deep3', children: [leaf, makeNode({ name: 'sibling3' })] });
    const deep2 = makeNode({ name: 'Deep2', children: [deep3, makeNode({ name: 'sibling2' })] });
    const deep1 = makeNode({ name: 'Deep1', children: [deep2, makeNode({ name: 'sibling1' })] });
    const root = makeNode({ name: 'Root', children: [deep1, makeNode({ name: 'sibling0' })] });

    const bigChunk = makeChunkFromNode('unknown', 'Test', [root]);
    const result = splitOversizedChunks([bigChunk], 15000, 2);

    // With maxDepth=2, should stop splitting after 2 levels even if still oversized
    // The oversized leaf chunk should appear as-is
    const oversized = result.filter(c => c.markdown.length > 15000);
    expect(oversized.length).toBeGreaterThan(0); // at least one chunk couldn't be split further
  });

  it('accepts leaf nodes over threshold as-is', () => {
    // Single node with no children but lots of text (can't split)
    const bigLeaf = makeNode({ name: 'x'.repeat(20000) });
    const chunk = makeChunkFromNode('unknown', 'Big Leaf', [bigLeaf]);

    const result = splitOversizedChunks([chunk], 15000);
    expect(result).toHaveLength(1);
    expect(result[0].markdown.length).toBeGreaterThan(15000);
  });

  it('integration: identifyAndSerializeChunks splits oversized expert sections', () => {
    const roots = [
      makeNode({
        name: 'BrainLift',
        children: [
          makeNode({ name: 'Owner', children: [makeNode({ name: 'Test' })] }),
          makeNode({
            name: 'Experts',
            children: [
              makeNode({ name: 'Expert A', children: makeLongContent(10000) }),
              makeNode({ name: 'Expert B', children: makeLongContent(10000) }),
            ],
          }),
        ],
      }),
    ];

    const { chunks } = identifyAndSerializeChunks(roots);
    const expertChunks = chunks.filter(c => c.type === 'experts');
    // Should have been split into at least 2 chunks
    expect(expertChunks.length).toBeGreaterThanOrEqual(2);
    // Each should be under 15K (or close — small children might combine)
    for (const c of expertChunks) {
      expect(c.markdown.length).toBeLessThan(20000); // generous threshold for test
    }
  });
});
