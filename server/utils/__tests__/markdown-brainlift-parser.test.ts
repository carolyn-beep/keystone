/**
 * Tests for parseMarkdownBrainlift -- 01-parser-and-entry-point spec
 *
 * Pure function tests -- no mocks needed.
 */

import { describe, it, expect } from 'vitest';
import { parseMarkdownBrainlift } from '../markdown-brainlift-parser';

// ---------------------------------------------------------------------------
// FR1: Markdown Line Parsing and Tree Construction
// ---------------------------------------------------------------------------

describe('FR1: Line Parsing and Tree Construction', () => {
  it('returns empty hierarchy for empty input', () => {
    const result = parseMarkdownBrainlift('');
    expect(result.markdown).toBe('');
    expect(result.hierarchy).toEqual([]);
  });

  it('returns empty hierarchy for input with only # Title', () => {
    const result = parseMarkdownBrainlift('# My Brainlift');
    expect(result.hierarchy).toEqual([]);
  });

  it('ignores blank lines between sections', () => {
    const md = `# Title

- Owner

  - John

- Purpose
  - Some purpose`;
    const result = parseMarkdownBrainlift(md);
    // Should have Owner, John, Purpose, Some purpose = 4 nodes at various depths
    // But only Owner and Purpose at top level
    const topNames = result.hierarchy.map(n => n.name);
    expect(topNames).toContain('Owner');
    expect(topNames).toContain('Purpose');
  });

  it('ignores non-bullet lines', () => {
    const md = `# Title
This is a paragraph that should be ignored
- Owner
Some other text
  - John`;
    const result = parseMarkdownBrainlift(md);
    expect(result.hierarchy).toHaveLength(1); // Only Owner at top level
    expect(result.hierarchy[0].name).toBe('Owner');
    expect(result.hierarchy[0].children).toHaveLength(1);
    expect(result.hierarchy[0].children[0].name).toBe('John');
  });

  it('preserves correct depth for deeply nested content (4+ levels)', () => {
    const md = `- Level 0
  - Level 1
    - Level 2
      - Level 3
        - Level 4`;
    const result = parseMarkdownBrainlift(md);
    expect(result.hierarchy).toHaveLength(1);
    const l0 = result.hierarchy[0];
    expect(l0.depth).toBe(0);
    expect(l0.children[0].depth).toBe(1);
    expect(l0.children[0].children[0].depth).toBe(2);
    expect(l0.children[0].children[0].children[0].depth).toBe(3);
    expect(l0.children[0].children[0].children[0].children[0].depth).toBe(4);
    expect(l0.children[0].children[0].children[0].children[0].name).toBe('Level 4');
  });

  it('generates sequential IDs starting from node_1', () => {
    const md = `- First
- Second
  - Third`;
    const result = parseMarkdownBrainlift(md);
    expect(result.hierarchy[0].id).toBe('node_1');
    expect(result.hierarchy[1].id).toBe('node_2');
    expect(result.hierarchy[1].children[0].id).toBe('node_3');
  });

  it('sets note to null for all nodes', () => {
    const md = `- Node one
  - Node two`;
    const result = parseMarkdownBrainlift(md);
    expect(result.hierarchy[0].note).toBeNull();
    expect(result.hierarchy[0].children[0].note).toBeNull();
  });

  it('normalizes Windows line endings', () => {
    const md = '- First\r\n  - Second\r\n- Third';
    const result = parseMarkdownBrainlift(md);
    expect(result.hierarchy).toHaveLength(2);
    expect(result.hierarchy[0].children).toHaveLength(1);
  });

  it('normalizes tabs to 2 spaces', () => {
    const md = '- Parent\n\t- Child';
    const result = parseMarkdownBrainlift(md);
    expect(result.hierarchy).toHaveLength(1);
    expect(result.hierarchy[0].children).toHaveLength(1);
    expect(result.hierarchy[0].children[0].name).toBe('Child');
  });

  it('returns original markdown string as-is', () => {
    const md = '# Title\n\n- Owner\n  - John';
    const result = parseMarkdownBrainlift(md);
    expect(result.markdown).toBe(md);
  });

  it('handles sibling nodes at same depth correctly', () => {
    const md = `- A
  - B
  - C
- D`;
    const result = parseMarkdownBrainlift(md);
    expect(result.hierarchy).toHaveLength(2); // A and D
    expect(result.hierarchy[0].children).toHaveLength(2); // B and C
    expect(result.hierarchy[0].children[0].name).toBe('B');
    expect(result.hierarchy[0].children[1].name).toBe('C');
  });
});

// ---------------------------------------------------------------------------
// FR2: Marker Detection and URL Extraction
// ---------------------------------------------------------------------------

describe('FR2: Marker Detection and URL Extraction', () => {
  it('detects DOK1 marker (isDOK1Marker = true)', () => {
    const md = '- DOK1';
    const result = parseMarkdownBrainlift(md);
    expect(result.hierarchy[0].isDOK1Marker).toBe(true);
  });

  it('detects DOK1 marker anywhere in name', () => {
    const md = '- Some DOK1 facts';
    const result = parseMarkdownBrainlift(md);
    expect(result.hierarchy[0].isDOK1Marker).toBe(true);
  });

  it('detects DOK2 marker at start of name', () => {
    const md = '- DOK2 Summary';
    const result = parseMarkdownBrainlift(md);
    expect(result.hierarchy[0].isDOK2Marker).toBe(true);
  });

  it('detects DOK3 marker at start of name', () => {
    const md = '- DOK3';
    const result = parseMarkdownBrainlift(md);
    expect(result.hierarchy[0].isDOK3Marker).toBe(true);
  });

  it('detects DOK4 marker', () => {
    const md = '- DOK4';
    const result = parseMarkdownBrainlift(md);
    expect(result.hierarchy[0].isDOK4Marker).toBe(true);
  });

  it('detects SPOVs as DOK4 marker', () => {
    const md = '- SPOVs';
    const result = parseMarkdownBrainlift(md);
    expect(result.hierarchy[0].isDOK4Marker).toBe(true);
  });

  it('detects Spiky POVs as DOK4 marker', () => {
    const md = '- Spiky POVs';
    const result = parseMarkdownBrainlift(md);
    expect(result.hierarchy[0].isDOK4Marker).toBe(true);
  });

  it('detects Source marker (Source 1: Name)', () => {
    const md = '- Source 1: NCAA NIL Policy';
    const result = parseMarkdownBrainlift(md);
    expect(result.hierarchy[0].isSourceMarker).toBe(true);
    expect(result.hierarchy[0].name).toBe('Source 1: NCAA NIL Policy');
  });

  it('detects plain Source marker without number', () => {
    const md = '- Source';
    const result = parseMarkdownBrainlift(md);
    expect(result.hierarchy[0].isSourceMarker).toBe(true);
  });

  it('detects Category marker (Category: Name)', () => {
    const md = '- Category: Legal Framework';
    const result = parseMarkdownBrainlift(md);
    expect(result.hierarchy[0].isCategoryMarker).toBe(true);
  });

  it('detects Purpose marker (exact match only)', () => {
    const md = '- Purpose';
    const result = parseMarkdownBrainlift(md);
    expect(result.hierarchy[0].isPurposeMarker).toBe(true);
  });

  it('does NOT detect "Purpose statement" as Purpose marker', () => {
    const md = '- Purpose statement';
    const result = parseMarkdownBrainlift(md);
    expect(result.hierarchy[0].isPurposeMarker).toBe(false);
  });

  it('extracts URL from node name', () => {
    const md = '- https://www.example.com/page';
    const result = parseMarkdownBrainlift(md);
    expect(result.hierarchy[0].extractedUrl).toBe('https://www.example.com/page');
  });

  it('sets extractedUrl to null for non-URL nodes', () => {
    const md = '- Just some text';
    const result = parseMarkdownBrainlift(md);
    expect(result.hierarchy[0].extractedUrl).toBeNull();
  });

  it('non-marker nodes have all marker flags false', () => {
    const md = '- Regular content node';
    const result = parseMarkdownBrainlift(md);
    const node = result.hierarchy[0];
    expect(node.isDOK1Marker).toBe(false);
    expect(node.isDOK2Marker).toBe(false);
    expect(node.isDOK3Marker).toBe(false);
    expect(node.isDOK4Marker).toBe(false);
    expect(node.isSourceMarker).toBe(false);
    expect(node.isCategoryMarker).toBe(false);
    expect(node.isPurposeMarker).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// FR3: Content Extractor Integration
// ---------------------------------------------------------------------------

describe('FR3: Content Extractor Integration', () => {
  it('extractContent returns hierarchy and content for markdown sourceType', async () => {
    const { extractContent } = await import('../content-extractor');
    const file = {
      buffer: Buffer.from('- Owner\n  - John\n- Purpose\n  - Test purpose'),
      originalname: 'test.md',
      mimetype: 'text/markdown',
    } as Express.Multer.File;

    const result = await extractContent({ sourceType: 'markdown', file });
    expect(result.hierarchy).toBeDefined();
    expect(result.hierarchy!.length).toBeGreaterThan(0);
    expect(result.sourceLabel).toBe('Markdown');
    expect(result.content).toContain('Owner');
  });

  it('throws ContentExtractionError when file is missing', async () => {
    const { extractContent, ContentExtractionError } = await import('../content-extractor');
    await expect(
      extractContent({ sourceType: 'markdown' as any })
    ).rejects.toThrow(ContentExtractionError);
  });
});

// ---------------------------------------------------------------------------
// FR4: Template Structural Fidelity
// ---------------------------------------------------------------------------

describe('FR4: Template Structural Fidelity', () => {
  const NIL_TEMPLATE = `# NIL in College Athletics

- Owner
  - Marcus Johnson

- Purpose
  - Understanding how Name, Image, and Likeness policies are reshaping college athletics recruiting, compliance, and athlete development

- Category: Legal Framework
  - Source 1: NCAA NIL Policy Guidelines
    - https://www.ncaa.org/nil-policy
    - DOK1
      - The NCAA adopted an interim NIL policy on July 1, 2021, allowing athletes to profit from their name, image, and likeness
      - As of 2024, over 30 states have enacted their own NIL legislation with varying restrictions
      - The NCAA's NIL policy does not permit pay-for-play or recruiting inducements
    - DOK2
      - The legal landscape for NIL is a patchwork of federal inaction and state-level legislation, creating compliance complexity for multi-state programs
      - While the NCAA permits NIL activity, the boundary between permissible NIL deals and impermissible recruiting inducements remains contested
  - Source 2: Alston v. NCAA Supreme Court Decision
    - https://www.supremecourt.gov/opinions/20pdf/20-512_gfbh.pdf
    - DOK1
      - In NCAA v. Alston (2021), the Supreme Court unanimously ruled that NCAA limits on education-related benefits violate antitrust law
      - Justice Kavanaugh's concurrence suggested broader NCAA compensation limits may also be legally vulnerable
    - DOK2
      - Alston cracked the legal foundation of amateurism by treating the NCAA as a commercial enterprise subject to antitrust scrutiny, not a special educational carve-out

- Category: Economic Impact
  - Source 3: Knight Commission Report on NIL
    - https://www.knightcommission.org/nil-report-2023
    - DOK1
      - Football and men's basketball account for 90% of all reported NIL deals by dollar value (Knight Commission, 2023)
      - The median NIL deal for a Division I athlete is approximately $3,500 per year
      - Female athletes in Olympic sports receive disproportionately more social-media-based NIL deals relative to their sport's revenue
    - DOK2
      - NIL has created a two-tier economy within college athletics where revenue-sport stars command six-figure deals while most athletes earn modest amounts, mirroring professional sports economics

- DOK3
  - The combination of Alston's legal precedent and state NIL laws is accelerating a market-driven restructuring of college athletics that the NCAA can no longer control through internal governance alone
    - Sources
      - Source 1
      - Source 2
  - The disproportionate flow of NIL money to revenue sports amplifies existing Title IX tensions, because the economic rationale for NIL directly conflicts with equity mandates
    - Sources
      - Source 3
      - Source 1

- DOK4
  - College athletics will bifurcate into a professional tier (football/basketball with employment contracts) and an educational tier (Olympic sports with scholarship models) within 10 years, and this is the healthiest possible outcome for athlete welfare
    - Links
      - Insight 1
      - Insight 2
  - The NCAA's real existential threat is not NIL itself but the loss of the amateurism narrative -- once athletes are understood as workers, the entire justification for the NCAA's regulatory authority collapses
    - Links
      - Insight 1`;

  it('parses full NIL example with correct top-level structure', () => {
    const result = parseMarkdownBrainlift(NIL_TEMPLATE);
    const topNames = result.hierarchy.map(n => n.name);
    expect(topNames).toEqual([
      'Owner',
      'Purpose',
      'Category: Legal Framework',
      'Category: Economic Impact',
      'DOK3',
      'DOK4',
    ]);
  });

  it('sets correct marker flags on top-level nodes', () => {
    const result = parseMarkdownBrainlift(NIL_TEMPLATE);
    const flags = result.hierarchy.map(n => ({
      name: n.name,
      purpose: n.isPurposeMarker,
      category: n.isCategoryMarker,
      dok3: n.isDOK3Marker,
      dok4: n.isDOK4Marker,
    }));
    expect(flags).toEqual([
      { name: 'Owner', purpose: false, category: false, dok3: false, dok4: false },
      { name: 'Purpose', purpose: true, category: false, dok3: false, dok4: false },
      { name: 'Category: Legal Framework', purpose: false, category: true, dok3: false, dok4: false },
      { name: 'Category: Economic Impact', purpose: false, category: true, dok3: false, dok4: false },
      { name: 'DOK3', purpose: false, category: false, dok3: true, dok4: false },
      { name: 'DOK4', purpose: false, category: false, dok3: false, dok4: true },
    ]);
  });

  it('preserves Owner + child name as nested nodes', () => {
    const result = parseMarkdownBrainlift(NIL_TEMPLATE);
    const owner = result.hierarchy[0];
    expect(owner.name).toBe('Owner');
    expect(owner.children).toHaveLength(1);
    expect(owner.children[0].name).toBe('Marcus Johnson');
  });

  it('preserves Purpose + child description as nested nodes', () => {
    const result = parseMarkdownBrainlift(NIL_TEMPLATE);
    const purpose = result.hierarchy[1];
    expect(purpose.isPurposeMarker).toBe(true);
    expect(purpose.children).toHaveLength(1);
    expect(purpose.children[0].name).toContain('Understanding how');
  });

  it('has DOK4 Links > Insight N children for parseExplicitLinkRefs', () => {
    const result = parseMarkdownBrainlift(NIL_TEMPLATE);
    const dok4 = result.hierarchy.find(n => n.isDOK4Marker)!;
    expect(dok4.children).toHaveLength(2); // 2 SPOVs

    const spov1 = dok4.children[0];
    expect(spov1.children).toHaveLength(1); // Links node
    expect(spov1.children[0].name).toBe('Links');
    expect(spov1.children[0].children).toHaveLength(2);
    expect(spov1.children[0].children[0].name).toBe('Insight 1');
    expect(spov1.children[0].children[1].name).toBe('Insight 2');
  });

  it('has DOK3 Sources > Source N children as structural nodes', () => {
    const result = parseMarkdownBrainlift(NIL_TEMPLATE);
    const dok3 = result.hierarchy.find(n => n.isDOK3Marker)!;
    expect(dok3.children).toHaveLength(2); // 2 insights

    const insight1 = dok3.children[0];
    expect(insight1.children).toHaveLength(1); // Sources node
    expect(insight1.children[0].name).toBe('Sources');
    expect(insight1.children[0].children).toHaveLength(2);
    expect(insight1.children[0].children[0].name).toBe('Source 1');
    expect(insight1.children[0].children[1].name).toBe('Source 2');
  });

  it('produces correct nesting for multiple categories with multiple sources', () => {
    const result = parseMarkdownBrainlift(NIL_TEMPLATE);
    const legalCat = result.hierarchy[2]; // Category: Legal Framework
    expect(legalCat.isCategoryMarker).toBe(true);
    expect(legalCat.children).toHaveLength(2); // Source 1 and Source 2

    const source1 = legalCat.children[0];
    expect(source1.isSourceMarker).toBe(true);
    expect(source1.name).toBe('Source 1: NCAA NIL Policy Guidelines');
    // Source 1 has: URL, DOK1, DOK2
    expect(source1.children).toHaveLength(3);
    expect(source1.children[0].extractedUrl).toBe('https://www.ncaa.org/nil-policy');

    const dok1 = source1.children[1];
    expect(dok1.isDOK1Marker).toBe(true);
    expect(dok1.children).toHaveLength(3); // 3 facts

    const econCat = result.hierarchy[3]; // Category: Economic Impact
    expect(econCat.isCategoryMarker).toBe(true);
    expect(econCat.children).toHaveLength(1); // Source 3
  });

  it('extracts URLs on source URL child lines', () => {
    const result = parseMarkdownBrainlift(NIL_TEMPLATE);
    const source1 = result.hierarchy[2].children[0]; // Source 1
    const urlNode = source1.children[0];
    expect(urlNode.extractedUrl).toBe('https://www.ncaa.org/nil-policy');

    const source2 = result.hierarchy[2].children[1]; // Source 2
    const urlNode2 = source2.children[0];
    expect(urlNode2.extractedUrl).toBe('https://www.supremecourt.gov/opinions/20pdf/20-512_gfbh.pdf');
  });
});
