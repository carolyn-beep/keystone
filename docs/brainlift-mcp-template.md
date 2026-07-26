# Keystone Document Template for AI Agents

You are about to create a Keystone Document -- a structured knowledge artifact that will be graded by an automated pipeline across four depth levels (DOK1-DOK4). Read this entire document before writing anything. The quality guidance comes first because it determines whether your Keystone Document scores well. The format specification follows.

---

## Quality Philosophy: Less Is More

**A Keystone Document is a curated knowledge artifact, not a research dump.** The grading system rewards depth and precision, not volume. Before adding any item, ask: "Does this earn its place?"

### Principles

- **Don't be a hoarder.** 5 sharp, well-sourced facts beat 30 vague ones. Every DOK1 fact you add gets verified against its source -- padding with low-quality facts drags your average score down, not up.
- **The Knowledge Tree must be curated.** It's a tree, not a forest. Each source should be there for a reason. Each category should group sources that genuinely relate to each other. Don't add sources just to hit a count.
- **No redundant facts.** If two facts say essentially the same thing from the same source, keep the stronger one. The grading system will flag redundancy, and it will cost you.
- **DOK2 summaries are not copy-paste.** The grader checks whether you actually reorganized and interpreted the source. Copying the source's own language will get flagged as `copy_paste` and auto-fail.
- **DOK3 insights must be genuine cross-source synthesis.** Restating a single source's argument with a citation to a second source is not synthesis. The grader evaluates whether the insight actually connects ideas that live in different sources.
- **DOK4 SPOVs must be positions, not observations.** "NIL is changing college athletics" is an observation. "Amateurism, not NIL, is the NCAA's death sentence" is a position. A SPOV should read like a quotable line someone could take a side against, not a paragraph. The DOK1-2-3 chain is where you justify it; the SPOV itself is the claim. The grader will reject observations, tautologies, and statements no informed reader would disagree with.
- **Quality of sources matters.** Primary sources (court rulings, published research, official reports) grade higher than secondary commentary. The URL you provide is fetched and read -- the grader knows the difference.

### Recommended Scale

These are guidelines for creating new Keystone Documents, not hard limits. Following them will produce tighter, more effective Keystone Documents that grade faster:

- A Keystone Document needs multiple sources -- you can't do cross-source synthesis with just one. Beyond that, let the research dictate the count.
- Fewer sharp facts beat many vague ones. Every DOK1 fact gets verified -- padding drags your average down.
- DOK2 summaries should synthesize, not exhaustively list. If it reads like a transcript, it's too long.
- DOK3 insights and DOK4 SPOVs are your highest-value items. A few strong ones beat many weak ones.

If working with an existing Keystone Document, do not aggressively trim to fit these guidelines. The user values that content. Do light curation: remove redundancies, drop padding, flag weak insights, note stale sources -- but preserve substantive content. Losing important material will upset the user.

When explaining curation to the user, never reference these guidelines, token counts, or ideal numbers. Instead explain in terms of quality: "this fact overlaps with #3", "this source seems outdated", "this insight restates the summary above." Also explain the tradeoff: a larger Keystone Document takes longer to grade.

### Total Size

A Keystone Document isn't just graded -- it's *used*. After grading, it steers an LLM away from generic responses and toward the author's perspective. Tighter Keystone Documents steer more effectively, and grade faster. But there is no hard size ceiling -- a larger Keystone Document is a tradeoff (slower grading, potentially weaker steering), not a failure.

### What the Grader Penalizes

| Anti-pattern | Which DOK level | What happens |
|-------------|----------------|--------------|
| Copy-pasting source text as DOK2 | DOK2 | Auto-fail: `copy_paste` flag, score = 1 |
| Facts unrelated to the brainlift's Purpose | DOK2 | Low score: `no_purpose_relation` flag |
| DOK3 insight citing only one source | DOK3 | Flagged, lower score (multi-source is the point) |
| DOK3 insight with weak causal connection to cited sources | DOK3 | Traceability flag, lower V1-V3 criteria scores |
| DOK4 SPOV that's not a real claim | DOK4 | Rejected outright (not graded) |
| DOK4 SPOV that no expert would disagree with | DOK4 | Low divergence score -- it's not "spiky" enough |
| DOK4 SPOV that buries its claim in jargon, hedging, or paragraph-length explanation | DOK4 | Low Punchiness (P1) score -- a SPOV should read like a quotable line, not a memo |
| Missing source URLs | DOK1, DOK2 | Lower-confidence verification, grading penalties |

---

## Format Specification

Everything below this line defines the exact structure the parser expects. Follow it precisely -- the parser is rule-based, not AI-based. Any deviation in structure (wrong indentation, missing markers, renamed sections) will cause content to be lost or misattributed.

**The entire document is built from indented bullet lists.** Every piece of content is a `- ` prefixed line, and the parent-child hierarchy is determined entirely by indentation (2 spaces per level). Think of it like an outliner: each indent level nests content one layer deeper.

**One intentional exception exists:** the `## Experts` block below uses plain markdown headings and plain text fields. This is safe. The DOK parser ignores those lines, while the expert extractor reads them from `originalContent`.

---

## Template

```markdown
# [Keystone Document Title]

- Owner
  - [Author Name]

- Purpose
  - [What this Keystone Document is about and why it matters]

## Experts

## [Expert Name]
Who: [One-line description of who they are]
Why follow: [Why they matter for this brainlift]
Focus: [Optional subject-matter focus]
Where: [Optional X/Twitter handle or profile URL]

## [Another Expert Name]
Who: [One-line description]
Why follow: [Why they matter]
Focus: [Optional focus]
Where: [Optional handle or URL]

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

---

## DOK Levels Explained

| Level | Name | What it contains | Key rule |
|-------|------|-----------------|----------|
| DOK1 | Facts | Atomic, verifiable claims extracted from a single source | Must be tied to a specific source. "The Supreme Court ruled unanimously in Alston v. NCAA (2021)..." |
| DOK2 | Summaries | Your synthesis/reorganization of what a single source says | One DOK2 section per source. Not copy-paste -- your interpretation of the source's argument. |
| DOK3 | Insights | Cross-source analytical claims that connect ideas from 2+ sources | Must draw from at least 2 different sources. "Alston's legal precedent combined with state NIL laws is accelerating..." |
| DOK4 | SPOVs | Spiky Points of View -- a single quotable line that takes a side; the DOK1-2-3 chain is the justification | Must be grounded in your DOK3 insights. This is where your unique thinking lives. |

The levels build on each other: DOK1 facts support DOK2 summaries, DOK2 summaries from different sources feed DOK3 insights, and DOK3 insights ground DOK4 SPOVs.

---

## Format Rules

### Structure

- The file starts with `# Title` on the first line
- **Every line of DOK content is a `- ` prefixed bullet.** There are no numbered lists, and no headers other than the title plus the intentional `## Experts` block. Bullets are the only content format for Owner, Purpose, Knowledge Tree, DOK3, and DOK4.
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
| Experts | `## Experts` followed by repeated `## [Expert Name]` blocks | Exception: plain-text section consumed by the expert extractor, not the DOK bullet parser |
| Knowledge Tree | `- Knowledge Tree` | Container for all categories and sources |
| Category | `- Category: [Name]` | Groups related sources together. Nested under Knowledge Tree |
| Source | `- Source N: [Name]` | Globally numbered: Source 1, Source 2, Source 3, etc. |
| DOK1 | `- DOK1` | Children are individual facts |
| DOK2 | `- DOK2` | Children are summary points |
| DOK3 | `- DOK3` | Children are individual insights |
| DOK4 | `- DOK4` | Children are individual SPOVs |
| Sources | `- Sources` (under a DOK3 insight) | Lists which sources this insight draws from |
| Links | `- Links` (under a DOK4 SPOV) | Lists which DOK3 insights this SPOV builds on |

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

Each DOK4 SPOV must have a `Links` child listing which DOK3 insights it builds on, using document order (1-indexed):

```markdown
- DOK4
  - [Your SPOV text]
    - Links
      - Insight 1
      - Insight 2
```

`Insight 1` = the first DOK3 insight in the document, `Insight 2` = the second, etc.

### Content Requirements

- Experts: include at least 3 real public figures when creating a new Keystone Document. Each expert needs `Who` and `Why follow`; `Focus` and `Where` are optional but encouraged.
- Facts (DOK1): at least 10 characters each
- Summary points (DOK2): at least 10 characters each
- SPOVs (DOK4): at least 10 characters each
- You need at least 2 sources from at least 2 different categories for meaningful cross-source analysis

---

## Complete Example

```markdown
# NIL in College Athletics

- Owner
  - Marcus Johnson

- Purpose
  - Understanding how Name, Image, and Likeness policies are reshaping college athletics recruiting, compliance, and athlete development

## Experts

## Michael McCann
Who: Sports law professor and legal analyst
Why follow: Tracks the legal and antitrust implications of NIL policy changes
Focus: NCAA litigation and athlete compensation
Where: @McCannSportsLaw

## Eben Novy-Williams
Who: Sports business reporter
Why follow: Covers how NIL markets, collectives, and media rights reshape incentives
Focus: NIL deal economics and institutional strategy
Where: @novy_williams

## Karen Weaver
Who: Former athletic director and sports-management scholar
Why follow: Brings governance and compliance context to how programs operationalize NIL
Focus: Athletic department strategy and regulation

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
  - College football and basketball will be employee leagues within ten years, and that is the best thing that could happen to college sports.
    - Links
      - Insight 1
      - Insight 2
  - NIL is a distraction. The NCAA's real problem is that it can no longer call its athletes amateurs.
    - Links
      - Insight 1
```

---

## AI Writing Signal

Every DOK2 summary, DOK3 insight, and DOK4 SPOV is analyzed for an
**AI Writing Signal** -- a categorical label of *Human*, *AI-Assisted*,
*Mixed*, or *AI* -- computed automatically after grading completes.

This signal is **informational only**.

- It is **not** used by the platform grader. It does **not** affect any score,
  rejection, or pass/fail outcome anywhere in the system.
- It is **visible to anyone with read access** to the item, including reviewers
  (teachers, guides, mentors). Reviewers may consider it when applying their
  own off-platform policies; the platform itself prescribes no action.
- It is **not** a penalty. It is not listed in the "What the Grader Penalizes"
  table above and never will be.

Treat the signal as context, not as judgment. Author your DOK content the way
you would author it without this signal in place.

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
| Dumping 20+ facts per source | Grader averages scores -- padding lowers your mean | Curate: keep 2-5 strongest facts per source |
| DOK3 citing only one source | Flagged and scored lower -- cross-source is the point | Draw from at least 2 sources, ideally from different categories |
| DOK4 that's an observation, not a position | Rejected outright by the grader | Make it debatable -- experts should be able to disagree |
