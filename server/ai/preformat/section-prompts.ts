/**
 * Section-Specific LLM Prompt Templates for BrainLift Pre-Formatting.
 *
 * Each builder returns { system, user, jsonSchema } for a specific chunk type.
 * JSON schemas use OpenRouter's structured output format (strict mode).
 */

import type { ChunkType, PreformatChunk, PromptConfig } from './types';

// ═══════════════════════════════════════════════════════════════════════════
// Shared prompt components
// ═══════════════════════════════════════════════════════════════════════════

const DOK_DEFINITIONS = `DOK Levels:
- DOK1 (Facts): Individual facts, data points, quotes extracted from a source. Raw information with no interpretation.
- DOK2 (Summaries): The student's interpretation/summary of a source. Groups of related facts synthesized into a narrative.
- DOK3 (Insights): Cross-source analytical claims that synthesize information from MULTIPLE sources. These go beyond restating any single source.
- DOK4 (SPOVs - Spiky Points of View): The student's original, opinionated perspectives that are uniquely theirs. Not found in any source.`;

const ROLE_CONTEXT = 'You are restructuring a section of a BrainLift document. A BrainLift is a student\'s personal knowledge base organized around sources they\'ve studied.';

const CONSERVATIVE_DEFAULTS = `Conservative defaults for ambiguities:
- If content could be an original framework or model the student created, keep it as a DOK3 insight (not scratchpad).
- If an analysis line appears within a DOK2 source summary, keep it in the DOK2 summary (don't extract to DOK3).
- Only classify content as scratchpad if it is CLEARLY non-research: TO-DO lists, SOPs, timelines, character planning, episode scripts, operational plans.
- If content is flagged "out of scope" but still included in the document, keep it in place.
- If a source has no link or attribution, keep it as a DOK2 source with a null URL.
- Named containers (e.g., "Season 1 Research") should be flattened -- preserve the container name in the source label.`;

const STRIP_INSTRUCTIONS = `Content to strip (do NOT include in any output field):
- Template instructions like "What are experts", "Creating lists of experts is DOK 1", "How to create summaries"
- Workflowy artifacts: "0 Backlink", internal "workflowy.com/#/" links
- Empty bullets or whitespace-only content`;

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

Your task: Extract the owner's name from this Owner section.

${STRIP_INSTRUCTIONS}

Return the owner's full name. If the section contains a name and additional info (bio, title), extract only the name.`,
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

Your task: Extract the main purpose statement and any out-of-scope items from this Purpose section.

${STRIP_INSTRUCTIONS}

The purpose should be a clear, concise statement of what this BrainLift is about.
Out-of-scope items are topics explicitly excluded or noted as not covered.`,
    user: chunk.markdown,
    jsonSchema: wrapSchema('purpose_result', {
      type: 'object',
      properties: {
        purpose: { type: 'string' },
        outOfScope: {
          type: 'array',
          items: { type: 'string' },
        },
      },
      required: ['purpose', 'outOfScope'],
    }),
  };
}

export function buildExpertsPrompt(chunk: PreformatChunk): PromptConfig {
  return {
    system: `${ROLE_CONTEXT}

${DOK_DEFINITIONS}

Your task: Normalize each expert entry into structured fields.

For each expert, extract:
- name: The expert's full name
- who: Brief description of who they are (title, role, background)
- focus: What topics or areas they specialize in
- whyFollow: Why the student follows or studies this expert
- where: Where to find them (website, social media, publication)

Handle inconsistent field names: "Who follow" = whyFollow, "Find her" / "Find him" = where.
If a field is missing, use an empty string.

${STRIP_INSTRUCTIONS}`,
    user: chunk.markdown,
    jsonSchema: wrapSchema('experts_result', {
      type: 'object',
      properties: {
        experts: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              name: { type: 'string' },
              who: { type: 'string' },
              focus: { type: 'string' },
              whyFollow: { type: 'string' },
              where: { type: 'string' },
            },
            required: ['name', 'who', 'focus', 'whyFollow', 'where'],
            additionalProperties: false,
          },
        },
      },
      required: ['experts'],
    }),
  };
}

export function buildSpovsPrompt(chunk: PreformatChunk): PromptConfig {
  return {
    system: `${ROLE_CONTEXT}

${DOK_DEFINITIONS}

Your task: Extract DOK4 SPOVs (Spiky Points of View) from this section.

SPOVs are the student's original, opinionated perspectives. They may be nested in containers or numbered.
Flatten any container nesting -- each SPOV should be a standalone text entry.

If a SPOV explicitly references numbered DOK3 insights (e.g., "see Insight 3", "builds on Insight 1 and 5"), capture those numbers in explicitInsightRefs as 1-indexed integers. If no explicit references, use an empty array.

${STRIP_INSTRUCTIONS}`,
    user: chunk.markdown,
    jsonSchema: wrapSchema('spovs_result', {
      type: 'object',
      properties: {
        spovs: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              text: { type: 'string' },
              explicitInsightRefs: {
                type: 'array',
                items: { type: 'integer' },
              },
            },
            required: ['text', 'explicitInsightRefs'],
            additionalProperties: false,
          },
        },
      },
      required: ['spovs'],
    }),
  };
}

export function buildInsightsPrompt(chunk: PreformatChunk): PromptConfig {
  return {
    system: `${ROLE_CONTEXT}

${DOK_DEFINITIONS}

Your task: Extract DOK3 insights from this section.

DOK3 insights are cross-source analytical claims. Each insight should reference the source names it draws from.
Preserve the student's original wording. Do not paraphrase or combine insights.

If an insight references specific sources (by name, number, or description), capture those in sourceRefs as strings.
If no explicit source references, use an empty array.

${STRIP_INSTRUCTIONS}`,
    user: chunk.markdown,
    jsonSchema: wrapSchema('insights_result', {
      type: 'object',
      properties: {
        insights: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              text: { type: 'string' },
              sourceRefs: {
                type: 'array',
                items: { type: 'string' },
              },
            },
            required: ['text', 'sourceRefs'],
            additionalProperties: false,
          },
        },
      },
      required: ['insights'],
    }),
  };
}

export function buildCategoryPrompt(chunk: PreformatChunk): PromptConfig {
  return {
    system: `${ROLE_CONTEXT}

${DOK_DEFINITIONS}

Your task: Restructure this Knowledge Tree category into source-grouped content.

This is the most important classification task. You must:

1. **Identify sources** -- A source is a book, article, podcast, video, person, or topic the student studied. Sources may be labeled "Source:", may have a URL parent, may just be a title or topic name. Even unlabeled content groups that clearly discuss one external source should be treated as a source.

2. **Group facts (DOK1) under their source** -- Facts are individual data points, quotes, or observations. They may be labeled "DOK1", "Facts", or just be bullet points near a URL or source name.

3. **Group summaries (DOK2) under their source** -- Summaries are the student's interpretation of the source. May be labeled "DOK2", "Summary", or be narrative text following facts.

4. **Extract candidate DOK3 insights** -- Look for inline "Insight:" annotations, category-level summaries that synthesize across MULTIPLE sources, or analysis that goes beyond restating a single source. Include sourceRefs (source names this insight derives from).

5. **Extract candidate DOK4 SPOVs** -- Look for inline "SPOV:" annotations or strongly opinionated statements that represent the student's unique perspective. Include sourceRefs.

6. **Classify operational content as scratchpad** -- TO-DO lists, episode scripts, SOPs, timelines, character planning, operational plans. ONLY classify as scratchpad if CLEARLY non-research.

7. **Identify template instructions to strip** -- Instructions like "What are experts", "Creating lists of experts is DOK 1", "How to create summaries". Put these in strippedTemplateInstructions.

${CONSERVATIVE_DEFAULTS}

${STRIP_INSTRUCTIONS}

The "category" field should be the clean category name (strip "Category N:" prefix, markdown headings, etc.).`,
    user: chunk.markdown,
    jsonSchema: wrapSchema('category_result', {
      type: 'object',
      properties: {
        category: { type: 'string' },
        sources: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              name: { type: 'string' },
              url: { type: ['string', 'null'] },
              facts: { type: 'array', items: { type: 'string' } },
              summary: { type: 'array', items: { type: 'string' } },
            },
            required: ['name', 'url', 'facts', 'summary'],
            additionalProperties: false,
          },
        },
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
            },
            required: ['text', 'sourceRefs'],
            additionalProperties: false,
          },
        },
        scratchpad: { type: 'array', items: { type: 'string' } },
        strippedTemplateInstructions: { type: 'array', items: { type: 'string' } },
      },
      required: ['category', 'sources', 'candidateInsights', 'candidateSpovs', 'scratchpad', 'strippedTemplateInstructions'],
    }),
  };
}

export function buildKnowledgeTreePrompt(chunk: PreformatChunk): PromptConfig {
  return {
    system: `${ROLE_CONTEXT}

${DOK_DEFINITIONS}

Your task: Restructure this Knowledge Tree section into categories with source-grouped content.

This Knowledge Tree has no explicit category markers. Identify logical groupings and create categories.
Each category should follow the same structure as a single category result.

For each category you identify:
1. Group sources with their facts (DOK1) and summaries (DOK2)
2. Extract candidate insights (DOK3) that synthesize across sources
3. Extract candidate SPOVs (DOK4) -- strongly opinionated student perspectives
4. Move operational content to scratchpad
5. Identify template instructions to strip

${CONSERVATIVE_DEFAULTS}

${STRIP_INSTRUCTIONS}`,
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
              sources: {
                type: 'array',
                items: {
                  type: 'object',
                  properties: {
                    name: { type: 'string' },
                    url: { type: ['string', 'null'] },
                    facts: { type: 'array', items: { type: 'string' } },
                    summary: { type: 'array', items: { type: 'string' } },
                  },
                  required: ['name', 'url', 'facts', 'summary'],
                  additionalProperties: false,
                },
              },
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
                  },
                  required: ['text', 'sourceRefs'],
                  additionalProperties: false,
                },
              },
              scratchpad: { type: 'array', items: { type: 'string' } },
              strippedTemplateInstructions: { type: 'array', items: { type: 'string' } },
            },
            required: ['category', 'sources', 'candidateInsights', 'candidateSpovs', 'scratchpad', 'strippedTemplateInstructions'],
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

Your task: Classify this unrecognized section.

Determine if this content is:
- "dok_content": Contains research content (sources, facts, summaries, insights). If so, extract structured data.
- "operational": Contains operational plans, workflows, SOPs that are clearly work-related but not research.
- "scratchpad": Contains drafts, notes, TO-DOs, or temporary content.

${CONSERVATIVE_DEFAULTS}

If classification is "dok_content", extract sources, insights, and spovs.
If classification is "operational" or "scratchpad", put the content lines in the "content" array.`,
    user: chunk.markdown,
    jsonSchema: wrapSchema('unknown_result', {
      type: 'object',
      properties: {
        classification: {
          type: 'string',
          enum: ['dok_content', 'operational', 'scratchpad'],
        },
        sources: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              name: { type: 'string' },
              url: { type: ['string', 'null'] },
              facts: { type: 'array', items: { type: 'string' } },
              summary: { type: 'array', items: { type: 'string' } },
            },
            required: ['name', 'url', 'facts', 'summary'],
            additionalProperties: false,
          },
        },
        insights: {
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
        spovs: {
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
        content: {
          type: 'array',
          items: { type: 'string' },
        },
      },
      required: ['classification', 'sources', 'insights', 'spovs', 'content'],
    }),
  };
}

export function buildUnstructuredPrompt(chunk: PreformatChunk): PromptConfig {
  return {
    system: `${ROLE_CONTEXT}

${DOK_DEFINITIONS}

Your task: Classify and restructure this entire unstructured document.

This document has no recognized section markers (no Owner, Purpose, Experts, Knowledge Tree sections).
You must identify ALL content types and organize them.

Extract:
- owner: The document owner's name (null if not found)
- purpose: The document's purpose statement (null if not found)
- experts: Any expert references found
- spovs: Any DOK4 spiky points of view
- insights: Any DOK3 cross-source insights
- categories: Group source-based content into logical categories
- scratchpad: Operational or temporary content

${CONSERVATIVE_DEFAULTS}

${STRIP_INSTRUCTIONS}`,
    user: chunk.markdown,
    jsonSchema: wrapSchema('unstructured_result', {
      type: 'object',
      properties: {
        owner: {
          type: ['object', 'null'],
          properties: {
            name: { type: 'string' },
          },
          required: ['name'],
          additionalProperties: false,
        },
        purpose: {
          type: ['object', 'null'],
          properties: {
            purpose: { type: 'string' },
            outOfScope: { type: 'array', items: { type: 'string' } },
          },
          required: ['purpose', 'outOfScope'],
          additionalProperties: false,
        },
        experts: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              name: { type: 'string' },
              who: { type: 'string' },
              focus: { type: 'string' },
              whyFollow: { type: 'string' },
              where: { type: 'string' },
            },
            required: ['name', 'who', 'focus', 'whyFollow', 'where'],
            additionalProperties: false,
          },
        },
        spovs: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              text: { type: 'string' },
              explicitInsightRefs: { type: 'array', items: { type: 'integer' } },
            },
            required: ['text', 'explicitInsightRefs'],
            additionalProperties: false,
          },
        },
        insights: {
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
        categories: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              category: { type: 'string' },
              sources: {
                type: 'array',
                items: {
                  type: 'object',
                  properties: {
                    name: { type: 'string' },
                    url: { type: ['string', 'null'] },
                    facts: { type: 'array', items: { type: 'string' } },
                    summary: { type: 'array', items: { type: 'string' } },
                  },
                  required: ['name', 'url', 'facts', 'summary'],
                  additionalProperties: false,
                },
              },
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
                  },
                  required: ['text', 'sourceRefs'],
                  additionalProperties: false,
                },
              },
              scratchpad: { type: 'array', items: { type: 'string' } },
              strippedTemplateInstructions: { type: 'array', items: { type: 'string' } },
            },
            required: ['category', 'sources', 'candidateInsights', 'candidateSpovs', 'scratchpad', 'strippedTemplateInstructions'],
            additionalProperties: false,
          },
        },
        scratchpad: { type: 'array', items: { type: 'string' } },
      },
      required: ['owner', 'purpose', 'experts', 'spovs', 'insights', 'categories', 'scratchpad'],
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
