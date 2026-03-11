/**
 * Pre-Format Evaluator
 *
 * Single Opus 4.6 LLM call to determine whether a BrainLift hierarchy
 * needs pre-formatting before extraction. Ternary output:
 * needs_formatting | no_formatting_needed | not_a_brainlift.
 *
 * Feeds the LLM both the serialized hierarchy AND extraction diagnostics
 * so it can reason about structural quality with concrete evidence.
 * Also returns contentSizeChars for frontend threshold warnings.
 */

import type { HierarchyNode } from '@shared/hierarchy-types';
import { serializeSubtree } from './chunker';
import { extractAllFromHierarchy } from '../hierarchyExtractor';

const MODEL = 'anthropic/claude-opus-4-6';

export type EvaluationDecision = 'needs_formatting' | 'no_formatting_needed' | 'not_a_brainlift';

export interface EvaluationResult {
  decision: EvaluationDecision;
  confidence: 'high' | 'medium' | 'low';
  reasons: string[];
  /** Total serialized hierarchy size in chars — for frontend threshold warnings */
  contentSizeChars: number;
}

/**
 * Run the extractor and produce diagnostic stats for the LLM.
 */
function buildExtractionDiagnostics(hierarchy: HierarchyNode[]): string {
  const result = extractAllFromHierarchy(hierarchy);
  const m = result.metadata;

  // Count facts with unknown/null source
  const unknownSourceFacts = result.facts.filter(f => !f.source || f.source === 'Unknown' || f.source === 'General');
  const attributedFacts = result.facts.filter(f => f.source && f.source !== 'Unknown' && f.source !== 'General');

  // Count DOK2 groups
  const dok2Groups = result.dok2Summaries;

  // Count hierarchy stats
  let totalNodes = 0;
  let ktNodes = 0;
  let inKT = false;
  function walkCount(node: HierarchyNode, isInKT: boolean) {
    totalNodes++;
    const thisIsKT = isInKT || /knowledge\s*tree|DOK\s*2/i.test(node.name);
    if (thisIsKT) ktNodes++;
    node.children.forEach(c => walkCount(c, thisIsKT));
  }
  hierarchy.forEach(n => walkCount(n, false));

  const lines = [
    `## Extraction Diagnostics (from running the actual extractor on this hierarchy)`,
    ``,
    `Total hierarchy nodes: ${totalNodes}`,
    `Knowledge Tree nodes: ${ktNodes}`,
    ``,
    `### DOK1 (Facts)`,
    `DOK1 marker nodes found: ${m.dok1NodesFound}`,
    `Total facts extracted: ${m.totalFactsExtracted}`,
    `Facts with known source attribution: ${attributedFacts.length}`,
    `Facts with UNKNOWN/missing source: ${unknownSourceFacts.length}${unknownSourceFacts.length > 0 ? ` (${(unknownSourceFacts.length / Math.max(result.facts.length, 1) * 100).toFixed(0)}%)` : ''}`,
    `Sources attributed: ${m.sourcesAttributed}`,
    `Categories found: ${m.categoriesFound.length} — ${m.categoriesFound.slice(0, 5).join(', ')}${m.categoriesFound.length > 5 ? '...' : ''}`,
    ``,
    `### DOK2 (Summaries)`,
    `DOK2 marker nodes found: ${m.dok2NodesFound}`,
    `DOK2 summary groups extracted: ${dok2Groups.length}`,
    `Total DOK2 points extracted: ${m.totalDOK2PointsExtracted}`,
    ``,
    `### DOK3 (Insights)`,
    `DOK3 marker nodes found: ${m.dok3NodesFound}`,
    `Total DOK3 insights extracted: ${m.totalDOK3InsightsExtracted}`,
    ``,
    `### DOK4 (SPOVs)`,
    `DOK4 marker nodes found: ${m.dok4NodesFound}`,
    `Total DOK4 SPOVs extracted: ${m.totalDOK4SpovsExtracted}`,
  ];

  // Add sample of unknown-source facts if any
  if (unknownSourceFacts.length > 0) {
    lines.push('');
    lines.push(`### Sample facts with UNKNOWN source (first 5):`);
    for (const f of unknownSourceFacts.slice(0, 5)) {
      lines.push(`- "${f.fact.substring(0, 80)}${f.fact.length > 80 ? '...' : ''}" (category: ${f.category})`);
    }
  }

  return lines.join('\n');
}

const EVALUATION_SYSTEM_PROMPT = `You evaluate BrainLift documents to determine if they need automated restructuring before our extraction pipeline processes them.

## What Is a BrainLift?

A BrainLift is a student's personal knowledge base built from sources they've studied. It's organized using DOK (Depth of Knowledge) levels:

| DOK | What | Characteristics |
|-----|------|-----------------|
| DOK1 | Facts | Objective data points extracted from a source |
| DOK2 | Summaries | The student's interpretation of a source — tying facts together |
| DOK3 | Insights | Cross-source analytical claims that synthesize MULTIPLE sources |
| DOK4 | SPOVs (Spiky Points of View) | The student's boldest original claims |

**Bright line:** DOK1-2 = external world (objective). DOK3-4 = owner's expertise (subjective).

## Canonical BrainLift Structure

\`\`\`
TITLE
- Owner
  - name
- Purpose
  - primary purpose
- Experts
  - Expert 1
    - Who / Focus / Why Follow / Where
- DOK4 - SPOV
  - spov 1 - text
- DOK3 - Insights
  - Insight 1 - text
    - Links
      - Category N, Source "source name"
- DOK2 - Knowledge Tree
  - Category 1: Name
    - Source: Source Name
      - DOK1 - facts
        - fact text
      - DOK2 - summary
        - summary text
      - link to source
        - URL
- Scratchpad (optional)
\`\`\`

## Structural Rules

1. **Node order**: Owner → Purpose → Experts → DOK4 → DOK3 → DOK2 → Scratchpad
2. **Experts are NOT a DOK level**
3. **Knowledge Tree IS DOK2** — contains DOK1 facts and DOK2 summaries per source
4. **DOK3 insights belong in their own top-level section** — not buried inside the Knowledge Tree
5. **DOK1 and DOK2 only pertain to sources** — category-level summaries that synthesize across sources are DOK3
6. **Facts must be nested under sources** — not floating at the category or root level

## How the Extraction Pipeline Works

The extractor walks the hierarchy tree:
- Finds DOK1/DOK2 marker nodes by looking for "DOK1" or "DOK2" in node names
- Walks UP from each marker to find the nearest Source and Category ancestors
- If facts/summaries are NOT nested under a recognizable source → "Unknown" attribution → broken linking

The linking chain:
\`\`\`
DOK1 facts → attributed to Source (tree walk UP)
DOK2 summaries → attributed to Source (tree walk UP)
DOK3 insights → linked to DOK2 summaries (LLM semantic matching)
DOK4 SPOVs → linked to DOK3 insights (LLM semantic matching)
\`\`\`

## Knowledge Tree Quality

The Knowledge Tree is where most extraction happens. Pay special attention to:

- **Do DOK1/DOK2 markers exist INSIDE the Knowledge Tree?** Having a top-level "DOK2 Knowledge Tree" label is NOT the same as having DOK1/DOK2 markers under individual sources. The extractor needs markers at the source level to extract facts and summaries.
- **Are facts grouped under identifiable topics or sources?** The grouping node does NOT need a "Source:" prefix. A topic name like "ReadBasix in depth" or "Nature vs. Nurture" with DOK1/DOK2 markers nested under it is a perfectly valid structure. What matters is that DOK1/DOK2 markers have a meaningful parent node — not what that parent is called.
- **Is there a large Knowledge Tree with zero DOK1 markers?** That means the entire KT is free text the extractor can't process.
- **High "Unknown" source attribution in the diagnostics does NOT automatically mean the structure is broken.** The extractor only attributes sources when it finds a node matching the exact "Source:" naming pattern. Many well-structured BrainLifts use topic names instead of "Source:" prefix — the DOK1/DOK2 markers are still properly nested, the content is still grouped logically. Look at the ACTUAL hierarchy structure, not just the attribution percentage.

## What NEEDS Pre-Formatting (decision: "needs_formatting")

1. **No DOK markers at all** — raw nested notes with no DOK1/DOK2/DOK3/DOK4 labels
2. **Everything is flat** — no hierarchy, no sections
3. **Sections nested inside wrong parents** — Knowledge Tree buried under DOK4, insights as children of a source
4. **Knowledge Tree has no internal DOK1/DOK2 markers** — the KT exists but its content is free text without markers, so the extractor can't pull facts or summaries
5. **No source structure in the Knowledge Tree** — facts and summaries floating at category level with no source grouping
6. **Mislabeled DOK levels** — "DOK1: Experts", "DOK3: Knowledge Tree"
7. **DOK3 insights buried inside Knowledge Tree** — insights that should be in their own section are nested under categories or sources

## What Does NOT Need Pre-Formatting (decision: "no_formatting_needed")

The extractor is resilient. A BrainLift is fine as-is when:
- Top-level DOK sections exist (DOK4, DOK3, DOK2)
- DOK1/DOK2 markers are present inside the Knowledge Tree under sources
- Sources are organized under categories (even without exact "Source:"/"Category:" prefix)
- DOK3 insights are in their own section
- DOK4 SPOVs are in their own section

Minor imperfections that do NOT need fixing:
- Missing Owner, Purpose, or Experts sections
- Non-standard expert field names
- Extra nesting or containers within DOK4/DOK3
- Section order not matching canonical template
- Source names with full citations instead of clean names
- DOK markers with extra words ("DOK1 Facts", "DOK2 - Summary of book")
- Missing URLs or "link to source" nodes
- Topics used as source groupings instead of "Source:" prefix (e.g., "ReadBasix in depth" with DOK1/DOK2 nested under it) — the structure is correct even if the extractor reports "Unknown" attribution
- Categories without "Category N:" prefix — as long as the KT has logical groupings with DOK markers inside

## Not a BrainLift (decision: "not_a_brainlift")

The content is clearly not a BrainLift — no recognizable BrainLift structure, too little content to be meaningful, a hollow template, or just scattered notes.

## Your Input

You will receive:
1. The serialized BrainLift hierarchy (the actual document structure)
2. Extraction diagnostics from running the actual extractor on this hierarchy

The extraction diagnostics are EVIDENCE, not a verdict. Use them to support your analysis, but reason about the actual structure. A high DOK1 count doesn't mean the structure is good — and a low count doesn't mean it's bad. Look at the content and decide.

## Your Decision

Return one of three decisions:

- **"needs_formatting"** — this IS a BrainLift (has research content) but the extraction pipeline would significantly fail on this structure
- **"no_formatting_needed"** — this IS a BrainLift and the extractor can handle it reasonably well as-is
- **"not_a_brainlift"** — this is NOT a BrainLift at all (to-do list, random notes, empty template, operational document)

If in doubt between "needs_formatting" and "no_formatting_needed", say it does NOT need formatting. A messy but labeled BrainLift is better left alone than risk content loss from reformatting.`;

/**
 * Evaluate whether a BrainLift hierarchy needs pre-formatting.
 * Single Opus 4.6 call with hierarchy + extraction diagnostics.
 */
export async function evaluateNeedsPreformat(
  hierarchy: HierarchyNode[],
): Promise<EvaluationResult> {
  const apiKey = process.env.OPENROUTER_API_KEY;
  if (!apiKey) {
    throw new Error('OpenRouter API key not configured');
  }

  // Serialize hierarchy and capture full size before truncation
  let markdown = '';
  for (const node of hierarchy) {
    markdown += serializeSubtree(node);
  }
  const contentSizeChars = markdown.length;

  const MAX_CHARS = 50000;
  if (markdown.length > MAX_CHARS) {
    markdown = markdown.substring(0, MAX_CHARS) + '\n\n[... truncated, document continues for ' + (markdown.length - MAX_CHARS) + ' more characters ...]';
  }

  // Run extractor and build diagnostics
  const diagnostics = buildExtractionDiagnostics(hierarchy);

  const userMessage = `${diagnostics}\n\n---\n\n## BrainLift Hierarchy\n\n${markdown}`;

  const body = {
    model: MODEL,
    messages: [
      { role: 'system', content: EVALUATION_SYSTEM_PROMPT },
      { role: 'user', content: userMessage },
    ],
    temperature: 0,
    response_format: {
      type: 'json_schema',
      json_schema: {
        name: 'evaluation_result',
        strict: true,
        schema: {
          type: 'object',
          properties: {
            decision: { type: 'string', enum: ['needs_formatting', 'no_formatting_needed', 'not_a_brainlift'] },
            confidence: { type: 'string', enum: ['high', 'medium', 'low'] },
            reasons: { type: 'array', items: { type: 'string' } },
          },
          required: ['decision', 'confidence', 'reasons'],
          additionalProperties: false,
        },
      },
    },
  };

  const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    const errBody = await response.text().catch(() => '');
    throw new Error(`Evaluation API error ${response.status}: ${errBody.substring(0, 200)}`);
  }

  const data = (await response.json()) as {
    choices?: Array<{ message?: { content?: string } }>;
  };
  const content = data.choices?.[0]?.message?.content;
  if (!content) {
    throw new Error('No response content from evaluation LLM');
  }

  const parsed = JSON.parse(content) as { decision: EvaluationDecision; confidence: 'high' | 'medium' | 'low'; reasons: string[] };
  return {
    ...parsed,
    contentSizeChars,
  };
}
