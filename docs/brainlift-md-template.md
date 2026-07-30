# Keystone Document Markdown Template

A Keystone Document is a structured knowledge document that organizes research into four levels of depth (DOK1-DOK4), progressing from raw facts to original thinking.

This template defines a **standalone, tool-agnostic format** for authoring Keystone Documents as plain `.md` files. No Workflowy account, no proprietary tools -- just a text editor. It was designed primarily for LLM-driven generation, where an AI can reliably produce a complete, well-structured Keystone Document in a single pass by following these rules. A human can absolutely use it too, though the rigid structure and precise formatting make it better suited as a machine-writable format -- if you're building a Keystone Document yourself, the platform's native builder is a better experience, letting you focus on your thinking rather than template mechanics. The indented bullet structure maps directly to the Keystone Document platform's import pipeline, and because it uses standard markdown indentation, it can also be pasted directly into Workflowy and the outline hierarchy will be preserved correctly.

**The entire document is built from indented bullet lists.** Every piece of content is a `- ` prefixed line, and the parent-child hierarchy is determined entirely by indentation (2 spaces per level). Think of it like an outliner: each indent level nests content one layer deeper. The parser uses this tree structure to automatically detect sources, categorize facts, link insights across sources, and wire up the full grading pipeline -- all from indentation alone.

**Follow this template exactly.** The format is parsed by rules, not AI -- any deviation in structure (wrong indentation, missing markers, renamed sections) will cause content to be lost or misattributed.

---

## Template

```markdown
# [Keystone Document Title]

- Owner
  - [Author Name]

- Purpose
  - [What this Keystone Document is about and why it matters]

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
  - [Divergent, contrarian point of view the author holds]
    - Links
      - Insight 1
      - Insight 2
  - [Another Conviction]
    - Links
      - Insight 1
```

---

## DOK Levels Explained

| Level | Name | What it contains | Key rule |
|-------|------|-----------------|----------|
| DOK1 | Facts | Atomic, verifiable claims extracted from a single source | Must be tied to a specific source. "The Supreme Court ruled unanimously in Alston v. NCAA (2021)..." |
| DOK2 | Summaries | Your synthesis/reorganization of what a single source says | One DOK2 section per source. Not copy-paste -- your interpretation of the source's argument. |
| DOK3 | Insights | Cross-source analytical claims that connect ideas from 2+ sources | Must draw from at least 2 different sources. "Alston's legal precedent combined with state NIL laws is accelerating..." |
| DOK4 | Convictions | Convictions -- your original, defensible, possibly contrarian positions | Must be grounded in your DOK3 insights. This is where your unique thinking lives. |

The levels build on each other: DOK1 facts support DOK2 summaries, DOK2 summaries from different sources feed DOK3 insights, and DOK3 insights ground DOK4 Convictions.

---

## Format Rules

### Structure

- The file starts with `# Title` on the first line
- **Every line of content is a `- ` prefixed bullet.** There are no plain text lines, no numbered lists, no headers other than the title. Bullets are the only content format.
- **Indentation is exactly 2 spaces per level.** This is how the parser determines what belongs to what. A fact indented 6 spaces deep lives under a DOK1 marker indented 4 spaces deep, which lives under a Source indented 2 spaces deep. Get this wrong and content gets orphaned or misattributed.
  ```
  - Level 0 (0 spaces before -)
    - Level 1 (2 spaces before -)
      - Level 2 (4 spaces before -)
        - Level 3 (6 spaces before -)
  ```
- Blank lines between sections are fine (they're ignored)
- **Do not use tabs.** Spaces only, exactly 2 per level.

### Section Keywords

These keywords are detected by exact patterns. Use them exactly as shown:

| Keyword | Format | Notes |
|---------|--------|-------|
| Owner | `- Owner` (alone on its line, name on next line as child) | NOT `- Owner: Name` |
| Purpose | `- Purpose` (alone on its line, content as children) | Must be exactly "Purpose", nothing after it |
| Knowledge Tree | `- Knowledge Tree` | Container for all categories and sources |
| Category | `- Category: [Name]` | Groups related sources together. Nested under Knowledge Tree |
| Source | `- Source N: [Name]` | Globally numbered: Source 1, Source 2, Source 3, etc. |
| DOK1 | `- DOK1` | Children are individual facts |
| DOK2 | `- DOK2` | Children are summary points |
| DOK3 | `- DOK3` | Children are individual insights |
| DOK4 | `- DOK4` | Children are individual Convictions |
| Sources | `- Sources` (under a DOK3 insight) | Lists which sources this insight draws from |
| Links | `- Links` (under a DOK4 Conviction) | Lists which DOK3 insights this Conviction builds on |

### Sources

- **Sources are globally numbered** across the entire document: `Source 1`, `Source 2`, `Source 3`, etc. The number doesn't reset per category.
- The same source can appear in only one category.
- **Every source should have a URL** as its first child bullet. The URL is how the grading system verifies your facts -- it fetches the source content and checks your DOK1 claims against it. Without a URL:
  - DOK1 facts fall back to general AI knowledge for verification, which produces lower-confidence scores
  - DOK2 summaries receive a grading penalty because the system can't confirm you actually synthesized from the source
  - Evidence fetching is skipped entirely, meaning the grader has no direct access to what the source actually says
  - A source without a URL won't break the import, but it will meaningfully weaken the grading quality for everything under that source

### DOK3 Back-references

Each DOK3 insight must have a `Sources` child listing which sources it draws from, using the source numbers:

```markdown
- DOK3
  - [Your insight text]
    - Sources
      - Source 1
      - Source 3
```

These references tell the system which DOK2 summaries your insight connects. A DOK3 insight with only one source will still be parsed and graded, but the grading system enforces a multi-source constraint -- insights that draw from only one source get flagged and score lower, because the whole point of DOK3 is cross-source synthesis. Aim for at least 2 sources from different categories per insight.

### DOK4 Back-references

Each DOK4 Conviction must have a `Links` child listing which DOK3 insights it builds on, using document order (1-indexed):

```markdown
- DOK4
  - [Your Conviction text]
    - Links
      - Insight 1
      - Insight 2
```

`Insight 1` = the first DOK3 insight in the document, `Insight 2` = the second, etc.

### Content Requirements

- Facts (DOK1): at least 10 characters each
- Summary points (DOK2): at least 10 characters each
- Convictions (DOK4): at least 10 characters each
- You need at least 2 sources from at least 2 different categories for meaningful cross-source analysis

---

## Complete Example

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

## Common Mistakes

| Mistake | Why it breaks | Fix |
|---------|--------------|-----|
| `- Owner: Marcus Johnson` | Owner must be on its own line, name on the next | Use two lines: `- Owner` then `  - Marcus Johnson` |
| `- Purpose: Understanding...` | Purpose must be exactly "Purpose" with nothing after it | Use two lines: `- Purpose` then `  - Understanding...` |
| Using tabs instead of spaces | Parser expects 2-space indentation | Use spaces only |
| Unnumbered sources (`- Source: Name`) | Source numbers are required for DOK3 back-references | Use `- Source 1: Name`, `- Source 2: Name`, etc. |
| Missing URL under source | Facts get lower-confidence scores, summaries get penalized, evidence fetching is skipped | Always include the URL as the first child of each source |
| DOK3 nested under Knowledge Tree | DOK3 must be top-level (same depth as Knowledge Tree) | Move DOK3 section outside of Knowledge Tree |
| `- Insight 3` under DOK3 Sources | DOK3 Sources reference source numbers, not insight numbers | Use `- Source 1`, `- Source 2`, etc. |
| Inconsistent indentation | 3 spaces, 4 spaces, mixed | Always use exactly 2 spaces per level |
