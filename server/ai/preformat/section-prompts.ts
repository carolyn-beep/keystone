/**
 * Section-Specific LLM Prompt Templates for BrainLift Pre-Formatting.
 *
 * CORE PRINCIPLE: The LLM's job is to CLASSIFY and PLACE existing text into
 * the correct structural slots. It must NEVER generate, paraphrase, summarize,
 * or combine the student's words. Every text string in the output must be a
 * verbatim copy from the input — typos, grammar errors, and all.
 *
 * All sections except Owner output free-form markdown in "sectionMarkdown".
 * The markdown parser reconstructs HierarchyNode[] from the LLM's output.
 */

import type { ChunkType, PreformatChunk, PromptConfig } from './types';

// ═══════════════════════════════════════════════════════════════════════════
// Shared prompt components
// ═══════════════════════════════════════════════════════════════════════════

const VERBATIM_RULE = `CRITICAL RULE — VERBATIM TEXT ONLY:
You MUST copy the student's text EXACTLY as written, character-for-character.
- Include typos, grammar errors, unconventional formatting — do NOT fix them.
- NEVER paraphrase, summarize, reword, combine, or shorten text.
- NEVER generate new content that doesn't appear in the input.
- NEVER infer or synthesize insights/SPOVs that the student didn't explicitly write.
- Every string you output MUST be a verbatim copy-paste from the input text.
- If you can't find text for a field, use an empty string — don't invent text.

Your job is ONLY to decide WHERE each piece of text belongs in the structure.
You are a filing clerk, not an editor.`;

const DOK_DEFINITIONS = `DOK Levels (for classification only — you don't create these, you recognize them):
- DOK1 (Facts): Objective data points, quotes, statistics extracted FROM a source. Same for anyone who reads the source. Raw information from the external world.
- DOK2 (Summaries): The student's interpretation that logically ties facts from a source together. Must be directly supported by DOK1 facts. Understanding how/why based on source material.
- DOK3 (Insights): Text the student ALREADY WROTE as cross-source analytical claims. Surprising, contrarian, subjective. Only include text explicitly written as an insight.
- DOK4 (SPOVs - Spiky Points of View): Text the student ALREADY WROTE as their original opinionated perspective. Extended thinking, transference across domains.

BRIGHT LINE: DOK1-2 = external world (objective, from sources). DOK3-4 = owner's expertise (subjective).
Content that is the student's own ideas, plans, brainstorming, creative concepts, or operational notes is NOT DOK1 or DOK2 — it belongs in Scratchpad.`;

const ROLE_CONTEXT = `You are restructuring a section of a BrainLift document. A BrainLift is a student's personal knowledge base organized around sources they've studied.

${VERBATIM_RULE}`;

const ZERO_CONTENT_LOSS = `CRITICAL: ZERO content loss. Every piece of text from the input MUST appear in the sectionMarkdown output. When in doubt, include it. NEVER drop content.`;

const CONSERVATIVE_DEFAULTS = `Conservative defaults for ambiguities:
- If you're unsure whether something is DOK2 or DOK3, keep it as DOK2 (under its source).
- If you're unsure whether something is a SPOV, keep it wherever it already is.
- Only classify content as scratchpad if it is CLEARLY non-research: TO-DO lists, SOPs, timelines, character planning, episode scripts, operational plans.
- If content is flagged "out of scope" but still included, keep it in place.
- If a source has no link or attribution, keep it with a null URL.
- Named containers (e.g., "Season 1 Research") should be flattened — preserve the container name in the source label.`;

const STRIP_INSTRUCTIONS = `Content to strip (do NOT include in any output field):
- Template instructions like "What are experts", "Creating lists of experts is DOK 1", "How to create summaries"
- Workflowy artifacts: "0 Backlink", internal "workflowy.com/#/" links
- Empty bullets or whitespace-only content
Put stripped template instructions in the strippedTemplateInstructions array (where applicable).`;

// ═══════════════════════════════════════════════════════════════════════════
// JSON Schema Helpers
// ═══════════════════════════════════════════════════════════════════════════

function wrapSchema(name: string, schema: object): object {
  return {
    name,
    strict: true,
    schema: {
      ...schema,
      additionalProperties: false,
    },
  };
}

// ═══════════════════════════════════════════════════════════════════════════
// Prompt Builders
// ═══════════════════════════════════════════════════════════════════════════

export function buildOwnerPrompt(chunk: PreformatChunk): PromptConfig {
  return {
    system: `${ROLE_CONTEXT}

Your task: Find the owner's name in this section and copy it EXACTLY as written.

Do NOT clean up, reformat, or abbreviate the name. Copy the exact string.
If the section contains a name plus additional info (bio, title), copy ONLY the name line verbatim.`,
    user: chunk.markdown,
    jsonSchema: wrapSchema('owner_result', {
      type: 'object',
      properties: {
        name: { type: 'string' },
      },
      required: ['name'],
    }),
  };
}

export function buildPurposePrompt(chunk: PreformatChunk): PromptConfig {
  return {
    system: `${ROLE_CONTEXT}

Your task: Reorganize this Purpose section into canonical BrainLift format as an indented markdown bullet list. COPY ALL TEXT VERBATIM.

Output the reorganized purpose as an indented markdown bullet list in the "sectionMarkdown" field. Use this structure:

\`\`\`
- Purpose
  - main purpose statement copied verbatim
  - Out of scope:
    - out-of-scope item 1
    - out-of-scope item 2
  - [any other sub-items preserved as-is]
\`\`\`

Rules:
1. The root bullet must be "- Purpose"
2. Copy the purpose statement verbatim as a child bullet
3. If there are out-of-scope items, nest them under "- Out of scope:"
4. Preserve ALL other sub-items, lists, or nested content under Purpose as additional child bullets
5. Copy ALL text verbatim — include typos, grammar errors, formatting

${ZERO_CONTENT_LOSS}`,
    user: chunk.markdown,
    jsonSchema: wrapSchema('purpose_result', {
      type: 'object',
      properties: {
        sectionMarkdown: { type: 'string' },
      },
      required: ['sectionMarkdown'],
    }),
  };
}

export function buildExpertsPrompt(chunk: PreformatChunk): PromptConfig {
  return {
    system: `${ROLE_CONTEXT}

Your task: Reorganize this Experts section into canonical BrainLift format as an indented markdown bullet list. COPY ALL TEXT VERBATIM.

Output the reorganized experts as an indented markdown bullet list in the "sectionMarkdown" field. Use this structure:

\`\`\`
- Expert Name
  - Who: description of who they are
  - Focus: their focus/specialty area
  - Why Follow: why the student follows them
  - Where: where to find them (links, platforms)
  - [any additional fields preserved as-is with their original labels]
- Another Expert Name
  - Who: ...
  - Focus: ...
\`\`\`

Rules:
1. Each expert becomes a top-level bullet with their name
2. Standard fields (Who, Focus, Why Follow, Where) become child bullets with the label prefix
3. Map variant labels: "Bio:" → "Who:", "Topics:" → "Focus:", "Who follow:" → "Why Follow:", "Find her:" / "Find him:" / "Links:" → "Where:"
4. ANY content under an expert that does NOT match standard fields gets preserved as additional child bullets with their original labels
5. Copy ALL text values verbatim — only the field label prefix may change
6. If a standard field has no content, omit it (don't create empty bullets)
7. Preserve nested lists, sub-items, and link trees under experts

${ZERO_CONTENT_LOSS}

${STRIP_INSTRUCTIONS}`,
    user: chunk.markdown,
    jsonSchema: wrapSchema('experts_result', {
      type: 'object',
      properties: {
        sectionMarkdown: { type: 'string' },
        strippedTemplateInstructions: { type: 'array', items: { type: 'string' } },
      },
      required: ['sectionMarkdown', 'strippedTemplateInstructions'],
    }),
  };
}

export function buildSpovsPrompt(chunk: PreformatChunk): PromptConfig {
  return {
    system: `${ROLE_CONTEXT}

${DOK_DEFINITIONS}

Your task: Reorganize this SPOVs (DOK4) section into canonical BrainLift format as an indented markdown bullet list. COPY ALL TEXT VERBATIM.

Output the reorganized SPOVs as an indented markdown bullet list in the "sectionMarkdown" field. Use this structure:

\`\`\`
- spov 1 - the full SPOV text copied verbatim
  - supporting context copied verbatim
  - Supported By
    - Insight #3
  - [any other nested content preserved]
- spov 2 - another SPOV text
  - context text
\`\`\`

Rules:
1. Each SPOV becomes a top-level bullet with "spov N - " prefix followed by the SPOV text verbatim
2. Number SPOVs sequentially (spov 1, spov 2, ...)
3. ALL child/nested text (supporting examples, elaborations, cross-references) becomes child bullets — copy verbatim
4. Flatten container nesting — each SPOV is a standalone top-level entry
5. If a SPOV explicitly references insights (e.g., "see Insight 3"), preserve those references in the child bullets
6. Do NOT create new SPOVs — only include text already written as a SPOV
7. Do NOT synthesize or infer SPOVs from other content

${ZERO_CONTENT_LOSS}

${CONSERVATIVE_DEFAULTS}`,
    user: chunk.markdown,
    jsonSchema: wrapSchema('spovs_result', {
      type: 'object',
      properties: {
        sectionMarkdown: { type: 'string' },
      },
      required: ['sectionMarkdown'],
    }),
  };
}

export function buildInsightsPrompt(chunk: PreformatChunk): PromptConfig {
  return {
    system: `${ROLE_CONTEXT}

${DOK_DEFINITIONS}

Your task: Reorganize this Insights (DOK3) section into canonical BrainLift format as an indented markdown bullet list. COPY ALL TEXT VERBATIM.

Output the reorganized insights as an indented markdown bullet list in the "sectionMarkdown" field. Use this structure:

\`\`\`
- Insight 1 - the full insight text copied verbatim
  - Links
    - Category N, Source "source name"
  - [any nested evidence/analysis preserved]
- Insight 2 - another insight text
  - Links
    - Category M, Source "other source"
\`\`\`

Rules:
1. Each insight becomes a top-level bullet with "Insight N - " prefix followed by the insight text verbatim
2. Number insights sequentially (Insight 1, Insight 2, ...)
3. If the insight references source names, nest them under a "Links" child bullet
4. ALL nested content (evidence, analysis, sub-items) becomes child bullets — copy verbatim
5. Do NOT synthesize new insights — only include text explicitly marked as an insight
6. Do NOT decide that some text "sounds like an insight" — only explicitly labeled ones

${ZERO_CONTENT_LOSS}

${CONSERVATIVE_DEFAULTS}`,
    user: chunk.markdown,
    jsonSchema: wrapSchema('insights_result', {
      type: 'object',
      properties: {
        sectionMarkdown: { type: 'string' },
      },
      required: ['sectionMarkdown'],
    }),
  };
}

export function buildCategoryPrompt(chunk: PreformatChunk): PromptConfig {
  return {
    system: `${ROLE_CONTEXT}

${DOK_DEFINITIONS}

Your task: Reorganize this Knowledge Tree category into canonical BrainLift format. COPY ALL TEXT VERBATIM.

Output the reorganized category as an indented markdown bullet list in the "sectionMarkdown" field. Use this structure:

\`\`\`
- Source: Source Name
  - DOK1 - facts
    - fact text copied verbatim (objective, from the source)
    - another fact
  - DOK2 - summary
    - summary text copied verbatim (ties facts together, supported by facts above)
  - Scratchpad
    - student's own ideas, notes, brainstorming related to this source
  - link to source
    - URL
- Source: Another Source
  - DOK1 - facts
    - ...
  - DOK2 - summary
    - ...
- Scratchpad
  - general operational items not tied to any source
\`\`\`

Rules for the markdown:
1. **Identify sources** — A source is a book, article, podcast, video, person, or topic the student studied. Use "Source: " prefix followed by the source name copied exactly.

2. **DOK1 - facts** under each source: Objective data points, quotes, statistics, observations extracted FROM the source. These are things anyone would find if they read the same source. Copy each fact verbatim.

3. **DOK2 - summary** under each source: The student's interpretation that logically ties facts from THIS source together. Must be directly supported by the DOK1 facts above. A DOK2 summary explains how/why based on source material — it is NOT the student's own ideas, plans, or brainstorming.

4. **Scratchpad** per source or at the end: ANYTHING that does not fit as DOK1 facts or DOK2 summary goes here. If it's not an objective fact from a source and not a summary tying those facts together — it's scratchpad.

   **The bright line:** DOK1-2 = external world (objective, from sources). Everything else = scratchpad.

5. **Preserve the student's nesting and sub-headers.** If a source has sub-sections, topic groupings, case study headings — keep them as nested bullets. Do NOT flatten the student's organization.

6. **Copy ALL text verbatim.** Every piece of text from the input must appear in the output. Include typos, grammar errors, formatting. NEVER drop content.

Additionally, extract into JSON fields:
- **candidateInsights**: ONLY text EXPLICITLY marked as an insight (e.g., "Insight:" prefix). Copy verbatim with sourceRefs.
- **candidateSpovs**: ONLY text EXPLICITLY marked as a SPOV. Copy verbatim with context.
- **strippedTemplateInstructions**: Template instructions like "What are experts", "Creating lists of experts is DOK 1".

CRITICAL: ZERO content loss. Every piece of text from the input MUST appear in either the sectionMarkdown OR one of the JSON fields. When in doubt, include it in the markdown.

${CONSERVATIVE_DEFAULTS}`,
    user: chunk.markdown,
    jsonSchema: wrapSchema('category_result', {
      type: 'object',
      properties: {
        category: { type: 'string' },
        sectionMarkdown: { type: 'string' },
        candidateInsights: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              text: { type: 'string' },
              sourceRefs: { type: 'array', items: { type: 'string' } },
            },
            required: ['text', 'sourceRefs'],
            additionalProperties: false,
          },
        },
        candidateSpovs: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              text: { type: 'string' },
              sourceRefs: { type: 'array', items: { type: 'string' } },
              context: { type: 'array', items: { type: 'string' } },
            },
            required: ['text', 'sourceRefs', 'context'],
            additionalProperties: false,
          },
        },
        strippedTemplateInstructions: { type: 'array', items: { type: 'string' } },
      },
      required: ['category', 'sectionMarkdown', 'candidateInsights', 'candidateSpovs', 'strippedTemplateInstructions'],
    }),
  };
}

export function buildKnowledgeTreePrompt(chunk: PreformatChunk): PromptConfig {
  return {
    system: `${ROLE_CONTEXT}

${DOK_DEFINITIONS}

Your task: Organize this Knowledge Tree into categories with source-grouped content. COPY ALL TEXT VERBATIM.

This Knowledge Tree has no explicit category markers. Identify logical groupings and output each as a separate category.

Each category's content goes in "sectionMarkdown" — an indented markdown bullet list following canonical BrainLift format:

\`\`\`
- Source: Source Name
  - DOK1 - facts
    - fact text verbatim
  - DOK2 - summary
    - summary text verbatim
  - link to source
    - URL
- Source: Another Source
  - ...
- Scratchpad
  - operational content verbatim
\`\`\`

Preserve the student's nesting and sub-headers. Copy ALL text verbatim. ZERO content loss.

Additionally extract candidateInsights (ONLY explicitly marked) and candidateSpovs (ONLY explicitly marked) as JSON.

${CONSERVATIVE_DEFAULTS}`,
    user: chunk.markdown,
    jsonSchema: wrapSchema('knowledge_tree_result', {
      type: 'object',
      properties: {
        categories: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              category: { type: 'string' },
              sectionMarkdown: { type: 'string' },
              candidateInsights: {
                type: 'array',
                items: {
                  type: 'object',
                  properties: {
                    text: { type: 'string' },
                    sourceRefs: { type: 'array', items: { type: 'string' } },
                  },
                  required: ['text', 'sourceRefs'],
                  additionalProperties: false,
                },
              },
              candidateSpovs: {
                type: 'array',
                items: {
                  type: 'object',
                  properties: {
                    text: { type: 'string' },
                    sourceRefs: { type: 'array', items: { type: 'string' } },
                    context: { type: 'array', items: { type: 'string' } },
                  },
                  required: ['text', 'sourceRefs', 'context'],
                  additionalProperties: false,
                },
              },
              strippedTemplateInstructions: { type: 'array', items: { type: 'string' } },
            },
            required: ['category', 'sectionMarkdown', 'candidateInsights', 'candidateSpovs', 'strippedTemplateInstructions'],
            additionalProperties: false,
          },
        },
      },
      required: ['categories'],
    }),
  };
}

export function buildUnknownPrompt(chunk: PreformatChunk): PromptConfig {
  return {
    system: `${ROLE_CONTEXT}

${DOK_DEFINITIONS}

Your task: Classify this unrecognized section and reorganize its content as canonical markdown. COPY ALL TEXT VERBATIM.

First, determine what kind of content this is:
- "dok_content": Contains research content (sources, facts, summaries). Reorganize using the canonical KT format below.
- "operational": Contains operational plans, workflows, SOPs. Preserve as indented markdown bullet list.
- "scratchpad": Contains drafts, notes, TO-DOs, temporary content. Preserve as indented markdown bullet list.

For "dok_content", output sectionMarkdown in canonical KT format:
\`\`\`
- Source: Source Name
  - DOK1 - facts
    - fact text verbatim
  - DOK2 - summary
    - summary text verbatim
  - link to source
    - URL
\`\`\`

For "operational" or "scratchpad", output sectionMarkdown as a faithful indented bullet list preserving all content and structure.

${ZERO_CONTENT_LOSS}

${CONSERVATIVE_DEFAULTS}

REMEMBER: Copy all text VERBATIM. Do not paraphrase, summarize, or generate new text.`,
    user: chunk.markdown,
    jsonSchema: wrapSchema('unknown_result', {
      type: 'object',
      properties: {
        classification: {
          type: 'string',
          enum: ['dok_content', 'operational', 'scratchpad'],
        },
        sectionMarkdown: { type: 'string' },
      },
      required: ['classification', 'sectionMarkdown'],
    }),
  };
}

export function buildUnstructuredPrompt(chunk: PreformatChunk): PromptConfig {
  return {
    system: `${ROLE_CONTEXT}

${DOK_DEFINITIONS}

Your task: Organize this entire unstructured document into canonical BrainLift format. COPY ALL TEXT VERBATIM.

This document has no recognized section markers. Output the ENTIRE reorganized document as a single indented markdown bullet list in "sectionMarkdown". Use this structure:

\`\`\`
- Owner
  - owner name
- Purpose
  - purpose statement
  - Out of scope:
    - scope item
- Experts
  - Expert Name
    - Who: description
    - Focus: specialty
    - Why Follow: reason
    - Where: links/platforms
- DOK4 - SPOV
  - spov 1 - SPOV text
    - context
- DOK3 - Insights
  - Insight 1 - insight text
    - Links
      - Category N, Source "name"
- DOK2 - Knowledge Tree
  - Category 1: Topic
    - Source: Source Name
      - DOK1 - facts
        - fact text
      - DOK2 - summary
        - summary text
      - link to source
        - URL
- Scratchpad
  - operational or non-research items
\`\`\`

Rules:
1. Identify ALL sections: Owner, Purpose, Experts, SPOVs, Insights, Knowledge Tree categories, Scratchpad
2. Place every piece of text into the correct section
3. Copy ALL text verbatim — include typos, grammar, formatting
4. If text doesn't fit any structured section → put in Scratchpad
5. NEVER drop content. When in doubt, include in Scratchpad.
6. Only mark content as DOK3 (Insight) or DOK4 (SPOV) if EXPLICITLY labeled as such

${ZERO_CONTENT_LOSS}

${CONSERVATIVE_DEFAULTS}`,
    user: chunk.markdown,
    jsonSchema: wrapSchema('unstructured_result', {
      type: 'object',
      properties: {
        sectionMarkdown: { type: 'string' },
      },
      required: ['sectionMarkdown'],
    }),
  };
}

// ═══════════════════════════════════════════════════════════════════════════
// Prompt Builder Dispatch Map
// ═══════════════════════════════════════════════════════════════════════════

export const PROMPT_BUILDERS: Record<ChunkType, (chunk: PreformatChunk) => PromptConfig> = {
  owner: buildOwnerPrompt,
  purpose: buildPurposePrompt,
  experts: buildExpertsPrompt,
  spovs: buildSpovsPrompt,
  insights: buildInsightsPrompt,
  category: buildCategoryPrompt,
  knowledge_tree: buildKnowledgeTreePrompt,
  unknown: buildUnknownPrompt,
  unstructured: buildUnstructuredPrompt,
};
