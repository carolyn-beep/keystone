# Brainlift Markdown Format Specification

A standalone `.md` format that replaces Workflowy dependency while remaining fully compatible with the existing grading pipeline. Zero changes to existing extraction, grading, or linking code.

---

## Design Principle

The .md file parses deterministically into `HierarchyNode[]` -- the same tree structure Workflowy produces. All downstream code (extractors, graders, auto-linkers) works unchanged because it only depends on `HierarchyNode[]` with boolean marker flags.

**The template is immutable.** Once published, it cannot change without breaking existing .md brainlifts. Code can always be updated later to take advantage of template structure.

---

## Template

```markdown
# [Brainlift Title]

- Owner
  - [Author Name]

- Purpose
  - [What this Brainlift is about and why it matters]

- Knowledge Tree
  - Category: [Category Name]
    - Source 1: [Source Name]
      - https://[source-url]
      - DOK1
        - [Atomic, verifiable claim from this source]
        - [Another atomic claim]
      - DOK2
        - [Synthesis/reorganization of what this source says]
        - [Another synthesis point]
    - Source 2: [Another Source Name]
      - https://[source-url]
      - DOK1
        - [Facts from this source]
      - DOK2
        - [Summary of this source]

  - Category: [Another Category Name]
    - Source 3: [Source Name]
      - https://[source-url]
      - DOK1
        - [Facts from this source]
      - DOK2
        - [Summary of this source]

- DOK3
  - [Cross-source insight connecting ideas from 2+ sources]
    - Sources
      - Source 1
      - Source 2
  - [Another cross-source insight]
    - Sources
      - Source 2
      - Source 3

- DOK4
  - [Spiky, contrarian point of view the author holds]
    - Links
      - Insight 1
      - Insight 2
  - [Another SPOV]
    - Links
      - Insight 1
```

### Template Design Rationale

**Sources are numbered** (`Source 1`, `Source 2`, etc.) to enable future deterministic DOK3-to-DOK2 linking without string matching. The existing `isSourceMarker` regex (`/^Source\s*\d*/i`) already matches this pattern. The number becomes the stable identifier an LLM can reference consistently.

**DOK3 insights have explicit `Sources` sub-nodes** referencing source numbers. This is structural metadata baked into the template for future use. In v1, the semantic auto-linker handles DOK3 linking and these sub-nodes are ignored. In v2, a deterministic linker can resolve `Source 1` -> the DOK2 summary under `Source 1` without any LLM call.

**DOK4 SPOVs have `Links` sub-nodes** referencing DOK3 insights by document order (1-indexed). This already works today via `parseExplicitLinkRefs()`.

---

## Parsing Rules

1. `# Title` line becomes root node name (used for `brainlift.title`)
2. Lines starting with `- ` (at any indentation) become nodes
3. Indentation determines parent-child: 2 spaces = 1 depth level
4. Marker detection applies the same regexes as Workflowy parsing (see below)
5. URL extraction applies `/https?:\/\/[^\s\]\)]+/` to each node's text
6. Blank lines are ignored

---

## Marker Regexes (from `server/utils/external-sources.ts`)

| Marker | Regex | Notes |
|--------|-------|-------|
| DOK1 | `/DOK\s*1\b/i` | Can appear anywhere in name (no `^` anchor) |
| DOK2 | `/^DOK\s*2\b/i` | Must start with "DOK2" |
| DOK3 | `/^DOK\s*3\b/i` | Must start with "DOK3" |
| DOK4 | `/^(DOK\s*4\b\|SPOVs?\b(?!\s*\d)\|Spiky\s+POVs?\b(?!\s*\d))/i` | Also matches "SPOVs", "Spiky POVs" |
| Source | `/^Source\s*\d*/i` | Matches "Source", "Source 1", "Source 1: Name" |
| Category | `/^Category\s*\d*/i` | Matches "Category", "Category 1: Name" |
| Purpose | `/^Purpose\s*$/i` | Exact match "Purpose" only |

These regexes are applied during `HierarchyNode` construction to set boolean flags (`isDOK1Marker`, `isSourceMarker`, etc.). All downstream extractors rely on these booleans -- they do zero regex matching themselves.

---

## What Each Section Maps To

| Template element | Pipeline use |
|-----------------|--------------|
| `# Title` | `brainlift.title` |
| `- Owner` + child `- [Name]` | `brainlift.author` (existing owner regex expects "Owner" on one line, name on the next) |
| `- Purpose` | `brainlift.description`, `brainlift.displayPurpose` (via `extractPurposeFromHierarchy()`) |
| `- Category: X` | `fact.category`, `dok2Summary.category` (via `findAncestorContext()`) |
| `- Source N: X` | `fact.source`, `dok2Summary.sourceName` (name stored with number prefix in v1 -- cosmetic, fixable later) |
| URL child of Source | `dok2Summary.sourceUrl`, evidence fetching (via `findUrlInSubtree()`) |
| `- DOK1` children | `facts` table rows (via `extractFactsFromHierarchy()`) |
| `- DOK2` children | `dok2Summaries` + `dok2Points` rows (via `extractDOK2Summaries()`) |
| `- DOK3` children | `dok3Insights` rows (via `extractDOK3Insights()`) |
| `- Sources > Source N` (under DOK3) | Ignored in v1 (semantic linker handles DOK3 linking). Future: deterministic DOK3-to-DOK2 resolution |
| `- DOK4` children | `dok4Spovs` rows (via `extractDOK4Spovs()`) |
| `- Links > Insight N` (under DOK4) | `dok4Spov.explicitDok3Refs` (via existing `parseExplicitLinkRefs()`) |

**Note on source names:** The existing name-stripping regex (`/^Source\s*:?\s*/i`) will store `"1: NCAA NIL Policy"` instead of `"NCAA NIL Policy"` for numbered sources. This is cosmetic and does not affect grading, linking, or evidence fetching. A one-line regex fix (`/^Source\s*\d*:?\s*/i`) can clean this up whenever desired.

---

## Structural Constraints

1. **Every Source must have a URL as its first child.** Without URLs, DOK1 grading falls back to LLM knowledge (lower confidence), DOK2 grading applies a source-link penalty, and evidence fetching skips entirely.
2. **Every DOK1 and DOK2 must be inside a Source context.** The extractor walks up to find a Source ancestor. No Source = `source: 'Unknown'`.
3. **Sources are globally numbered** across all categories (`Source 1`, `Source 2`, `Source 3`, etc.). Numbers are stable identifiers for DOK3 backlinks.
4. **DOK3 items are top-level** (not nested under sources). Each has a `Sources` sub-node listing the source numbers it draws from. In v1, the semantic auto-linker handles linking and these are ignored. The sub-nodes are structural metadata for future deterministic linking.
5. **DOK4 items are top-level.** `Links > Insight N` references are 1-indexed, matching DOK3 document order. Already handled by existing `parseExplicitLinkRefs()`.
6. **At least 2 sources from different categories** for meaningful DOK3 grading (multi-source constraint).
7. **Minimum content lengths:** Facts 10+ chars, DOK2 points 10+ chars, DOK4 SPOVs 10+ chars.

---

## Concrete Example

```markdown
# NIL in College Athletics

- Owner
  - Marcus Johnson

- Purpose
  - Understanding how Name, Image, and Likeness policies are reshaping college athletics recruiting, compliance, and athlete development

- Knowledge Tree
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
      - Insight 1
```

---

## What Stays the Same (Zero Changes)

- `hierarchyExtractor.ts` -- all extraction functions
- `dok3AutoLinker.ts` -- LLM semantic linking
- `dok4AutoLinker.ts` -- explicit refs + semantic fallback
- `dok3Grader.ts`, `dok4GraderService.ts` -- grading pipelines
- `evidenceFetcher.ts`, `factVerifier.ts` -- evidence and verification
- `saveBrainliftFromAI()` -- brainlift creation + DOK1 grading
- `runDOK3DOK4Pipeline()` -- auto-linking and grading cascade
- Expert extraction, redundancy analysis
- All database schema and storage queries

---

## New Code Required

1. **Markdown parser**: `parseMarkdownBrainlift(md: string) -> { markdown: string, hierarchy: HierarchyNode[] }`
2. **Entry point**: Add `'markdown'` case to existing `extractContent()` in `content-extractor.ts`, reusing the existing `POST /api/brainlifts/import-stream` route with multer file upload

---

## Deferred (v2)

- **Deterministic DOK3-to-DOK2 linking**: Template already has `Sources > Source N` sub-nodes. Code changes needed: (1) skip "Sources" sub-node text in `extractDOK3Insights()`, (2) parse source numbers, (3) add explicit resolution path in `dok3AutoLinker.ts` before semantic fallback, (4) fix source name-stripping regex to handle numbers.
- **Source name cleanup**: One-line regex fix to strip number prefix from stored sourceName.
